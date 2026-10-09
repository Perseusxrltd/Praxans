import type { DatabaseSync } from "node:sqlite";
import { decodeRegion, encodeRegion, type EncodedRegion } from "./region-codec";
import {
  requireColumns,
  storageVersion,
  type StorageColumns,
} from "./storage-format";

const legacyColumns: StorageColumns = [
  ["id", "TEXT", 1, 0],
  ["json", "TEXT", 0, 1],
  ["checksum", "TEXT", 0, 1],
];
const encodedColumns: StorageColumns = [
  ...legacyColumns,
  ["encoding", "TEXT", 0, 1],
  ["raw_bytes", "INTEGER", 0, 0],
  ["payload", "BLOB", 0, 0],
  ["payload_checksum", "TEXT", 0, 0],
];

export function checkRegionStorage(db: DatabaseSync): number {
  const version = storageVersion(db);
  const exists = db
    .prepare("SELECT 1 FROM sqlite_schema WHERE name='chunks'")
    .get();
  if (!exists && version === 0) return version;
  requireColumns(db, "chunks", version < 2 ? legacyColumns : encodedColumns);
  return version;
}

/** Run inside the owner's save transaction, never during constructor setup. */
export function initializeRegions(db: DatabaseSync): void {
  if (checkRegionStorage(db) >= 2) return;
  db.exec(`
    ALTER TABLE chunks ADD COLUMN encoding TEXT NOT NULL DEFAULT 'json';
    ALTER TABLE chunks ADD COLUMN raw_bytes INTEGER;
    ALTER TABLE chunks ADD COLUMN payload BLOB;
    ALTER TABLE chunks ADD COLUMN payload_checksum TEXT;
    PRAGMA user_version=2;
  `);
}

/** One authoritative row; legacy plaintext and new encoded rows may coexist. */
export function regionReader(db: DatabaseSync) {
  const version = checkRegionStorage(db);
  const select = db.prepare("SELECT * FROM chunks WHERE id=?");
  return (id: string): { json: string; checksum: string; encoded: boolean } => {
    const row = select.get(id) as
      | {
          json: string;
          checksum: string;
          encoding?: EncodedRegion["encoding"];
          raw_bytes?: number | null;
          payload?: Uint8Array | null;
          payload_checksum?: string | null;
        }
      | undefined;
    if (!row)
      throw new Error(`Region ${id} is missing; preserve the database.`);
    try {
      if (typeof row.json !== "string" || typeof row.checksum !== "string")
        throw new Error("Region row is incomplete.");
      const encoding = version < 2 ? "json" : row.encoding;
      if (
        encoding === "json" &&
        (row.payload != null || row.payload_checksum != null)
      )
        throw new Error("Plaintext region has an unexpected encoded payload.");
      if (encoding === "zstd-frame-1" && row.json !== "")
        throw new Error("Encoded region has conflicting plaintext.");
      const rawBytes =
        encoding === "json" && row.raw_bytes == null
          ? Buffer.byteLength(row.json)
          : row.raw_bytes;
      const json = decodeRegion(
        {
          encoding,
          rawBytes,
          payload: encoding === "json" ? row.json : row.payload,
          payloadChecksum: row.payload_checksum ?? null,
        } as EncodedRegion,
        row.checksum,
      );
      return { json, checksum: row.checksum, encoded: row.raw_bytes != null };
    } catch (cause) {
      throw new Error(
        `Region ${id} failed its storage checks; preserve the database.`,
        { cause },
      );
    }
  };
}

export function regionWriter(db: DatabaseSync) {
  const write = db.prepare(
    `INSERT INTO chunks(id,json,checksum,encoding,raw_bytes,payload,payload_checksum)
     VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
     json=excluded.json,checksum=excluded.checksum,encoding=excluded.encoding,
     raw_bytes=excluded.raw_bytes,payload=excluded.payload,payload_checksum=excluded.payload_checksum`,
  );
  return (id: string, json: string, checksum: string): void => {
    const encoded = encodeRegion(json);
    write.run(
      id,
      encoded.encoding === "json" ? encoded.payload : "",
      checksum,
      encoded.encoding,
      encoded.rawBytes,
      encoded.encoding === "json" ? null : encoded.payload,
      encoded.payloadChecksum,
    );
  };
}
