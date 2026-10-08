import { MATERIALS } from "./content";
import { addNutrients, BIO_NUTRIENTS } from "./chemistry";
import { LAWS, respire, respirable, returnMaterial } from "./laws";
import { PLANET } from "./planet";
import { heatCapacity } from "./thermodynamics";
import { clamp } from "./random";
import type { Citizen, Civilization, Tile, World } from "./types";
import { nearbyTiles } from "./terrain";
import { canReachCampStocks } from "./settlement";
import { distance } from "./world";

/** Effective human heat balance, not a model of organs or cellular thermoregulation. */
export const PHYSIOLOGY = Object.freeze({
  skinTemperature: 33,
  adultArea: 1.8,
  basalWatts: 85,
  restingWatts: 25,
  activeWatts: 75,
  airResistance: 0.12,
  wrapTargetKg: 2,
  wrappingKgPerHour: 0.4,
});

export const hydrationTarget = (person: Citizen) =>
  person.age < 12 ? 1 + person.body * 0.25 : 8;

/** The existing shared shelter approximation, used by physiology and local decisions. */
export function bodyShelter(world: World, person: Citizen) {
  const structure = world.structures.find(
    (s) =>
      s.civId === person.civId &&
      !s.collapsed &&
      s.progress >= 1 &&
      distance(person, s) < 0.5,
  );
  const coverage = structure
    ? Math.min(
        1,
        structure.properties.capacity /
          Math.max(
            1,
            world.citizens.filter((p) => distance(p, structure) < 0.5).length,
          ),
      )
    : 0;
  return {
    coverage,
    resistance: coverage * (structure?.properties.insulation ?? 0),
  };
}

/** Signed watts: negative loss is heat arriving from surroundings hotter than skin. */
export function bodyHeatBalance(
  person: Citizen,
  temperature: number,
  active: boolean,
  shelterResistance: number,
  wrapMass = person.wrapMass,
) {
  const scale = Math.max(0.2, person.body / 18);
  const area = PHYSIOLOGY.adultArea * scale ** (2 / 3);
  const wrapResistance =
    wrapMass / (MATERIALS.fiber.density * area * MATERIALS.fiber.conductivity);
  const resistance =
    PHYSIOLOGY.airResistance + wrapResistance + shelterResistance;
  const lossW =
    (area * (PHYSIOLOGY.skinTemperature - temperature)) / resistance;
  const metabolismW =
    (PHYSIOLOGY.basalWatts +
      (active ? PHYSIOLOGY.activeWatts : PHYSIOLOGY.restingWatts)) *
    scale;
  return { area, lossW, metabolismW };
}

/**
 * A local controller estimate, not a recipe or a physical mass limit. The old
 * adult 2 kg reference bounds new planning, scaled by represented body area.
 * Existing larger wraps may be retained. At temperatures above skin, stripping
 * increases this model's incoming heat; the signed balance must not be reversed.
 */
export function preferredWrapMass(
  person: Citizen,
  temperature: number,
  active: boolean,
  shelterResistance: number,
): number {
  const { area, metabolismW } = bodyHeatBalance(
    person,
    temperature,
    active,
    shelterResistance,
  );
  const maximum = Math.max(
    person.wrapMass,
    (PHYSIOLOGY.wrapTargetKg * area) / PHYSIOLOGY.adultArea,
  );
  if (temperature > PHYSIOLOGY.skinTemperature) return maximum;
  if (temperature === PHYSIOLOGY.skinTemperature) return person.wrapMass;
  const resistance =
    (area * (PHYSIOLOGY.skinTemperature - temperature)) / metabolismW -
    PHYSIOLOGY.airResistance -
    shelterResistance;
  return Math.max(
    0,
    Math.min(
      maximum,
      resistance *
        MATERIALS.fiber.density *
        area *
        MATERIALS.fiber.conductivity,
    ),
  );
}

/** Water in the occupied cell or on its immediate bank is physically reachable. */
export function nearbyDrinkingWater(
  world: World,
  person: Citizen,
): Tile | undefined {
  const tiles = nearbyTiles(world, person, 1.5);
  return (
    tiles.find((t) => t.water > 0.1) ??
    tiles.find((t) => t.ice + t.air.snow > 0.1)
  );
}

/** Take only real food the person can reach, including independently carried rations. */
export function takeAccessibleFood(
  world: World,
  person: Citizen,
  civ: Civilization,
  requested: number,
): number {
  const journey = person.journeyId
    ? world.caravans.find((c) => c.id === person.journeyId)
    : undefined;
  const atHome = canReachCampStocks(world, civ, person);
  const carried = person.cargo?.material === "biomass" ? person.cargo : null;
  let left = Math.max(0, requested);
  const personal = Math.min(left, person.provisions);
  person.provisions -= personal;
  left -= personal;
  if (journey) {
    const amount = Math.min(left, journey.provisions);
    journey.provisions -= amount;
    left -= amount;
  } else if (atHome) {
    const amount = Math.min(left, civ.stock.biomass);
    civ.stock.biomass -= amount;
    left -= amount;
  }
  if (carried && left > 0) {
    const amount = Math.min(left, carried.amount);
    carried.amount -= amount;
    left -= amount;
    if (carried.amount === 0) person.cargo = null;
  }
  return requested - left;
}

/** Extra metabolism spends accessible food; it cannot draw from a distant stockpile. */
function fuel(
  world: World,
  person: Citizen,
  civ: Civilization,
  tile: Tile,
  requestedKJ: number,
): number {
  const requested = Math.max(
    0,
    Math.min(
      requestedKJ / (LAWS.chemicalEnergy * MATERIALS.biomass.carbon),
      respirable(world, 1) / MATERIALS.biomass.carbon,
    ),
  );
  const amount = takeAccessibleFood(world, person, civ, requested);
  if (!amount) return 0;
  respire(world, amount * MATERIALS.biomass.carbon, tile);
  addNutrients(tile, BIO_NUTRIENTS, amount * MATERIALS.biomass.mineral);
  return amount * MATERIALS.biomass.carbon * LAWS.chemicalEnergy;
}

export function regulateTemperature(
  world: World,
  person: Citizen,
  civ: Civilization,
  tile: Tile,
  dt: number,
  active: boolean,
  shelterResistance: number,
): void {
  // Arranging usable fiber is performed work. Physiology only wears the material
  // already present; being near a stockpile cannot clothe anyone by itself.
  const worn = person.wrapMass * (1 - Math.exp(-dt * 0.000015));
  person.wrapMass -= worn;
  returnMaterial(world, tile, "fiber", worn);

  // Frozen water can be melted with metabolic energy. Both the water and the
  // latent heat have sources; an empty food supply cannot create drinking water.
  const targetWater = hydrationTarget(person);
  if (person.hydration < targetWater * 0.8 && tile.water < 0.1) {
    const source = nearbyDrinkingWater(world, person) ?? tile;
    const available = source.air.snow + source.ice;
    const requested = Math.min(
      available,
      targetWater - person.hydration,
      dt * 2,
    );
    const heatPerKg =
      PLANET.fusionHeat + Math.max(0, -source.temperature) * 2.1;
    const melted =
      fuel(world, person, civ, tile, requested * heatPerKg) / heatPerKg;
    const snow = Math.min(source.air.snow, melted);
    source.air.snow -= snow;
    source.ice -= Math.min(source.ice, melted - snow);
    person.hydration += melted;
    tile.temperature -= (melted * heatPerKg) / heatCapacity(tile);
  }

  const { lossW, metabolismW } = bodyHeatBalance(
    person,
    tile.temperature,
    active,
    shelterResistance,
  );
  const deficitKJ = Math.max(0, lossW - metabolismW) * dt * 3.6;
  const suppliedKJ = fuel(world, person, civ, tile, deficitKJ);
  // Remaining exposure reduces health. Insulation alone supplies no energy.
  person.health = clamp(
    person.health - Math.max(0, deficitKJ - suppliedKJ) / 240,
  );
  const excessKJ = Math.max(0, metabolismW - lossW) * dt * 3.6;
  const sweat = Math.min(
    Math.max(0, person.hydration - targetWater * 0.35),
    excessKJ / PLANET.vaporizationHeat,
  );
  person.hydration -= sweat;
  tile.air.vapor += sweat;
  tile.temperature -= (sweat * PLANET.vaporizationHeat) / heatCapacity(tile);
  person.health = clamp(
    person.health -
      Math.max(0, excessKJ - sweat * PLANET.vaporizationHeat) / 240,
  );
}
