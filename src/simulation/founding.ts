/** Equal initial resources; survival subsequently depends on the living environment. */
export const FOUNDING = Object.freeze({
  people: 8,
  ages: [20, 24, 22, 28, 26, 32, 30, 34] as readonly number[],
  stockPerPerson: { biomass: 4, wood: 4.5, fiber: 1, stone: 2.25, clay: 0.75 },
  minimumTemperature: 8,
  maximumTemperature: 30,
  minimumLocalFood: 160,
  minimumLocalWood: 60,
  minimumSoilWater: 2000,
  description:
    "Eight unrelated adults, equal supplies and a comparable spread of traits, begin in a temperate clearing with water and reachable plant food. This is an initial balance choice, not a biological minimum population or a survival guarantee.",
});
