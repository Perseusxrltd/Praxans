import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { requireColumns, storageVersion } from "./storage-format";
import {
  ARCHIVE_BLOCK_BYTES,
  DIGIT_ARCHIVE_ENCODING,
  decodeArchiveBlock,
  encodeDigitArchiveBlock,
} from "./archive-codec";

export { STORAGE_VERSION, storageVersion } from "./storage-format";
export { ARCHIVE_BLOCK_BYTES, DIGIT_ARCHIVE_ENCODING } from "./archive-codec";
const encoding = "deflate-parts-1";
const compressionLevel = 6;
const sha256 = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

const legacyColumns: [string, string, number, number][] = [
  ["id", "TEXT", 1, 0],
  ["json", "TEXT", 0, 1],
  ["checksum", "TEXT", 0, 1],
  ["created_at", "INTEGER", 0, 1],
];

function validateArchiveSchema(db: DatabaseSync): void {
  requireColumns(db, "world_backups", [
    ...legacyColumns,
    ["encoding", "TEXT", 0, 1],
    ["raw_bytes", "INTEGER", 0, 0],
    ["part_count", "INTEGER", 0, 0],
  ]);
  requireColumns(db, "world_backup_parts", [
    ["archive_id", "TEXT", 1, 1],
    ["part", "INTEGER", 2, 1],
    ["raw_bytes", "INTEGER", 0, 1],
    ["checksum", "TEXT", 0, 1],
    ["payload", "BLOB", 0, 1],
  ]);
}

export function checkArchiveStorage(db: DatabaseSync): number {
  const version = storageVersion(db);
  if (version > 0) validateArchiveSchema(db);
  else if (
    db.prepare("SELECT 1 FROM sqlite_master WHERE name='world_backups'").get()
  )
    requireColumns(db, "world_backups", legacyColumns);
  return version;
}

/** Storage encoding evolves independently of physical world state and laws. */
export function initializeArchives(db: DatabaseSync): void {
  if (checkArchiveStorage(db) === 0) {
    requireColumns(db, "world_backups", legacyColumns);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`
        ALTER TABLE world_backups ADD COLUMN encoding TEXT NOT NULL DEFAULT 'json';
        ALTER TABLE world_backups ADD COLUMN raw_bytes INTEGER;
        ALTER TABLE world_backups ADD COLUMN part_count INTEGER;
        CREATE TABLE world_backup_parts (
          archive_id TEXT NOT NULL,
          part INTEGER NOT NULL,
          raw_bytes INTEGER NOT NULL,
          checksum TEXT NOT NULL,
          payload BLOB NOT NULL,
          PRIMARY KEY(archive_id,part)
        );
        PRAGMA user_version=1;
        COMMIT;
      `);
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* SQLite may already have rolled back an I/O failure. */
      }
      throw error;
    }
  }
  // Check keys as well as names: an archive identity must remain unique.
  validateArchiveSchema(db);
}

/**
 * World state is ordinary JSON data. Serialize root arrays one record at a
 * time, retaining JSON.stringify's key order and number/string encoding.
 * Extra string memory is bounded by the largest record, not the whole world.
 */
function* worldJson(world: object): Generator<string> {
  yield "{";
  let comma = "";
  for (const [key, value] of Object.entries(world)) {
    if (value === undefined) continue;
    yield comma + JSON.stringify(key) + ":";
    comma = ",";
    if (Array.isArray(value)) {
      yield "[";
      for (let index = 0; index < value.length; index++) {
        if (index) yield ",";
        yield JSON.stringify(value[index]) ?? "null";
      }
      yield "]";
    } else {
      const json = JSON.stringify(value);
      if (json === undefined)
        throw new Error("A world archive requires ordinary JSON data.");
      yield json;
    }
  }
  yield "}";
}

function* blocks(pieces: Iterable<string>): Generator<Buffer> {
  const block = Buffer.allocUnsafe(ARCHIVE_BLOCK_BYTES);
  let used = 0;
  for (const piece of pieces) {
    const bytes = Buffer.from(piece);
    let offset = 0;
    while (offset < bytes.length) {
      const count = Math.min(bytes.length - offset, block.length - used);
      bytes.copy(block, used, offset, offset + count);
      used += count;
      offset += count;
      if (used === block.length) {
        yield block;
        used = 0;
      }
    }
  }
  if (used) yield block.subarray(0, used);
}

export interface WorldArchive {
  id: string;
  checksum: string;
  createdAt: number;
  encoding: string;
  rawBytes: number;
  parts: number;
}

export function listWorldArchives(db: DatabaseSync): WorldArchive[] {
  const version = checkArchiveStorage(db);
  const extra =
    version === 0
      ? "'json' AS encoding,length(CAST(json AS BLOB)) AS rawBytes,0 AS parts"
      : "encoding,coalesce(raw_bytes,length(CAST(json AS BLOB))) AS rawBytes,coalesce(part_count,0) AS parts";
  const archives = db
    .prepare(
      `SELECT id,checksum,created_at AS createdAt,${extra} FROM world_backups ORDER BY id`,
    )
    .all() as unknown as WorldArchive[];
  // Check the complete descriptor set before any independent conversion commits.
  for (const archive of archives) {
    if (
      archive.encoding !== "json" &&
      archive.encoding !== encoding &&
      archive.encoding !== DIGIT_ARCHIVE_ENCODING
    )
      throw new Error(
        `Unsupported world archive encoding ${archive.encoding}.`,
      );
    if (archive.encoding === DIGIT_ARCHIVE_ENCODING && version < 3)
      throw new Error("Digit archive blocks require storage version 3.");
  }
  return archives;
}

function verifyStoredArchive(db: DatabaseSync, expected: WorldArchive): void {
  const stored = listWorldArchives(db).find(
    (archive) => archive.id === expected.id,
  );
  if (
    !stored ||
    (Object.keys(expected) as (keyof WorldArchive)[]).some(
      (key) => stored[key] !== expected[key],
    )
  )
    throw new Error(
      `World archive ${expected.id} manifest changed during its write.`,
    );
  for (const bytes of worldArchiveBytes(db, expected.id)) void bytes;
}

// Version 3 builds on the encoded-region schema of version 2. Legacy schema-1
// archives keep their existing codec until the ordinary regional save upgrades it.
function targetEncoding(db: DatabaseSync): string {
  return storageVersion(db) >= 2 ? DIGIT_ARCHIVE_ENCODING : encoding;
}

function markEncoding(db: DatabaseSync, target: string): void {
  if (target === DIGIT_ARCHIVE_ENCODING && storageVersion(db) === 2)
    db.exec("PRAGMA user_version=3;");
}

function writeParts(
  db: DatabaseSync,
  id: string,
  pieces: Iterable<string>,
  target: string,
) {
  const insert = db.prepare("INSERT INTO world_backup_parts VALUES(?,?,?,?,?)");
  const hash = createHash("sha256");
  let rawBytes = 0,
    parts = 0;
  for (const bytes of blocks(pieces)) {
    hash.update(bytes);
    rawBytes += bytes.length;
    let packed: Buffer = deflateSync(bytes, { level: compressionLevel });
    if (target === DIGIT_ARCHIVE_ENCODING) {
      const candidate = encodeDigitArchiveBlock(bytes);
      if (candidate.length < packed.length) packed = candidate;
    }
    insert.run(id, parts++, bytes.length, sha256(bytes), packed);
  }
  return { checksum: hash.digest("hex"), rawBytes, parts };
}

/** Slice without splitting a UTF-16 surrogate pair or allocating a second full byte buffer. */
function* textPieces(text: string): Generator<string> {
  for (let start = 0; start < text.length;) {
    let end = Math.min(text.length, start + ARCHIVE_BLOCK_BYTES / 4);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
    yield text.slice(start, end);
    start = end;
  }
}

/**
 * Losslessly pack an existing archive inside a Store transaction.
 * The original text and checksum remain authoritative: never parse/reserialize
 * history. Run before loading terrain so the old large row does not overlap a
 * second fully decoded world. Failure preserves the original archive and parts.
 * Legacy regional schema retains the old codec. Encoded-region worlds mark
 * storage version 3 in this same transaction before using digit-stream blocks.
 */
export function compactWorldArchive(
  db: DatabaseSync,
  id: string,
): WorldArchive {
  const archive = listWorldArchives(db).find((item) => item.id === id);
  if (!archive) throw new Error(`Unknown world archive ${id}.`);
  if (
    archive.encoding !== "json" &&
    archive.encoding !== encoding &&
    archive.encoding !== DIGIT_ARCHIVE_ENCODING
  )
    throw new Error(`Unsupported world archive encoding ${archive.encoding}.`);
  if (archive.encoding === DIGIT_ARCHIVE_ENCODING) {
    for (const bytes of worldArchiveBytes(db, id)) void bytes;
    return archive;
  }
  const target = targetEncoding(db);
  db.exec("SAVEPOINT praxans_archive_compact");
  try {
    markEncoding(db, target);
    if (archive.encoding === encoding) {
      const size = db.prepare(
        "SELECT length(payload) AS bytes FROM world_backup_parts WHERE archive_id=? AND part=?",
      );
      const replace = db.prepare(
        "UPDATE world_backup_parts SET payload=? WHERE archive_id=? AND part=?",
      );
      let part = 0;
      // Each iterator step reads one bounded block. Its original checksum and
      // the complete original byte stream must verify before this can commit.
      for (const bytes of worldArchiveBytes(db, id)) {
        const packed =
          target === DIGIT_ARCHIVE_ENCODING
            ? encodeDigitArchiveBlock(bytes)
            : deflateSync(bytes, { level: compressionLevel });
        const current = size.get(id, part) as { bytes: number };
        if (packed.length < current.bytes) replace.run(packed, id, part);
        part++;
      }
      if (target !== archive.encoding)
        db.prepare("UPDATE world_backups SET encoding=? WHERE id=?").run(
          target,
          id,
        );
      // Also verify the actual replacement, including writes affected by a
      // database trigger or fault. Failure rolls back every changed block.
      verifyStoredArchive(db, { ...archive, encoding: target });
      db.exec("RELEASE praxans_archive_compact");
      return { ...archive, encoding: target };
    }
    if (
      db
        .prepare("SELECT count(*) n FROM world_backup_parts WHERE archive_id=?")
        .get(id)!.n !== 0
    )
      throw new Error(`Plaintext world archive ${id} has unexpected blocks.`);
    const row = db
      .prepare("SELECT json FROM world_backups WHERE id=? AND encoding='json'")
      .get(id) as { json: string };
    const written = writeParts(db, id, textPieces(row.json), target);
    if (
      written.checksum !== archive.checksum ||
      written.rawBytes !== archive.rawBytes
    )
      throw new Error(
        `World archive ${id} checksum mismatch; original history preserved.`,
      );
    db.prepare(
      "UPDATE world_backups SET json='',encoding=?,raw_bytes=?,part_count=? WHERE id=?",
    ).run(target, written.rawBytes, written.parts, id);
    // Validate the stored compressed representation before dropping the original
    // from this transaction. Any malformed or altered block rolls it all back.
    verifyStoredArchive(db, { ...archive, encoding: target, ...written });
    db.exec("RELEASE praxans_archive_compact");
    return { ...archive, encoding: target, ...written };
  } catch (error) {
    try {
      db.exec(
        "ROLLBACK TO praxans_archive_compact; RELEASE praxans_archive_compact",
      );
    } catch {
      /* Retain the initial I/O or checksum failure if SQLite rolled back. */
    }
    throw error;
  }
}

/** Call inside the same Store transaction as the corresponding world migration. */
export function writeWorldArchive(
  db: DatabaseSync,
  id: string,
  world: object,
  createdAt = Date.now(),
): WorldArchive {
  const target = targetEncoding(db);
  db.exec("SAVEPOINT praxans_archive_write");
  try {
    markEncoding(db, target);
    // Reserve the immutable identity before spending work; never overwrite it.
    db.prepare(
      "INSERT INTO world_backups(id,json,checksum,created_at,encoding,raw_bytes,part_count) VALUES(?,'','',?,?,0,0)",
    ).run(id, createdAt, target);
    const { checksum, rawBytes, parts } = writeParts(
      db,
      id,
      worldJson(world),
      target,
    );
    db.prepare(
      "UPDATE world_backups SET checksum=?,raw_bytes=?,part_count=? WHERE id=?",
    ).run(checksum, rawBytes, parts, id);
    verifyStoredArchive(db, {
      id,
      checksum,
      createdAt,
      encoding: target,
      rawBytes,
      parts,
    });
    db.exec("RELEASE praxans_archive_write");
    return { id, checksum, createdAt, encoding: target, rawBytes, parts };
  } catch (error) {
    try {
      db.exec(
        "ROLLBACK TO praxans_archive_write; RELEASE praxans_archive_write",
      );
    } catch {
      /* Preserve the original failure if SQLite rolled back the outer write. */
    }
    throw error;
  }
}

/**
 * Drain completely before claiming verification. New blocks are bounded;
 * legacy plaintext archives still require reading their original single row.
 * Full archive verification belongs on an independent offline backup.
 */
export function* worldArchiveBytes(
  db: DatabaseSync,
  id: string,
): Generator<Uint8Array> {
  const archive = listWorldArchives(db).find((item) => item.id === id);
  if (!archive) throw new Error(`Unknown world archive ${id}.`);
  const hash = createHash("sha256");
  let total = 0;
  if (archive.encoding === "json") {
    const row = db
      .prepare("SELECT json FROM world_backups WHERE id=?")
      .get(id) as { json: string };
    const bytes = Buffer.from(row.json);
    hash.update(bytes);
    total = bytes.length;
    yield bytes;
  } else if (
    archive.encoding === encoding ||
    archive.encoding === DIGIT_ARCHIVE_ENCODING
  ) {
    if (archive.encoding === DIGIT_ARCHIVE_ENCODING && storageVersion(db) < 3)
      throw new Error("Digit archive blocks require storage version 3.");
    if (
      !Number.isSafeInteger(archive.parts) ||
      archive.parts < 1 ||
      !Number.isSafeInteger(archive.rawBytes) ||
      archive.rawBytes < 1 ||
      Math.ceil(archive.rawBytes / ARCHIVE_BLOCK_BYTES) !== archive.parts
    )
      throw new Error(`Invalid world archive manifest ${id}.`);
    const count = db
      .prepare(
        "SELECT count(*) AS n FROM world_backup_parts WHERE archive_id=?",
      )
      .get(id)!;
    if (count.n !== archive.parts)
      throw new Error(`World archive ${id} has missing or unexpected blocks.`);
    const get = db.prepare(
      "SELECT raw_bytes,checksum,payload FROM world_backup_parts WHERE archive_id=? AND part=? AND typeof(payload)='blob' AND length(payload)<=?",
    );
    for (let part = 0; part < archive.parts; part++) {
      const row = get.get(id, part, ARCHIVE_BLOCK_BYTES + 1024) as
        | { raw_bytes: number; checksum: string; payload: Uint8Array }
        | undefined;
      const expected = Math.min(ARCHIVE_BLOCK_BYTES, archive.rawBytes - total);
      if (!row || row.raw_bytes !== expected)
        throw new Error(`Invalid world archive ${id} block ${part}.`);
      const bytes = decodeArchiveBlock(
        row.payload,
        expected,
        archive.encoding === DIGIT_ARCHIVE_ENCODING,
      );
      if (bytes.length !== expected || sha256(bytes) !== row.checksum)
        throw new Error(`World archive ${id} block ${part} checksum mismatch.`);
      hash.update(bytes);
      total += bytes.length;
      yield bytes;
    }
  } else
    throw new Error(`Unsupported world archive encoding ${archive.encoding}.`);
  if (total !== archive.rawBytes || hash.digest("hex") !== archive.checksum)
    throw new Error(`World archive ${id} checksum mismatch.`);
}

export function verifyWorldArchives(db: DatabaseSync): WorldArchive[] {
  const archives = listWorldArchives(db);
  for (const archive of archives)
    for (const bytes of worldArchiveBytes(db, archive.id)) void bytes;
  return archives;
}
