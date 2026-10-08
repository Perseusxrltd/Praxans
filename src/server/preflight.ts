import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "./store";
import { stepWorld, validateWorld } from "../simulation/engine";

/** Candidate validation runs on a private consistent copy while the actual world keeps ticking. */
export function preflight(database: string) {
  const directory = mkdtempSync(join(tmpdir(), "praxans-preflight-"));
  let store: Store | undefined;
  try {
    const source = new DatabaseSync(database, { readOnly: true });
    try {
      source.prepare("VACUUM INTO ?").run(join(directory, "world.sqlite"));
    } finally {
      source.close();
    }
    store = new Store(join(directory, "world.sqlite"));
    const row = store.db.prepare("SELECT json FROM world WHERE id=1").get() as {
      json: string;
    };
    if (!row) throw new Error("The existing world is missing.");
    const before = JSON.parse(row.json);
    const world = store.load(0, true);
    for (const key of [
      "id",
      "seed",
      "tick",
      "rng",
      "nextId",
      "generationVersion",
    ] as const)
      if (world[key] !== before[key])
        throw new Error(`Candidate changed existing ${key}.`);
    stepWorld(world, 32);
    validateWorld(world);
    return {
      id: world.id,
      seed: world.seed,
      sourceTick: before.tick,
      tick: world.tick,
      format: world.version,
      laws: world.lawsVersion,
    };
  } finally {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
