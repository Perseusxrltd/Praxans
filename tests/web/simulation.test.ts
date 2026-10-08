import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, summarizeWorld } from "../../src/simulation/world";
import { stepWorld, validateWorld } from "../../src/simulation/engine";
import { evaluateDesign, ledger, refreshTile } from "../../src/simulation/laws";
import { seedPlant, updateEcology } from "../../src/simulation/ecology";
import { applyAgentActions } from "../../src/simulation/actions";
import { dispatchTrade, requestAssembly } from "../../src/simulation/economy";
import type { Design } from "../../src/simulation/types";
import { encounter } from "../../src/simulation/diplomacy";

export const testShelter: Design = {
  name: "Load trial",
  components: [
    {
      material: "wood",
      x: 0,
      y: 0,
      z: 0,
      width: 0.16,
      depth: 0.16,
      height: 1.8,
    },
    {
      material: "wood",
      x: -0.72,
      y: -0.72,
      z: 1.8,
      width: 1.6,
      depth: 1.6,
      height: 0.03,
    },
  ],
};
test("fixed ticks replay exactly, including after JSON serialization", () => {
  const a = createWorld(1847),
    b = createWorld(1847);
  stepWorld(a, 192);
  for (let i = 0; i < 192; i++) stepWorld(b);
  assert.deepEqual(a, b);
  const restored = JSON.parse(JSON.stringify(a));
  validateWorld(restored);
  stepWorld(a, 96);
  stepWorld(restored, 96);
  assert.deepEqual(a, restored);
});
test("24 simulated days conserve elements and biochemical energy through growth, gathering, building, and trade", (t) => {
  const world = createWorld(1847);
  let maxStructures = 0;
  for (let day = 0; day < 24; day++) {
    stepWorld(world, 96);
    validateWorld(world);
    maxStructures = Math.max(maxStructures, world.structures.length);
    assert.ok(
      world.tiles.every(
        (tile) => tile.temperature > -80 && tile.temperature < 65,
      ),
      "the initial temperate region must not run away into uninhabitable temperatures",
    );
  }
  const summary = summarizeWorld(world);
  assert.equal(world.births, 0, "gestation takes months, not days");
  assert.ok(summary.discoveries > 0);
  assert.ok(world.citizens.length >= 12);
  assert.ok(
    maxStructures > 0,
    "material experimentation should lead to at least one usable assembly",
  );
  assert.ok(Math.abs(summary.carbonError) < 0.001);
  assert.ok(Math.abs(summary.waterError) < 0.001);
  assert.ok(Math.abs(summary.mineralError) < 0.001);
  assert.ok(Math.abs(summary.energyError) < 0.1);
  t.diagnostic(
    JSON.stringify({
      days: 24,
      people: world.citizens.length,
      peakAssemblies: maxStructures,
      discoveries: summary.discoveries,
      elementError: summary.elementError,
      energyError: summary.energyError,
      temperature: [
        Math.min(...world.tiles.map((tile) => tile.temperature)),
        Math.max(...world.tiles.map((tile) => tile.temperature)),
      ],
    }),
  );
});
test("photosynthesis needs sunlight, water, and mineral nutrients", () => {
  for (const missing of ["light", "water", "mineral"]) {
    const world = createWorld(6);
    world.tick = missing === "light" ? 0 : 48;
    world.weather = "clear";
    if (missing === "water") world.atmosphere.water = 0;
    if (missing !== "light")
      for (const tile of world.tiles) {
        if (missing === "water") {
          tile.water = 0;
          tile.air.vapor = 0;
          tile.air.cloud = 0;
          tile.air.snow = 0;
        } else {
          tile.mineral = 0;
          tile.nutrients = {};
          tile.rock = 0;
          tile.detritus.mineral = 0;
        }
      }
    updateEcology(world);
    assert.equal(
      world.energy.captured,
      0,
      `No photosynthetic energy without ${missing}`,
    );
  }
});
test("seeds inherit with mutation and transfer parental matter", () => {
  const world = createWorld(8),
    source = world.tiles.find((t) => t.plant)!,
    target = world.tiles.find((t) => !t.plant && t.terrain === "hill")!;
  assert.ok(target);
  source.pollination = 1;
  const before = ledger(world),
    genome = structuredClone(source.plant!.genome);
  assert.equal(seedPlant(world, source, target), true);
  assert.equal(target.plant, null);
  assert.equal(target.seedBank[0].generation, 1);
  assert.equal(target.seedBank[0].lineage, source.plant!.lineage);
  assert.notDeepEqual(target.seedBank[0].genome, genome);
  const after = ledger(world);
  assert.ok(Math.abs(before.carbon - after.carbon) < 1e-6);
  assert.ok(Math.abs(before.mineral - after.mineral) < 1e-6);
});
test("shelter follows geometry and material strength, independent of names", () => {
  const physical = evaluateDesign(testShelter);
  assert.equal(physical.stable, true);
  assert.ok(physical.coveredArea > 1.5);
  assert.deepEqual(
    physical,
    evaluateDesign({ ...testShelter, name: "Anything at all" }),
  );
  const floating = structuredClone(testShelter);
  floating.components[1].z += 0.5;
  assert.equal(evaluateDesign(floating).stable, false);
  assert.equal(evaluateDesign(floating).capacity, 0);
  const weak = structuredClone(testShelter);
  weak.components[0].material = "biomass";
  assert.equal(evaluateDesign(weak).stable, false);
});
test("construction reserves matter; failed action batches make no change", () => {
  const world = createWorld(),
    civ = world.civilizations[0],
    other = world.civilizations[1];
  civ.stock.wood += other.stock.wood;
  other.stock.wood = 0;
  const before = ledger(world),
    wood = civ.stock.wood,
    cost = evaluateDesign(testShelter).cost.wood;
  requestAssembly(world, civ, testShelter);
  assert.ok(Math.abs(civ.stock.wood - (wood - cost)) < 1e-8);
  validateWorld(world);
  assert.ok(Math.abs(ledger(world).carbon - before.carbon) < 1e-6);
  const original = JSON.stringify(world);
  assert.throws(() =>
    applyAgentActions(
      world,
      civ.id,
      [
        { type: "focus", focus: "discover", reason: "Try a new approach." },
        {
          type: "assemble",
          design: testShelter,
          reason: "Not enough material.",
        },
      ],
      "Test agent",
    ),
  );
  assert.equal(JSON.stringify(world), original);
});
test("an offered exchange preserves matter without reserving foreign stock before consent", () => {
  const world = createWorld(),
    [from, to] = world.civilizations,
    before = ledger(world);
  encounter(world, from, to, true);
  dispatchTrade(
    world,
    from,
    to.id,
    { material: "wood", amount: 12 },
    { material: "stone", amount: 3 },
  );
  assert.equal(from.stock.wood, 24);
  assert.equal(to.stock.stone, 18);
  assert.equal(world.caravans.length, 1);
  assert.ok(Math.abs(ledger(world).carbon - before.carbon) < 1e-6);
  assert.ok(Math.abs(ledger(world).mineral - before.mineral) < 1e-6);
  for (let day = 0; day < 8 && !from.trades; day++) stepWorld(world, 96);
  validateWorld(world);
  assert.ok(from.trades > 0);
});
test("depleted nutrients reduce edible tissue estimates instead of luring workers forever", () => {
  const world = createWorld(),
    tile = world.tiles.find((t) => t.plant)!;
  tile.plant!.mineral = 0;
  if (tile.groundcover) tile.groundcover.mineral = 0;
  refreshTile(tile);
  assert.equal(tile.forage, 0);
});
test("invalid laws, non-finite needs, and invented matter cannot be loaded", () => {
  for (const corrupt of [
    (w: ReturnType<typeof createWorld>) => {
      w.lawsVersion = "other";
    },
    (w: ReturnType<typeof createWorld>) => {
      w.citizens[0].health = NaN;
    },
    (w: ReturnType<typeof createWorld>) => {
      w.civilizations[0].stock.wood += 5;
    },
  ]) {
    const world = createWorld();
    corrupt(world);
    assert.throws(() => validateWorld(world), /Invalid saved world/);
  }
});
