import { MATERIALS } from "./content";
import {
  addElements,
  composition,
  elementTerms,
  freezeElements,
  molarMass,
  normalize,
  totalElements,
} from "./elements";
import type { ElementMass, Material, Tile, World } from "./types";

/** Retain small molecular transfers when an atmospheric reservoir is very large. */
export function accumulateAtmosphere(
  world: World,
  kind: keyof World["atmosphere"],
  amount: number,
): void {
  if (amount === 0) return;
  if (!Number.isFinite(amount))
    throw new Error("Invalid atmospheric transfer.");
  const previous = world.atmosphere[kind];
  const increment = amount - (world.atmosphereCompensation[kind] ?? 0);
  const next = previous + increment;
  if (
    amount < 0 &&
    Math.abs(next) < Number.EPSILON * Math.max(1, previous) &&
    amount >= -previous
  ) {
    world.atmosphere[kind] = 0;
    world.atmosphereCompensation[kind] = 0;
  } else {
    world.atmosphereCompensation[kind] = next - previous - increment;
    world.atmosphere[kind] = next;
  }
}

// Organic matrix is a carbohydrate equivalent, NOT pure carbon. Mineral tissue is an
// explicit coarse elemental mixture. This is atom accounting, not protein biochemistry.
export const ORGANIC = freezeElements(composition("C6H10O5"));
export const WATER = freezeElements(composition("H2O"));
export const CO2 = freezeElements(composition("CO2"));
export const CLAY = freezeElements(composition("Al2Si2O5(OH)4"));
export const BIO_NUTRIENTS = freezeElements(
  normalize({
    N: 0.5,
    P: 0.09,
    K: 0.18,
    Ca: 0.1,
    Mg: 0.06,
    S: 0.055,
    Fe: 0.008,
    Mn: 0.0015,
    Zn: 0.0015,
    Cu: 0.0005,
    Mo: 0.0001,
    B: 0.0034,
  }),
);
// Model lithology, not a claim that every rock has Earth's average crust composition.
export const ROCK = freezeElements(
  normalize({
    O: 0.466,
    Si: 0.277,
    Al: 0.0813,
    Fe: 0.05,
    Ca: 0.0363,
    Na: 0.0283,
    K: 0.0259,
    Mg: 0.0209,
    Ti: 0.0044,
    P: 0.001,
    S: 0.0006,
    Mn: 0.001,
    Zn: 0.00007,
    Cu: 0.00006,
    Mo: 0.000001,
    B: 0.00001,
    H: 0.0001,
  }),
);
export const CHEMISTRY = Object.freeze({
  organicFormula: "C6H10O5",
  photosynthesis: "6 CO2 + 5 H2O + light → C6H10O5 + 6 O2",
  co2PerOrganic: (6 * molarMass("CO2")) / molarMass("C6H10O5"),
  waterPerOrganic: (5 * molarMass("H2O")) / molarMass("C6H10O5"),
  oxygenPerOrganic: (6 * molarMass("O2")) / molarMass("C6H10O5"),
  nutrientRatio: 0.04,
  coverage: [
    "elemental mass conservation",
    "oxygen-limited aerobic respiration",
    "stoichiometric photosynthesis",
    "individual soil nutrient limitation",
    "energy-consuming nitrogen fixation",
    "mineral weathering",
    "temperature-dependent elemental phase reference",
  ],
  limits: [
    "carbohydrate-equivalent organic tissue",
    "bulk mineral dissolution without aqueous equilibrium or charge balance",
    "no general reaction solver, protein chemistry, isotope decay, or nuclear transmutation",
  ],
});

export function materialElements(
  material: Material,
  amount: number,
): ElementMass {
  const mass: ElementMass = {};
  if (material === "stone") addElements(mass, ROCK, amount);
  else if (material === "clay") addElements(mass, CLAY, amount);
  else {
    addElements(mass, ORGANIC, amount * MATERIALS[material].carbon);
    addElements(mass, BIO_NUTRIENTS, amount * MATERIALS[material].mineral);
  }
  return mass;
}
export function availableMixture(tile: Tile, mixture: ElementMass): number {
  let possible = Infinity;
  const terms = elementTerms(mixture),
    symbols = terms?.symbols ?? Object.keys(mixture);
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const fraction = terms ? terms.fractions[i] : mixture[symbol];
    if (fraction > 0)
      possible = Math.min(
        possible,
        Math.max(0, tile.nutrients[symbol] ?? 0) / fraction,
      );
  }
  return Number.isFinite(possible) ? possible : 0;
}
export function addNutrients(
  tile: Tile,
  mixture: ElementMass,
  amount: number,
): void {
  if (amount === 0) return;
  addElements(tile.nutrients, mixture, amount);
  tile.mineral += totalElements(mixture) * amount;
}
export function takeNutrients(
  tile: Tile,
  mixture: ElementMass,
  requested: number,
): number {
  const amount = Math.max(
    0,
    Math.min(requested, availableMixture(tile, mixture)),
  );
  const terms = elementTerms(mixture),
    symbols = terms?.symbols ?? Object.keys(mixture);
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const fraction = terms ? terms.fractions[i] : mixture[symbol];
    tile.nutrients[symbol] = Math.max(
      0,
      (tile.nutrients[symbol] ?? 0) - fraction * amount,
    );
  }
  tile.mineral = totalElements(tile.nutrients);
  return amount;
}
export function moveSoil(source: Tile, target: Tile, requested: number): void {
  const amount = Math.min(source.mineral, requested);
  if (amount <= 0) return;
  const fraction = amount / source.mineral;
  for (const [symbol, mass] of Object.entries(source.nutrients)) {
    const moved = mass * fraction;
    source.nutrients[symbol] -= moved;
    target.nutrients[symbol] = (target.nutrients[symbol] ?? 0) + moved;
  }
  source.mineral = totalElements(source.nutrients);
  target.mineral = totalElements(target.nutrients);
}
export function limitingNutrient(tile: Tile): string {
  return Object.entries(BIO_NUTRIENTS).reduce(
    (worst, [symbol, fraction]) =>
      (tile.nutrients[symbol] ?? 0) / fraction <
      (tile.nutrients[worst] ?? 0) / BIO_NUTRIENTS[worst]
        ? symbol
        : worst,
    "N",
  );
}

/** Aggregate reservoirs before expanding chemical composition, avoiding 118 sums per tile. */
export function elementLedger(world: World): ElementMass {
  const result: ElementMass = {
    O: world.atmosphere.oxygen,
    N: world.atmosphere.nitrogen,
    Ar: world.atmosphere.argon,
  };
  let organic = 0,
    biological = 0,
    rock = world.atmosphere.dust,
    water = world.atmosphere.water;
  for (const tile of world.tiles) {
    organic +=
      tile.detritus.carbon +
      (tile.plant?.carbon ?? 0) +
      (tile.groundcover?.carbon ?? 0);
    biological +=
      tile.detritus.mineral +
      (tile.plant?.mineral ?? 0) +
      (tile.groundcover?.mineral ?? 0);
    for (const seed of tile.seedBank) {
      organic += seed.carbon;
      biological += seed.mineral;
    }
    result.O += tile.dissolvedOxygen;
    water +=
      tile.water + tile.ice + tile.air.vapor + tile.air.cloud + tile.air.snow;
    rock += tile.rock + tile.sediment + tile.air.dust;
    addElements(result, tile.nutrients);
  }
  const addMaterial = (material: Material, amount: number) =>
    addElements(result, materialElements(material, amount));
  for (const civ of world.civilizations)
    for (const [material, amount] of Object.entries(civ.stock))
      addMaterial(material as Material, amount);
  for (const person of world.citizens) {
    addMaterial("biomass", person.body);
    addMaterial("fiber", person.wrapMass);
    addMaterial("biomass", person.provisions);
    water += person.hydration;
    if (person.cargo) addMaterial(person.cargo.material, person.cargo.amount);
  }
  for (const animal of world.animals) {
    addMaterial("biomass", animal.body);
    water += animal.hydration;
  }
  for (const structure of world.structures)
    for (const [material, amount] of Object.entries(structure.properties.cost))
      addMaterial(material as Material, amount);
  for (const caravan of world.caravans) {
    addMaterial(caravan.offer.material, caravan.offer.amount);
    addMaterial(caravan.receive.material, caravan.receive.amount);
    addMaterial("biomass", caravan.provisions);
  }
  for (const chunk of world.chunks) {
    addElements(result, chunk.geology.buried);
    addElements(result, chunk.geology.exposed);
  }
  addElements(result, ORGANIC, organic);
  addElements(result, BIO_NUTRIENTS, biological);
  addElements(result, ROCK, rock);
  addElements(result, WATER, water);
  addElements(result, CO2, world.atmosphere.carbon * CHEMISTRY.co2PerOrganic);
  return result;
}

export function elementalErrors(
  world: World,
  current = elementLedger(world),
): { absolute: number; relative: number } {
  let absolute = 0,
    relative = 0;
  for (const symbol of new Set([
    ...Object.keys(current),
    ...Object.keys(world.initialElements),
    ...Object.keys(world.incomingElements),
  ])) {
    const expected =
      (world.initialElements[symbol] ?? 0) +
      (world.incomingElements[symbol] ?? 0);
    const error = Math.abs((current[symbol] ?? 0) - expected);
    absolute = Math.max(absolute, error);
    relative = Math.max(relative, error / Math.max(1, expected));
  }
  return { absolute, relative };
}
export function oxygenFraction(world: World): number {
  const oxygen = world.atmosphere.oxygen / molarMass("O2");
  return (
    oxygen /
    Math.max(
      1,
      oxygen +
        world.atmosphere.nitrogen / molarMass("N2") +
        world.atmosphere.argon / molarMass("Ar") +
        (world.atmosphere.carbon * CHEMISTRY.co2PerOrganic) / molarMass("CO2"),
    )
  );
}
