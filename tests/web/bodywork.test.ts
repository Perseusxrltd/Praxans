import test from "node:test";
import assert from "node:assert/strict";
import { smallWorld } from "./fixtures";
import {
  beginBodyWork,
  bodyWorkOpportunities,
  finishBodyWork,
  isBodyRepair,
  reconsiderBodyWork,
  workOnBody,
} from "../../src/simulation/bodywork";
import {
  bodyHeatBalance,
  PHYSIOLOGY,
  initialMetabolism,
  preferredWrapMass,
  regulateTemperature,
} from "../../src/simulation/physiology";
import {
  updateCitizen,
  updateCitizens,
  processDeaths,
} from "../../src/simulation/citizens";
import { beginExperience } from "../../src/simulation/cognition";
import { getTile, tileIndex } from "../../src/simulation/world";
import { elementLedger } from "../../src/simulation/chemistry";
import { ledger } from "../../src/simulation/laws";
import { validateWorld } from "../../src/simulation/engine";
import { astronomy } from "../../src/simulation/planet";
import { nearbyTiles } from "../../src/simulation/terrain";
import { Store, digest } from "../../src/server/store";
import { migrateWorld } from "../../src/server/migrations";
import {
  verifyWorldArchives,
  worldArchiveBytes,
} from "../../src/server/archives";
import type { Citizen, World } from "../../src/simulation/types";

function fixture() {
  const world = smallWorld(1847, 64, 64),
    civ = world.civilizations[0];
  const [actor, second, child] = world.citizens;
  for (const person of [actor, second, child]) {
    person.x = civ.x;
    person.y = civ.y;
    person.task = null;
    person.hunger = 95;
    person.energy = 95;
    person.health = 98;
    person.sick = 0;
    person.mind.sleepPressure = 0;
    person.mind.sleeping = false;
  }
  child.age = 0.22;
  child.parentIds = [];
  child.partnerId = null;
  civ.stock.fiber += child.wrapMass;
  child.wrapMass = 0;
  const tile = getTile(world, civ.x, civ.y)!;
  tile.temperature = 6.94;
  child.task = {
    kind: "rest",
    tile: tileIndex(world, child.x, child.y),
    path: [],
    progress: 0,
  };
  return { world, civ, actor, second, child, tile };
}

function wrap(world: World, person: Citizen, mass: number) {
  world.civilizations.find((c) => c.id === person.civId)!.stock.fiber +=
    person.wrapMass - mass;
  person.wrapMass = mass;
}

function stock(world: World, amount: number) {
  const [civ, reserve] = world.civilizations;
  reserve.stock.fiber += civ.stock.fiber - amount;
  civ.stock.fiber = amount;
}

function assign(world: World, actor: Citizen, recipient: Citizen, target = 2) {
  actor.task = {
    kind: "repair",
    material: "fiber",
    recipientId: recipient.id,
    targetWrapMass: target,
    tile: tileIndex(world, actor.x, actor.y),
    path: [],
    progress: 0,
  };
  beginExperience(actor, "repair", world.tick);
  return actor.task;
}

function close(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} differs from ${expected}`,
  );
}

function conserved(
  world: World,
  elements: Record<string, number>,
  chemical: number,
) {
  const after = elementLedger(world);
  for (const [element, amount] of Object.entries(elements))
    close(after[element], amount, 1e-5);
  close(
    ledger(world).chemical + world.energy.released - world.energy.captured,
    chemical,
    1e-5,
  );
}

test("physiology cannot turn nearby stock into free protection at any age", () => {
  for (const age of [0.22, 11, 12, 30]) {
    const { world, civ, child, tile } = fixture();
    child.age = age;
    const fiber = civ.stock.fiber;
    regulateTemperature(world, child, civ, tile, 0.25, false, 0);
    assert.equal(child.wrapMass, 0);
    assert.equal(civ.stock.fiber, fiber);
  }
});

test("elapsed time and productive work fund partial protection for kin, nonkin and foreign recipients", () => {
  for (const relationship of ["kin", "nonkin", "foreign"] as const) {
    const { world, civ, actor, child } = fixture();
    if (relationship === "kin") child.parentIds = [actor.id];
    if (relationship === "foreign") child.civId = world.civilizations[1].id;
    civ.stock.fiber -= 0.5;
    actor.cargo = { material: "fiber", amount: 0.5 };
    const elements = elementLedger(world),
      chemical =
        ledger(world).chemical + world.energy.released - world.energy.captured;
    const task = assign(world, actor, child);
    const work = beginBodyWork(world);
    workOnBody(world, actor, 0.25, 0.125, work);
    assert.equal(child.wrapMass, 0, "selection/intention transfers nothing");
    finishBodyWork(world, work);
    close(child.wrapMass, 0.05);
    close(actor.cargo!.amount, 0.45);
    close(task.progress, 0.05);
    assert.equal(
      actor.experience.repair ?? 0,
      0,
      "a partial task is not a completed episode",
    );
    conserved(world, elements, chemical);
    assert.throws(() => finishBodyWork(world, work), /once/);
  }
});

test("common fiber claims are independent of intent order and cannot recycle concurrent removals", () => {
  const results = [];
  for (const reversed of [false, true]) {
    const { world, civ, actor, second, child } = fixture();
    stock(world, 0.05);
    assign(world, actor, child);
    assign(world, second, child);
    const elements = elementLedger(world),
      chemical =
        ledger(world).chemical + world.energy.released - world.energy.captured;
    const work = beginBodyWork(world);
    for (const p of reversed ? [second, actor] : [actor, second])
      workOnBody(world, p, 0.25, 0.25, work);
    finishBodyWork(world, work);
    close(child.wrapMass, 0.05);
    close(actor.task!.progress, 0.025);
    close(second.task!.progress, 0.025);
    conserved(world, elements, chemical);
    results.push([
      child.wrapMass,
      civ.stock.fiber,
      actor.task!.progress,
      second.task!.progress,
    ]);
  }
  assert.deepEqual(results[0], results[1]);
  for (const reversed of [false, true]) {
    const { world, civ, actor, second, child } = fixture();
    wrap(world, child, 1);
    stock(world, 0);
    assign(world, actor, child, 0);
    assign(world, second, child, 2);
    const elements = elementLedger(world),
      chemical =
        ledger(world).chemical + world.energy.released - world.energy.captured;
    const work = beginBodyWork(world);
    for (const p of reversed ? [second, actor] : [actor, second])
      workOnBody(world, p, 0.25, 0.25, work);
    finishBodyWork(world, work);
    close(child.wrapMass, 0.9);
    close(civ.stock.fiber, 0.1);
    assert.equal(
      second.task,
      null,
      "unfunded work cannot bank transfer credit",
    );
    assert.ok(second.mind.reward <= 0);
    assert.equal(second.experience.repair ?? 0, 0);
    conserved(world, elements, chemical);
    world.tick++;
    assign(world, second, child, 2);
    const later = beginBodyWork(world);
    workOnBody(world, second, 0.25, 0.25, later);
    finishBodyWork(world, later);
    close(child.wrapMass, 1, 1e-8);
    close(civ.stock.fiber, 0);
  }
});

test("a planned opposing task is private; performed self-removal prompts reconsideration even when net mass hides it", () => {
  for (const performed of [false, true]) {
    const { world, actor, child } = fixture();
    wrap(world, child, 1);
    child.age = 20;
    const helperTask = assign(world, actor, child, 2);
    assign(world, child, child, 0);
    const work = beginBodyWork(world);
    workOnBody(world, actor, 0.25, 0.25, work);
    if (performed) workOnBody(world, child, 0.25, 0.25, work);
    finishBodyWork(world, work);
    close(child.wrapMass, performed ? 1 : 1.1);
    assert.equal(actor.task, performed ? null : helperTask);
    if (performed) {
      assert.ok(
        child.mind.reward < 0,
        "another actor's warming does not reward harmful removal",
      );
      assert.ok(
        actor.mind.reward > 0,
        "the helper's actual thermal contribution is evaluated separately",
      );
      world.tick++;
      assign(world, actor, child, 2);
      const next = beginBodyWork(world);
      workOnBody(world, actor, 0.25, 0.25, next);
      finishBodyWork(world, next);
      close(child.wrapMass, 1.1, 1e-8);
    }
  }
});

test("movement, death and journeys invalidate contact; an unknown response does not fabricate consent", () => {
  for (const condition of [
    "withdraw",
    "dead",
    "journey",
    "sleeping",
  ] as const) {
    const { world, civ, actor, child } = fixture();
    assign(world, actor, child);
    const work = beginBodyWork(world),
      fiber = civ.stock.fiber;
    workOnBody(world, actor, 0.25, 0.25, work);
    if (condition === "withdraw") child.x += 1;
    if (condition === "dead") child.health = 0;
    if (condition === "journey") child.journeyId = "departing";
    if (condition === "sleeping") child.mind.sleeping = true;
    finishBodyWork(world, work);
    close(child.wrapMass, condition === "sleeping" ? 0.1 : 0);
    close(civ.stock.fiber, fiber - (condition === "sleeping" ? 0.1 : 0));
    assert.equal("consent" in child, false);
  }
});

test("removed fiber stays usable and does not overwrite an unrelated carried load", () => {
  const { world, civ, actor, child } = fixture();
  wrap(world, child, 1);
  actor.x = child.x = civ.x + 12;
  actor.y = child.y = civ.y;
  getTile(world, actor.x, actor.y)!.terrain = "meadow";
  civ.stock.wood -= 1;
  actor.cargo = { material: "wood", amount: 1 };
  const elements = elementLedger(world),
    chemical =
      ledger(world).chemical + world.energy.released - world.energy.captured;
  assign(world, actor, child, 0);
  let work = beginBodyWork(world);
  workOnBody(world, actor, 0.25, 0.25, work);
  finishBodyWork(world, work);
  assert.equal(child.wrapMass, 1);
  assert.deepEqual(actor.cargo, { material: "wood", amount: 1 });
  civ.stock.wood += actor.cargo.amount;
  actor.cargo = null;
  assign(world, actor, child, 0);
  work = beginBodyWork(world);
  workOnBody(world, actor, 0.25, 0.25, work);
  finishBodyWork(world, work);
  close(child.wrapMass, 0.9);
  assert.deepEqual(actor.cargo, { material: "fiber", amount: 0.1 });
  conserved(world, elements, chemical);
});

test("thermal planning respects signed heat exchange including the skin-temperature boundary", () => {
  const { actor } = fixture();
  actor.wrapMass = 1;
  for (const temperature of [-10, 6.94, 20, 33, 40]) {
    const target = preferredWrapMass(actor, temperature, false, 0);
    const before = bodyHeatBalance(actor, temperature, false, 0);
    const after = bodyHeatBalance(actor, temperature, false, 0, target);
    assert.ok(
      Math.abs(after.lossW - after.metabolicDemandW) <=
        Math.abs(before.lossW - before.metabolicDemandW) + 1e-9,
    );
    if (temperature === 33) assert.equal(target, actor.wrapMass);
    if (temperature === 40) assert.ok(target > actor.wrapMass);
    if (temperature === 20) assert.ok(target < actor.wrapMass);
  }
  actor.wrapMass = 4;
  assert.ok(
    preferredWrapMass(actor, 40, false, 0) >= 4,
    "the planning reference is not a physical cap",
  );
});

test("ordinary activity and private targets do not reverse a local covering opportunity", () => {
  const { world, civ, actor, second, tile } = fixture();
  world.citizens = [actor, second];
  tile.temperature = 15;
  wrap(world, actor, 1.2);
  wrap(world, second, preferredWrapMass(second, 15, false, 0));
  for (const activity of [
    "idle",
    "rest",
    "gather",
    "self-add",
    "self-remove",
  ]) {
    actor.task = null;
    if (activity === "rest" || activity === "gather")
      actor.task = {
        kind: activity,
        tile: tileIndex(world, actor.x, actor.y),
        path: [],
        progress: 0,
      };
    if (activity.startsWith("self-"))
      assign(world, actor, actor, activity === "self-add" ? 2 : 0);
    const choices = bodyWorkOpportunities(
      world,
      second,
      civ,
      beginBodyWork(world),
    );
    assert.equal(choices.length, 0, activity);
  }
  wrap(world, actor, 0);
  const cold = bodyWorkOpportunities(world, second, civ, beginBodyWork(world));
  assert.ok(
    cold.some((choice) => choice.recipient === actor && choice.target > 0),
  );
  tile.temperature = 40;
  const hot = bodyWorkOpportunities(world, second, civ, beginBodyWork(world));
  assert.ok(
    hot.some((choice) => choice.recipient === actor && choice.target > 0),
  );
  tile.temperature = 33;
  assert.deepEqual(
    bodyWorkOpportunities(world, second, civ, beginBodyWork(world)),
    [],
  );
});

test("paid autonomous intervals reconsider inherited targets without opposing care or instant transfers", () => {
  for (const reversed of [false, true]) {
    const { world, civ, actor, second, tile } = fixture();
    for (const person of world.citizens)
      if (person !== actor && person !== second) person.health = 0;
    processDeaths(world); // A conservative two-person fixture before persistence.
    world.citizens = reversed ? [second, actor] : [actor, second];
    tile.temperature = 15;
    wrap(world, actor, 1.2);
    wrap(world, second, preferredWrapMass(second, 15, false, 0));
    assign(world, actor, actor, preferredWrapMass(actor, 15, false, 0));
    for (const p of [actor, second]) {
      civ.stock.biomass -= 0.9;
      p.metabolism.intake += 0.9;
      p.traits.sociability = 1;
      p.mind.synapses.repair = [4, 0, 0, 0, 0, 0, 0, 0];
    }
    world.tick = 1;
    while (
      world.tick % 4 !== 1 ||
      astronomy(world.tick, actor.x, actor.y).solarAltitude < 20
    )
      world.tick++;
    world.rng = 0;
    const store = new Store(":memory:");
    try {
      store.save(world);
      const restored = store.load(0, true);
      assert.deepEqual(
        restored,
        world,
        "loading never rewrites an inherited target",
      );
      const a = restored.citizens.find((p) => p.id === actor.id)!;
      const b = restored.citizens.find((p) => p.id === second.id)!;
      const inherited = a.task!;
      const elements = elementLedger(restored);
      const chemical =
        ledger(restored).chemical +
        restored.energy.released -
        restored.energy.captured;
      const fiber = restored.civilizations[0].stock.fiber;
      const energy = a.energy;
      updateCitizens(restored);
      assert.equal(a.task, null);
      assert.ok(!isBodyRepair(b.task));
      assert.equal(inherited.progress, 0);
      close(a.wrapMass, 1.2 * Math.exp(-0.25 * 0.000015));
      close(restored.civilizations[0].stock.fiber, fiber);
      assert.ok(a.energy < energy);
      assert.ok(a.metabolism.last!.foodOxidizedKg > 0);
      assert.equal(a.experience.repair ?? 0, 0);
      conserved(restored, elements, chemical);
    } finally {
      store.close();
    }
  }
});

test("planning tolerance still spends cold fuel at rest and cooling water during work", () => {
  for (const [active, hydration] of [
    [false, 8],
    [true, 8],
    [true, 2.8],
  ] as const) {
    const { world, civ, actor, tile } = fixture();
    tile.temperature = 15;
    wrap(world, actor, 1.2);
    actor.hydration = hydration;
    const water = actor.hydration;
    const food = civ.stock.biomass + actor.provisions;
    const elements = elementLedger(world);
    const chemical =
      ledger(world).chemical + world.energy.released - world.energy.captured;
    const flux = regulateTemperature(world, actor, civ, tile, 0.25, active, 0);
    assert.ok(flux.foodOxidizedKg > 0);
    assert.ok(civ.stock.biomass + actor.provisions < food);
    if (active && hydration === 8) {
      assert.ok(
        actor.hydration < water,
        "surplus heat consumes actual cooling water",
      );
      assert.equal(flux.activityFraction, 1);
    } else if (!active) {
      assert.ok(
        flux.releasedKJ > flux.maintenanceKJ,
        "extra resting heat consumes actual fuel",
      );
      assert.equal(flux.activityFraction, 0);
    } else {
      assert.equal(actor.hydration, hydration);
      assert.ok(
        flux.unremovedHeatKJ > 0 && flux.healthLoss > 0,
        "planning tolerance grants no immunity when cooling water is unavailable",
      );
    }
    conserved(world, elements, chemical);
  }
});

test("ongoing voluntary care follows local changes while physical opposing work stays possible", () => {
  const { world, actor, child, tile } = fixture();
  wrap(world, child, 0.2);
  const task = assign(world, actor, child, 2);
  const work = beginBodyWork(world);
  assert.equal(reconsiderBodyWork(world, actor, work), true);
  assert.ok(isBodyRepair(task));
  assert.ok(task.targetWrapMass > child.wrapMass);
  assert.equal(child.wrapMass, 0.2);
  tile.temperature = 32;
  assert.equal(reconsiderBodyWork(world, actor, work), false);
  assert.equal(
    actor.task,
    null,
    "a changed need permits a new choice next interval",
  );
  assert.equal(child.wrapMass, 0.2);
  assign(world, actor, child, 2);
  workOnBody(world, actor, 0.25, 0.25, work);
  finishBodyWork(world, work);
  close(child.wrapMass, 0.3, 1e-9);
  assert.ok(
    actor.mind.reward < 0,
    "a physical action can worsen thermal conditions",
  );
});

test("already awake people can choose care before cargo/reserve goals, while selection earns no free work", () => {
  const { world, civ, actor, child } = fixture();
  world.citizens = [actor, child];
  world.rng = 0;
  world.tick = 1;
  while (
    astronomy(world.tick, actor.x, actor.y).solarAltitude >= -6 ||
    world.tick % 4 === 0
  )
    world.tick++;
  actor.traits.sociability = 1;
  actor.mind.synapses.repair = [4, 0, 0, 0, 0, 0, 0, 0];
  civ.stock.fiber -= 0.5;
  actor.cargo = { material: "fiber", amount: 0.5 };
  actor.metabolism.intake = 0.9; // A real prior meal funds the helper's two intervals.
  civ.stock.biomass = 0; // Fixture scarcity: baseline comparisons below concern finite fiber.
  updateCitizens(world);
  assert.ok(isBodyRepair(actor.task));
  assert.equal(actor.task.recipientId, child.id);
  assert.equal(child.wrapMass, 0);
  assert.equal(actor.task.progress, 0);
  const energy = actor.energy;
  world.tick++;
  updateCitizens(world);
  assert.ok(
    child.wrapMass > 0 && child.wrapMass <= PHYSIOLOGY.wrappingKgPerHour * 0.25,
  );
  assert.ok(
    actor.energy < energy,
    "active work spends the ordinary fatigue budget",
  );
  assert.ok(actor.cargo!.amount < 0.5);
});

test("an unwilling helper retains a separate self-adjustment opportunity", () => {
  const { world, civ, actor, child } = fixture();
  wrap(world, actor, 0.3);
  actor.traits.sociability = 0;
  actor.mind.synapses.repair = [4, 0, 0, 0, 0, 0, 0, 0];
  world.rng = 0;
  world.tick = 1;
  const choices = bodyWorkOpportunities(
    world,
    actor,
    civ,
    beginBodyWork(world),
  );
  assert.ok(choices.some((choice) => choice.recipient === child));
  assert.ok(choices.some((choice) => choice.recipient === actor));
  updateCitizen(world, actor, civ, 8);
  assert.ok(isBodyRepair(actor.task));
  assert.equal(actor.task.recipientId, actor.id);
});

test("personal exhaustion, sleep pressure, thirst and hunger interrupt care without removing protection already made", () => {
  for (const need of ["energy", "sleep", "thirst", "hunger"] as const) {
    const { world, civ, actor, child } = fixture();
    wrap(world, child, 0.4);
    assign(world, actor, child);
    if (need === "energy") actor.energy = 10;
    else if (need === "sleep") actor.mind.sleepPressure = 0.9;
    else if (need === "thirst") {
      actor.hydration = 0.5;
      for (const tile of nearbyTiles(world, actor, 2)) {
        tile.water = 0;
        tile.ice = 0;
        tile.air.snow = 0;
      }
    } else {
      actor.hunger = 15;
      actor.provisions = 0;
      civ.stock.biomass = 0;
    }
    updateCitizen(world, actor, civ, 8);
    assert.ok(!isBodyRepair(actor.task));
    close(child.wrapMass, 0.4);
  }
});

test("post-physiology target capping completes work in either actor update order", () => {
  const results = [];
  for (const reversed of [false, true]) {
    const { world, civ, actor, child, tile } = fixture();
    tile.temperature = -10; // Both planning boundaries require the full reference wrap.
    wrap(world, child, 1.99);
    const task = assign(world, actor, child);
    world.tick = 1;
    world.citizens = reversed ? [child, actor] : [actor, child];
    updateCitizens(world);
    close(child.wrapMass, 2);
    assert.equal(actor.task, null);
    assert.ok(
      task.progress > 0.01,
      "the same paid interval covers the actual wear before transfer",
    );
    results.push([child.wrapMass, civ.stock.fiber, task.progress]);
  }
  assert.deepEqual(results[0], results[1]);
});

test("time-limited fiber placement reduces cold demand with the same material and no additional food", () => {
  const base = fixture();
  const unprotected = structuredClone(base.world),
    protectedWorld = structuredClone(base.world);
  const outcomes = [];
  for (const [world, help] of [
    [unprotected, false],
    [protectedWorld, true],
  ] as const) {
    const actor = world.citizens[0],
      child = world.citizens[2],
      civ = world.civilizations[0];
    const tile = getTile(world, child.x, child.y)!;
    civ.stock.biomass = 0;
    child.provisions = 0;
    child.cargo = null;
    if (help) assign(world, actor, child);
    const initialFiber = civ.stock.fiber + child.wrapMass;
    for (let i = 0; i < 20; i++) {
      world.tick++;
      regulateTemperature(world, child, civ, tile, 0.25, false, 0);
      if (help) {
        const work = beginBodyWork(world);
        workOnBody(world, actor, 0.25, 0.25, work);
        finishBodyWork(world, work);
      }
    }
    assert.ok(
      civ.stock.fiber + child.wrapMass <= initialFiber,
      "only ordinary wear leaves the usable fiber pools",
    );
    outcomes.push({
      health: child.health,
      wrapped: child.wrapMass,
      food: civ.stock.biomass + child.provisions,
    });
  }
  assert.ok(outcomes[1].wrapped > 1.9);
  assert.ok(outcomes[1].health > outcomes[0].health + 5);
  assert.equal(outcomes[0].food, 0);
  assert.equal(outcomes[1].food, 0);
});

test("partial body work survives persistence; stale and malformed targets are handled explicitly", () => {
  const { world, actor, child } = fixture(),
    store = new Store(":memory:");
  try {
    assign(world, actor, child);
    const work = beginBodyWork(world);
    workOnBody(world, actor, 0.25, 0.25, work);
    finishBodyWork(world, work);
    store.save(world);
    const restored = store.load(0, true);
    assert.deepEqual(restored, world);
    restored.citizens[0].task!.recipientId = "historical-person-no-longer-here";
    validateWorld(restored);
    const later = beginBodyWork(restored);
    workOnBody(restored, restored.citizens[0], 0.25, 0.25, later);
    finishBodyWork(restored, later);
    assert.equal(restored.citizens[0].task, null);
    const invalid = structuredClone(world);
    invalid.citizens[0].task!.targetWrapMass = -1;
    assert.throws(() => validateWorld(invalid), /body maintenance/);
  } finally {
    store.close();
  }
});

test("finishing a self-adjustment cannot change another helper's thermal reward frame", () => {
  const rewards = [];
  for (const reverseIds of [false, true]) {
    const { world, actor, second } = fixture();
    if (reverseIds) [actor.id, second.id] = [second.id, actor.id];
    wrap(world, actor, 0);
    assign(world, actor, actor, 0.1);
    assign(world, second, actor, 2);
    const work = beginBodyWork(world);
    workOnBody(world, actor, 0.25, 0.25, work);
    workOnBody(world, second, 0.25, 0.25, work);
    finishBodyWork(world, work);
    close(actor.wrapMass, 0.2);
    assert.equal(actor.task, null);
    assert.ok(second.mind.reward > 0);
    rewards.push(second.mind.reward);
  }
  assert.equal(rewards[0], rewards[1]);
});

test("format nine migration retains people, minds, tasks, inventories and empty histories exactly", () => {
  for (const empty of [false, true]) {
    const { world, actor } = fixture(),
      store = new Store(":memory:");
    try {
      actor.task = {
        kind: "gather",
        material: "biomass",
        tile: tileIndex(world, actor.x, actor.y),
        path: [],
        progress: 1.2,
      };
      if (empty) {
        for (const person of world.citizens) person.health = 0;
        processDeaths(world);
      }
      store.save(world);
      const old = structuredClone(world);
      old.version = 9;
      old.lawsVersion = "biosphere-1.3";
      for (const person of old.citizens)
        delete (person as Partial<Citizen>).metabolism;
      const { tiles: _tiles, ...metadata } = old;
      const json = JSON.stringify(metadata);
      store.db
        .prepare("UPDATE world SET json=?,checksum=?")
        .run(json, digest(json));
      const original = JSON.stringify(old);
      const migrated = migrateWorld(old);
      assert.equal(JSON.stringify(old), original);
      assert.deepEqual(migrated.world, {
        ...old,
        version: 16,
        lawsVersion: "biosphere-1.10",
        citizens: old.citizens.map((person) => ({
          ...person,
          metabolism: initialMetabolism(person.body),
        })),
      });
      assert.deepEqual(
        migrated.interventions.map((i) => i.id),
        [
          "010-performed-body-maintenance",
          "011-consumption-before-ration-pickup",
          "012-funded-human-metabolism",
          "013-local-inventory-exposure-and-access",
          "014-performed-local-food-handoff",
          "015-age-bounded-structural-growth",
          "016-performed-resource-harvesting",
        ],
      );
      const loaded = store.load(0, true);
      assert.deepEqual(loaded, migrated.world);
      assert.equal(loaded.citizens.length, empty ? 0 : old.citizens.length);
      const archives = verifyWorldArchives(store.db);
      assert.equal(archives.length, 1);
      const archived = Buffer.concat([
        ...worldArchiveBytes(store.db, archives[0].id),
      ]).toString();
      // Store reconstructs chunked terrain after metadata; preserve that original
      // load order as well as all values, not the in-memory fixture's key order.
      assert.equal(
        digest(archived),
        digest(JSON.stringify({ ...metadata, tiles: _tiles })),
      );
      assert.deepEqual(JSON.parse(archived), old);
      assert.deepEqual(store.load(0, true), loaded);
      assert.equal(store.interventions().length, 7);
    } finally {
      store.close();
    }
  }
});
