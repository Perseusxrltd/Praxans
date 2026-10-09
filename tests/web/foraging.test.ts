import test from "node:test";
import assert from "node:assert/strict";
import { smallWorld } from "./fixtures";
import { beginExperience, perceive } from "../../src/simulation/cognition";
import { updateCitizen } from "../../src/simulation/citizens";
import { validateWorld } from "../../src/simulation/engine";
import { ledger, refreshTile } from "../../src/simulation/laws";
import { findPath, tileIndex } from "../../src/simulation/world";
import { Store } from "../../src/server/store";
import type { Citizen, Tile, World } from "../../src/simulation/types";

function fixture() {
  const world = smallWorld(1847, 64, 64),
    civ = world.civilizations[0],
    person = world.citizens[0];
  const tile = world.tiles.find(
    (t) =>
      t.terrain !== "water" &&
      t.forage > 5 &&
      t.water > 8 &&
      Math.hypot(t.x - civ.x, t.y - civ.y) > 3 &&
      Math.hypot(t.x - civ.x, t.y - civ.y) < 8 &&
      findPath(world, person, t, 1100),
  );
  assert.ok(tile);
  world.tick = 49; // Daylight between ordinary hourly observations.
  person.x = tile.x;
  person.y = tile.y;
  person.hunger = 85;
  person.energy = 95;
  person.health = 98;
  person.sick = 0;
  person.mind.sleepPressure = 0;
  person.mind.sleeping = false;
  tile.temperature = 15;
  tile.water -= 8 - person.hydration;
  person.hydration = 8;
  civ.stock.biomass -= 3 - person.provisions;
  person.provisions = 3;
  person.cargo = null;
  person.task = {
    kind: "gather",
    material: "biomass",
    tile: tileIndex(world, tile.x, tile.y),
    path: [],
    progress: 1.2,
  };
  beginExperience(person, "gather", 44);
  perceive(world, person, 0);
  person.mind.places[0].tick = 44;
  validateWorld(world);
  return { world, civ, person, tile };
}

function leaveFood(tile: Tile, kilograms: number) {
  assert.ok(kilograms >= 0 && kilograms <= tile.forage);
  const fraction = kilograms / tile.forage;
  for (const plant of [tile.plant, tile.groundcover]) {
    if (!plant) continue;
    tile.detritus.carbon += plant.carbon * (1 - fraction);
    tile.detritus.mineral += plant.mineral * (1 - fraction);
    plant.carbon *= fraction;
    plant.mineral *= fraction;
  }
  refreshTile(tile);
  assert.ok(Math.abs(tile.forage - kilograms) < 1e-9);
}

function act(world: World, person: Citizen) {
  const before = ledger(world),
    civ = world.civilizations.find((c) => c.id === person.civId)!;
  updateCitizen(
    world,
    person,
    civ,
    world.citizens.filter((p) => p.civId === civ.id).length,
  );
  const after = ledger(world);
  for (const element of ["carbon", "water", "mineral"] as const)
    assert.ok(Math.abs(after[element] - before[element]) < 1e-6, element);
  validateWorld(world);
}

test("a new local observation of depletion stops funded work without food or a time refund", () => {
  const { world, person, tile } = fixture();
  leaveFood(tile, 0);
  const stale = structuredClone(world),
    stalePerson = stale.citizens.find((p) => p.id === person.id)!,
    staleTask = stalePerson.task!,
    observedTask = person.task!;
  perceive(world, person, 0);
  assert.equal(person.mind.places[0].food, 0);
  assert.ok(stalePerson.mind.places[0].food > 5);

  act(stale, stalePerson);
  assert.equal(stalePerson.task, staleTask);
  assert.ok(staleTask.progress > 1.2, "unobserved depletion is not known");

  act(world, person);
  assert.notEqual(person.task, observedTask);
  assert.equal(
    observedTask.progress,
    1.2,
    "already-spent work is not refunded",
  );
  assert.equal(person.cargo, null, "cancelling does not manufacture a harvest");
  assert.ok(person.metabolism.last!.activityFraction > 0);
  assert.ok(person.metabolism.last!.releasedKJ > 0);
  assert.ok(person.task);
  assert.equal(person.task.progress, 0, "the replacement starts next interval");
});

test("an observed small positive food patch can still be harvested", () => {
  const { world, person, tile } = fixture();
  leaveFood(tile, 0.5);
  perceive(world, person, 0);
  const task = person.task!;
  task.progress = 2.39;
  act(world, person);
  assert.equal(person.task, null);
  assert.equal(person.cargo?.material, "biomass");
  assert.ok(person.cargo!.amount > 0 && person.cargo!.amount <= 0.5);
});

test("dated observations also end extraction from an exhausted stone source", () => {
  const { world, civ, person, tile } = fixture();
  person.task!.kind = "extract";
  person.task!.material = "stone";
  beginExperience(person, "extract", 44);
  civ.stock.stone += tile.rock;
  tile.rock = 0;
  perceive(world, person, 0);
  const task = person.task!;
  act(world, person);
  assert.notEqual(person.task, task);
  assert.equal(task.progress, 1.2);
  assert.equal(person.cargo, null);
});

test("an older or same-interval empty memory permits a deliberate new gathering attempt", () => {
  for (const startedTick of [49, 50]) {
    const { world, person, tile } = fixture();
    leaveFood(tile, 0);
    perceive(world, person, 0);
    beginExperience(person, "gather", startedTick);
    world.tick = 51;
    const task = person.task!;
    act(world, person);
    assert.equal(person.task, task);
    assert.ok(task.progress > 1.2);
  }
});

test("unseen changes at a remembered destination do not change an ongoing journey", () => {
  const { world, civ, person, tile } = fixture();
  person.x = civ.x;
  person.y = civ.y;
  person.task!.path = findPath(world, person, tile, 1100)!;
  assert.ok(person.task!.path.length);
  const depleted = structuredClone(world),
    other = depleted.citizens.find((p) => p.id === person.id)!;
  leaveFood(depleted.tiles[person.task!.tile], 0);
  act(world, person);
  act(depleted, other);
  assert.deepEqual(person.task, other.task);
  assert.equal(person.x, other.x);
  assert.equal(person.y, other.y);
  assert.equal(world.rng, depleted.rng);
});

test("saved task and dated observation survive loading before ordinary reconsideration", () => {
  const { world, person, tile } = fixture();
  leaveFood(tile, 0);
  perceive(world, person, 0);
  const store = new Store(":memory:");
  try {
    store.acquireLease();
    store.save(world);
    const loaded = store.load(world.seed, true),
      restored = loaded.citizens.find((p) => p.id === person.id)!;
    assert.deepEqual(restored.task, person.task);
    assert.deepEqual(restored.mind.places, person.mind.places);
    assert.deepEqual(restored.mind.pending, person.mind.pending);
    const original = restored.task!;
    act(loaded, restored);
    assert.notEqual(restored.task, original);
    assert.equal(original.progress, 1.2);
    assert.equal(restored.cargo, null);
  } finally {
    store.close();
  }
});
