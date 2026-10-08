import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "./store";
import { stepWorld, validateWorld } from "../simulation/engine";
import { unappliedRenewal, readRenewal } from "./intervention";
import { renewCommunities } from "../simulation/renewal";
import type { World } from "../simulation/types";

/** Candidate validation runs on a private consistent copy while the actual world keeps ticking. */
export function preflight(
  database: string,
  directory = mkdtempSync(join(tmpdir(), "praxans-preflight-")),
) {
  let store: Store | undefined;
  try {
    const source = new DatabaseSync(database, { readOnly: true });
    try {
      source.prepare("VACUUM INTO ?").run(join(directory, "world.sqlite"));
    } finally {
      source.close();
    }
    store = new Store(join(directory, "world.sqlite"));
    // Only identity is needed for the pre-migration comparison. Parsing a second
    // complete population here needlessly doubles its resident memory.
    const before = store.db
      .prepare(
        `SELECT
      json_extract(json, '$.id') AS id,
      json_extract(json, '$.seed') AS seed,
      json_extract(json, '$.tick') AS tick,
      json_extract(json, '$.rng') AS rng,
      json_extract(json, '$.nextId') AS nextId,
      json_extract(json, '$.generationVersion') AS generationVersion
      FROM world WHERE id=1`,
      )
      .get() as
      | Pick<
          World,
          "id" | "seed" | "tick" | "rng" | "nextId" | "generationVersion"
        >
      | undefined;
    if (!before) throw new Error("The existing world is missing.");
    const world = store.load(0, true, false);
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
    const renewal = unappliedRenewal(store, readRenewal(database));
    // This entire database is a disposable copy: avoid another full in-memory
    // rollback clone and a redundant archive while the live owner is running.
    if (renewal) renewCommunities(world, renewal);
    store.resumeClock(world.tick);
    stepWorld(world, 32);
    store.advanceClock(world.tick);
    validateWorld(world);
    store.save(world);
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
