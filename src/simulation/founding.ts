/** Equal initial resources; survival subsequently depends on the living environment. */
export const FOUNDING = Object.freeze({
  people: 300,
  ages: [20, 24, 22, 28, 26, 32, 30, 34] as readonly number[],
  stockPerPerson: { biomass: 48, wood: 12, fiber: 4, stone: 2.25, clay: 0.75 },
  resourceRadius: 48,
  minimumTemperature: 8,
  maximumTemperature: 30,
  minimumLocalFoodPerPerson: 20,
  minimumLocalWoodPerPerson: 10,
  minimumSoilWater: 2000,
  description:
    "Three hundred unrelated adult settlers, each represented individually, arrive with equal finite supplies and a comparable spread of traits. Opening food is 48 kg per person; 2 kg of the 4 kg fiber allowance becomes a body wrap. Habitat screening counts standing food and wood only on represented land connected within a 480 m projected radius, with requirements scaled to population. This does not assign resource ownership, teach personal locations, measure ecological replacement or exclude competing camps. The selected adult founding group is not a complete historical age distribution, a biological minimum population, or a survival guarantee.",
});
