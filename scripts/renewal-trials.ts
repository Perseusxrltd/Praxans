import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { digest } from "../src/server/store";
import { migrateWorld } from "../src/server/migrations";
import { renewalSchema } from "../src/server/intervention";
import { renewCommunities } from "../src/simulation/renewal";
import { stepWorld, validateWorld } from "../src/simulation/engine";
import { ledger } from "../src/simulation/laws";
import { elementLedger } from "../src/simulation/chemistry";
import { nearbyTiles } from "../src/simulation/terrain";
import { getTile, peopleOf } from "../src/simulation/world";
import type { World } from "../src/simulation/types";

// Read-only source. This program has no server, clock ownership or database writes.
const [sourcePath, requestPath, outputPath, duration = "400", domain] =
  process.argv.slice(2);
if (!sourcePath || !requestPath || !outputPath)
  throw new Error(
    "Usage: tsx scripts/renewal-trials.ts <backup> <request.json> <report.json> [days] [isolated-community-id|catchments|catchment:community-id]",
  );
const days = Number(duration);
if (!Number.isSafeInteger(days) || days < 1 || days > 1500)
  throw new Error("Invalid duration");
const sourceFiles = [
  ...readdirSync("src/simulation")
    .filter((p) => p.endsWith(".ts"))
    .map((p) => `src/simulation/${p}`),
  "src/server/migrations.ts",
  "src/server/intervention.ts",
].sort();
const implementation = createHash("sha256");
for (const file of sourceFiles)
  implementation
    .update(file)
    .update("\0")
    .update(readFileSync(file))
    .update("\0");
const implementationSha256 = implementation.digest("hex");
const db = new DatabaseSync(sourcePath, { readOnly: true });
const head = db.prepare("SELECT json,checksum FROM world WHERE id=1").get() as {
  json: string;
  checksum: string;
};
if (digest(head.json) !== head.checksum) throw new Error("World checksum");
const saved = JSON.parse(head.json) as World;
saved.tiles = [];
for (const chunk of saved.chunks) {
  const row = db
    .prepare("SELECT json,checksum FROM chunks WHERE id=?")
    .get(chunk.id) as { json: string; checksum: string };
  if (digest(row.json) !== row.checksum) throw new Error("Region checksum");
  saved.tiles.push(...JSON.parse(row.json));
}
db.close();
const world = migrateWorld(saved).world;
const request = renewalSchema.parse(
  JSON.parse(readFileSync(requestPath, "utf8")),
);
const wholeCatchments =
  domain === "catchments" || domain?.startsWith("catchment:");
const localId = domain?.startsWith("catchment:")
  ? domain.slice(10)
  : domain === "catchments"
    ? undefined
    : domain;
if (domain) {
  const communities = world.civilizations.filter((c) =>
    localId ? c.id === localId : request.civilizationIds.includes(c.id),
  );
  if (!communities.length) throw new Error("Unknown isolated community");
  const chunks = world.chunks.filter((chunk) =>
    communities.some((civ) => {
      if (!wholeCatchments)
        return (
          chunk.x === Math.floor(civ.x / 32) &&
          chunk.y === Math.floor(civ.y / 32)
        );
      const nearestX = Math.max(
        chunk.x * 32,
        Math.min(civ.x, chunk.x * 32 + 31),
      );
      const nearestY = Math.max(
        chunk.y * 32,
        Math.min(civ.y, chunk.y * 32 + 31),
      );
      return (
        Math.hypot(nearestX - civ.x, nearestY - civ.y) <= request.habitat.radius
      );
    }),
  );
  const previousRegions = world.chunks.length;
  world.tiles = chunks.flatMap((chunk) =>
    world.tiles.slice(chunk.start, chunk.start + 1024),
  );
  world.chunks = chunks.map((chunk, index) => ({
    ...chunk,
    start: index * 1024,
  }));
  world.civilizations = communities;
  const identities = new Set(communities.map((c) => c.id));
  for (const civ of communities)
    civ.relations = Object.fromEntries(
      Object.entries(civ.relations).filter(([id]) => identities.has(id)),
    );
  world.citizens = world.citizens.filter((p) => identities.has(p.civId));
  world.animals = world.animals.filter((a) => !!getTile(world, a.x, a.y));
  world.structures = world.structures.filter(
    (s) => identities.has(s.civId) && !!getTile(world, s.x, s.y),
  );
  world.caravans = [];
  world.diplomacy = { messages: [], accords: [] };
  world.changedTiles = [];
  for (const key of Object.keys(
    world.atmosphere,
  ) as (keyof World["atmosphere"])[])
    world.atmosphere[key] *= chunks.length / previousRegions;
  world.atmosphereCompensation = {};
  const current = ledger(world);
  world.initialMatter = {
    carbon: current.carbon,
    water: current.water,
    mineral: current.mineral,
  };
  world.boundary = { carbon: 0, water: 0, mineral: 0, chemical: 0 };
  world.energy.initialChemical =
    current.chemical - world.energy.captured + world.energy.released;
  world.initialElements = elementLedger(world);
  world.incomingElements = {};
  request.civilizationIds = communities.map((c) => c.id);
}
const catchments = world.civilizations.map((civ) => {
  const tiles = nearbyTiles(world, civ, request.habitat.radius).filter(
    (tile) =>
      Math.hypot(tile.x - civ.x, tile.y - civ.y) <= request.habitat.radius,
  );
  return {
    civId: civ.id,
    radiusMetres: request.habitat.radius * 10,
    representedCells: tiles.length,
    landCells: tiles.filter((tile) => tile.terrain !== "water").length,
    representedAreaHectares: (tiles.length * 100) / 10000,
  };
});
const intervention = renewCommunities(world, request);
validateWorld(world);
const startTick = world.tick,
  started = performance.now();
const samples: unknown[] = [];
function sample(day: number) {
  return {
    day,
    tick: world.tick,
    communities: world.civilizations.map((c) => {
      const people = peopleOf(world, c.id),
        home = getTile(world, c.x, c.y)!;
      const nearby = nearbyTiles(world, c, 12);
      return {
        id: c.id,
        population: people.length,
        deaths: c.deaths,
        births: c.births,
        foodKg: c.stock.biomass,
        fiberKg: c.stock.fiber,
        harvestKg: c.harvests,
        temperature: home.temperature,
        water: home.water,
        ice: home.ice,
        health:
          people.reduce((s, p) => s + p.health, 0) / Math.max(1, people.length),
        nourishment:
          people.reduce((s, p) => s + p.hunger, 0) / Math.max(1, people.length),
        hydration:
          people.reduce((s, p) => s + p.hydration, 0) /
          Math.max(1, people.length),
        growingKg: nearby.reduce(
          (s, t) => s + (t.plant?.carbon ?? 0) + (t.groundcover?.carbon ?? 0),
          0,
        ),
        seedKg: nearby.reduce(
          (s, t) => s + t.seedBank.reduce((v, p) => v + p.carbon, 0),
          0,
        ),
        forage: nearby.reduce((s, t) => s + t.forage, 0),
        structures: world.structures.filter(
          (s) => s.civId === c.id && s.progress >= 1 && !s.collapsed,
        ).length,
      };
    }),
  };
}
samples.push(sample(0));
for (let day = 1; day <= days; day++) {
  stepWorld(world, 96);
  if (day % 5 === 0 || day === days || world.citizens.length === 0) {
    validateWorld(world);
    const result = sample(day);
    samples.push(result);
    console.log(JSON.stringify(result));
    writeFileSync(
      outputPath,
      JSON.stringify(
        {
          source: sourcePath,
          implementationSha256,
          sourceTick: startTick,
          format: world.version,
          laws: world.lawsVersion,
          scope: domain
            ? wholeCatchments
              ? "All saved regions intersecting the requested complete catchments, with sealed outer edges and proportional atmospheric inventory. Domain sensitivity diagnostic: cropping changes transport and shared RNG consumption, not an exact whole-world forecast."
              : "Isolated actual home region with sealed edges and proportional atmospheric inventory; diagnostic, not an exact whole-world forecast."
            : "All saved regions and communities; offline continuation without agent actions.",
          domain: {
            regions: world.chunks.length,
            cells: world.tiles.length,
            catchments,
          },
          requestedDays: days,
          completedDays: day,
          elapsedMs: performance.now() - started,
          intervention,
          samples,
          lastDeaths: world.pendingEvents.filter(
            (e) => e.tick >= startTick && e.category === "life" && e.lifeState,
          ),
        },
        null,
        2,
      ) + "\n",
    );
  }
  if (!world.citizens.length) break;
}
