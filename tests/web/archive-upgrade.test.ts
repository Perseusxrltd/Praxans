import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, digest } from "../../src/server/store";
import { initializeRegions } from "../../src/server/regions";
import { storageVersion } from "../../src/server/storage-format";
import { checkpointFingerprint } from "../../src/server/checkpoint";
import {
  compactWorldArchive,
  listWorldArchives,
  worldArchiveBytes,
  writeWorldArchive,
  DIGIT_ARCHIVE_ENCODING,
} from "../../src/server/archives";
import { smallWorld } from "./fixtures";

const original =
  '{ "values": [' +
  Array.from(
    { length: 24000 },
    (_, i) =>
      "0." +
      String(Math.imul(i + 1, 2654435761) >>> 0).padStart(10, "0") +
      String(i * 17),
  ).join(",") +
  '], "note": "原始 🌿", "zero": -0, "exp": 1e+0003 }\n';
const text = (store: Store, id = "retained") =>
  Buffer.concat([...worldArchiveBytes(store.db, id)]).toString();
const parts = (store: Store) =>
  store.db
    .prepare(
      "SELECT archive_id,part,raw_bytes,checksum,payload FROM world_backup_parts ORDER BY archive_id,part",
    )
    .all();

function legacyArchive(store: Store) {
  store.db
    .prepare(
      "INSERT INTO world_backups(id,json,checksum,created_at) VALUES('retained',?,?,12345)",
    )
    .run(original, digest(original));
  const archive = store.transaction(() =>
    compactWorldArchive(store.db, "retained"),
  );
  assert.equal(archive.encoding, "deflate-parts-1");
  return archive;
}

test("storage 3 reduces archive blocks while preserving original bytes, identities and incompressible fallbacks", () => {
  const store = new Store(":memory:");
  try {
    const archive = legacyArchive(store);
    store.transaction(() =>
      writeWorldArchive(store.db, "tiny", { n: 1 }, 6789),
    );
    const before = parts(store);
    store.transaction(() => initializeRegions(store.db));
    assert.equal(storageVersion(store.db), 2);
    const converted = store.transaction(() =>
      compactWorldArchive(store.db, "retained"),
    );
    assert.deepEqual(converted, {
      ...archive,
      encoding: DIGIT_ARCHIVE_ENCODING,
    });
    store.transaction(() => compactWorldArchive(store.db, "tiny"));
    assert.equal(storageVersion(store.db), 3);
    const after = parts(store);
    assert.deepEqual(
      after.map(({ payload, ...row }) => row),
      before.map(({ payload, ...row }) => row),
    );
    assert.ok(
      after.some(
        (row, i) =>
          (row.payload as Uint8Array).length <
          (before[i].payload as Uint8Array).length,
      ),
    );
    for (let i = 0; i < after.length; i++)
      assert.ok(
        (after[i].payload as Uint8Array).length <=
          (before[i].payload as Uint8Array).length,
      );
    assert.deepEqual(
      after.filter((r) => r.archive_id === "tiny"),
      before.filter((r) => r.archive_id === "tiny"),
    );
    assert.equal(text(store), original);
    assert.equal(text(store, "tiny"), '{"n":1}');
    store.db.exec(
      "CREATE TRIGGER no_repacking BEFORE UPDATE ON world_backup_parts BEGIN SELECT RAISE(ABORT,'unexpected repeated packing'); END",
    );
    store.transaction(() => compactWorldArchive(store.db, "retained"));
    assert.equal(text(store), original);
  } finally {
    store.close();
  }
});

test("conversion failure rolls back every replacement, archive descriptor and storage-version change", () => {
  for (const failure of ["checksum", "write", "stored", "header"] as const) {
    const store = new Store(":memory:");
    try {
      legacyArchive(store);
      store.transaction(() => initializeRegions(store.db));
      if (failure === "checksum")
        store.db.exec("UPDATE world_backups SET checksum='wrong'");
      if (failure === "write")
        store.db.exec(
          "CREATE TRIGGER fail_part BEFORE UPDATE ON world_backup_parts WHEN NEW.part=1 BEGIN SELECT RAISE(ABORT,'injected part failure'); END",
        );
      if (failure === "stored")
        store.db.exec(
          "CREATE TRIGGER damage_part AFTER UPDATE ON world_backup_parts WHEN NEW.part=1 BEGIN UPDATE world_backup_parts SET payload=x'00' WHERE part=0; END",
        );
      if (failure === "header")
        store.db.exec(
          "CREATE TRIGGER fail_header BEFORE UPDATE ON world_backups BEGIN SELECT RAISE(ABORT,'injected header failure'); END",
        );
      const before = parts(store),
        head = store.db.prepare("SELECT * FROM world_backups").all();
      assert.throws(() =>
        store.transaction(() => compactWorldArchive(store.db, "retained")),
      );
      assert.equal(storageVersion(store.db), 2);
      assert.deepEqual(parts(store), before);
      assert.deepEqual(
        store.db.prepare("SELECT * FROM world_backups").all(),
        head,
      );
    } finally {
      store.close();
    }
  }
});

test("current-law restart upgrades archives without changing the world, clock, ownership or region bytes", () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-archive-upgrade-"));
  const path = join(directory, "world.sqlite");
  let store = new Store(path);
  try {
    legacyArchive(store);
    const world = smallWorld(1847, 64, 64);
    store.resumeClock(world.tick, 1791400000000);
    store.save(world);
    store.db
      .prepare("INSERT INTO sessions VALUES('retained-owner',?,12345)")
      .run(world.civilizations[0].id);
    const preserved = () =>
      Object.fromEntries(
        [
          "world",
          "chunks",
          "world_clock",
          "sessions",
          "world_events",
          "world_history",
          "interventions",
        ].map((table) => [
          table,
          store.db.prepare(`SELECT * FROM ${table}`).all(),
        ]),
      );
    const before = preserved(),
      compatibleBefore = checkpointFingerprint(path);
    store.close();
    store = new Store(path);
    store.acquireLease();
    assert.deepEqual(store.load(0, true), world);
    assert.equal(storageVersion(store.db), 3);
    assert.deepEqual(preserved(), before);
    assert.notEqual(
      checkpointFingerprint(path),
      compatibleBefore,
      "older storage compatibility must not be inferred from an unchanged world checksum",
    );
    assert.equal(text(store), original);
    store.db.exec(
      "CREATE TRIGGER no_reload_repacking BEFORE UPDATE ON world_backup_parts BEGIN SELECT RAISE(ABORT,'unexpected repeated packing'); END",
    );
    store.close();
    store = new Store(path);
    store.acquireLease();
    assert.deepEqual(store.load(0, true), world);
    assert.equal(text(store), original);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a later law failure retains the old checkpoint and completed storage upgrade for compatible forward recovery", () => {
  const store = new Store(":memory:");
  try {
    legacyArchive(store);
    const world = smallWorld(1847, 64, 64);
    store.save(world);
    const row = store.db.prepare("SELECT json FROM world").get() as {
      json: string;
    };
    const old = JSON.parse(row.json);
    old.version = 17;
    old.lawsVersion = "biosphere-1.11";
    const json = JSON.stringify(old);
    store.db
      .prepare("UPDATE world SET json=?,checksum=?")
      .run(json, digest(json));
    const before = store.db.prepare("SELECT * FROM world").get();
    store.db.exec(
      "CREATE TRIGGER reject_law BEFORE UPDATE ON world BEGIN SELECT RAISE(ABORT,'injected later law failure'); END",
    );
    assert.throws(() => store.load(0, true), /injected later law failure/);
    assert.equal(storageVersion(store.db), 3);
    assert.deepEqual(store.db.prepare("SELECT * FROM world").get(), before);
    assert.equal(listWorldArchives(store.db).length, 1);
    assert.equal(text(store), original);
    assert.equal(store.interventions().length, 0);
    store.db.exec("DROP TRIGGER reject_law");
    assert.deepEqual(store.load(0, true), world);
    assert.equal(listWorldArchives(store.db).length, 2);
    assert.equal(text(store), original);
  } finally {
    store.close();
  }
});

test("unknown current laws are rejected before changing the representation of history", () => {
  const store = new Store(":memory:");
  try {
    legacyArchive(store);
    store.save(smallWorld(1847, 64, 64));
    const row = store.db.prepare("SELECT json FROM world").get() as {
      json: string;
    };
    const world = JSON.parse(row.json);
    world.lawsVersion = "future-unrecognized-laws";
    const json = JSON.stringify(world);
    store.db
      .prepare("UPDATE world SET json=?,checksum=?")
      .run(json, digest(json));
    const before = parts(store),
      archives = listWorldArchives(store.db);
    assert.throws(() => store.load(0, true), /laws are incompatible/);
    assert.equal(storageVersion(store.db), 2);
    assert.deepEqual(parts(store), before);
    assert.deepEqual(listWorldArchives(store.db), archives);
  } finally {
    store.close();
  }
});

test("all archive capabilities are checked before any earlier archive is converted", () => {
  for (const invalid of ["wrong-version", "unknown-later-encoding"]) {
    const store = new Store(":memory:");
    try {
      legacyArchive(store);
      store.save(smallWorld(1847, 64, 64));
      if (invalid === "wrong-version")
        store.db
          .prepare("UPDATE world_backups SET encoding=?")
          .run(DIGIT_ARCHIVE_ENCODING);
      else
        store.db
          .prepare(
            "INSERT INTO world_backups(id,json,checksum,created_at,encoding) VALUES('zz-future','{}',?,12345,'unknown-codec')",
          )
          .run(digest("{}"));
      const before = parts(store),
        head = store.db
          .prepare("SELECT * FROM world_backups ORDER BY id")
          .all();
      assert.throws(
        () => store.load(0, true),
        invalid === "wrong-version"
          ? /require storage version 3/
          : /Unsupported world archive encoding/,
      );
      assert.equal(storageVersion(store.db), 2);
      assert.deepEqual(parts(store), before);
      assert.deepEqual(
        store.db.prepare("SELECT * FROM world_backups ORDER BY id").all(),
        head,
      );
    } finally {
      store.close();
    }
  }
});

test("new archive writes verify stored bytes and immutable manifests before committing", () => {
  for (const invalid of ["payload", "manifest"]) {
    const store = new Store(":memory:");
    try {
      store.transaction(() => initializeRegions(store.db));
      if (invalid === "payload")
        store.db.exec(
          "CREATE TRIGGER damage_new_part AFTER INSERT ON world_backup_parts BEGIN UPDATE world_backup_parts SET payload=x'00' WHERE archive_id=NEW.archive_id AND part=NEW.part; END",
        );
      else
        store.db.exec(
          "CREATE TRIGGER damage_new_manifest AFTER UPDATE ON world_backups BEGIN UPDATE world_backups SET created_at=created_at+1 WHERE id=NEW.id; END",
        );
      assert.throws(() =>
        store.transaction(() =>
          writeWorldArchive(
            store.db,
            "new",
            { number: 123456789012345 },
            12345,
          ),
        ),
      );
      assert.equal(storageVersion(store.db), 2);
      assert.deepEqual(listWorldArchives(store.db), []);
      assert.deepEqual(parts(store), []);
    } finally {
      store.close();
    }
  }
});
