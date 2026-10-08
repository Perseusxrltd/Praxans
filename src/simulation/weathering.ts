import { MATERIALS } from "./content";
import { evaluateDesign, returnMaterial } from "./laws";
import { clamp } from "./random";
import { getTile } from "./terrain";
import { recordEvent } from "./events";
import type {
  Citizen,
  Civilization,
  Material,
  Structure,
  World,
} from "./types";

/** Effective hourly rates for exposed bulk materials, not empirically calibrated lifetimes. */
const RATES: Record<
  Material,
  { loss: number; fatigue: number; frost: number }
> = {
  biomass: { loss: 0.0004, fatigue: 0.0004, frost: 0.002 },
  wood: { loss: 0.0000015, fatigue: 0.000001, frost: 0.0005 },
  fiber: { loss: 0.000012, fatigue: 0.000008, frost: 0.001 },
  stone: { loss: 0.00000003, fatigue: 0.00000002, frost: 0.0008 },
  clay: { loss: 0.000006, fatigue: 0.000003, frost: 0.004 },
};

export function initialFabric(
  structure: Structure,
  temperature: number,
): Structure["fabric"] {
  const nominal = evaluateDesign(structure.design);
  return {
    parts: structure.design.components.map((part) => ({
      mass:
        part.width *
        part.depth *
        part.height *
        MATERIALS[part.material].density *
        (structure.properties.cost[part.material] /
          Math.max(nominal.cost[part.material], 1e-12)),
      damage: clamp(1 - structure.condition / 100, 0, 1),
    })),
    exposureHours: 0,
    previousTemperature: temperature,
    lostMass: 0,
    repairedMass: 0,
  };
}

export function refreshStructure(structure: Structure): void {
  structure.properties = evaluateDesign(
    structure.design,
    structure.fabric.parts,
  );
  structure.condition =
    100 *
    Math.min(
      ...structure.design.components.map((part, i) => {
        const nominal =
          part.width *
          part.depth *
          part.height *
          MATERIALS[part.material].density;
        return clamp(
          (structure.fabric.parts[i].mass / nominal) *
            (1 - structure.fabric.parts[i].damage),
          0,
          1,
        );
      }),
    );
  if (structure.collapsed) {
    structure.properties.stable = false;
    structure.properties.capacity = 0;
    structure.properties.coveredArea = 0;
    structure.properties.storageVolume = 0;
    structure.properties.workSurface = 0;
    structure.properties.insulation = 0;
  }
}

export function updateWeathering(world: World, elapsedHours = 1): void {
  for (const structure of world.structures) {
    const tile = getTile(world, structure.x, structure.y)!;
    const wetness = clamp(
      tile.air.humidity * 0.45 +
        tile.air.rain * 0.3 +
        Math.max(0, tile.water / 16000 - 0.8),
      0,
      1,
    );
    const warmth = clamp(2 ** ((tile.temperature - 20) / 10), 0.03, 8);
    const wind = Math.hypot(tile.air.windX, tile.air.windY);
    const freeze =
      structure.fabric.previousTemperature > 0 && tile.temperature <= 0;
    const oldCondition = structure.condition;
    structure.design.components.forEach((part, i) => {
      const piece = structure.fabric.parts[i],
        rate = RATES[part.material];
      // Exposure follows surfaces and surrounding geometry. Ruins expose all faces.
      const sheltered =
        !structure.collapsed &&
        structure.design.components.some(
          (other, j) =>
            j !== i &&
            other.z >= part.z + part.height &&
            other.x <= part.x &&
            other.y <= part.y &&
            other.x + other.width >= part.x + part.width &&
            other.y + other.depth >= part.y + part.depth,
        );
      const exposure = sheltered ? 0.25 : 1;
      const organic = MATERIALS[part.material].carbon > 0;
      const surfaceToVolume =
        2 * (1 / part.width + 1 / part.depth + 1 / part.height);
      const erosion =
        rate.loss *
        exposure *
        clamp(surfaceToVolume / 20, 0.15, 6) *
        (organic ? warmth * wetness : 0.15 + wetness + wind * 0.015);
      const lost = piece.mass * (1 - Math.exp(-erosion * elapsedHours));
      piece.mass -= lost;
      returnMaterial(world, tile, part.material, lost);
      structure.fabric.lostMass += lost;
      world.evolution.structuralLoss += lost;
      piece.damage = clamp(
        piece.damage +
          rate.fatigue *
            elapsedHours *
            exposure *
            (0.1 + wetness * warmth + wind * 0.03) +
          (freeze ? rate.frost * wetness : 0),
        0,
        1,
      );
    });
    structure.fabric.exposureHours += elapsedHours;
    structure.fabric.previousTemperature = tile.temperature;
    refreshStructure(structure);
    if (
      !structure.collapsed &&
      structure.progress >= 1 &&
      !structure.properties.stable
    ) {
      structure.collapsed = true;
      structure.maintenance = false;
      refreshStructure(structure);
      recordEvent(world, {
        category: "building",
        title: `${structure.design.name} gives way`,
        detail:
          "Weathered material can no longer carry its loads. The remaining matter stays here as a ruin that can be recovered.",
        civId: structure.civId,
        x: structure.x,
        y: structure.y,
      });
    } else if (oldCondition >= 85 && structure.condition < 85) {
      recordEvent(world, {
        category: "building",
        title: `${structure.design.name} bears the weather`,
        detail:
          "Moisture, temperature, and exposure have weakened its fabric. Maintenance requires fresh material and work.",
        civId: structure.civId,
        x: structure.x,
        y: structure.y,
      });
    }
  }
}

export function repairNeeds(
  structure: Structure,
): Partial<Record<Material, number>> {
  const result: Partial<Record<Material, number>> = {};
  structure.design.components.forEach((part, i) => {
    const nominal =
      part.width * part.depth * part.height * MATERIALS[part.material].density;
    const piece = structure.fabric.parts[i];
    result[part.material] =
      (result[part.material] ?? 0) +
      Math.max(0, nominal - piece.mass) +
      piece.mass * piece.damage;
  });
  return result;
}

/** Repair replaces lost or damaged matter; removed fabric becomes local detritus/mineral. */
export function repairStructure(
  world: World,
  civ: Civilization,
  structure: Structure,
  work: number,
): number {
  if (
    structure.collapsed ||
    structure.progress < 1 ||
    structure.civId !== civ.id
  )
    return 0;
  const tile = getTile(world, structure.x, structure.y)!;
  let budget = Math.max(0, work) * 6,
    restored = 0;
  for (const [i, part] of structure.design.components.entries()) {
    const piece = structure.fabric.parts[i];
    const nominal =
      part.width * part.depth * part.height * MATERIALS[part.material].density;
    const fill = Math.min(
      budget,
      civ.stock[part.material],
      Math.max(0, nominal - piece.mass),
    );
    piece.mass += fill;
    civ.stock[part.material] -= fill;
    budget -= fill;
    restored += fill;
    const defect = piece.mass * piece.damage;
    const replacement = Math.min(budget, civ.stock[part.material], defect);
    if (replacement > 0) {
      returnMaterial(world, tile, part.material, replacement);
      civ.stock[part.material] -= replacement;
      piece.damage *= Math.max(0, 1 - replacement / defect);
      budget -= replacement;
      restored += replacement;
    }
  }
  structure.fabric.repairedMass += restored;
  world.evolution.repaired += restored;
  refreshStructure(structure);
  if (structure.condition > 99.5) structure.maintenance = false;
  return restored;
}

export function salvageMaterial(
  world: World,
  structure: Structure,
  material: Material,
  amount: number,
): number {
  if (!structure.collapsed) return 0;
  const tile = getTile(world, structure.x, structure.y)!;
  let recovered = 0,
    handled = 0;
  for (const [i, part] of structure.design.components.entries()) {
    if (part.material !== material) continue;
    const piece = structure.fabric.parts[i];
    const removed = Math.min(piece.mass, Math.max(0, amount - handled));
    const usable = removed * (1 - piece.damage) ** 2;
    piece.mass -= removed;
    recovered += usable;
    handled += removed;
    returnMaterial(world, tile, material, removed - usable);
  }
  world.evolution.salvaged += recovered;
  refreshStructure(structure);
  if (structure.properties.mass < 0.000001) {
    for (const [material, mass] of Object.entries(structure.properties.cost))
      returnMaterial(world, tile, material as Material, mass);
    world.structures = world.structures.filter((s) => s !== structure);
  }
  return recovered;
}

export function workspaceBenefit(world: World, person: Citizen): number {
  const area = world.structures
    .filter(
      (s) =>
        !s.collapsed &&
        s.progress >= 1 &&
        Math.hypot(s.x - person.x, s.y - person.y) < 1.5,
    )
    .reduce(
      (sum, s) => sum + (s.properties.workSurface * s.condition) / 100,
      0,
    );
  return Math.min(0.25, area * 0.12);
}

export function decayStocks(world: World, civ: Civilization): void {
  const footprint = campTiles(world, civ);
  const volume = world.structures
    .filter((s) => s.civId === civ.id && !s.collapsed && s.progress >= 1)
    .reduce(
      (sum, s) => sum + (s.properties.storageVolume * s.condition) / 100,
      0,
    );
  const storedVolume = Object.entries(civ.stock).reduce(
    (sum, [m, amount]) => sum + amount / MATERIALS[m as Material].density,
    0,
  );
  const protectedFraction = clamp(volume / Math.max(storedVolume, 0.001), 0, 1);
  for (const material of Object.keys(civ.stock) as Material[]) {
    const share = civ.stock[material] / footprint.length;
    let spoiled = 0;
    for (const tile of footprint) {
      const damp =
        clamp(tile.air.humidity + tile.air.rain * 0.2, 0, 1) *
        (1 - protectedFraction * 0.6);
      const warmth = clamp(2 ** ((tile.temperature - 20) / 10), 0.05, 8);
      const rate =
        material === "biomass"
          ? 0.004 * warmth * (1.3 + damp)
          : RATES[material].loss * 24 * (0.1 + damp) * warmth;
      const loss = share * (1 - Math.exp(-rate));
      spoiled += loss;
      returnMaterial(world, tile, material, loss);
    }
    civ.stock[material] -= spoiled;
  }
}
import { campTiles } from "./settlement";
