import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { renewCommunities, type CommunityRenewal } from "../simulation/renewal";
import { validateWorld } from "../simulation/engine";
import { digest, type Store } from "./store";
import type { World } from "../simulation/types";

const nonnegative = z.number().finite().min(0).max(10000);
export const renewalSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,95}$/),
    worldId: z.string().min(1).max(100),
    seed: z.number().int(),
    civilizationIds: z.array(z.string().min(1).max(100)).min(1).max(20),
    peoplePerCommunity: z.number().int().min(2).max(1000),
    suppliesPerPerson: z
      .object({
        biomass: nonnegative,
        wood: nonnegative,
        fiber: nonnegative,
        stone: nonnegative,
        clay: nonnegative,
      })
      .strict(),
    habitat: z
      .object({
        radius: z.number().int().min(0).max(96),
        plantKg: nonnegative,
        groundcoverKg: nonnegative,
        seedKg: z.number().min(0).max(0.8),
      })
      .strict(),
    reason: z.string().min(1).max(1500),
  })
  .strict();

/** The request is a private operator file, never an HTTP/MCP capability. */
export function readRenewal(database: string): CommunityRenewal | undefined {
  const path = join(dirname(database), "runtime", "intervention.json");
  if (!existsSync(path)) return undefined;
  return renewalSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function unappliedRenewal(
  store: Store,
  request?: CommunityRenewal,
): CommunityRenewal | undefined {
  if (!request) return undefined;
  request = renewalSchema.parse(request);
  const id = `operator:${request.id}`,
    checksum = digest(JSON.stringify(request));
  const existing = store.db
    .prepare("SELECT description FROM interventions WHERE id=?")
    .get(id) as { description: string } | undefined;
  if (existing) {
    if (!existing.description.startsWith(`Request ${checksum}. `))
      throw new Error(
        "This intervention ID was already used with different instructions.",
      );
    return undefined;
  }
  return request;
}

export function applyRenewal(
  store: Store,
  world: World,
  request?: CommunityRenewal,
): World {
  request = unappliedRenewal(store, request);
  if (!request) return world;
  const id = `operator:${request.id}`,
    checksum = digest(JSON.stringify(request));
  const candidate = structuredClone(world);
  const result = renewCommunities(candidate, request);
  validateWorld(candidate);
  store.transaction(() => {
    // Commit the exact pre-intervention checkpoint and the changed one in the
    // same transaction; a failure leaves the sole writer's old state intact.
    store.save(world);
    const before = store.db
      .prepare("SELECT checksum FROM world WHERE id=1")
      .get() as { checksum: string };
    store.save(candidate);
    const after = store.db
      .prepare("SELECT checksum FROM world WHERE id=1")
      .get() as { checksum: string };
    store.db
      .prepare(
        "INSERT INTO interventions(id,tick,description,before_checksum,after_checksum,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        id,
        world.tick,
        `Request ${checksum}. ${request.reason} ${JSON.stringify({ request, result })}`,
        before.checksum,
        after.checksum,
        Date.now(),
      );
  });
  return candidate;
}
