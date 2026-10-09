import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Store,
  WorldCheckpointBusyError,
  digest,
} from "../../src/server/store";
import { recordEvent } from "../../src/simulation/world";
import { smallWorld as createWorld } from "./fixtures";
import { stepWorld } from "../../src/simulation/engine";
import {
  materializeChunk,
  getTile,
  generateTile,
} from "../../src/simulation/terrain";
import { elementLedger } from "../../src/simulation/chemistry";
import { legacyCheckpoint } from "./fixtures";
import {
  listWorldArchives,
  worldArchiveBytes,
} from "../../src/server/archives";

test("a long transaction renews the sole writer's lease before exposing its commit", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-long-write-lease-"));
  const path = join(directory, "world.sqlite"),
    store = new Store(path);
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  let contender: Store | undefined;
  try {
    store.acquireLease();
    store.db.exec("CREATE TABLE long_write_probe(value INTEGER)");
    store.transaction(() => {
      store.db.prepare("INSERT INTO long_write_probe VALUES(1)").run();
      now += 45000;
    });
    const lease = store.db
      .prepare("SELECT expires_at FROM world_lease WHERE id=1")
      .get()!;
    assert.ok(Number(lease.expires_at) > now);
    contender = new Store(path);
    assert.throws(
      () => contender!.acquireLease(),
      /owns|ownership|lease|already/i,
    );
    assert.equal(
      store.db.prepare("SELECT value FROM long_write_probe").get()!.value,
      1,
    );
  } finally {
    contender?.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("loss of writer ownership before a long commit rolls back the proposed write", (t) => {
  const store = new Store(":memory:");
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  try {
    store.acquireLease();
    store.db.exec("CREATE TABLE long_write_probe(value INTEGER)");
    assert.throws(
      () =>
        store.transaction(() => {
          store.db.prepare("INSERT INTO long_write_probe VALUES(1)").run();
          store.db
            .prepare("UPDATE world_lease SET token='changed-owner' WHERE id=1")
            .run();
          now += 45000;
        }),
      /lost ownership/,
    );
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM long_write_probe").get()!.n,
      0,
    );
  } finally {
    store.close();
  }
});

test("a released reader cannot leave two large save batches in the WAL", () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-checkpoint-boundary-"));
  const path = join(directory, "world.sqlite");
  const store = new Store(path);
  let reader: DatabaseSync | undefined;
  try {
    store.db.exec(
      "CREATE TABLE checkpoint_probe(id INTEGER PRIMARY KEY, revision INTEGER, value BLOB); BEGIN",
    );
    const insert = store.db.prepare(
      "INSERT INTO checkpoint_probe VALUES(?,0,?)",
    );
    for (let n = 0; n < 128; n++) insert.run(n, Buffer.alloc(65536));
    store.db.exec("COMMIT");
    store.db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
    reader = new DatabaseSync(path, { readOnly: true });
    reader.exec("BEGIN");
    reader.prepare("SELECT count(*) FROM checkpoint_probe").get();
    const write = (revision: number) =>
      store.transaction(() => {
        store.db
          .prepare("UPDATE checkpoint_probe SET revision=?,value=? WHERE id<64")
          .run(revision, Buffer.alloc(65536, revision));
      });
    write(1);
    const firstWal = statSync(path + "-wal").size;
    const delayed = store.db.prepare("PRAGMA wal_checkpoint(PASSIVE)").get()!;
    assert.ok(Number(delayed.checkpointed) < Number(delayed.log));
    reader.close();
    reader = undefined;
    // No operator checkpoint here: the actual transaction path must prepare
    // WAL reuse before attempting the next complete save.
    write(2);
    assert.ok(statSync(path + "-wal").size < firstWal + 65536);
    assert.equal(
      store.db
        .prepare(
          "SELECT count(*) n FROM checkpoint_probe WHERE id<64 AND revision=2",
        )
        .get()!.n,
      64,
    );
    assert.equal(
      store.db.prepare("PRAGMA integrity_check").get()!.integrity_check,
      "ok",
    );
  } finally {
    reader?.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a held reader defers a transaction before its callback and the same work can retry", () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-checkpoint-busy-"));
  const path = join(directory, "world.sqlite");
  const store = new Store(path);
  let reader: DatabaseSync | undefined;
  try {
    store.db.exec(
      "PRAGMA busy_timeout=2; CREATE TABLE checkpoint_probe(value INTEGER); INSERT INTO checkpoint_probe VALUES(0)",
    );
    store.db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
    reader = new DatabaseSync(path, { readOnly: true });
    reader.exec("BEGIN");
    reader.prepare("SELECT value FROM checkpoint_probe").get();
    store.transaction(() =>
      store.db.prepare("UPDATE checkpoint_probe SET value=1").run(),
    );
    let called = false;
    const work = () => {
      called = true;
      store.db.prepare("UPDATE checkpoint_probe SET value=2").run();
    };
    assert.throws(() => store.transaction(work), WorldCheckpointBusyError);
    assert.equal(called, false);
    assert.equal(
      store.db.prepare("SELECT value FROM checkpoint_probe").get()!.value,
      1,
    );
    reader.close();
    reader = undefined;
    store.transaction(work);
    assert.equal(called, true);
    assert.equal(
      store.db.prepare("SELECT value FROM checkpoint_probe").get()!.value,
      2,
    );
  } finally {
    reader?.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("WAL retention shrinks after readers release it without discarding active history", () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-wal-retention-"));
  const path = join(directory, "world.sqlite");
  const store = new Store(path);
  let reader: DatabaseSync | undefined;
  try {
    const limit = Number(
      store.db.prepare("PRAGMA journal_size_limit").get()?.journal_size_limit,
    );
    assert.ok(limit > 0 && limit <= 16 * 1024 * 1024);
    // A held reader and deliberately disabled automatic checkpoints reproduce
    // a backup's retained WAL without applying a storage fault to any real world.
    store.db.exec(
      "PRAGMA wal_autocheckpoint=0; CREATE TABLE retention_probe (value BLOB)",
    );
    const insert = store.db.prepare(
      "INSERT INTO retention_probe VALUES (zeroblob(?))",
    );
    insert.run(limit / 2);
    reader = new DatabaseSync(path, { readOnly: true });
    reader.exec("BEGIN");
    assert.equal(
      reader.prepare("SELECT count(*) n FROM retention_probe").get()?.n,
      1,
    );
    for (let n = 0; n < 3; n++) insert.run(limit / 2);
    const held = store.db.prepare("PRAGMA wal_checkpoint(PASSIVE)").get() as {
      log: number;
      checkpointed: number;
    };
    assert.ok(held.checkpointed < held.log);
    assert.ok(statSync(path + "-wal").size > limit);
    assert.equal(
      reader.prepare("SELECT count(*) n FROM retention_probe").get()?.n,
      1,
    );
    reader.close();
    reader = undefined;
    const released = store.db
      .prepare("PRAGMA wal_checkpoint(PASSIVE)")
      .get() as { log: number; checkpointed: number };
    assert.equal(released.checkpointed, released.log);
    insert.run(1); // Reusing the fully checkpointed WAL applies the retention cap.
    assert.ok(statSync(path + "-wal").size <= limit);
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM retention_probe").get()?.n,
      5,
    );
    assert.equal(
      store.db
        .prepare("SELECT sum(length(value)) bytes FROM retention_probe")
        .get()?.bytes,
      limit * 2 + 1,
    );
  } finally {
    reader?.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an automatically rolled-back full database retains the original error and prior rows", () => {
  const store = new Store(":memory:");
  try {
    store.db.exec(
      "CREATE TABLE capacity_probe (value BLOB); INSERT INTO capacity_probe VALUES (x'01')",
    );
    const pages = store.db.prepare("PRAGMA page_count").get() as {
      page_count: number;
    };
    store.db.exec(`PRAGMA max_page_count=${pages.page_count}`);
    assert.throws(
      () =>
        store.transaction(() => {
          store.db.exec("UPDATE capacity_probe SET value=zeroblob(1048576)");
        }),
      /database or disk is full/,
    );
    assert.equal(
      store.db.prepare("SELECT hex(value) AS value FROM capacity_probe").get()
        ?.value,
      "01",
    );
    store.transaction(() =>
      store.db.exec("UPDATE capacity_probe SET value=x'02'"),
    );
    assert.equal(
      store.db.prepare("SELECT hex(value) AS value FROM capacity_probe").get()
        ?.value,
      "02",
    );
  } finally {
    store.close();
  }
});

test("a live service refuses to generate a replacement for a missing world", () => {
  const store = new Store(":memory:");
  try {
    assert.throws(
      () => store.load(1847, true),
      /expected living world is missing/,
    );
    assert.equal(
      (
        store.db.prepare("SELECT COUNT(*) AS n FROM world").get() as {
          n: number;
        }
      ).n,
      0,
    );
    const original = store.load(1847);
    assert.deepEqual(store.load(9999, true), original);
  } finally {
    store.close();
  }
});

test("a registered hotfix preserves an established world and archives its exact previous state", () => {
  const store = new Store(":memory:");
  try {
    const original = createWorld(42, 64, 64, "archipelago-1");
    stepWorld(original, 8);
    const legacy = legacyCheckpoint(store, original, 5);
    const upgraded = store.load(999);
    assert.equal(upgraded.version, 17);
    assert.equal(upgraded.entropy.sinceTick, original.tick);
    assert.equal(upgraded.generationVersion, "archipelago-1");
    assert.equal(upgraded.tick, original.tick);
    assert.equal(upgraded.seed, original.seed);
    for (let i = 0; i < upgraded.tiles.length; i++) {
      const { sediment, surfaceChange, ice, seedBank, ...tile } =
        upgraded.tiles[i];
      assert.deepEqual(tile, legacy.tiles[i], `legacy terrain cell ${i}`);
      assert.equal(ice, 0);
      assert.deepEqual(seedBank, []);
    }
    assert.deepEqual(
      upgraded.citizens.map(
        ({ mind, journeyId, wrapMass, provisions, metabolism, ...person }) =>
          person,
      ),
      legacy.citizens,
    );
    assert.deepEqual(upgraded.atmosphere, original.atmosphere);
    // Compare the rearranged small inventories separately from unchanged bulk
    // air. Adding each ration's nitrogen to billions of kg of atmospheric N
    // loses several ulps solely from grouping, hiding the transfer we test.
    const withoutBulkAir = (world: typeof original) =>
      elementLedger({
        ...world,
        atmosphere: { ...world.atmosphere, nitrogen: 0, oxygen: 0, argon: 0 },
      });
    const restoredElements = withoutBulkAir(upgraded),
      originalElements = withoutBulkAir(original);
    for (const symbol of Object.keys(originalElements))
      assert.ok(
        Math.abs(restoredElements[symbol] - originalElements[symbol]) <
          Math.max(
            1e-8,
            Math.abs(originalElements[symbol]) * Number.EPSILON * 8,
          ),
        `${symbol}: projecting personal inventories into legacy stock preserves matter`,
      );
    assert.equal(store.interventions().length, 12);
    const [backup] = listWorldArchives(store.db);
    const json = Buffer.concat([
      ...worldArchiveBytes(store.db, backup.id),
    ]).toString();
    assert.equal(digest(json), backup.checksum);
    assert.equal(JSON.parse(json).version, 5);
    assert.deepEqual(JSON.parse(json).tiles, legacy.tiles);
    assert.deepEqual(store.load(0), upgraded);
    assert.equal(
      store.interventions().length,
      12,
      "a restart does not apply the migration again",
    );
    materializeChunk(upgraded, 30, 40);
    assert.deepEqual(
      getTile(upgraded, 960, 1280),
      generateTile(42, 960, 1280, "archipelago-1"),
    );
  } finally {
    store.close();
  }
});

test("unknown upgrades fail without replacing the world's checkpoint", () => {
  const store = new Store(":memory:");
  try {
    store.save(createWorld(5, 64, 64));
    const row = store.db.prepare("SELECT json FROM world").get() as {
      json: string;
    };
    const unknown = JSON.parse(row.json);
    unknown.version = 999;
    const json = JSON.stringify(unknown);
    store.db
      .prepare("UPDATE world SET json=?,checksum=?")
      .run(json, digest(json));
    assert.throws(() => store.load(1), /No registered migration/);
    assert.equal(
      (store.db.prepare("SELECT json FROM world").get() as { json: string })
        .json,
      json,
    );
    assert.equal(store.interventions().length, 0);
  } finally {
    store.close();
  }
});

test("events outlive the observer window; failed transactions retain their pending archive", () => {
  const store = new Store(":memory:");
  try {
    const world = createWorld(19, 64, 64);
    for (let n = 0; n < 720; n++)
      recordEvent(world, {
        category: "nature",
        title: `Memory ${n}`,
        detail: "A permanent record.",
      });
    const expected = world.pendingEvents.length;
    assert.equal(world.events.length, 300);
    assert.throws(
      () =>
        store.transaction(() => {
          store.save(world);
          throw new Error("interrupt");
        }),
      /interrupt/,
    );
    assert.equal(world.pendingEvents.length, expected);
    assert.equal(store.journal().events.length, 0);
    store.save(world);
    assert.equal(world.pendingEvents.length, 0);
    let before: number | undefined,
      count = 0;
    while (true) {
      const page = store.journal(before, 100);
      if (!page.events.length) break;
      count += page.events.length;
      before = page.next!;
    }
    assert.equal(count, expected);
    store.save(world);
    assert.equal(
      (
        store.db.prepare("SELECT COUNT(*) AS n FROM world_events").get() as {
          n: number;
        }
      ).n,
      expected,
    );
    store.recordRelease(
      world,
      "test-hotfix",
      "An observer fix; the universe continues.",
    );
    store.recordRelease(
      world,
      "test-hotfix",
      "An observer fix; the universe continues.",
    );
    assert.equal(store.interventions().length, 1);
  } finally {
    store.close();
  }
});

test("an online backup restores the same world and stewardship", async () => {
  const dir = mkdtempSync(join(tmpdir(), "praxans-backup-"));
  const store = new Store(join(dir, "world.sqlite"));
  try {
    const world = store.load(1847),
      session = store.session();
    store.claim(session.session, world.civilizations[0].id, world);
    await store.backup(join(dir, "copy.sqlite"));
    const restored = new Store(join(dir, "copy.sqlite"));
    try {
      assert.deepEqual(restored.load(999), world);
      assert.equal(
        restored.session(session.token).session.civId,
        world.civilizations[0].id,
      );
    } finally {
      restored.close();
    }
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("only one server can own a world volume, and graceful shutdown releases ownership", () => {
  const dir = mkdtempSync(join(tmpdir(), "praxans-owner-")),
    path = join(dir, "world.sqlite");
  const first = new Store(path),
    second = new Store(path);
  try {
    first.acquireLease();
    assert.throws(
      () => second.acquireLease(),
      /Another server owns this world/,
    );
    first.close();
    assert.doesNotThrow(() => second.acquireLease());
  } finally {
    second.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the saved wall clock retains unprocessed time through a second recovery restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "praxans-time-")),
    path = join(dir, "world.sqlite");
  let store = new Store(path);
  try {
    let world = createWorld(52, 64, 64);
    store.resumeClock(world.tick, 100000);
    stepWorld(world, 4);
    store.advanceClock(world.tick);
    store.save(world);
    store.close();
    store = new Store(path);
    world = store.load(0);
    store.resumeClock(world.tick, 106000);
    assert.equal(store.dueTicks(106000), 20);
    stepWorld(world, 2);
    store.advanceClock(world.tick);
    store.save(world);
    store.close();
    store = new Store(path);
    world = store.load(0);
    store.resumeClock(world.tick, 106000);
    assert.equal(world.tick, 6);
    assert.equal(store.dueTicks(106000), 18);
    assert.throws(() => store.advanceClock(5), /cannot move backward/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
