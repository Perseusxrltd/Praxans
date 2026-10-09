import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, digest } from "../../src/server/store";
import {
  initializeRegions,
  regionReader,
  regionWriter,
} from "../../src/server/regions";
import { storageVersion } from "../../src/server/storage-format";
import {
  verifyWorldArchives,
  writeWorldArchive,
} from "../../src/server/archives";
import { smallWorld } from "./fixtures";

// The old writer's physical schema, with a current-law world. Storage migration
// must work independently of a physical migration or a newly generated world.
function legacyWorld(store: Store) {
  const world = smallWorld(1847, 64, 64);
  world.pendingEvents = [];
  const { tiles, pendingEvents, ...metadata } = world;
  const json = JSON.stringify({ ...metadata, pendingEvents });
  store.db
    .prepare("INSERT INTO world VALUES(1,?,?,?)")
    .run(json, digest(json), 12345);
  const insert = store.db.prepare("INSERT INTO chunks VALUES(?,?,?)");
  for (const chunk of world.chunks) {
    const text = JSON.stringify(
      tiles.slice(chunk.start, chunk.start + 32 ** 2),
    );
    insert.run(chunk.id, text, digest(text));
  }
  for (const point of world.history)
    store.db
      .prepare("INSERT INTO world_history VALUES(?,?)")
      .run(point.tick, JSON.stringify(point));
  store.db
    .prepare("INSERT INTO world_clock VALUES(1,?,?)")
    .run(world.tick, 1791400000000);
  store.db
    .prepare("INSERT INTO sessions VALUES(?,?,?)")
    .run("retained-owner", world.civilizations[0].id, 12345);
  store.transaction(() =>
    writeWorldArchive(store.db, "older-history", { note: "keep 🌱" }, 6789),
  );
  return world;
}

test("current-law legacy regions upgrade only at save, with exact state, clock and archive continuity on restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-regions-"));
  const path = join(directory, "world.sqlite");
  let store = new Store(path);
  try {
    const world = legacyWorld(store);
    const originalRows = store.db
      .prepare("SELECT * FROM chunks ORDER BY id")
      .all() as { id: string; json: string; checksum: string }[];
    const archive = verifyWorldArchives(store.db);
    const clock = store.db.prepare("SELECT * FROM world_clock").all();
    const owners = store.db.prepare("SELECT * FROM sessions").all();
    const history = store.db.prepare("SELECT * FROM world_history").all();
    const metadata = store.db.prepare("SELECT json,checksum FROM world").get();
    store.close();
    store = new Store(path);
    assert.equal(storageVersion(store.db), 1);
    store.acquireLease();
    const loaded = store.load(0, true);
    assert.deepEqual(loaded, world);
    assert.equal(storageVersion(store.db), 1, "loading is not a schema write");
    store.resumeClock(loaded.tick);
    store.save(loaded);
    assert.equal(storageVersion(store.db), 2);
    const read = regionReader(store.db);
    for (const row of originalRows)
      assert.deepEqual(read(row.id), {
        json: row.json,
        checksum: row.checksum,
        encoded: true,
      });
    assert.equal(
      store.db
        .prepare("SELECT count(*) n FROM chunks WHERE encoding='zstd-frame-1'")
        .get()!.n,
      originalRows.length,
    );
    assert.deepEqual(
      store.db.prepare("SELECT json,checksum FROM world").get(),
      metadata,
    );
    assert.deepEqual(
      store.db.prepare("SELECT * FROM world_clock").all(),
      clock,
    );
    assert.deepEqual(store.db.prepare("SELECT * FROM sessions").all(), owners);
    assert.deepEqual(
      store.db.prepare("SELECT * FROM world_history").all(),
      history,
    );
    assert.deepEqual(verifyWorldArchives(store.db), archive);
    assert.equal(store.interventions().length, 0, "no physical intervention");
    // Neither a no-op save nor a process restart should keep recompressing rows.
    store.db.exec(
      "CREATE TRIGGER unchanged_region BEFORE UPDATE ON chunks BEGIN SELECT RAISE(ABORT,'unexpected region rewrite'); END",
    );
    store.save(loaded);
    store.close();
    store = new Store(path);
    const restored = store.load(0, true);
    assert.deepEqual(restored, world);
    store.save(restored);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("failure after encoding rolls back schema, payloads and checkpoint, then the same Store can retry", () => {
  const store = new Store(":memory:");
  try {
    const world = legacyWorld(store);
    const loaded = store.load(0, true);
    const head = store.db.prepare("SELECT * FROM world").get();
    const rows = store.db.prepare("SELECT * FROM chunks ORDER BY id").all();
    const archives = verifyWorldArchives(store.db);
    store.db.exec(
      "CREATE TRIGGER failed_checkpoint BEFORE UPDATE ON world BEGIN SELECT RAISE(ABORT,'injected checkpoint failure'); END",
    );
    assert.throws(() => store.save(loaded), /injected checkpoint failure/);
    assert.equal(storageVersion(store.db), 1);
    assert.deepEqual(store.db.prepare("SELECT * FROM world").get(), head);
    assert.deepEqual(
      store.db.prepare("SELECT * FROM chunks ORDER BY id").all(),
      rows,
    );
    assert.deepEqual(verifyWorldArchives(store.db), archives);
    store.db.exec("DROP TRIGGER failed_checkpoint");
    store.save(loaded);
    assert.equal(storageVersion(store.db), 2);
    assert.equal(
      store.db
        .prepare("SELECT count(*) n FROM chunks WHERE raw_bytes IS NULL")
        .get()!.n,
      0,
    );
    assert.deepEqual(store.load(0, true), world);
  } finally {
    store.close();
  }
});

test("one region table reads mixed legacy, deliberately plain and packed rows and rejects conflicting or damaged payloads", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE chunks(id TEXT PRIMARY KEY,json TEXT NOT NULL,checksum TEXT NOT NULL); PRAGMA user_version=1;",
    );
    const legacy = '{ "number": 1.23456789012345, "name": "old 🌱" }';
    db.prepare("INSERT INTO chunks VALUES(?,?,?)").run(
      "old",
      legacy,
      digest(legacy),
    );
    db.exec("BEGIN");
    initializeRegions(db);
    db.exec("COMMIT");
    const write = regionWriter(db);
    write("plain", "0", digest("0"));
    const packed = JSON.stringify({ note: "river 🌿 stones ".repeat(10000) });
    write("packed", packed, digest(packed));
    const read = regionReader(db);
    assert.deepEqual(read("old"), {
      json: legacy,
      checksum: digest(legacy),
      encoded: false,
    });
    assert.deepEqual(read("plain"), {
      json: "0",
      checksum: digest("0"),
      encoded: true,
    });
    assert.deepEqual(read("packed"), {
      json: packed,
      checksum: digest(packed),
      encoded: true,
    });
    assert.throws(() => read("missing"), /Region missing is missing/);
    for (const change of [
      "encoding='future-codec'",
      "json='conflicting plaintext'",
      "raw_bytes=1",
      "payload=x'0001'",
      "payload_checksum='bad'",
      "checksum='bad'",
    ]) {
      db.exec("SAVEPOINT damage");
      db.exec(`UPDATE chunks SET ${change} WHERE id='packed'`);
      assert.throws(
        () => read("packed"),
        /Region packed failed its storage checks/,
      );
      db.exec("ROLLBACK TO damage; RELEASE damage");
    }
    db.exec("UPDATE chunks SET payload=x'01' WHERE id='plain'");
    assert.throws(
      () => read("plain"),
      /Region plain failed its storage checks/,
    );
  } finally {
    db.close();
  }
});

test("an incompatible encoded-region schema fails before changing any database bytes", () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-region-schema-"));
  const path = join(directory, "world.sqlite");
  try {
    const store = new Store(path);
    store.save(smallWorld(1847, 64, 64));
    store.close();
    const db = new DatabaseSync(path);
    db.exec("ALTER TABLE chunks DROP COLUMN payload");
    db.close();
    const before = readFileSync(path);
    assert.throws(
      () => new Store(path),
      /World storage schema for chunks is incompatible/,
    );
    assert.deepEqual(readFileSync(path), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
