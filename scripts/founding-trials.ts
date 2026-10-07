import { mkdirSync, writeFileSync } from "node:fs";
import {
  createWorld,
  initializeFounders,
  summarizeWorld,
} from "../src/simulation/world";
import { stepWorld, validateWorld } from "../src/simulation/engine";
import { LAWS, ledger } from "../src/simulation/laws";
import { WORLD_VERSION } from "../src/simulation/types";
import { elementLedger } from "../src/simulation/chemistry";

// Disposable seeded worlds: this program never opens a save or contacts the live server.
const days = 14,
  results = [];
for (const scenario of [
  { seed: 1847, name: "temperate", warming: 0, water: 1 },
  { seed: 72, name: "warm and dry", warming: 8, water: 0.45 },
  { seed: 908, name: "cool and wet", warming: -6, water: 1.25 },
]) {
  for (const people of [4, 8, 12]) {
    const world = createWorld(scenario.seed, 64, 64);
    world.citizens = [];
    for (const civ of world.civilizations)
      initializeFounders(world, civ, people);
    for (const tile of world.tiles) {
      tile.temperature += scenario.warming;
      if (tile.terrain !== "water") tile.water *= scenario.water;
    }
    const initial = ledger(world);
    world.initialMatter = {
      carbon: initial.carbon,
      mineral: initial.mineral,
      water: initial.water,
    };
    world.energy.initialChemical = initial.chemical;
    world.initialElements = elementLedger(world);
    const starting = world.citizens.length;
    for (let day = 0; day < days; day++) {
      stepWorld(world, 96);
      validateWorld(world);
    }
    const summary = summarizeWorld(world);
    const result = {
      scenario: scenario.name,
      seed: scenario.seed,
      foundersPerCommunity: people,
      days,
      initialPopulation: starting,
      population: world.citizens.length,
      survival: world.citizens.length / starting,
      communities: world.civilizations.map((c) => ({
        name: c.name,
        living: world.citizens.filter((p) => p.civId === c.id).length,
        foodKg: +c.stock.biomass.toFixed(2),
      })),
      averageHealth: +(
        world.citizens.reduce((s, p) => s + p.health, 0) /
        Math.max(1, world.citizens.length)
      ).toFixed(2),
      structures: world.structures.filter((s) => s.progress >= 1).length,
      relativeElementError: summary.elementRelativeError,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }
}
mkdirSync("docs/validation", { recursive: true });
writeFileSync(
  "docs/validation/founding-trials.json",
  JSON.stringify(
    {
      days,
      format: WORLD_VERSION,
      laws: LAWS.version,
      note: "Three seed/initial-weather scenarios, three population sizes. Equal per-person supplies; autonomous local behavior; no external agent. This tests the opening fortnight, not long-term demographic or genetic viability.",
      results,
    },
    null,
    2,
  ) + "\n",
);
