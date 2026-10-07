import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { WORLD_VERSION } from "../src/simulation/types";

const command = process.argv[2],
  path = resolve(process.env.PRAXANS_DB ?? "data/praxans.sqlite");
if (!command || command === "--help") {
  console.log(
    "Usage: npm run world:inspect\n       npm run world:backup -- [destination.sqlite]\nSet PRAXANS_DB to the existing world. Inspection and backup never initialize or reset a world.",
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
    if (existsSync(destination))
      throw new Error("Backup destination already exists; use a new filename.");
    mkdirSync(dirname(destination), { recursive: true });
    db.prepare("VACUUM INTO ?").run(destination);
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
    const regions = db.prepare("SELECT id,json,checksum FROM chunks").all() as {
      id: string;
      json: string;
      checksum: string;
    }[];
    for (const region of regions)
      if (digest(region.json) !== region.checksum)
        throw new Error(`Region ${region.id} checksum mismatch.`);
    console.log(
      JSON.stringify(
        {
          path,
          id: world.id,
          seed: world.seed,
          tick: world.tick,
          format: world.version,
          laws: world.lawsVersion,
          requiresMigration: world.version !== WORLD_VERSION,
          regions: regions.length,
          people: world.citizens.length,
          communities: world.civilizations.length,
          savedAt: new Date(head.saved_at).toISOString(),
          checksums: "valid",
        },
        null,
        2,
      ),
    );
  } else throw new Error(`Unknown maintenance command: ${command}`);
} finally {
  db.close();
}
