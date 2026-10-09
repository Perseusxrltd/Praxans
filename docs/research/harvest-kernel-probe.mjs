// Disposable numerical controls; run from the repository root with node --import tsx.
import { writeFileSync } from "node:fs";
import { smallWorld } from "../../tests/web/fixtures.ts";
import { beginBodyWork } from "../../src/simulation/bodywork.ts";
import { beginHarvestWork, workOnHarvest, finishHarvestWork } from "../../src/simulation/harvesting.ts";
import { tileIndex, getTile } from "../../src/simulation/world.ts";
const cases = [
  { name: "solo-uncapped", materials: ["biomass"], carbon: 4, mineral: 1, hours: 2.4 },
  { name: "handling-to-source", materials: ["biomass"], carbon: 20, mineral: 10, hours: 2.4 },
  { name: "mixed-mineral-limited", materials: ["biomass", "wood", "fiber"], carbon: 1e3, mineral: 0.08, hours: 2.4 },
  { name: "crowded-transition", materials: Array(8).fill("biomass"), carbon: 30, mineral: 10, hours: 2.4 }
];
const intervals = [2.4, 0.25, 0.125, 0.0625, 0.03125, 0.015625, 390625e-8];
const reports = [];
for (const scenario of cases) {
  const runs = [];
  for (const dt of intervals) {
    const world = smallWorld(1847, 64, 64), civ = world.civilizations[0], tile = getTile(world, civ.x, civ.y);
    const plant = structuredClone(world.tiles.find((t) => t.plant).plant);
    plant.carbon = scenario.carbon;
    plant.mineral = scenario.mineral;
    plant.genome.woodiness = 0.4;
    plant.genome.defense = 0.1;
    tile.plant = plant;
    tile.groundcover = null;
    world.citizens = world.citizens.slice(0, scenario.materials.length);
    civ.focus = "balance";
    civ.policies.extraction = 0.5;
    for (const [i, p] of world.citizens.entries()) {
      p.x = tile.x;
      p.y = tile.y;
      p.civId = civ.id;
      p.skill = 0;
      p.cargo = null;
      p.journeyId = null;
      p.task = { kind: scenario.materials[i] === "biomass" ? "gather" : "extract", material: scenario.materials[i], tile: tileIndex(world, tile.x, tile.y), path: [], progress: 0 };
    }
    let elapsed = 0, steps = 0;
    while (elapsed < scenario.hours - 1e-12) {
      const h = Math.min(dt, scenario.hours - elapsed);
      const work = beginHarvestWork(world, beginBodyWork(world));
      for (const p of world.citizens) workOnHarvest(world, p, h, work);
      finishHarvestWork(world, work);
      world.tick++;
      elapsed += h;
      steps++;
    }
    runs.push({ dt, steps, products: world.citizens.map((p) => p.cargo?.amount ?? 0), carbon: plant.carbon, mineral: plant.mineral });
  }
  const reference = runs.at(-1);
  reports.push({ ...scenario, referenceInterval: reference.dt, runs: runs.map((r) => ({ ...r, maxProductError: Math.max(...r.products.map((v, i) => Math.abs(v - reference.products[i]))), totalKg: r.products.reduce((s, n) => s + n, 0) })) });
}
writeFileSync(process.argv[2] ?? "output/research/harvesting-kernel-final.json", JSON.stringify({ method: "Equal cumulative effective effort with fixed actors, source, policy and skill; no replenishment, physiology or completion. Fine interval is a numerical reference, not empirical truth.", reports }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(reports.map((r) => ({ name: r.name, runs: r.runs.map((x) => ({ dt: x.dt, totalKg: x.totalKg, error: x.maxProductError })) }))));
