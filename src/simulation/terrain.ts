import { initialPlant, initialAnimals } from "./life";
import { surfaceFields } from "./surface";
import { LAWS, refreshTile } from "./laws";
import { between, clamp, hash, noise } from "./random";
import {
  CHUNK_SIZE,
  type GenerationVersion,
  type Terrain,
  type Tile,
  type World,
} from "./types";
import {
  BIO_NUTRIENTS,
  CHEMISTRY,
  ROCK,
  CLAY,
  addNutrients,
  elementLedger,
} from "./chemistry";
import { addElements, totalElements } from "./elements";
import {
  initialGeology,
  geologicalElements,
  geologicalMass,
  plateAt,
} from "./geology";
import {
  saturationVapor,
  climatePrior,
  NORTH_TILE,
  SOUTH_TILE,
  LONGITUDE_TILES,
  wrapX,
} from "./planet";

export const INITIAL_AIR = Object.freeze({
  carbon: 270,
  water: 500,
  oxygen: 239130,
  nitrogen: 780840,
  argon: 12800,
});

const coordinateKey = (x: number, y: number) => x * 134217728 + y;
const indices = new WeakMap<
  World,
  { length: number; positions: Map<number, number> }
>();
export function tileIndex(world: World, x: number, y: number): number {
  let cached = indices.get(world);
  if (!cached || cached.length !== world.tiles.length) {
    cached = {
      length: world.tiles.length,
      positions: new Map(
        world.tiles.map((t, i) => [coordinateKey(t.x, t.y), i]),
      ),
    };
    indices.set(world, cached);
  }
  return (
    cached.positions.get(coordinateKey(wrapX(Math.round(x)), Math.round(y))) ??
    -1
  );
}
export const getTile = (world: World, x: number, y: number): Tile | undefined =>
  world.tiles[tileIndex(world, x, y)];
export function nearbyTiles(
  world: World,
  center: { x: number; y: number },
  radius: number,
): Tile[] {
  const result: Tile[] = [];
  for (let y = Math.floor(center.y - radius); y <= center.y + radius; y++)
    for (let x = Math.floor(center.x - radius); x <= center.x + radius; x++) {
      if ((x - center.x) ** 2 + (y - center.y) ** 2 > radius ** 2) continue;
      const tile = getTile(world, x, y);
      if (tile) result.push(tile);
    }
  return result;
}

/** A coordinate has the same initial terrain regardless of exploration order or other players. */
export function generateTile(
  seed: number,
  x: number,
  y: number,
  generationVersion: GenerationVersion = "planet-1",
): Tile {
  x = wrapX(x);
  const rng = { rng: Math.floor(hash(x, y, seed + 983) * 0xffffffff) >>> 0 };
  const { elevation, moisture, terrain, biome, temperature } = surfaceFields(
    seed,
    x,
    y,
    generationVersion,
  );
  const green =
    terrain === "forest" || terrain === "meadow" || terrain === "marsh";
  // Keep the legacy PRNG draw so migrated regions remain exactly reproducible.
  if (green) between(rng, 24, 110);
  const tile: Tile = {
    x,
    y,
    terrain,
    biome,
    elevation,
    variation: hash(x, y, seed),
    road: 0,
    owner: null,
    water: terrain === "water" ? 200000 : moisture * LAWS.waterCapacity,
    mineral: 0,
    nutrients: {},
    rock: terrain === "hill" ? between(rng, 200, 600) : between(rng, 20, 100),
    air: {
      vapor: saturationVapor(temperature) * (0.45 + moisture * 0.5),
      cloud: 0,
      snow: 0,
      pressure: 101325,
      windX: 0,
      windY: 0,
      rain: 0,
      humidity: 0.45 + moisture * 0.5,
      sunlight: 0,
      dust: 0,
      tide: 0,
    },
    detritus: { carbon: green ? 8 : 1, mineral: green ? 0.5 : 0.1 },
    temperature,
    moisture,
    fertility: 1,
    trees: 0,
    forage: 0,
    plant: null,
    groundcover: null,
    pollination: 0,
    dissolvedOxygen: terrain === "water" ? 1.6 : 0,
  };
  tile.plant = initialPlant(seed, tile);
  tile.groundcover = initialPlant(seed, tile, true);
  addNutrients(tile, BIO_NUTRIENTS, between(rng, 4, 14));
  addNutrients(tile, ROCK, between(rng, 15, 30));
  addNutrients(tile, CLAY, between(rng, 8, 24));
  refreshTile(tile);
  return tile;
}
export function materializeChunk(
  world: World,
  chunkX: number,
  chunkY: number,
): void {
  if (
    !Number.isSafeInteger(chunkX) ||
    !Number.isSafeInteger(chunkY) ||
    chunkY * CHUNK_SIZE < NORTH_TILE ||
    (chunkY + 1) * CHUNK_SIZE - 1 > SOUTH_TILE
  )
    throw new Error(
      "Region coordinates lie beyond the polar limits of this projection.",
    );
  chunkX = wrapX(chunkX * CHUNK_SIZE) / CHUNK_SIZE;
  const id = `${chunkX},${chunkY}`;
  if (world.chunks.some((c) => c.id === id)) return;
  const start = world.tiles.length;
  const beforeElements = elementLedger(world);
  const geology = initialGeology(world.seed, chunkX, chunkY);
  world.chunks.push({
    id,
    x: chunkX,
    y: chunkY,
    start,
    createdTick: world.tick,
    geology,
  });
  let carbon = 0,
    mineral = 0,
    water = 0,
    chemical = 0;
  for (let dy = 0; dy < CHUNK_SIZE; dy++)
    for (let dx = 0; dx < CHUNK_SIZE; dx++) {
      const tile = generateTile(
        world.seed,
        chunkX * CHUNK_SIZE + dx,
        chunkY * CHUNK_SIZE + dy,
        world.generationVersion,
      );
      const organicC =
        tile.detritus.carbon +
        (tile.plant?.carbon ?? 0) +
        (tile.groundcover?.carbon ?? 0);
      carbon += organicC + INITIAL_AIR.carbon;
      mineral +=
        tile.mineral +
        tile.rock +
        tile.detritus.mineral +
        (tile.plant?.mineral ?? 0) +
        (tile.groundcover?.mineral ?? 0) +
        INITIAL_AIR.nitrogen;
      water +=
        tile.water +
        tile.air.vapor +
        tile.air.cloud +
        tile.air.snow +
        INITIAL_AIR.water +
        organicC * CHEMISTRY.waterPerOrganic;
      chemical += organicC * LAWS.chemicalEnergy;
      for (const key of Object.keys(
        INITIAL_AIR,
      ) as (keyof typeof INITIAL_AIR)[])
        world.atmosphere[key] += INITIAL_AIR[key];
      world.initialTrees += tile.trees;
      world.changedTiles.push(world.tiles.length);
      world.tiles.push(tile);
    }
  const animals = initialAnimals(
    world.seed,
    chunkX,
    chunkY,
    world.tiles.slice(start),
    world.tick,
  );
  for (const animal of animals) {
    const organic = animal.body * 0.94;
    carbon += organic;
    mineral += animal.body * 0.06;
    water += animal.hydration + organic * CHEMISTRY.waterPerOrganic;
    chemical += organic * LAWS.chemicalEnergy;
    world.animals.push(animal);
  }
  // Extending the modeled volume brings its initial reservoirs across an explicit accounting boundary.
  world.boundary.carbon += carbon;
  world.boundary.mineral += mineral + geologicalMass(geology);
  world.boundary.water += water;
  world.boundary.chemical += chemical;
  const afterElements = elementLedger(world);
  for (const [symbol, mass] of Object.entries(afterElements))
    world.incomingElements[symbol] =
      (world.incomingElements[symbol] ?? 0) +
      mass -
      (beforeElements[symbol] ?? 0);
}
export function materializeArea(
  world: World,
  x: number,
  y: number,
  radius = 1,
): void {
  const cx = Math.floor(x / CHUNK_SIZE),
    cy = Math.floor(y / CHUNK_SIZE);
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++)
      materializeChunk(world, cx + dx, cy + dy);
}
export function materializeCorridor(
  world: World,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length > 640) return; // A single journey has a bounded planning horizon; the world does not.
  const steps = Math.max(1, Math.ceil(length / CHUNK_SIZE));
  for (let i = 0; i <= steps; i++)
    materializeArea(
      world,
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
}
export function spiralSite(index: number): { x: number; y: number } {
  const ring = Math.ceil((Math.sqrt(index + 1) - 1) / 2),
    side = Math.max(1, 2 * ring),
    offset = (2 * ring + 1) ** 2 - 1 - index;
  if (offset < side) return { x: ring - offset, y: -ring };
  if (offset < 2 * side) return { x: -ring, y: -ring + offset - side };
  if (offset < 3 * side) return { x: -ring + offset - 2 * side, y: ring };
  return { x: ring, y: ring - (offset - 3 * side) };
}
