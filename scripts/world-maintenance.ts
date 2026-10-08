import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { WORLD_VERSION } from "../src/simulation/types";
import { backupDatabase } from "../src/server/backup";
import {
  listWorldArchives,
  storageVersion,
  verifyWorldArchives,
} from "../src/server/archives";

const command = process.argv[2],
  path = resolve(process.env.PRAXANS_DB ?? "data/praxans.sqlite");
if (!command || command === "--help") {
  console.log(
    "Usage: npm run world:inspect\n       npm run world:backup -- [destination.sqlite]\n       node dist/server/maintenance.js verify-archives\nSet PRAXANS_DB to the existing world. Archive verification requires an offline copy. These commands never initialize or reset a world.",
  );
  process.exit(0);
}
if (!existsSync(path))
  throw new Error(
    `No world exists at ${path}; refusing to create an empty save.`,
  );
const db = new DatabaseSync(path, { readOnly: true });
try {
  if (command === "backup") {
    const destination = resolve(
      process.argv[3] ??
        join(
          dirname(path),
          "backups",
          `world-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
        ),
    );
    await backupDatabase(db, destination);
    console.log(`Consistent world backup saved to ${destination}`);
  } else if (command === "inspect") {
    const head = db
      .prepare("SELECT json,checksum,saved_at FROM world WHERE id=1")
      .get() as
      { json: string; checksum: string; saved_at: number } | undefined;
    if (!head) throw new Error("The database has no world checkpoint.");
    const digest = (json: string) =>
      createHash("sha256").update(json).digest("hex");
    if (digest(head.json) !== head.checksum)
      throw new Error("World metadata checksum mismatch.");
    const world = JSON.parse(head.json);
    const regions = db.prepare("SELECT id FROM chunks ORDER BY id").all() as {
      id: string;
    }[];
    const readRegion = db.prepare(
      "SELECT json,checksum FROM chunks WHERE id=?",
    );
    for (const { id } of regions) {
      const region = readRegion.get(id) as { json: string; checksum: string };
      if (digest(region.json) !== region.checksum)
        throw new Error(`Region ${id} checksum mismatch.`);
    }
    console.log(
      JSON.stringify(
        {
          path,
          id: world.id,
          seed: world.seed,
          tick: world.tick,
          format: world.version,
          storageVersion: storageVersion(db),
          laws: world.lawsVersion,
          requiresMigration: world.version !== WORLD_VERSION,
          regions: regions.length,
          people: world.citizens.length,
          communities: world.civilizations.length,
          savedAt: new Date(head.saved_at).toISOString(),
          checksums: "valid",
          archives: listWorldArchives(db),
          archiveVerification:
            "not performed; use verify-archives on an offline copy",
        },
        null,
        2,
      ),
    );
  } else if (command === "verify-archives") {
    const owner = db
      .prepare("SELECT expires_at FROM world_lease WHERE id=1")
      .get() as { expires_at: number } | undefined;
    if (owner && owner.expires_at > Date.now())
      throw new Error(
        "Archive verification requires an offline backup with no active world owner; legacy archives can require substantial memory.",
      );
    const archives = verifyWorldArchives(db);
    console.log(
      JSON.stringify(
        { storageVersion: storageVersion(db), archives, checksums: "valid" },
        null,
        2,
      ),
    );
  } else throw new Error(`Unknown maintenance command: ${command}`);
} finally {
  db.close();
}
