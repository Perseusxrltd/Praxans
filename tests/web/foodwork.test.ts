import test from "node:test";
import assert from "node:assert/strict";
import { smallWorld } from "./fixtures";
import { beginBodyWork } from "../../src/simulation/bodywork";
import {
  beginFoodWork,
  finishFoodWork,
  foodWorkOpportunity,
  isFoodHandoff,
  workOnFood,
  FOOD_HANDOFF,
} from "../../src/simulation/foodwork";
import { updateCitizens, processDeaths } from "../../src/simulation/citizens";
import {
  initialMetabolism,
  hydrationTarget,
} from "../../src/simulation/physiology";
import { beginExperience } from "../../src/simulation/cognition";
import { elementLedger } from "../../src/simulation/chemistry";
import { ledger } from "../../src/simulation/laws";
import { getTile, tileIndex } from "../../src/simulation/world";
import { nearbyTiles } from "../../src/simulation/terrain";
import { canReachCampStocks } from "../../src/simulation/settlement";
import { astronomy } from "../../src/simulation/planet";
import { validateWorld, stepWorld } from "../../src/simulation/engine";
import { migrateWorld } from "../../src/server/migrations";
import { Store, digest } from "../../src/server/store";
import {
  verifyWorldArchives,
  worldArchiveBytes,
} from "../../src/server/archives";
import type { Citizen, Task, World } from "../../src/simulation/types";

function fixture(includeSecond = false) {
  const world = smallWorld(1847, 64, 64),
    civ = world.civilizations[0];
  const [actor, second, child] = world.citizens;
  world.citizens = includeSecond ? [actor, second, child] : [actor, child];
  const tile = nearbyTiles(world, civ, 30).find(
    (t) => t.terrain !== "water" && Math.hypot(t.x - civ.x, t.y - civ.y) > 20,
  )!;
  assert.ok(tile);
  tile.temperature = 33;
  for (const person of [actor, second, child]) {
    person.x = tile.x;
    person.y = tile.y;
    person.age = 30;
    person.body = 18;
    person.metabolism = initialMetabolism(person.body);
    person.provisions = 0;
    person.cargo = null;
    person.wrapMass = 0;
    person.hydration = 8;
    person.hunger = 95;
    person.energy = 80;
    person.health = 98;
    person.sick = 0;
    person.journeyId = null;
    person.parentIds = [];
    person.partnerId = null;
    person.traits.sociability = 0;
    person.mind.sleepPressure = 0;
    person.mind.sleeping = false;
    person.task = null;
  }
  child.age = 0;
  child.body = 2;
  child.metabolism = initialMetabolism(child.body);
  child.hydration = hydrationTarget(child);
  child.hunger = 0;
  child.task = {
    kind: "rest",
    tile: tileIndex(world, tile.x, tile.y),
    path: [],
    progress: 0,
  };
  world.civilizations[1].stock.biomass += civ.stock.biomass - 3.9;
  civ.stock.biomass = 0;
  actor.provisions = 3;
  actor.metabolism.intake = 0.9;
  world.tick = 1;
  while (
    astronomy(world.tick, actor.x, actor.y).solarAltitude > -30 ||
    world.tick % 4 === 0
  )
    world.tick++;
  world.rng = 0;
  assert.equal(canReachCampStocks(world, civ, actor), false);
  return { world, civ, actor, second, child, tile };
}

function assign(
  world: World,
  actor: Citizen,
  recipient: Citizen,
  target = 0.1,
) {
  actor.task = {
    kind: "deliver",
    material: "biomass",
    recipientId: recipient.id,
    targetProvisionMass: target,
    tile: tileIndex(world, actor.x, actor.y),
    path: [],
    progress: 0,
  };
  beginExperience(actor, "deliver", world.tick);
  return actor.task;
}
const begin = (world: World) => beginFoodWork(world, beginBodyWork(world));
function close(actual: number, expected: number, tolerance = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} differs from ${expected}`,
  );
}
function balance(world: World) {
  return {
    elements: elementLedger(world),
    energy:
      ledger(world).chemical + world.energy.released - world.energy.captured,
  };
}
function conserved(world: World, before: ReturnType<typeof balance>) {
  const after = balance(world);
  for (const [element, amount] of Object.entries(before.elements))
    close(after.elements[element], amount, 5e-6);
  close(after.energy, before.energy, 1e-3);
}

test("paid local food changes custody only, for kin, nonkin and foreign recipients at any age", () => {
  for (const age of [0, 30])
    for (const relationship of ["kin", "nonkin", "foreign"]) {
      const { world, civ, actor, child } = fixture();
      child.age = age;
      if (relationship === "kin") child.parentIds = [actor.id];
      if (relationship === "foreign") child.civId = world.civilizations[1].id;
      actor.provisions -= 0.1;
      actor.cargo = { material: "biomass", amount: 0.1 };
      const task = assign(world, actor, child, 1),
        before = balance(world),
        physiology = structuredClone([actor.metabolism, child.metabolism]),
        stocks = structuredClone(world.civilizations.map((c) => c.stock));
      const work = begin(world);
      workOnFood(world, actor, 0.25, 0.1, work);
      assert.equal(child.provisions, 0);
      assert.equal(task.progress, 0);
      finishFoodWork(world, work);
      close(child.provisions, 0.2);
      close(actor.provisions, 2.8);
      assert.equal(actor.cargo, null);
      close(task.progress, 0.2);
      assert.equal(child.hunger, 0);
      assert.equal(child.health, 98);
      assert.deepEqual([actor.metabolism, child.metabolism], physiology);
      assert.deepEqual(
        world.civilizations.map((c) => c.stock),
        stocks,
      );
      assert.equal(civ.stock.biomass, 0);
      conserved(world, before);
      assert.throws(() => finishFoodWork(world, work), /once/);
    }
});

test("zero work and broken contact cannot deliver or advance progress", () => {
  for (const failure of [
    "zero",
    "unproductive",
    "distant",
    "actor-moves",
    "child-moves",
    "journey",
    "dead",
    "removed",
    "replaced",
  ] as const) {
    const { world, actor, child } = fixture(),
      task = assign(world, actor, child);
    const work = begin(world);
    workOnFood(
      world,
      actor,
      failure === "zero" ? 0 : 0.25,
      failure === "unproductive" ? 0 : 0.25,
      work,
    );
    if (failure === "distant" || failure === "child-moves")
      child.x += failure === "distant" ? 20 : 0.1;
    if (failure === "actor-moves") actor.x += 0.1;
    if (failure === "journey") child.journeyId = "departed";
    if (failure === "dead") child.health = 0;
    if (failure === "removed") world.citizens = [actor];
    if (failure === "replaced") actor.task = { ...task };
    finishFoodWork(world, work);
    assert.equal(child.provisions, 0, failure);
    assert.equal(actor.provisions, 3, failure);
    assert.equal(task.progress, 0, failure);
  }
  const { world, actor, child } = fixture(),
    task = assign(world, actor, child),
    work = begin(world);
  workOnFood(world, actor, 0.25, 0.25, work);
  assert.throws(
    () => finishFoodWork(structuredClone(world), work),
    /own world tick/,
  );
  world.tick++;
  assert.throws(() => finishFoodWork(world, work), /own world tick/);
  assert.equal(task.progress, 0);
});

test("competing and repeated claims share one recipient gap independently of enumeration", () => {
  const results = [];
  for (const reverse of [false, true]) {
    const { world, actor, second, child } = fixture(true);
    actor.provisions = second.provisions = 0.5;
    const tasks = [
        assign(world, actor, child, 0.1),
        assign(world, second, child, 0.1),
      ],
      before = balance(world),
      work = begin(world);
    for (const p of reverse ? [second, actor] : [actor, second]) {
      workOnFood(world, p, 0.25, 0.25, work);
      workOnFood(world, p, 0.25, 0.25, work);
    }
    finishFoodWork(world, work);
    close(child.provisions, 0.1);
    for (const task of tasks) close(task.progress, 0.05);
    close(actor.provisions, 0.45);
    close(second.provisions, 0.45);
    conserved(world, before);
    results.push([
      actor.provisions,
      second.provisions,
      child.provisions,
      tasks.map((t) => t.progress),
    ]);
  }
  assert.deepEqual(results[0], results[1]);
  const { world, actor, child } = fixture();
  actor.provisions = 0.2;
  actor.cargo = { material: "biomass", amount: 0.1 };
  assign(world, actor, child, 1);
  const work = begin(world),
    before = balance(world);
  workOnFood(world, actor, 0.25, 0.25, work);
  finishFoodWork(world, work);
  assert.equal(
    actor.provisions,
    0,
    "finite subtraction cannot leave a negative fraction of a ration",
  );
  assert.equal(actor.cargo, null);
  close(child.provisions, 0.3);
  conserved(world, before);
});

test("food cannot be forwarded in the same interval, even through a funded intermediate holder", () => {
  for (const initial of [0, 0.07])
    for (const reverse of [false, true]) {
      const { world, actor, second, child } = fixture(true);
      second.provisions = initial;
      assign(world, actor, second, 0.5);
      const onward = assign(world, second, child, 0.5),
        before = balance(world),
        work = begin(world);
      for (const p of reverse ? [second, actor] : [actor, second])
        workOnFood(world, p, 0.25, 0.25, work);
      finishFoodWork(world, work);
      close(child.provisions, initial);
      close(second.provisions, 0.5 - initial);
      close(onward.progress, initial);
      conserved(world, before);
    }
});

test("new or already consumed holdings cannot finance a captured handoff", () => {
  for (const source of ["consumed", "new-provisions", "new-cargo"] as const) {
    const { world, actor, child } = fixture();
    actor.provisions = 0.2;
    const task = assign(world, actor, child, 1),
      work = begin(world);
    workOnFood(world, actor, 0.25, 0.25, work);
    if (source === "consumed") {
      actor.provisions = 0.03;
      actor.metabolism.intake += 0.17;
    }
    if (source === "new-provisions") actor.provisions += 1;
    if (source === "new-cargo")
      actor.cargo = { material: "biomass", amount: 1 };
    const before = balance(world);
    finishFoodWork(world, work);
    close(task.progress, source === "consumed" ? 0.03 : 0.2);
    if (source === "new-cargo") assert.equal(actor.cargo!.amount, 1);
    conserved(world, before);
  }
});

test("autonomous willingness selects future paid delivery; declining keeps private food", () => {
  for (const willing of [false, true]) {
    const { world, actor, child } = fixture();
    actor.traits.sociability = willing ? 1 : 0;
    actor.mind.synapses.deliver = [4, 0, 0, 0, 0, 0, 0, 0];
    assert.ok(foodWorkOpportunity(world, actor, begin(world)));
    updateCitizens(world);
    assert.equal(isFoodHandoff(actor.task), willing);
    assert.equal(child.provisions, 0, "assignment earns no free interval");
    assert.equal(actor.provisions, 3);
    const energy = actor.energy;
    world.tick++;
    updateCitizens(world);
    if (willing) {
      assert.ok(
        child.provisions > 0 &&
          child.provisions <= FOOD_HANDOFF.kgPerWorkHour * 0.25,
      );
      assert.ok(actor.energy < energy);
      assert.ok(actor.provisions < 3);
      assert.equal(child.metabolism.last!.ingestedKg, 0);
    } else assert.equal(child.provisions, 0);
  }
});

test("all current meals precede both donor budgets and recipient bundle gaps", () => {
  for (const reverse of [false, true]) {
    const { world, actor, child } = fixture();
    actor.provisions = 1.02;
    actor.metabolism.intake = 0;
    child.provisions = 0.08;
    const task = assign(world, actor, child),
      before = balance(world);
    if (reverse) world.citizens.reverse();
    updateCitizens(world);
    close(child.metabolism.last!.ingestedKg, 0.08);
    close(child.provisions, 0.1, 1e-9);
    close(task.progress, 0.1, 1e-9);
    close(
      actor.provisions + actor.metabolism.last!.ingestedKg + task.progress,
      1.02,
    );
    assert.ok(actor.provisions >= 0);
    conserved(world, before);
  }
});

test("local opportunity reads the coarse signal, not another person's private internal fuel", () => {
  const { world, actor, child } = fixture();
  const first = foodWorkOpportunity(world, actor, begin(world));
  child.metabolism.intake = 0.1;
  child.metabolism.reserves = 0;
  const changedPrivateFuel = foodWorkOpportunity(world, actor, begin(world));
  assert.equal(first?.recipient, child);
  assert.equal(changedPrivateFuel?.recipient, child);
  assert.equal(changedPrivateFuel?.target, first?.target);
  child.hunger = 90;
  assert.equal(foodWorkOpportunity(world, actor, begin(world)), undefined);
});

test("an unfunded large target cannot expand other helpers' shared destination budget", () => {
  const { world, actor, second, child } = fixture(true);
  const unfunded = structuredClone(second);
  unfunded.id = "unfunded-helper";
  unfunded.provisions = 0;
  world.citizens.push(unfunded);
  second.provisions = 1;
  assign(world, actor, child, 0.1);
  assign(world, second, child, 0.1);
  assign(world, unfunded, child, 10);
  const before = balance(world),
    work = begin(world);
  for (const p of [actor, second, unfunded])
    workOnFood(world, p, 0.25, 0.25, work);
  finishFoodWork(world, work);
  close(child.provisions, 0.1);
  assert.equal(unfunded.provisions, 0);
  conserved(world, before);
});

test("personal exhaustion, sleep, thirst, hunger and unfunded activity stop a handoff", () => {
  for (const need of [
    "energy",
    "sleep",
    "thirst",
    "hunger",
    "oxygen",
  ] as const) {
    const { world, actor, child } = fixture(),
      task = assign(world, actor, child);
    if (need === "energy") actor.energy = 10;
    if (need === "sleep") actor.mind.sleepPressure = 0.9;
    if (need === "thirst") {
      actor.hydration = 0.2;
      for (const tile of nearbyTiles(world, actor, 2)) {
        tile.water = 0;
        tile.ice = 0;
        tile.air.snow = 0;
      }
    }
    if (need === "hunger") {
      actor.metabolism.intake = 0;
      actor.provisions = 0.001;
    }
    if (need === "oxygen") world.atmosphere.oxygen = 0;
    updateCitizens(world);
    assert.equal(child.provisions, 0, need);
    assert.equal(task.progress, 0, need);
    if (need === "oxygen")
      assert.equal(actor.metabolism.last!.activityFraction, 0);
    else assert.ok(!isFoodHandoff(actor.task), need);
  }
});

test("a paid local handoff funds subsequent infant ingestion, while distant and no-choice controls do not", () => {
  const results = [];
  for (const access of ["local", "distant", "unchosen"] as const)
    for (const reverse of [false, true]) {
      const { world, actor, child } = fixture();
      if (access === "distant") actor.x += 20;
      if (access !== "unchosen") assign(world, actor, child);
      if (reverse) world.citizens.reverse();
      const before = balance(world);
      updateCitizens(world);
      assert.equal(child.metabolism.last!.ingestedKg, 0);
      const delivered = child.provisions;
      world.tick++;
      updateCitizens(world);
      if (access === "local") {
        close(delivered, 0.1);
        assert.ok(child.metabolism.last!.ingestedKg > 0);
        assert.ok(child.metabolism.last!.foodOxidizedKg > 0);
        assert.equal(child.metabolism.last!.reserveOxidizedKg, 0);
      } else {
        assert.equal(delivered, 0);
        assert.equal(child.metabolism.last!.ingestedKg, 0);
        assert.ok(child.metabolism.last!.reserveOxidizedKg > 0);
      }
      conserved(world, before);
      results.push({
        access,
        delivered,
        metabolism: child.metabolism,
        provisions: child.provisions,
        health: child.health,
      });
    }
  for (let i = 0; i < results.length; i += 2)
    assert.deepEqual(results[i], results[i + 1]);
});

test("food task validation distinguishes holders, targets and stale recipients", () => {
  const world = smallWorld(1847, 64, 64),
    [actor, recipient] = world.citizens;
  const task = assign(world, actor, recipient);
  validateWorld(world);
  for (const change of [
    { material: "fiber" },
    { targetWrapMass: 1 },
    { structureId: "house" },
    { targetProvisionMass: NaN },
    { targetProvisionMass: -1 },
    { recipientId: actor.id },
    { recipientId: undefined },
    { kind: "repair" },
  ] as Partial<Task>[]) {
    actor.task = { ...task, ...change };
    assert.throws(() => validateWorld(world), /food handoff/);
  }
  actor.task = { ...task, recipientId: "retained-dead-person" };
  validateWorld(world);
  const work = begin(world);
  workOnFood(world, actor, 0.25, 0.25, work);
  assert.equal(actor.task, null);
});

test("a stranded adult receives paid local food despite an unfinished route, then funds later movement", () => {
  const deliveries: number[] = [];
  for (const route of ["stopped", "pending"] as const)
    for (const reverse of [false, true]) {
      const { world, actor, child: recipient, tile } = fixture();
      recipient.age = 30;
      recipient.body = 16.2;
      recipient.metabolism = {
        ...initialMetabolism(recipient.body),
        reserves: 0,
      };
      recipient.energy = 0;
      recipient.hydration = hydrationTarget(recipient);
      const destination = tileIndex(world, tile.x + 1, tile.y);
      world.tiles[destination].terrain = "meadow";
      recipient.task = {
        kind: "rest",
        tile: destination,
        path: route === "pending" ? [destination] : [],
        progress: 0,
      };
      assign(world, actor, recipient, 0.5);
      const before = balance(world),
        start = { x: recipient.x, y: recipient.y };
      if (reverse) world.citizens.reverse();
      updateCitizens(world);
      assert.equal(recipient.metabolism.last!.ingestedKg, 0);
      assert.equal(recipient.metabolism.last!.releasedKJ, 0);
      assert.equal(recipient.metabolism.last!.activityFraction, 0);
      assert.deepEqual({ x: recipient.x, y: recipient.y }, start);
      assert.ok(
        recipient.provisions > 0 && recipient.provisions <= 0.5,
        `${route}: actual stationary contact must allow the funded handoff`,
      );
      deliveries.push(recipient.provisions);
      assert.ok(actor.metabolism.last!.releasedKJ > 0);
      assert.ok(actor.provisions < 3);
      world.tick++;
      updateCitizens(world);
      assert.ok(recipient.metabolism.last!.ingestedKg > 0);
      assert.ok(recipient.metabolism.last!.foodOxidizedKg > 0);
      if (route === "pending") {
        assert.ok(recipient.metabolism.last!.activityFraction > 0);
        assert.notDeepEqual({ x: recipient.x, y: recipient.y }, start);
      }
      conserved(world, before);
    }
  for (const amount of deliveries) close(amount, deliveries[0]);
});

test("actual travel invalidates a handoff even after returning, while blocked travel permits contact", () => {
  for (const motion of ["away", "return", "blocked", "zero-length"] as const)
    for (const reverse of [false, true]) {
      const { world, actor, child, tile } = fixture();
      const start = { x: child.x, y: child.y },
        origin = tileIndex(world, tile.x, tile.y),
        next = tileIndex(world, tile.x + 1, tile.y);
      world.tiles[next].terrain = motion === "blocked" ? "water" : "meadow";
      child.task = {
        kind: "rest",
        tile: motion === "away" ? next : origin,
        path:
          motion === "zero-length"
            ? [origin]
            : motion === "return"
              ? [next, origin]
              : [next],
        progress: 0,
      };
      const task = assign(world, actor, child),
        before = balance(world);
      if (reverse) world.citizens.reverse();
      updateCitizens(world);
      assert.ok(child.metabolism.last!.activityFraction > 0);
      const moved = motion === "away" || motion === "return";
      close(child.provisions, moved ? 0 : 0.1);
      close(task.progress, moved ? 0 : 0.1);
      if (motion !== "away")
        assert.deepEqual({ x: child.x, y: child.y }, start);
      if (motion === "return") {
        assert.equal(child.task!.path.length, 0);
        // A new interval permits contact again; a past journey is not a ban.
        assign(world, actor, child);
        world.tick++;
        updateCitizens(world);
        close(child.provisions, 0.1);
      }
      conserved(world, before);
    }
});

test("a stranded recipient still needs a willing, supplied and physically present donor", () => {
  for (const condition of ["unwilling", "unfunded", "distant"] as const) {
    const { world, actor, child, tile } = fixture();
    child.metabolism.reserves = 0;
    child.task!.path = [tileIndex(world, tile.x + 1, tile.y)];
    if (condition !== "unwilling") assign(world, actor, child);
    if (condition === "unfunded") {
      actor.provisions = 0;
      actor.metabolism.intake = actor.metabolism.reserves = 0;
    }
    if (condition === "distant") actor.x += 20;
    const before = balance(world);
    updateCitizens(world);
    assert.equal(child.provisions, 0, condition);
    assert.equal(child.metabolism.last!.ingestedKg, 0, condition);
    assert.equal(child.metabolism.last!.releasedKJ, 0, condition);
    conserved(world, before);
  }
});

test("format 13 migration preserves every existing quantity and task, archives and reopens deterministically", () => {
  const store = new Store(":memory:");
  try {
    const old = smallWorld(1847, 64, 64),
      [actor, recipient] = old.citizens;
    actor.task = {
      kind: "repair",
      material: "fiber",
      recipientId: recipient.id,
      targetWrapMass: 2,
      tile: tileIndex(old, actor.x, actor.y),
      path: [],
      progress: 0.037,
    };
    store.save(old);
    old.version = 13;
    old.lawsVersion = "biosphere-1.7";
    const { tiles, ...metadata } = old,
      json = JSON.stringify(metadata);
    store.db
      .prepare("UPDATE world SET json=?,checksum=?")
      .run(json, digest(json));
    const original = JSON.stringify(old),
      result = migrateWorld(old);
    assert.equal(JSON.stringify(old), original);
    assert.deepEqual(result.world, {
      ...old,
      version: 18,
      lawsVersion: "biosphere-1.12",
    });
    assert.deepEqual(
      result.interventions.map((i) => i.id),
      [
        "014-performed-local-food-handoff",
        "015-age-bounded-structural-growth",
        "016-performed-resource-harvesting",
        "017-contact-from-actual-movement",
        "018-mandatory-resting-metabolism",
      ],
    );
    const loaded = store.load(0, true);
    assert.deepEqual(loaded, result.world);
    const [archive] = verifyWorldArchives(store.db);
    assert.equal(
      archive.id,
      "014-performed-local-food-handoff+015-age-bounded-structural-growth+016-performed-resource-harvesting+017-contact-from-actual-movement+018-mandatory-resting-metabolism",
    );
    assert.equal(
      Buffer.concat([...worldArchiveBytes(store.db, archive.id)]).toString(),
      JSON.stringify({ ...metadata, tiles }),
    );
    const replay = structuredClone(loaded);
    stepWorld(loaded, 8);
    stepWorld(replay, 8);
    assert.deepEqual(loaded, replay);
    store.save(loaded);
    assert.deepEqual(store.load(0, true), loaded);
    assert.equal(store.interventions().length, result.interventions.length);
  } finally {
    store.close();
  }
});

test("format 16 contact migration preserves unfinished routes and exact living or extinct history", () => {
  for (const extinct of [false, true]) {
    const store = new Store(":memory:");
    try {
      const old = smallWorld(1847, 64, 64),
        person = old.citizens[0],
        target = tileIndex(old, person.x + 1, person.y);
      person.task = { kind: "rest", tile: target, path: [target], progress: 0 };
      if (extinct) {
        for (const p of old.citizens) p.health = 0;
        processDeaths(old);
      }
      store.save(old);
      old.version = 16;
      old.lawsVersion = "biosphere-1.10";
      const original = JSON.stringify(old),
        { tiles, ...metadata } = old,
        json = JSON.stringify(metadata);
      store.db
        .prepare("UPDATE world SET json=?,checksum=?")
        .run(json, digest(json));
      const migrated = migrateWorld(old);
      assert.equal(JSON.stringify(old), original);
      assert.deepEqual(migrated.world, {
        ...old,
        version: 18,
        lawsVersion: "biosphere-1.12",
      });
      assert.deepEqual(
        migrated.interventions.map((i) => i.id),
        [
          "017-contact-from-actual-movement",
          "018-mandatory-resting-metabolism",
        ],
      );
      const loaded = store.load(0, true);
      assert.deepEqual(loaded, migrated.world);
      const [archive] = verifyWorldArchives(store.db);
      assert.equal(
        archive.id,
        "017-contact-from-actual-movement+018-mandatory-resting-metabolism",
      );
      assert.equal(
        Buffer.concat([...worldArchiveBytes(store.db, archive.id)]).toString(),
        JSON.stringify({ ...metadata, tiles }),
      );
      const replay = structuredClone(loaded);
      stepWorld(loaded, 8);
      stepWorld(replay, 8);
      assert.deepEqual(loaded, replay);
      store.save(loaded);
      assert.deepEqual(store.load(0, true), loaded);
      assert.equal(store.interventions().length, migrated.interventions.length);
    } finally {
      store.close();
    }
  }
});
