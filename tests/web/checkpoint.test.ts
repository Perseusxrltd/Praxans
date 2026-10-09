import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { checkpointFingerprint } from "../../src/server/checkpoint";

test("runtime fallback distinguishes storage-only or regional changes from an unchanged world", () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-checkpoint-"));
  const path = join(directory, "world.sqlite");
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE world(id INTEGER PRIMARY KEY,checksum TEXT,saved_at INTEGER);
      CREATE TABLE chunks(id TEXT PRIMARY KEY,checksum TEXT);
      CREATE TABLE world_lease(id INTEGER PRIMARY KEY,token TEXT,expires_at INTEGER);
      INSERT INTO world VALUES(1,'same-world',0);
      INSERT INTO chunks VALUES('region-a','original-region');
      INSERT INTO world_lease VALUES(1,'old-owner',1);
    `);
    const original = checkpointFingerprint(path);
    db.exec(
      "UPDATE world SET saved_at=1; UPDATE world_lease SET token='next-owner',expires_at=999999;",
    );
    db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
    assert.equal(checkpointFingerprint(path), original);
    db.exec("PRAGMA user_version=2;");
    assert.notEqual(checkpointFingerprint(path), original);
    db.exec("PRAGMA user_version=0;");
    assert.equal(checkpointFingerprint(path), original);
    db.exec("ALTER TABLE chunks ADD COLUMN encoding TEXT;");
    const schemaChanged = checkpointFingerprint(path);
    assert.notEqual(schemaChanged, original);
    db.exec("UPDATE chunks SET checksum='changed-region';");
    assert.notEqual(checkpointFingerprint(path), schemaChanged);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
