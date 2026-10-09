import { MATERIALS } from "./content";
import { addNutrients, BIO_NUTRIENTS } from "./chemistry";
import { LAWS, respire, respirable, returnMaterial } from "./laws";
import { PLANET } from "./planet";
import { heatCapacity } from "./thermodynamics";
import { clamp } from "./random";
import type {
  Citizen,
  Civilization,
  MetabolicFlux,
  Metabolism,
  Tile,
  World,
} from "./types";
import { DAYS_PER_YEAR } from "./types";
import { nearbyTiles } from "./terrain";
import { distance } from "./world";
import { feedIntake, shareFiniteSupply } from "./subsistence";

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

/** Effective substrate limits; these are not measured anatomical parameters. */
export interface MetabolicModel {
  reserveFraction: number;
  reservePowerMultiple: number;
  maximumPowerMultiple: number;
  intakeKgPerBodyKg: number;
  intakeTurnoverPerHour: number;
  refillFraction: number;
  retentionFraction: number;
  injuryKJPerPoint: number;
}
export const METABOLISM: Readonly<MetabolicModel> = Object.freeze({
  reserveFraction: 0.1,
  reservePowerMultiple: 2,
  maximumPowerMultiple: 4,
  intakeKgPerBodyKg: 0.05,
  intakeTurnoverPerHour: 4,
  refillFraction: 0.4,
  retentionFraction: 0.35,
  injuryKJPerPoint: 240,
});

/** Dry-equivalent capacity and time scales, not a fitted human growth chart. */
export interface DevelopmentModel {
  birthBodyKg: number;
  adultBodyKg: number;
  maturityYears: number;
  structuralRecoveryHours: number;
}
export const DEVELOPMENT: Readonly<DevelopmentModel> = Object.freeze({
  birthBodyKg: 2,
  adultBodyKg: 18,
  maturityYears: 18,
  structuralRecoveryHours: 90 * 24,
});
const FOOD_KJ_PER_KG = LAWS.chemicalEnergy * MATERIALS.biomass.carbon;
const EPSILON = 1e-9;

/** A capacity bound; food scarcity can prevent reaching it. Never resize a body. */
export function structuralCapacity(
  age: number,
  reserveFraction = METABOLISM.reserveFraction,
  development: Readonly<DevelopmentModel> = DEVELOPMENT,
): number {
  const progress = clamp(age / development.maturityYears, 0, 1);
  return (
    (development.birthBodyKg +
      (development.adultBodyKg - development.birthBodyKg) *
        progress *
        (2 - progress)) *
    (1 - reserveFraction)
  );
}

/**
 * Citizens have already advanced age to this interval's end. Ordinary capacity
 * gain and finite recovery share one final gap; neither is a material credit.
 * Mature adults may recover structure lost through a real body transfer.
 */
function structuralDepositionLimit(
  person: Citizen,
  hours: number,
  model: Readonly<MetabolicModel>,
  development: Readonly<DevelopmentModel>,
): number {
  const startAge = Math.max(0, person.age - hours / (24 * DAYS_PER_YEAR));
  const startCapacity = structuralCapacity(
    startAge,
    model.reserveFraction,
    development,
  );
  const endCapacity = structuralCapacity(
    person.age,
    model.reserveFraction,
    development,
  );
  const structure = person.body - person.metabolism.reserves;
  const recovery =
    Math.max(0, startCapacity - structure) *
    -Math.expm1(-hours / development.structuralRecoveryHours);
  return Math.min(
    Math.max(0, endCapacity - structure),
    Math.max(0, endCapacity - startCapacity) + recovery,
  );
}

export function initialMetabolism(body: number): Metabolism {
  if (!Number.isFinite(body) || body < 0)
    throw new Error("A metabolic partition requires an existing body mass.");
  return { intake: 0, reserves: body * METABOLISM.reserveFraction, last: null };
}

/** Transfer, not oxidation: childbirth can use a finite part of a parent's body. */
export function withdrawBodyMatter(person: Citizen, requested: number): number {
  const amount = Math.min(person.body, Math.max(0, requested));
  const reserve = Math.min(person.metabolism.reserves, amount);
  person.metabolism.reserves -= reserve;
  person.body -= amount;
  return amount;
}

export const intakeCapacity = (
  person: Citizen,
  model: Readonly<MetabolicModel> = METABOLISM,
) => Math.max(0.001, person.body * model.intakeKgPerBodyKg);

/** Satiety is an intake signal, never a source of chemical energy or injury. */
function updateSatiety(person: Citizen, model: Readonly<MetabolicModel>) {
  person.hunger = clamp(
    (person.metabolism.intake / intakeCapacity(person, model)) * 100,
  );
}

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
  const scale = Math.max(0.2, person.body / DEVELOPMENT.adultBodyKg);
  const area = PHYSIOLOGY.adultArea * scale ** (2 / 3);
  const wrapResistance =
    wrapMass / (MATERIALS.fiber.density * area * MATERIALS.fiber.conductivity);
  const resistance =
    PHYSIOLOGY.airResistance + wrapResistance + shelterResistance;
  const lossW =
    (area * (PHYSIOLOGY.skinTemperature - temperature)) / resistance;
  const metabolicDemandW =
    (PHYSIOLOGY.basalWatts +
      (active ? PHYSIOLOGY.activeWatts : PHYSIOLOGY.restingWatts)) *
    scale;
  return { area, lossW, metabolicDemandW };
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
  const { area, metabolicDemandW } = bodyHeatBalance(
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
    (area * (PHYSIOLOGY.skinTemperature - temperature)) / metabolicDemandW -
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

export interface MetabolicStep {
  world: World;
  tick: number;
  person: Citizen;
  tile: Tile;
  hours: number;
  active: boolean;
  journeyId: string | null;
  model: Readonly<MetabolicModel>;
  capacity: number;
  ingestionLimitKg: number;
  maximumOxidationKg: number;
  reserveLimitKg: number;
  maintenanceKJ: number;
  restingKJ: number;
  heatLossKJ: number;
  structuralLimitKg: number;
  meltSource: Tile;
  meltRequestedKg: number;
  meltHeatPerKg: number;
  ingestedKg: number;
  fed: boolean;
  finished: boolean;
  refilled: boolean;
}

/** Snapshot demand before any shared food withdrawal or another body's heating. */
export function prepareMetabolism(
  world: World,
  person: Citizen,
  tile: Tile,
  dt: number,
  active: boolean,
  shelterResistance: number,
  model: Readonly<MetabolicModel> = METABOLISM,
  development: Readonly<DevelopmentModel> = DEVELOPMENT,
): MetabolicStep {
  if (!Number.isFinite(dt) || dt <= 0)
    throw new Error("Metabolism requires a positive finite time interval.");
  if (
    model !== METABOLISM &&
    (!Object.values(model).every(
      (value) => Number.isFinite(value) && value >= 0,
    ) ||
      model.reserveFraction >= 1 ||
      model.retentionFraction >= 1 ||
      model.refillFraction > 1 ||
      !model.intakeKgPerBodyKg ||
      !model.intakeTurnoverPerHour ||
      !model.injuryKJPerPoint)
  )
    throw new Error("Invalid experimental metabolic coefficients.");
  if (
    development !== DEVELOPMENT &&
    (!Object.values(development).every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
      development.adultBodyKg < development.birthBodyKg)
  )
    throw new Error("Invalid experimental developmental coefficients.");
  // Arranging usable fiber is performed work. Physiology only wears the material
  // already present; being near a stockpile cannot clothe anyone by itself.
  const worn = person.wrapMass * (1 - Math.exp(-dt * 0.000015));
  person.wrapMass -= worn;
  returnMaterial(world, tile, "fiber", worn);
  const targetWater = hydrationTarget(person);
  const source = nearbyDrinkingWater(world, person) ?? tile;
  const meltRequestedKg =
    person.hydration < targetWater * 0.8 && tile.water < 0.1
      ? Math.max(
          0,
          Math.min(
            source.air.snow + source.ice,
            targetWater - person.hydration,
            dt * 2,
          ),
        )
      : 0;
  const { lossW, metabolicDemandW } = bodyHeatBalance(
    person,
    tile.temperature,
    active,
    shelterResistance,
  );
  const restingW =
    (PHYSIOLOGY.basalWatts + PHYSIOLOGY.restingWatts) *
    Math.max(0.2, person.body / DEVELOPMENT.adultBodyKg);
  const capacity = intakeCapacity(person, model);
  return {
    world,
    tick: world.tick,
    person,
    tile,
    hours: dt,
    active,
    journeyId: person.journeyId,
    model,
    capacity,
    ingestionLimitKg: capacity * model.intakeTurnoverPerHour * dt,
    maximumOxidationKg:
      (restingW * model.maximumPowerMultiple * dt * 3.6) / FOOD_KJ_PER_KG,
    reserveLimitKg:
      (restingW * model.reservePowerMultiple * dt * 3.6) / FOOD_KJ_PER_KG,
    maintenanceKJ: metabolicDemandW * dt * 3.6,
    restingKJ: restingW * dt * 3.6,
    heatLossKJ: lossW * dt * 3.6,
    structuralLimitKg: structuralDepositionLimit(
      person,
      dt,
      model,
      development,
    ),
    meltSource: source,
    meltRequestedKg,
    meltHeatPerKg: PLANET.fusionHeat + Math.max(0, -source.temperature) * 2.1,
    ingestedKg: 0,
    fed: false,
    finished: false,
    refilled: false,
  };
}

function checkSteps(
  world: World,
  steps: readonly MetabolicStep[],
  phase: "feed" | "refill",
) {
  const seen = new Set<string>();
  for (const step of steps) {
    if (
      step.world !== world ||
      step.tick !== world.tick ||
      seen.has(step.person.id) ||
      (phase === "feed" ? step.fed : !step.finished || step.refilled)
    )
      throw new Error(
        "Metabolic phases must run once per person in their original world tick.",
      );
    seen.add(step.person.id);
  }
}

function requiredEnergy(step: MetabolicStep, meltKg = step.meltRequestedKg) {
  // Maintenance becomes heat. The same packet can then leave through sensible
  // loss or melting; baseline plus the full outward heat would count it twice.
  return Math.max(
    step.maintenanceKJ,
    Math.max(0, step.heatLossKJ) + meltKg * step.meltHeatPerKg,
  );
}

/** Current needs get a common food boundary before any optional internal storage. */
export function feedMetabolicNeeds(
  world: World,
  steps: readonly MetabolicStep[],
): void {
  checkSteps(world, steps, "feed");
  // Reserve one finite quantity per ice source before asking for its heat.
  // Otherwise two people can claim the same ice and withhold surplus food from
  // someone else's current maintenance after the first person melts it all.
  const iceClaims = new Map<
    Tile,
    { person: Citizen; amount: number; step: MetabolicStep }[]
  >();
  for (const step of steps) {
    const amount = Math.min(
      step.meltRequestedKg,
      Math.max(
        0,
        step.maximumOxidationKg * FOOD_KJ_PER_KG - Math.max(0, step.heatLossKJ),
      ) / step.meltHeatPerKg,
    );
    step.meltRequestedKg = 0;
    if (!(amount > 0 && step.person.health > 0)) continue;
    const claims = iceClaims.get(step.meltSource) ?? [];
    claims.push({ person: step.person, amount, step });
    iceClaims.set(step.meltSource, claims);
  }
  for (const [source, claims] of iceClaims)
    shareFiniteSupply(claims, source.ice + source.air.snow, (claim, amount) => {
      claim.step.meltRequestedKg = amount;
    });
  const received = feedIntake(
    world,
    steps.map((step) => ({
      person: step.person,
      amount: Math.max(
        0,
        Math.min(
          step.ingestionLimitKg,
          step.capacity - step.person.metabolism.intake,
          Math.min(
            step.maximumOxidationKg,
            requiredEnergy(step) / FOOD_KJ_PER_KG,
          ) - step.person.metabolism.intake,
        ),
      ),
    })),
  );
  for (const step of steps) {
    step.ingestedKg = received.get(step.person) ?? 0;
    step.fed = true;
  }
}

/** One oxygen-limited oxidation path supplies maintenance, heat and melting. */
export function finishMetabolism(
  world: World,
  step: MetabolicStep,
): MetabolicFlux {
  if (
    step.world !== world ||
    step.tick !== world.tick ||
    !step.fed ||
    step.finished
  )
    throw new Error(
      "A fed metabolic step must finish once in its original world tick.",
    );
  step.finished = true;
  const { person, tile, model } = step;
  const alive = person.health > 0;
  const meltedRequest = Math.min(
    step.meltRequestedKg,
    step.meltSource.air.snow + step.meltSource.ice,
  );
  const wantedKg = alive
    ? Math.min(
        step.maximumOxidationKg,
        requiredEnergy(step, meltedRequest) / FOOD_KJ_PER_KG,
      )
    : 0;
  const oxygenKg =
    respirable(world, wantedKg * MATERIALS.biomass.carbon) /
    MATERIALS.biomass.carbon;
  const foodOxidizedKg = Math.min(person.metabolism.intake, wantedKg, oxygenKg);
  const reserveOxidizedKg = Math.max(
    0,
    Math.min(
      person.metabolism.reserves,
      step.reserveLimitKg,
      wantedKg - foodOxidizedKg,
      oxygenKg - foodOxidizedKg,
    ),
  );
  person.metabolism.intake -= foodOxidizedKg;
  person.metabolism.reserves -= reserveOxidizedKg;
  person.body -= reserveOxidizedKg;
  const oxidizedKg = foodOxidizedKg + reserveOxidizedKg;
  const releasedKJ = oxidizedKg * FOOD_KJ_PER_KG;
  respire(world, oxidizedKg * MATERIALS.biomass.carbon, tile);
  addNutrients(tile, BIO_NUTRIENTS, oxidizedKg * MATERIALS.biomass.mineral);

  const melted = Math.min(
    meltedRequest,
    Math.max(0, releasedKJ - Math.max(0, step.heatLossKJ)) / step.meltHeatPerKg,
  );
  const meltKJ = melted * step.meltHeatPerKg;
  const snow = Math.min(step.meltSource.air.snow, melted);
  step.meltSource.air.snow -= snow;
  step.meltSource.ice -= Math.min(step.meltSource.ice, melted - snow);
  person.hydration += melted;
  tile.temperature -= meltKJ / heatCapacity(tile);
  const unmetMaintenanceKJ = Math.max(0, step.maintenanceKJ - releasedKJ);
  const unmetRestingKJ = Math.max(0, step.restingKJ - releasedKJ);
  const unmetColdKJ = Math.max(0, step.heatLossKJ - (releasedKJ - meltKJ));
  const excessKJ = Math.max(0, releasedKJ - meltKJ - step.heatLossKJ);
  const targetWater = hydrationTarget(person);
  const sweat = Math.min(
    Math.max(0, person.hydration - targetWater * 0.35),
    excessKJ / PLANET.vaporizationHeat,
  );
  person.hydration -= sweat;
  tile.air.vapor += sweat;
  tile.temperature -= (sweat * PLANET.vaporizationHeat) / heatCapacity(tile);
  const unremovedHeatKJ = Math.max(
    0,
    excessKJ - sweat * PLANET.vaporizationHeat,
  );
  // Unfunded optional work reduces activity; an intention is not another
  // mandatory bodily need. Keep requested fuel above, but use the captured
  // resting demand for injury, recovery and processing. Deficit components
  // overlap; do not injure twice for the same missing kJ.
  // This dose remains a phenomenological injury model, not core temperature.
  const injury = alive
    ? (Math.max(unmetRestingKJ, unmetColdKJ) + unremovedHeatKJ) /
      model.injuryKJPerPoint
    : 0;
  const previousHealth = person.health;
  person.health = clamp(person.health - injury);
  const healthLoss = previousHealth - person.health;

  let reserveStoredKg = 0,
    structureStoredKg = 0;
  if (
    alive &&
    person.health > 0 &&
    Math.max(unmetRestingKJ, unmetColdKJ, unremovedHeatKJ) < EPSILON
  ) {
    // Processing remains included in the coarse resting-maintenance account.
    // The inherited 35% convention caps its throughput, not a measured synthesis
    // cost. Extra oxidation for cold, melting or work grants no extra processing.
    // Never retain a fraction of the buffered balance on each substep.
    let allowance = Math.min(
      person.metabolism.intake,
      (Math.min(foodOxidizedKg, step.restingKJ / FOOD_KJ_PER_KG) *
        model.retentionFraction) /
        (1 - model.retentionFraction),
    );
    const structure = person.body - person.metabolism.reserves;
    const reserveTarget =
      (structure * model.reserveFraction) / (1 - model.reserveFraction);
    reserveStoredKg = Math.min(
      allowance,
      Math.max(0, reserveTarget - person.metabolism.reserves),
    );
    person.metabolism.reserves += reserveStoredKg;
    allowance -= reserveStoredKg;
    structureStoredKg = Math.min(allowance, step.structuralLimitKg);
    person.metabolism.intake -= reserveStoredKg + structureStoredKg;
    person.body += reserveStoredKg + structureStoredKg;
  }
  const activityFraction = step.active
    ? clamp(
        (releasedKJ - step.restingKJ) /
          Math.max(EPSILON, step.maintenanceKJ - step.restingKJ),
        0,
        1,
      )
    : 0;
  const flux: MetabolicFlux = {
    tick: step.tick,
    hours: step.hours,
    ingestedKg: step.ingestedKg,
    foodOxidizedKg,
    reserveOxidizedKg,
    reserveStoredKg,
    structureStoredKg,
    maintenanceKJ: step.maintenanceKJ,
    restingKJ: step.restingKJ,
    heatLossKJ: step.heatLossKJ,
    releasedKJ,
    meltKJ,
    unmetMaintenanceKJ,
    unmetRestingKJ,
    unmetColdKJ,
    unremovedHeatKJ,
    healthLoss,
    activityFraction,
    journeyId: step.journeyId,
  };
  person.metabolism.last = flux;
  updateSatiety(person, model);
  return flux;
}

/** Real meal buffers refill only after everyone's current metabolic interval. */
export function refillMetabolicIntake(
  world: World,
  steps: readonly MetabolicStep[],
): void {
  checkSteps(world, steps, "refill");
  const received = feedIntake(
    world,
    steps.map((step) => ({
      person: step.person,
      amount:
        step.person.metabolism.intake <
        step.capacity * step.model.refillFraction
          ? Math.max(
              0,
              Math.min(
                step.capacity - step.person.metabolism.intake,
                step.ingestionLimitKg - step.ingestedKg,
              ),
            )
          : 0,
    })),
  );
  for (const step of steps) {
    const amount = received.get(step.person) ?? 0;
    step.ingestedKg += amount;
    step.person.metabolism.last!.ingestedKg += amount;
    step.refilled = true;
    updateSatiety(step.person, step.model);
  }
}

/** Single-person diagnostic wrapper; the world engine stages a shared boundary. */
export function regulateTemperature(
  world: World,
  person: Citizen,
  civ: Civilization,
  tile: Tile,
  dt: number,
  active: boolean,
  shelterResistance: number,
  model: Readonly<MetabolicModel> = METABOLISM,
  development: Readonly<DevelopmentModel> = DEVELOPMENT,
): MetabolicFlux {
  if (person.civId !== civ.id)
    throw new Error("A person's food custody must match their community.");
  const step = prepareMetabolism(
    world,
    person,
    tile,
    dt,
    active,
    shelterResistance,
    model,
    development,
  );
  feedMetabolicNeeds(world, [step]);
  return finishMetabolism(world, step);
}
