import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { groundDistanceMetres } from "../../src/simulation/planet.ts";
import { campTiles } from "../../src/simulation/settlement.ts";
import { housing } from "../../src/simulation/world.ts";
const stats = (values) => {
  const a = [...values].sort((x, y) => x - y);
  return a.length
    ? {
        count: a.length,
        min: a[0],
        median: a[Math.floor(a.length / 2)],
        p90: a[Math.floor((a.length - 1) * 0.9)],
        max: a.at(-1),
        mean: a.reduce((s, v) => s + v, 0) / a.length,
      }
    : null;
};
const sum = (xs, fn) => xs.reduce((s, x) => s + fn(x), 0);
const fingerprint = async (file) => {
  const h = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) h.update(chunk);
  return h.digest("hex");
};
fs.mkdirSync("output/research", { recursive: true });
if (process.argv.length < 3)
  throw new Error("Pass one or more independent local backup files.");
const results = [];
for (const file of process.argv.slice(2)) {
  const sha256 = await fingerprint(file);
  const db = new DatabaseSync(file, { readOnly: true });
  const row = db.prepare("SELECT json,checksum FROM world WHERE id=1").get();
  if (createHash("sha256").update(row.json).digest("hex") !== row.checksum)
    throw Error("Bad metadata");
  const world = JSON.parse(row.json);
  world.tiles = [];
  const get = db.prepare("SELECT json,checksum FROM chunks WHERE id=?");
  for (const chunk of world.chunks) {
    const data = get.get(chunk.id);
    if (createHash("sha256").update(data.json).digest("hex") !== data.checksum)
      throw Error("Bad region");
    if (chunk.start !== world.tiles.length)
      throw Error("Unexpected region order");
    world.tiles.push(...JSON.parse(data.json));
  }
  db.close();
  const index = new Map(
    world.tiles.map((tile, i) => [`${tile.x},${tile.y}`, i]),
  );
  const components = new Map();
  const connected = (home) => {
    const start = index.get(`${home.x},${home.y}`);
    if (components.has(start)) return components.get(start);
    const cells = [start],
      seen = new Set(cells);
    for (let at = 0; at < cells.length; at++) {
      const tile = world.tiles[cells[at]];
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const i = index.get(`${tile.x + dx},${tile.y + dy}`);
        if (
          i === undefined ||
          seen.has(i) ||
          world.tiles[i].terrain === "water"
        )
          continue;
        seen.add(i);
        cells.push(i);
      }
    }
    for (const i of cells) components.set(i, seen);
    return seen;
  };
  const communities = world.civilizations.map((civ) => {
    const people = world.citizens.filter((p) => p.civId === civ.id),
      reachable = connected(civ),
      distances = world.tiles.map((tile) => groundDistanceMetres(tile, civ));
    const access = (r) => {
      const candidates = world.tiles.filter((tile, i) => distances[i] <= r);
      const land = candidates.filter((t) => t.terrain !== "water");
      const connectedLand = land.filter((t) =>
        reachable.has(index.get(`${t.x},${t.y}`)),
      );
      return {
        radiusMetres: r,
        representedCells: candidates.length,
        landCells: land.length,
        connectedLandCells: connectedLand.length,
        connectedLandHectares: connectedLand.length * 0.01,
        edibleTissueKg: sum(connectedLand, (t) => t.forage),
        organicPlantKg: sum(
          connectedLand,
          (t) => (t.plant?.carbon ?? 0) + (t.groundcover?.carbon ?? 0),
        ),
        edibleCellsOver2Kg: connectedLand.filter((t) => t.forage > 2).length,
        liquidWaterCells: connectedLand.filter((t) => t.water > 0.1).length,
        temperatureC: stats(connectedLand.map((t) => t.temperature)),
        competingCommunityIds: world.civilizations
          .filter((other) => groundDistanceMetres(civ, other) <= 2 * r)
          .map((other) => other.id),
      };
    };
    const ages = (group) => {
      const residents = people.filter(
        (p) => (p.age < 12 ? "child" : "adult") === group,
      );
      return {
        people: residents.length,
        bodyKg: stats(residents.map((p) => p.body)),
        wrapKg: stats(residents.map((p) => p.wrapMass)),
        provisionsKg: stats(residents.map((p) => p.provisions)),
        nourishment: stats(residents.map((p) => p.hunger)),
        health: stats(residents.map((p) => p.health)),
        distanceFromCampMetres: stats(
          residents.map((p) => groundDistanceMetres(p, civ)),
        ),
        rememberedFarthestFromCampMetres: stats(
          residents.map((p) =>
            Math.max(
              0,
              ...p.mind.places.map((place) => groundDistanceMetres(place, civ)),
            ),
          ),
        ),
        knownFreshFoodPlaces: stats(
          residents.map(
            (p) =>
              p.mind.places.filter(
                (place) =>
                  world.tick - place.tick < 96 * 7 &&
                  place.food > 2 &&
                  groundDistanceMetres(place, civ) <= 900,
              ).length,
          ),
        ),
        tasks: residents.reduce(
          (s, p) => (
            (s[p.task?.kind ?? "none"] = (s[p.task?.kind ?? "none"] ?? 0) + 1),
            s
          ),
          {},
        ),
      };
    };
    const camp = campTiles(world, civ);
    return {
      id: civ.id,
      name: civ.name,
      population: people.length,
      births: civ.births,
      deaths: civ.deaths,
      focus: civ.focus,
      policies: civ.policies,
      stockKg: civ.stock,
      personalFoodKg: sum(people, (p) => p.provisions),
      carriedFoodKg: sum(people, (p) =>
        p.cargo?.material === "biomass" ? p.cargo.amount : 0,
      ),
      cumulativeHarvestKg: civ.harvests,
      housingPlaces: housing(world, civ.id),
      campCells: camp.length,
      campTemperatureC: stats(camp.map((t) => t.temperature)),
      wholeConnectedLandHectares: reachable.size * 0.01,
      catchments: [120, 480, 900].map(access),
      adults: ages("adult"),
      children: ages("child"),
    };
  });
  const land = world.tiles.filter((t) => t.terrain !== "water");
  results.push({
    file,
    sha256,
    metadataSha256: row.checksum,
    tick: world.tick,
    daysAfterRenewal: (world.tick - 195860) / 96,
    people: world.citizens.length,
    births: world.births,
    deaths: world.deaths,
    regions: world.chunks.length,
    totalAreaHectares: world.tiles.length * 0.01,
    landAreaHectares: land.length * 0.01,
    globalEdibleTissueKg: sum(land, (t) => t.forage),
    globalOrganicPlantKg: sum(
      land,
      (t) => (t.plant?.carbon ?? 0) + (t.groundcover?.carbon ?? 0),
    ),
    communities,
  });
  if ((await fingerprint(file)) !== sha256)
    throw Error("Source backup changed");
  console.log(
    JSON.stringify({
      file,
      tick: world.tick,
      people: world.citizens.length,
      landHa: land.length * 0.01,
      foodKg: sum(land, (t) => t.forage),
    }),
  );
}
fs.writeFileSync(
  "output/research/collapse-habitat-recheck.json",
  JSON.stringify(
    {
      recordedAtUTC: new Date().toISOString(),
      method:
        "Independent verified backups opened read-only; metadata and every region hashed. Derived physical-distance, four-neighbour land connectivity and resource/memory summaries; no simulation advanced or host contacted.",
      limits: [
        "A geometrically connected cell is not proof of known resources, access permission, bounded path-search success, delivery time or renewable yield.",
        "Catchments overlap; their resources must not be added as independent inventories.",
        "Edible tissue is a standing upper stock, not sustainable production or the yield of one gathering visit.",
        "The 120m sample is a diagnostic inner area; actual restoration used48projected cells, about480m near these camps.",
      ],
      snapshots: results,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
