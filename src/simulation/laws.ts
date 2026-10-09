import { enclosedStorageVolume } from "./geometry";
import { MATERIALS } from "./content";
import {
  accumulateAtmosphere,
  BIO_NUTRIENTS,
  CHEMISTRY,
  CLAY,
  ROCK,
  addNutrients,
  availableMixture,
} from "./chemistry";
import { astronomy, PLANET } from "./planet";
import { dissipatedHeat, heatCapacity } from "./thermodynamics";
import { geologicalMass } from "./geology";
import { clamp } from "./random";
import type {
  Component,
  Design,
  Material,
  Matter,
  PhysicalProperties,
  Stock,
  Tile,
  World,
} from "./types";

/** Changing these laws requires a new version and an explicit saved-world migration. */
export const LAWS = Object.freeze({
  version: "biosphere-1.6",
  gravity: 9.81,
  chemicalEnergy: 17000,
  photosyntheticEfficiency: 0.024,
  tileArea: 100,
  solarPeak: 900,
  waterCapacity: 16000,
  nutrientRatio: 0.04,
  description:
    "A deterministic, reduced planetary ecology and mechanics model. Individual elements remain conserved across explicit reservoirs. Stellar radiation and geothermal heat are boundary energy inputs. Chemical tissue, atmospheric transport, geology, and bodies are coarse models with inspectable limits.",
});
export const emptyStock = (): Stock => ({
  biomass: 0,
  wood: 0,
  fiber: 0,
  stone: 0,
  clay: 0,
});
export const materialMatter = (material: Material, amount: number): Matter => ({
  carbon: MATERIALS[material].carbon * amount,
  mineral: MATERIALS[material].mineral * amount,
  water: 0,
});
export const solarAt = (tick: number) => astronomy(tick).irradiance / 1361;

/** Retain sub-ULP contributions to old cumulative counters across save/reload. */
export function accumulateEnergy(
  world: World,
  kind: "captured" | "released",
  amount: number,
): void {
  const compensation = (world.energy.compensation ??= {
    captured: 0,
    released: 0,
  });
  const corrected = amount - compensation[kind],
    previous = world.energy[kind],
    total = previous + corrected;
  compensation[kind] = total - previous - corrected;
  world.energy[kind] = total;
}

export function refreshTile(tile: Tile): void {
  tile.moisture = clamp(tile.water / LAWS.waterCapacity, 0, 1);
  tile.fertility = clamp(availableMixture(tile, BIO_NUTRIENTS) / 5, 0, 1);
  tile.trees = tile.plant
    ? (tile.plant.carbon * tile.plant.genome.woodiness) / 30
    : 0;
  tile.forage = [tile.plant, tile.groundcover].reduce(
    (sum, plant) =>
      sum +
      (plant
        ? Math.min(
            (plant.carbon *
              (1 - plant.genome.woodiness) *
              (1 - plant.genome.defense)) /
              0.94,
            plant.mineral / 0.06,
          )
        : 0),
    0,
  );
}
export function returnMaterial(
  _world: World,
  tile: Tile,
  material: Material,
  amount: number,
): void {
  const matter = materialMatter(material, amount);
  if (matter.carbon > 0) {
    tile.detritus.carbon += matter.carbon;
    tile.detritus.mineral += matter.mineral;
  } else addNutrients(tile, material === "clay" ? CLAY : ROCK, matter.mineral);
}
export const respirable = (world: World, wanted: number, water?: Tile) =>
  Math.min(
    Math.max(0, wanted),
    (water ? water.dissolvedOxygen : world.atmosphere.oxygen) /
      CHEMISTRY.oxygenPerOrganic,
  );
export function respire(
  world: World,
  carbon: number,
  tile?: Tile,
  aquatic = false,
): void {
  if (
    carbon < 0 ||
    carbon > respirable(world, carbon, aquatic ? tile : undefined) + 1e-9
  )
    throw new Error("Respiration exceeds available oxygen.");
  accumulateAtmosphere(world, "carbon", carbon);
  if (aquatic && tile)
    tile.dissolvedOxygen = Math.max(
      0,
      tile.dissolvedOxygen - carbon * CHEMISTRY.oxygenPerOrganic,
    );
  else
    accumulateAtmosphere(
      world,
      "oxygen",
      -Math.min(world.atmosphere.oxygen, carbon * CHEMISTRY.oxygenPerOrganic),
    );
  accumulateAtmosphere(world, "water", carbon * CHEMISTRY.waterPerOrganic);
  accumulateEnergy(world, "released", carbon * LAWS.chemicalEnergy);
  dissipatedHeat(world, carbon * LAWS.chemicalEnergy, tile?.temperature ?? 15);
  if (tile)
    tile.temperature += (carbon * LAWS.chemicalEnergy) / heatCapacity(tile);
}
export function ledger(world: World): Matter & { chemical: number } {
  let carbon = 0,
    water = world.atmosphere.water,
    mineral = world.atmosphere.nitrogen + world.atmosphere.dust;
  const add = (material: Material, amount: number) => {
    const m = materialMatter(material, amount);
    carbon += m.carbon;
    mineral += m.mineral;
  };
  for (const tile of world.tiles) {
    water +=
      tile.water + tile.ice + tile.air.vapor + tile.air.cloud + tile.air.snow;
    mineral +=
      tile.mineral +
      tile.rock +
      tile.sediment +
      tile.air.dust +
      tile.detritus.mineral +
      (tile.plant?.mineral ?? 0) +
      (tile.groundcover?.mineral ?? 0);
    carbon +=
      tile.detritus.carbon +
      (tile.plant?.carbon ?? 0) +
      (tile.groundcover?.carbon ?? 0);
    for (const seed of tile.seedBank) {
      carbon += seed.carbon;
      mineral += seed.mineral;
    }
  }
  for (const civ of world.civilizations)
    for (const [material, amount] of Object.entries(civ.stock))
      add(material as Material, amount);
  for (const person of world.citizens) {
    add("biomass", person.body);
    add("biomass", person.metabolism.intake);
    add("fiber", person.wrapMass);
    add("biomass", person.provisions);
    water += person.hydration;
    if (person.cargo) add(person.cargo.material, person.cargo.amount);
  }
  for (const animal of world.animals) {
    add("biomass", animal.body);
    water += animal.hydration;
  }
  for (const structure of world.structures)
    for (const [material, amount] of Object.entries(structure.properties.cost))
      add(material as Material, amount);
  for (const caravan of world.caravans) {
    add(caravan.offer.material, caravan.offer.amount);
    add(caravan.receive.material, caravan.receive.amount);
    add("biomass", caravan.provisions);
  }
  for (const chunk of world.chunks) mineral += geologicalMass(chunk.geology);
  // Bound H/O in carbohydrate is included in the legacy water-equivalent check.
  water += carbon * CHEMISTRY.waterPerOrganic;
  return {
    carbon: carbon + world.atmosphere.carbon,
    mineral,
    water,
    chemical: carbon * LAWS.chemicalEnergy,
  };
}

const overlaps = (a: Component, b: Component) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y));
const volume = (part: Component) => part.width * part.height * part.depth;

/** Static vertical load and coarse beam bending. Effects are measured from geometry, never a building name. */
export function evaluateDesign(
  design: Design,
  fabric?: { mass: number; damage: number }[],
): PhysicalProperties {
  if (!design.components.length || design.components.length > 32)
    throw new Error("An assembly must contain 1–32 components.");
  const parts = design.components;
  for (const p of parts) {
    if (
      !MATERIALS[p.material] ||
      ![p.x, p.y, p.z, p.width, p.height, p.depth].every(Number.isFinite) ||
      p.width < 0.025 ||
      p.height < 0.025 ||
      p.depth < 0.025 ||
      Math.max(p.width, p.height, p.depth) > 6 ||
      p.z < 0 ||
      p.z + p.height > 8 ||
      Math.abs(p.x) > 5 ||
      Math.abs(p.y) > 5
    )
      throw new Error(
        "Components must use known materials, finite dimensions, and fit within the assembly bounds.",
      );
  }
  let intersecting = false;
  for (let a = 0; a < parts.length; a++)
    for (let b = a + 1; b < parts.length; b++)
      if (
        overlaps(parts[a], parts[b]) > 1e-6 &&
        Math.min(parts[a].z + parts[a].height, parts[b].z + parts[b].height) -
          Math.max(parts[a].z, parts[b].z) >
          1e-5
      )
        intersecting = true;
  const masses = parts.map(
    (p, i) => fabric?.[i]?.mass ?? volume(p) * MATERIALS[p.material].density,
  );
  const loads = masses.map((m) => m * LAWS.gravity),
    supported = parts.map((p) => p.z < 0.002);
  const order = parts.map((_, i) => i).sort((a, b) => parts[a].z - parts[b].z);
  for (const i of order)
    if (!supported[i])
      supported[i] = order.some(
        (j) =>
          j !== i &&
          supported[j] &&
          Math.abs(parts[j].z + parts[j].height - parts[i].z) < 0.008 &&
          overlaps(parts[i], parts[j]) > 0.001,
      );
  let stability = intersecting ? 0 : 1,
    weakestStress = 0;
  for (const i of [...order].reverse()) {
    const p = parts[i],
      material = MATERIALS[p.material];
    const integrity = fabric
      ? clamp(
          (masses[i] / Math.max(volume(p) * material.density, 1e-9)) *
            (1 - fabric[i].damage),
          0,
          1,
        )
      : 1;
    const supports = order.filter(
      (j) =>
        j !== i &&
        supported[j] &&
        Math.abs(parts[j].z + parts[j].height - p.z) < 0.008 &&
        overlaps(p, parts[j]) > 0.001,
    );
    const area =
      p.z < 0.002
        ? p.width * p.depth
        : supports.reduce((s, j) => s + overlaps(p, parts[j]), 0);
    const stress = loads[i] / Math.max(area, 0.00001);
    let ratio = (material.strength * integrity ** 2) / Math.max(stress, 1);
    if (!supported[i]) ratio = 0;
    if (supports.length) {
      const minX = Math.min(...supports.map((j) => Math.max(p.x, parts[j].x))),
        maxX = Math.max(
          ...supports.map((j) =>
            Math.min(p.x + p.width, parts[j].x + parts[j].width),
          ),
        );
      const minY = Math.min(...supports.map((j) => Math.max(p.y, parts[j].y))),
        maxY = Math.max(
          ...supports.map((j) =>
            Math.min(p.y + p.depth, parts[j].y + parts[j].depth),
          ),
        );
      const cx = p.x + p.width / 2,
        cy = p.y + p.depth / 2;
      if (
        cx < minX - 0.01 ||
        cx > maxX + 0.01 ||
        cy < minY - 0.01 ||
        cy > maxY + 0.01
      )
        ratio = 0;
      const span = Math.max(p.width, p.depth),
        breadth = Math.min(p.width, p.depth);
      const bending =
        (loads[i] * span) /
        Math.max((8 * breadth * p.height ** 2) / 6, 0.000001);
      ratio = Math.min(
        ratio,
        (material.tensile * integrity ** 3) / Math.max(bending, 1),
      );
      for (const j of supports)
        loads[j] +=
          (loads[i] * overlaps(p, parts[j])) / Math.max(area, 0.00001);
    }
    weakestStress = Math.max(weakestStress, stress);
    stability = Math.min(stability, ratio);
  }
  const stable = stability >= 1;
  // Integrate the exact XY partition of cuboid edges. Thin parts and translations
  // must not acquire a whole sampling cell's surface or shelter capacity.
  let coveredArea = 0,
    insulation = 0,
    workSurface = 0,
    storageVolume = 0;
  const xs = [...new Set(parts.flatMap((p) => [p.x, p.x + p.width]))].sort(
    (a, b) => a - b,
  );
  const ys = [...new Set(parts.flatMap((p) => [p.y, p.y + p.depth]))].sort(
    (a, b) => a - b,
  );
  for (let ix = 0; ix < xs.length - 1; ix++)
    for (let iy = 0; iy < ys.length - 1; iy++) {
      const x = (xs[ix] + xs[ix + 1]) / 2,
        y = (ys[iy] + ys[iy + 1]) / 2;
      const area = (xs[ix + 1] - xs[ix]) * (ys[iy + 1] - ys[iy]);
      const above = parts.filter(
        (p) => x >= p.x && x < p.x + p.width && y >= p.y && y < p.y + p.depth,
      );
      const roof = above.filter((p) => p.z >= 1.6).sort((a, b) => a.z - b.z)[0];
      if (roof && !above.some((p) => p.z < 1.6 && p.z + p.height > 0.15)) {
        coveredArea += area;
        insulation +=
          (roof.height / MATERIALS[roof.material].conductivity) * area;
      }
      // Sample usable horizontal surfaces and laterally enclosed space. These
      // are geometric affordances, independent of a design's name or intent.
      const floor = [...above]
        .sort((a, b) => b.z + b.height - a.z - a.height)
        .find((p) => p.z + p.height <= 1.6);
      if (!floor) continue;
      const level = floor.z + floor.height;
      if (
        above.some(
          (p) =>
            p !== floor && p.z <= level + 0.1 && p.z + p.height > level + 0.01,
        )
      )
        continue;
      if (level >= 0.35 && !above.some((p) => p.z > level && p.z < level + 0.6))
        workSurface += area;
    }
  storageVolume = stable ? enclosedStorageVolume(parts) : 0;
  const cost = emptyStock();
  parts.forEach((p, i) => {
    cost[p.material] += masses[i];
  });
  const mass = masses.reduce((a, b) => a + b, 0),
    capacity = stable ? coveredArea / 1.7 : 0;
  return {
    mass,
    cost,
    stable,
    stability,
    coveredArea: stable ? coveredArea : 0,
    height: Math.max(...parts.map((p) => p.z + p.height)),
    insulation: stable && coveredArea ? insulation / coveredArea : 0,
    capacity,
    workSurface: stable ? workSurface : 0,
    storageVolume: stable ? storageVolume : 0,
    work: mass / 18 + parts.length * 0.7,
    weakestStress,
    explanation: [
      intersecting
        ? "Solid components intersect."
        : "Components occupy separate volumes.",
      stable
        ? "Loads reach the ground within the material strength limits."
        : "Unsupported geometry, tipping, or material stress prevents a stable structure.",
      `${(stable ? coveredArea : 0).toFixed(2)} m² of free floor space is covered above head height.`,
    ],
  };
}
