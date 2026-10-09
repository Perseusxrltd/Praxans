import test from "node:test";
import assert from "node:assert/strict";
import { smallWorld } from "./fixtures";
import { updateCitizens } from "../../src/simulation/citizens";
import { stepWorld, validateWorld } from "../../src/simulation/engine";
import {
  finishRationPickup,
  prepareRationPickup,
} from "../../src/simulation/subsistence";
import { canReachCampStocks } from "../../src/simulation/settlement";
import { MATERIALS } from "../../src/simulation/content";
import {
  PHYSIOLOGY,
  initialMetabolism,
  intakeCapacity,
} from "../../src/simulation/physiology";
import { elementLedger } from "../../src/simulation/chemistry";
import { emptyStock, LAWS, ledger } from "../../src/simulation/laws";
import { astronomy } from "../../src/simulation/planet";
import { nearbyTiles } from "../../src/simulation/terrain";
import { getTile, tileIndex } from "../../src/simulation/world";
import { Store, digest } from "../../src/server/store";
import { migrateWorld } from "../../src/server/migrations";
import {
  verifyWorldArchives,
  worldArchiveBytes,
} from "../../src/server/archives";
import {
  DAYS_PER_YEAR,
  type Citizen,
  type World,
} from "../../src/simulation/types";

function close(actual: number, expected: number, tolerance = 1e-8) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} != ${expected}`,
  );
}

function fixture(food = 3) {
  const world = smallWorld(1847, 64, 64),
    civ = world.civilizations[0];
  const [adult, child] = world.citizens;
  world.citizens = [adult, child];
  civ.stock = { ...emptyStock(), biomass: food };
  // Isolate allocation from the separately unresolved childhood-growth model.
  for (const person of world.citizens) {
    person.civId = civ.id;
    person.x = civ.x;
    person.y = civ.y;
    person.age = 30;
    person.body = 18;
    person.metabolism = initialMetabolism(person.body);
    person.provisions = 0;
    person.cargo = null;
    person.journeyId = null;
    person.wrapMass = 0;
    person.hunger = 90;
    person.hydration = 8;
    person.health = 98;
    person.sick = 0;
    person.energy = 60;
    person.mind.sleepPressure = 0;
    person.mind.sleeping = false;
    person.task = {
      kind: "rest",
      tile: tileIndex(world, person.x, person.y),
      path: [],
      progress: 0,
    };
  }
  // The adult really has a meal available internally; the child has neither
  // intake nor mobilizable reserves. Scores alone cannot establish either fact.
  adult.metabolism.intake = intakeCapacity(adult);
  child.metabolism.reserves = 0;
  world.tick = Array.from({ length: 96 }, (_, tick) => tick).find(
    (tick) =>
      (tick + 1) % 4 !== 0 && astronomy(tick, civ.x, civ.y).solarAltitude > 10,
  )!;
  assert.ok(Number.isInteger(world.tick));
  const neutral =
    PHYSIOLOGY.skinTemperature -
    ((PHYSIOLOGY.basalWatts + PHYSIOLOGY.restingWatts) *
      PHYSIOLOGY.airResistance) /
      PHYSIOLOGY.adultArea;
  for (const tile of nearbyTiles(world, civ, 5)) {
    tile.terrain = "meadow";
    // Leave thermal headroom for another person's small evaporative cooling.
    tile.temperature = neutral + 1;
    tile.water = 10;
    tile.ice = 0;
    tile.air.snow = 0;
  }
  const tile = getTile(world, civ.x, civ.y)!;
  return { world, civ, adult, child, tile };
}

function balances(world: World) {
  return {
    elements: elementLedger(world),
    chemical:
      ledger(world).chemical + world.energy.released - world.energy.captured,
  };
}
function conserved(world: World, before: ReturnType<typeof balances>) {
  const after = balances(world);
  for (const element of Object.keys(before.elements))
    close(after.elements[element], before.elements[element], 1e-5);
  close(after.chemical, before.chemical, 1e-5);
}

test("shared-world meals precede optional rations in both adult/child orders", () => {
  for (const food of [0, 3, 7]) {
    const outcomes = [];
    for (const reversed of [false, true]) {
      const { world, civ, adult, child } = fixture(food);
      child.age = 0.22;
      child.hunger = 10;
      if (reversed) world.citizens.reverse();
      const before = balances(world);
      const age = child.age;
      stepWorld(world);
      close(child.age - age, 0.25 / (24 * DAYS_PER_YEAR), 1e-14);
      const flux = child.metabolism.last!;
      close(flux.releasedKJ, food ? 99 : 0);
      if (food) {
        assert.ok(child.health > 98);
        assert.ok(child.metabolism.intake > 0);
      } else {
        assert.ok(child.health < 98);
        close(child.metabolism.intake, 0);
      }
      const availableForRations = food - flux.ingestedKg;
      close(adult.provisions, Math.min(3, availableForRations / 2));
      close(child.provisions, adult.provisions);
      close(
        civ.stock.biomass +
          adult.provisions +
          child.provisions +
          flux.ingestedKg,
        food,
      );
      conserved(world, before);
      outcomes.push([
        child.hunger,
        child.health,
        adult.provisions,
        child.provisions,
      ]);
    }
    assert.deepEqual(outcomes[0], outcomes[1]);
  }
});

test("cold fuel and melting use real food before an otherwise fed neighbor packs", () => {
  for (const frozen of [false, true]) {
    const outcomes = [];
    for (const reversed of [false, true]) {
      const { world, civ, adult, child } = fixture(0.1);
      child.x++;
      const cold = getTile(world, child.x, child.y)!;
      cold.temperature = -5;
      // Real insulation makes this demand attainable below the power ceiling.
      child.wrapMass = 2;
      world.civilizations[1].stock.fiber -= child.wrapMass;
      if (frozen) {
        for (const tile of nearbyTiles(world, child, 1.5)) tile.water = 0;
        child.hydration = 2;
        cold.ice = 2;
      }
      if (reversed) world.citizens.reverse();
      const before = balances(world),
        released = world.energy.released;
      updateCitizens(world);
      assert.ok(
        child.health > 98,
        "the available fuel covers the thermal deficit",
      );
      if (frozen) {
        close(cold.ice, 1.5);
        close(child.hydration, 2 - 0.25 * 0.065 + 0.5);
      }
      const flux = child.metabolism.last!;
      assert.ok(flux.foodOxidizedKg > 0 && flux.foodOxidizedKg < 0.1);
      close(flux.reserveOxidizedKg, 0);
      close(flux.unmetColdKJ, 0);
      close(
        civ.stock.biomass +
          adult.provisions +
          child.provisions +
          flux.ingestedKg,
        0.1,
      );
      close(
        world.energy.released - released,
        adult.metabolism.last!.releasedKJ + flux.releasedKJ,
      );
      close(adult.provisions, child.provisions);
      conserved(world, before);
      outcomes.push([
        child.health,
        child.hydration,
        adult.provisions,
        child.provisions,
      ]);
    }
    assert.deepEqual(outcomes[0], outcomes[1]);
  }
});

test("existing personal rations, work cargo and journey stores retain their custody", () => {
  const { world, civ, adult, child } = fixture(0);
  adult.provisions = 3;
  child.hunger = 10;
  const before = balances(world);
  updateCitizens(world);
  close(adult.provisions, 3);
  assert.ok(child.hunger < 10 && child.health < 98);
  conserved(world, before);

  child.journeyId = "finite-party";
  world.caravans.push({
    id: child.journeyId,
    from: civ.id,
    to: world.civilizations[1].id,
    x: child.x,
    y: child.y,
    path: [],
    offer: { material: "wood", amount: 1 },
    receive: { material: "stone", amount: 1 },
    departedTick: world.tick,
    kind: "trade",
    stage: "outbound",
    partyIds: [child.id],
    provisions: 0.3,
    request: null,
    messageId: null,
    accordId: null,
    result: "",
    returnContact: null,
  });
  child.cargo = { material: "biomass", amount: 0.1 };
  civ.stock.biomass = 7;
  const carried = balances(world);
  updateCitizens(world);
  assert.ok(child.hunger > 20);
  assert.equal(world.caravans[0].provisions, 0);
  assert.equal(child.cargo, null);
  assert.equal(
    child.provisions,
    0,
    "a passing traveler cannot refill from the camp",
  );
  close(civ.stock.biomass, 7);
  conserved(world, carried);
});

test("duplicate and reversed refill requests share one finite residual budget", () => {
  const outcomes = [];
  for (const reversed of [false, true]) {
    const { world, civ, adult, child } = fixture(1);
    adult.provisions = 2;
    const before = balances(world),
      bodies = world.citizens.map((p) => ({
        id: p.id,
        age: p.age,
        hunger: p.hunger,
        body: p.body,
        health: p.health,
        hydration: p.hydration,
        energy: p.energy,
      })),
      released = world.energy.released;
    const people = reversed ? [child, adult, adult] : [adult, adult, child];
    const pickup = prepareRationPickup(world, people);
    assert.equal(civ.stock.biomass, 1, "a request does not debit anything");
    finishRationPickup(world, pickup);
    close(adult.provisions, 2.25);
    close(child.provisions, 0.75);
    close(civ.stock.biomass, 0);
    conserved(world, before);
    assert.deepEqual(
      world.citizens.map((p) => ({
        id: p.id,
        age: p.age,
        hunger: p.hunger,
        body: p.body,
        health: p.health,
        hydration: p.hydration,
        energy: p.energy,
      })),
      bodies,
      "pickup alone supplies no physiological benefit",
    );
    assert.equal(world.energy.released, released);
    assert.throws(() => finishRationPickup(world, pickup), /once/);
    outcomes.push([adult.provisions, child.provisions]);
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
});

test("all pickups use the same camp footprint before stock volume shrinks it", () => {
  const { world, civ, adult, child } = fixture(6);
  civ.stock.wood =
    (50 - 4.5 / MATERIALS.biomass.density) * MATERIALS.wood.density;
  child.y -= 2;
  assert.ok(canReachCampStocks(world, civ, child));
  const before = balances(world);
  finishRationPickup(world, prepareRationPickup(world));
  close(adult.provisions, 3);
  close(child.provisions, 3);
  assert.equal(
    canReachCampStocks(world, civ, child),
    false,
    "rechecking after each debit would exclude the edge recipient",
  );
  conserved(world, before);
});

test("a stale pickup cannot teleport food or provision dead, departed or replaced people", () => {
  for (const change of [
    "move",
    "death",
    "journey",
    "community",
    "replacement",
    "tick",
    "world",
  ] as const) {
    const { world, civ, adult } = fixture(3);
    const pickup = prepareRationPickup(world, [adult]);
    if (change === "move") adult.x++;
    if (change === "death") adult.health = 0;
    if (change === "journey") adult.journeyId = "departed";
    if (change === "community") adult.civId = world.civilizations[1].id;
    if (change === "replacement") world.citizens[0] = structuredClone(adult);
    if (change === "tick") world.tick++;
    if (change === "world" || change === "tick") {
      assert.throws(
        () =>
          finishRationPickup(
            change === "world" ? structuredClone(world) : world,
            pickup,
          ),
        /original world tick/,
      );
    } else finishRationPickup(world, pickup);
    close(civ.stock.biomass, 3);
    close(adult.provisions, 0);
  }
});

test("pickup never spends later deliveries or exceeds newly occupied personal capacity", () => {
  const { world, civ, adult, child } = fixture(1);
  const pickup = prepareRationPickup(world);
  civ.stock.biomass += 5;
  adult.provisions = 3;
  const before = balances(world);
  finishRationPickup(world, pickup);
  close(adult.provisions, 3);
  close(child.provisions, 1);
  close(civ.stock.biomass, 5);
  conserved(world, before);
});

test("another real withdrawal reduces the pickup budget before commitment", () => {
  const { world, civ, adult, child } = fixture(3);
  const pickup = prepareRationPickup(world);
  civ.stock.biomass -= 2;
  adult.cargo = { material: "biomass", amount: 2 };
  const before = balances(world);
  finishRationPickup(world, pickup);
  close(adult.provisions, 0.5);
  close(child.provisions, 0.5);
  assert.equal(adult.cargo.amount, 2);
  close(civ.stock.biomass, 0);
  conserved(world, before);
});

test("an arriving worker waits for a boundary at which the camp is actually reachable", () => {
  const { world, civ, adult } = fixture(7);
  adult.x += 4;
  adult.task = {
    kind: "move",
    progress: 0,
    tile: tileIndex(world, civ.x, civ.y),
    path: [3, 2, 1, 0].map((dx) => tileIndex(world, civ.x + dx, civ.y)),
  };
  assert.equal(canReachCampStocks(world, civ, adult), false);
  updateCitizens(world);
  assert.ok(canReachCampStocks(world, civ, adult));
  assert.equal(adult.provisions, 0);
  world.tick++;
  updateCitizens(world);
  close(adult.provisions, 3);
});

test("workers collect provisions before departure, while later deliveries wait for the next bodily phase", () => {
  const { world, civ, adult, child } = fixture(3);
  child.metabolism = initialMetabolism(child.body);
  child.metabolism.intake = intakeCapacity(child);
  adult.task = {
    kind: "move",
    progress: 0,
    tile: tileIndex(world, civ.x + 4, civ.y),
    path: [1, 2, 3, 4].map((dx) => tileIndex(world, civ.x + dx, civ.y)),
  };
  updateCitizens(world);
  assert.ok(adult.x > civ.x + 1);
  close(adult.provisions, 1.5);
  close(child.provisions, 1.5);

  const delivery = fixture(0);
  delivery.adult.cargo = { material: "biomass", amount: 1 };
  delivery.adult.task = {
    kind: "deliver",
    progress: 1,
    tile: tileIndex(delivery.world, delivery.civ.x, delivery.civ.y),
    path: [],
  };
  delivery.child.hunger = 10;
  const before = balances(delivery.world);
  updateCitizens(delivery.world);
  assert.ok(
    delivery.child.hunger < 10,
    "food delivered afterward cannot pay for an earlier meal",
  );
  assert.equal(delivery.child.provisions, 0);
  close(delivery.civ.stock.biomass, 1);
  conserved(delivery.world, before);
  delivery.world.tick++;
  updateCitizens(delivery.world);
  assert.ok(delivery.child.hunger > 40);
});

test("death during physiology stops a nearly completed delivery and does not acquire rations", () => {
  const { world, civ, adult, tile } = fixture(0);
  adult.health = 0.01;
  adult.hydration = 0;
  adult.cargo = { material: "wood", amount: 1 };
  adult.task = {
    kind: "deliver",
    progress: 1,
    tile: tileIndex(world, adult.x, adult.y),
    path: [],
  };
  for (const t of nearbyTiles(world, adult, 1.5)) t.water = 0;
  tile.temperature = 80;
  const before = balances(world);
  updateCitizens(world);
  assert.equal(adult.health, 0);
  assert.equal(civ.stock.wood, 0);
  assert.equal(adult.cargo?.amount, 1);
  assert.equal(adult.provisions, 0);
  conserved(world, before);
});

test("current food scarcity is independent of the person's position in the update array", () => {
  const results = [];
  for (const reversed of [false, true]) {
    const { world, adult, child } = fixture(
      99 / (MATERIALS.biomass.carbon * LAWS.chemicalEnergy),
    );
    adult.metabolism.intake = 0;
    adult.metabolism.reserves = 0;
    adult.hunger = child.hunger = 10;
    if (reversed) world.citizens.reverse();
    updateCitizens(world);
    close(adult.metabolism.last!.releasedKJ, 49.5);
    close(child.metabolism.last!.releasedKJ, 49.5);
    assert.ok(adult.health < 98 && child.health < 98);
    results.push([adult.hunger, child.hunger, adult.health, child.health]);
  }
  assert.deepEqual(results[0], results[1]);
});

test("format-10 continuation archives all prior state without inventing food or allocating on load", () => {
  const world = smallWorld(1847, 64, 64),
    store = new Store(":memory:");
  try {
    store.save(world);
    const old = structuredClone(world);
    old.version = 10;
    old.lawsVersion = "biosphere-1.4";
    for (const person of old.citizens)
      delete (person as Partial<Citizen>).metabolism;
    const { tiles, ...metadata } = old;
    const json = JSON.stringify(metadata);
    store.db
      .prepare("UPDATE world SET json=?,checksum=?")
      .run(json, digest(json));
    const original = JSON.stringify(old);
    const migrated = migrateWorld(old);
    assert.equal(JSON.stringify(old), original);
    assert.deepEqual(migrated.world, {
      ...old,
      version: 12,
      lawsVersion: "biosphere-1.6",
      citizens: old.citizens.map((person) => ({
        ...person,
        metabolism: initialMetabolism(person.body),
      })),
    });
    assert.deepEqual(
      migrated.interventions.map((i) => i.id),
      ["011-consumption-before-ration-pickup", "012-funded-human-metabolism"],
    );
    const loaded = store.load(0, true);
    assert.deepEqual(loaded, migrated.world);
    validateWorld(loaded);
    const archives = verifyWorldArchives(store.db);
    assert.equal(archives.length, 1);
    const archived = Buffer.concat([
      ...worldArchiveBytes(store.db, archives[0].id),
    ]).toString();
    assert.equal(
      digest(archived),
      digest(JSON.stringify({ ...metadata, tiles })),
    );
    assert.deepEqual(JSON.parse(archived), old);
    assert.deepEqual(store.load(0, true), loaded);
    assert.equal(store.interventions().length, 2);
    const continued = structuredClone(loaded);
    stepWorld(loaded, 8);
    stepWorld(continued, 8);
    assert.deepEqual(loaded, continued, "new-law replay is deterministic");
  } finally {
    store.close();
  }
});
