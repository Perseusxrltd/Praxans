import test from "node:test";
import assert from "node:assert/strict";
import { smallWorld, box, built, shelter } from "./fixtures";
import { runExperiment } from "../../src/simulation/economy";
import { updateCitizen } from "../../src/simulation/citizens";
import { evaluateDesign, ledger } from "../../src/simulation/laws";
import { knows } from "../../src/simulation/cognition";
import { tileIndex } from "../../src/simulation/world";

test("a contradictory retest records the new result without strengthening the historical estimate", () => {
  const world = smallWorld(1847, 64, 64),
    civ = world.civilizations[0],
    actor = world.citizens[0],
    detached = structuredClone(box);
  detached.components[1].x = -2;
  detached.components[2].x = 2;
  detached.components[3].y = -2;
  detached.components[4].y = 2;
  for (const part of detached.components) part.z = 0;
  assert.equal(runExperiment(world, civ, detached, actor), true);
  const historical = civ.observations[0];
  historical.properties.storageVolume = 0.95;
  historical.statement = "The earlier calculation predicted 0.95 m³ of storage";
  historical.research.confidence = 0.5;
  const before = structuredClone(historical),
    stocks = civ.stock.wood,
    matter = ledger(world);
  world.tick = 1;
  assert.equal(runExperiment(world, civ, detached, actor), true);
  const current = civ.observations.at(-1)!;
  assert.notEqual(current.id, historical.id);
  assert.deepEqual(historical, before);
  assert.deepEqual(current.properties, evaluateDesign(detached));
  assert.equal(current.properties.storageVolume, 0);
  assert.equal(current.tick, 1);
  assert.ok(current.statement.includes("0.00 m³"));
  assert.ok(knows(actor, current.id));
  assert.ok(
    civ.stock.wood < stocks,
    "the new trial still consumes an actual sample",
  );
  assert.ok(Math.abs(ledger(world).carbon - matter.carbon) < 1e-6);
  assert.equal(runExperiment(world, civ, detached, actor), true);
  assert.equal(
    civ.observations.length,
    2,
    "matching repeated evidence can reinforce its own note",
  );
  assert.equal(current.trials, 2);
  assert.deepEqual(historical, before);
});

test("completing an assembly adds construction evidence without rewriting the earlier sample", () => {
  const world = smallWorld(1847, 64, 64),
    civ = world.civilizations[0],
    actor = world.citizens[0];
  assert.equal(runExperiment(world, civ, shelter, actor), true);
  const sample = civ.observations[0],
    original = structuredClone(sample),
    structure = built(world);
  structure.progress = 1 - 1e-9;
  world.tick = 48;
  actor.x = structure.x;
  actor.y = structure.y;
  actor.energy = 100;
  actor.hunger = 100;
  // The worker is outside stock reach; a high score alone cannot fund a meal.
  actor.metabolism.intake = 0.9;
  civ.stock.biomass -= 0.9;
  actor.mind.sleepPressure = 0;
  actor.task = {
    kind: "assemble",
    tile: tileIndex(world, actor.x, actor.y),
    path: [],
    progress: 0,
    structureId: structure.id,
  };
  updateCitizen(world, actor, civ, 8);
  assert.equal(structure.progress, 1);
  assert.deepEqual(sample, original);
  const completed = civ.observations.find(
    (o) => o.research.method === "construction",
  )!;
  assert.ok(completed);
  assert.notEqual(completed.id, sample.id);
  assert.equal(completed.tick, 48);
  assert.deepEqual(completed.properties, structure.properties);
  assert.ok(knows(actor, completed.id));
});
