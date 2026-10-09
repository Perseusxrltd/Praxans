import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

/**
 * A previous runtime may resume only the same logical checkpoint and storage
 * representation. Lease renewal, WAL checkpointing and saved_at are not world
 * changes. This is a bounded row-by-row compatibility fingerprint, not a full
 * integrity check of every stored payload or historical record.
 */
export function checkpointFingerprint(database: string): string {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    db.exec("BEGIN");
    const world = db.prepare("SELECT checksum FROM world WHERE id=1").get() as
      { checksum: string } | undefined;
    if (!world) throw new Error("The expected world checkpoint is missing.");
    const hash = createHash("sha256");
    const add = (value: unknown) => hash.update(JSON.stringify(value) + "\n");
    add({ world: world.checksum });
    add(db.prepare("PRAGMA user_version").get());
    for (const row of db
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name",
      )
      .iterate())
      add(row);
    for (const row of db
      .prepare("SELECT id,checksum FROM chunks ORDER BY id")
      .iterate())
      add(row);
    return hash.digest("hex");
  } finally {
    db.close();
  }
}
