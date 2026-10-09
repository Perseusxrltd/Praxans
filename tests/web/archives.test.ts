import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import {
  ARCHIVE_BLOCK_BYTES,
  initializeArchives,
  listWorldArchives,
  verifyWorldArchives,
  worldArchiveBytes,
  writeWorldArchive,
  compactWorldArchive,
} from "../../src/server/archives";
import { Store } from "../../src/server/store";
import { legacyCheckpoint, smallWorld } from "./fixtures";
import { describeMigration, migrateWorld } from "../../src/server/migrations";

const legacySchema =
  "CREATE TABLE world_backups(id TEXT PRIMARY KEY,json TEXT NOT NULL,checksum TEXT NOT NULL,created_at INTEGER NOT NULL)";
const hash = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const archivedText = (db: DatabaseSync, id: string) =>
  Buffer.concat([...worldArchiveBytes(db, id)]).toString();

test("compaction retains original archive bytes, formatting, identity and date across Unicode boundaries", () => {
  const store = new Store(":memory:");
  try {
    const text =
      '{ "note": "' +
      "a".repeat(ARCHIVE_BLOCK_BYTES / 4 - 12) +
      "🌱é水".repeat(70000) +
      '", "zero": -0, "exponent": 1e+0 }\n';
    const id = "original-spacing";
    store.db
      .prepare(
        "INSERT INTO world_backups(id,json,checksum,created_at) VALUES(?,?,?,?)",
      )
      .run(id, text, hash(text), 12345);
    const before = listWorldArchives(store.db)[0];
    const result = store.transaction(() => compactWorldArchive(store.db, id));
    assert.deepEqual(
      {
        id: result.id,
        checksum: result.checksum,
        rawBytes: result.rawBytes,
        createdAt: result.createdAt,
      },
      {
        id: before.id,
        checksum: before.checksum,
        rawBytes: before.rawBytes,
        createdAt: before.createdAt,
      },
    );
    assert.equal(archivedText(store.db, id), text);
    assert.equal(result.encoding, "deflate-parts-1");
    assert.ok(result.parts > 1);
    assert.deepEqual(
      { ...store.transaction(() => compactWorldArchive(store.db, id)) },
      result,
    );
    assert.equal(
      store.db.prepare("SELECT json FROM world_backups WHERE id=?").get(id)!
        .json,
      "",
    );
    assert.equal(verifyWorldArchives(store.db).length, 1);
  } finally {
    store.close();
  }
});

test("corrupt input or a failed archive replacement rolls back compaction without blessing damaged history", () => {
  for (const failure of ["checksum", "write"] as const) {
    const store = new Store(":memory:");
    try {
      const text = '{ "retained": "' + "🌿".repeat(150000) + '" }';
      store.db
        .prepare(
          "INSERT INTO world_backups(id,json,checksum,created_at) VALUES('old',?,?,17)",
        )
        .run(text, failure === "checksum" ? hash("wrong") : hash(text));
      const before = store.db
        .prepare("SELECT * FROM world_backups WHERE id='old'")
        .get();
      if (failure === "write")
        store.db.exec(
          "CREATE TRIGGER reject_compact BEFORE UPDATE ON world_backups BEGIN SELECT RAISE(ABORT,'injected archive conversion failure'); END",
        );
      assert.throws(
        () => store.transaction(() => compactWorldArchive(store.db, "old")),
        failure === "checksum"
          ? /checksum mismatch/
          : /injected archive conversion failure/,
      );
      assert.deepEqual(
        store.db.prepare("SELECT * FROM world_backups WHERE id='old'").get(),
        before,
      );
      assert.equal(
        store.db.prepare("SELECT count(*) n FROM world_backup_parts").get()!.n,
        0,
      );
    } finally {
      store.close();
    }
  }
});

test("a later law-migration failure preserves its checkpoint and exact readable historical archives", () => {
  const store = new Store(":memory:");
  try {
    legacyCheckpoint(store, smallWorld(1847, 64, 64), 7);
    const text = '{ "history": "exact old bytes 🌱" }\n';
    store.db
      .prepare(
        "INSERT INTO world_backups(id,json,checksum,created_at) VALUES('old',?,?,17)",
      )
      .run(text, hash(text));
    const head = store.db.prepare("SELECT * FROM world").get();
    store.db.exec(
      "CREATE TRIGGER reject_next_law BEFORE UPDATE ON world BEGIN SELECT RAISE(ABORT,'injected later migration failure'); END",
    );
    assert.throws(
      () => store.load(0, true),
      /injected later migration failure/,
    );
    assert.deepEqual(store.db.prepare("SELECT * FROM world").get(), head);
    assert.equal(archivedText(store.db, "old"), text);
    assert.equal(listWorldArchives(store.db)[0].encoding, "deflate-parts-1");
    assert.equal(store.interventions().length, 0);
  } finally {
    store.close();
  }
});

test("owned migration matches the pure API without changing its caller's original state", () => {
  for (const version of [5, 6, 7] as const) {
    const store = new Store(":memory:");
    try {
      const legacy = legacyCheckpoint(store, smallWorld(1847, 64, 64), version);
      const before = JSON.stringify(legacy);
      const expected = migrateWorld(legacy);
      assert.equal(JSON.stringify(legacy), before);
      const owned = structuredClone(legacy);
      const result = migrateWorld(owned, { inPlace: true });
      assert.equal(result.world, owned);
      assert.deepEqual(result, expected);
      assert.deepEqual(describeMigration(legacy), expected.interventions);
    } finally {
      store.close();
    }
  }
});

test("a failed commit after owned migration preserves the old checkpoint and archive history", () => {
  const store = new Store(":memory:");
  try {
    const world = smallWorld(1847, 64, 64);
    legacyCheckpoint(store, world, 7);
    const head = store.db.prepare("SELECT * FROM world").get();
    const regions = store.db.prepare("SELECT * FROM chunks ORDER BY id").all();
    store.db.exec(
      "CREATE TRIGGER reject_upgraded_world BEFORE UPDATE ON world WHEN json_extract(NEW.json,'$.version')=12 BEGIN SELECT RAISE(ABORT,'injected migration commit failure'); END",
    );
    assert.throws(
      () => store.load(0, true),
      /injected migration commit failure/,
    );
    assert.deepEqual(store.db.prepare("SELECT * FROM world").get(), head);
    assert.deepEqual(
      store.db.prepare("SELECT * FROM chunks ORDER BY id").all(),
      regions,
    );
    assert.equal(listWorldArchives(store.db).length, 0);
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM world_backup_parts").get()!.n,
      0,
    );
    assert.equal(store.interventions().length, 0);
    store.db.exec("DROP TRIGGER reject_upgraded_world");
    assert.equal(store.load(0, true).version, 12);
    assert.equal(verifyWorldArchives(store.db).length, 1);
    assert.equal(store.interventions().length, 5);
  } finally {
    store.close();
  }
});

test("constructor DDL failure closes the connection that its caller never received", () => {
  const directory = mkdtempSync(
    join(tmpdir(), "praxans-archive-open-failure-"),
  );
  const path = join(directory, "world.sqlite");
  const source = new DatabaseSync(path);
  source.exec("CREATE TABLE world_events(id TEXT)");
  source.close();
  const close = DatabaseSync.prototype.close;
  const closed: DatabaseSync[] = [];
  DatabaseSync.prototype.close = function () {
    closed.push(this);
    return close.call(this);
  };
  try {
    assert.throws(() => new Store(path), /no such column/);
    assert.equal(closed.length, 1);
    assert.throws(() => closed[0].prepare("SELECT 1"), /not open|closed/);
  } finally {
    DatabaseSync.prototype.close = close;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("compressed archives retain exact ordinary world JSON and arbitrary UTF-8 boundaries", () => {
  const store = new Store(":memory:");
  try {
    const world = smallWorld(1847);
    for (const [id, value] of [
      ["real-world", world],
      [
        "unicode",
        {
          id: "世界 🌱",
          optional: undefined,
          zero: -0,
          nested: { quote: '"\\\n\u0000', isolated: "\ud800", yes: true },
          entries: [null, undefined, NaN, , [1, 2], "é🌿水".repeat(60000)],
        },
      ],
    ] as const) {
      const expected = JSON.stringify(value);
      const before = JSON.stringify(value);
      const result = store.transaction(() =>
        writeWorldArchive(store.db, id, value, 12345),
      );
      assert.equal(archivedText(store.db, id), expected);
      assert.equal(result.checksum, hash(expected));
      assert.equal(result.rawBytes, Buffer.byteLength(expected));
      assert.equal(result.createdAt, 12345);
      assert.equal(JSON.stringify(value), before);
      assert.equal(result.encoding, "deflate-parts-1");
      assert.ok(result.parts > 1);
    }
    assert.equal(verifyWorldArchives(store.db).length, 2);
  } finally {
    store.close();
  }
});

test("storage upgrade retains every byte and identity of legacy plaintext archives", () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-archive-legacy-"));
  const path = join(directory, "world.sqlite");
  const json =
    '{ "version": 8, "note": "original formatting 🌱", "tiles": [] }';
  const legacy = new DatabaseSync(path);
  legacy.exec(legacySchema);
  legacy
    .prepare("INSERT INTO world_backups VALUES(?,?,?,?)")
    .run("retained", json, hash(json), 6789);
  assert.equal(archivedText(legacy, "retained"), json);
  legacy.close();
  const store = new Store(path);
  try {
    assert.equal(
      store.db.prepare("PRAGMA user_version").get()!.user_version,
      1,
    );
    const row = store.db
      .prepare("SELECT id,json,checksum,created_at FROM world_backups")
      .get()!;
    assert.deepEqual(
      { ...row },
      { id: "retained", json, checksum: hash(json), created_at: 6789 },
    );
    assert.equal(archivedText(store.db, "retained"), json);
    assert.deepEqual(listWorldArchives(store.db), [
      Object.assign(Object.create(null), {
        id: "retained",
        checksum: hash(json),
        createdAt: 6789,
        encoding: "json",
        rawBytes: Buffer.byteLength(json),
        parts: 0,
      }),
    ]);
    assert.throws(
      () =>
        store.transaction(() =>
          writeWorldArchive(store.db, "retained", { replacement: true }),
        ),
      /UNIQUE/,
    );
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM world_backup_parts").get()!.n,
      0,
    );
    assert.equal(archivedText(store.db, "retained"), json);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("archive failures roll back their blocks and the surrounding world transaction", () => {
  const store = new Store(":memory:");
  try {
    store.db.exec(
      "CREATE TABLE checkpoint_probe(value INTEGER); INSERT INTO checkpoint_probe VALUES(0)",
    );
    store.db.exec(
      "CREATE TRIGGER reject_archive_block BEFORE INSERT ON world_backup_parts WHEN NEW.part=1 BEGIN SELECT RAISE(ABORT,'injected archive failure'); END",
    );
    const value = { records: Array(20).fill("a".repeat(30000)) };
    assert.throws(
      () =>
        store.transaction(() => {
          store.db.prepare("UPDATE checkpoint_probe SET value=1").run();
          writeWorldArchive(store.db, "failed", value);
        }),
      /injected archive failure/,
    );
    assert.equal(
      store.db.prepare("SELECT value FROM checkpoint_probe").get()!.value,
      0,
    );
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM world_backups").get()!.n,
      0,
    );
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM world_backup_parts").get()!.n,
      0,
    );
    store.db.exec("DROP TRIGGER reject_archive_block");
    store.transaction(() => writeWorldArchive(store.db, "complete", value));
    const original = archivedText(store.db, "complete");
    assert.throws(
      () =>
        store.transaction(() => {
          writeWorldArchive(store.db, "later-aborted", value);
          throw new Error("later migration failure");
        }),
      /later migration failure/,
    );
    assert.equal(listWorldArchives(store.db).length, 1);
    assert.equal(archivedText(store.db, "complete"), original);
  } finally {
    store.close();
  }
});

test("archive verification rejects corrupt, missing, oversized and unsupported data", () => {
  const cases = [
    "checksum",
    "missing",
    "extra",
    "length",
    "payload",
    "oversized-input",
    "oversized-output",
    "encoding",
  ];
  for (const mode of cases) {
    const store = new Store(":memory:");
    try {
      store.transaction(() =>
        writeWorldArchive(store.db, "probe", {
          records: Array(20).fill("x".repeat(30000)),
        }),
      );
      if (mode === "checksum")
        store.db
          .prepare("UPDATE world_backups SET checksum=?")
          .run("0".repeat(64));
      if (mode === "missing")
        store.db.exec("DELETE FROM world_backup_parts WHERE part=1");
      if (mode === "extra")
        store.db.exec(
          "INSERT INTO world_backup_parts SELECT archive_id,99,raw_bytes,checksum,payload FROM world_backup_parts WHERE part=0",
        );
      if (mode === "length")
        store.db.exec("UPDATE world_backup_parts SET raw_bytes=1 WHERE part=0");
      if (mode === "payload")
        store.db
          .prepare("UPDATE world_backup_parts SET payload=? WHERE part=0")
          .run(Buffer.from("broken"));
      if (mode === "oversized-input")
        store.db
          .prepare("UPDATE world_backup_parts SET payload=? WHERE part=0")
          .run(Buffer.alloc(ARCHIVE_BLOCK_BYTES + 1025));
      if (mode === "oversized-output")
        store.db
          .prepare("UPDATE world_backup_parts SET payload=? WHERE part=0")
          .run(deflateSync(Buffer.alloc(ARCHIVE_BLOCK_BYTES + 1)));
      if (mode === "encoding")
        store.db.exec("UPDATE world_backups SET encoding='future-codec'");
      assert.throws(() => verifyWorldArchives(store.db), mode);
    } finally {
      store.close();
    }
  }
});

test("unknown or damaged archive schemas fail before modifying the database", () => {
  for (const mode of [
    "future",
    "missing",
    "missing-key",
    "legacy-missing-key",
  ] as const) {
    const directory = mkdtempSync(join(tmpdir(), "praxans-archive-schema-"));
    const path = join(directory, "world.sqlite");
    const db = new DatabaseSync(path);
    try {
      if (mode === "future")
        db.exec(
          "PRAGMA user_version=999; CREATE TABLE retained(value TEXT); INSERT INTO retained VALUES('keep')",
        );
      else if (mode === "missing")
        db.exec(
          "PRAGMA user_version=1; CREATE TABLE retained(value TEXT); INSERT INTO retained VALUES('keep')",
        );
      else if (mode === "legacy-missing-key")
        db.exec(
          "CREATE TABLE world_backups(id TEXT,json TEXT NOT NULL,checksum TEXT NOT NULL,created_at INTEGER NOT NULL)",
        );
      else {
        db.exec(legacySchema);
        initializeArchives(db);
        db.exec(
          "ALTER TABLE world_backups RENAME TO original; CREATE TABLE world_backups(id TEXT,json TEXT NOT NULL,checksum TEXT NOT NULL,created_at INTEGER NOT NULL,encoding TEXT NOT NULL,raw_bytes INTEGER,part_count INTEGER); DROP TABLE original",
        );
      }
    } finally {
      db.close();
    }
    try {
      const before = readFileSync(path);
      assert.throws(() => new Store(path), /storage (?:version|schema)/i);
      assert.deepEqual(readFileSync(path), before);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test(
  "an archive larger than the heap is written and verified without a full-world string",
  { timeout: 60000 },
  () => {
    const moduleUrl = pathToFileURL(resolve("src/server/archives.ts")).href;
    const code = `
    import { DatabaseSync } from 'node:sqlite';
    import { getHeapStatistics } from 'node:v8';
    import { initializeArchives,writeWorldArchive,verifyWorldArchives } from ${JSON.stringify(moduleUrl)};
    const db=new DatabaseSync(':memory:');
    db.exec(${JSON.stringify(legacySchema)});
    initializeArchives(db);
    const value={id:'bounded-encoding',records:Array(2048).fill('x'.repeat(65536))};
    const result=writeWorldArchive(db,'large',value,123);
    verifyWorldArchives(db);
    console.log(JSON.stringify({rawBytes:result.rawBytes,parts:result.parts,heapLimitBytes:getHeapStatistics().heap_size_limit}));
    db.close();
  `;
    const child = spawnSync(
      process.execPath,
      [
        "--max-old-space-size=48",
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        code,
      ],
      {
        encoding: "utf8",
        timeout: 55000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, NODE_OPTIONS: "" },
      },
    );
    assert.equal(child.status, 0, child.stderr || String(child.error));
    const result = JSON.parse(child.stdout);
    assert.ok(result.rawBytes > 128 * 1024 ** 2);
    assert.ok(result.rawBytes > result.heapLimitBytes);
    assert.ok(result.parts > 512);
  },
);
