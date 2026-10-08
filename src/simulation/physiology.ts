import { MATERIALS } from "./content";
import { addNutrients, BIO_NUTRIENTS } from "./chemistry";
import { LAWS, respire, respirable, returnMaterial } from "./laws";
import { PLANET } from "./planet";
import { heatCapacity } from "./thermodynamics";
import { clamp } from "./random";
import type { Citizen, Civilization, Tile, World } from "./types";
import { nearbyTiles } from "./terrain";
import { canReachCampStocks } from "./settlement";

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
  const atHome = canReachCampStocks(world, civ, person);
  // Wrapping is a direct use of actual flexible material. Thickness and conductivity
  // determine protection; a cosmetic clothing index grants no physical benefit.
  if (atHome && tile.temperature < 15 && person.age >= 12) {
    const wrapped = Math.max(
      0,
      Math.min(
        PHYSIOLOGY.wrapTargetKg - person.wrapMass,
        civ.stock.fiber,
        dt * PHYSIOLOGY.wrappingKgPerHour,
      ),
    );
    civ.stock.fiber -= wrapped;
    person.wrapMass += wrapped;
  }
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

  const scale = Math.max(0.2, person.body / 18);
  const area = PHYSIOLOGY.adultArea * scale ** (2 / 3);
  const wrapResistance =
    person.wrapMass /
    (MATERIALS.fiber.density * area * MATERIALS.fiber.conductivity);
  const resistance =
    PHYSIOLOGY.airResistance + wrapResistance + shelterResistance;
  const lossW =
    (area * (PHYSIOLOGY.skinTemperature - tile.temperature)) / resistance;
  const metabolismW =
    (PHYSIOLOGY.basalWatts +
      (active ? PHYSIOLOGY.activeWatts : PHYSIOLOGY.restingWatts)) *
    scale;
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
