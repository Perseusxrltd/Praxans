import test from "node:test";
import assert from "node:assert/strict";
import { getTile, peopleOf, tileIndex } from "../../src/simulation/world";
import { smallWorld as createWorld } from "./fixtures";
import { elementLedger } from "../../src/simulation/chemistry";
import { ledger } from "../../src/simulation/laws";
import { processDeaths } from "../../src/simulation/citizens";
import {
  regulateTemperature,
  initialMetabolism,
} from "../../src/simulation/physiology";
import { walkPath } from "../../src/simulation/movement";
import { validateWorld } from "../../src/simulation/engine";
import { applyRenewal } from "../../src/server/intervention";
import { Store } from "../../src/server/store";
import type { CommunityRenewal } from "../../src/simulation/renewal";
import { migrateWorld } from "../../src/server/migrations";
import { nearbyTiles } from "../../src/simulation/terrain";
import { updateCitizen } from "../../src/simulation/citizens";
import {
  feedIntake,
  foodReservePerPerson,
} from "../../src/simulation/subsistence";
import { measureSuccess } from "../../src/simulation/progress";
import { astronomy, groundDistanceMetres } from "../../src/simulation/planet";
import { decayStocks } from "../../src/simulation/weathering";
import { campTiles } from "../../src/simulation/settlement";

function request(world: ReturnType<typeof createWorld>): CommunityRenewal {
  return {
    id: "explicit-renewal",
    worldId: world.id,
    seed: world.seed,
    civilizationIds: world.civilizations.map((c) => c.id),
    peoplePerCommunity: 32,
    suppliesPerPerson: { biomass: 180, wood: 80, fiber: 6, stone: 5, clay: 2 },
    habitat: { radius: 5, plantKg: 8, groundcoverKg: 2, seedKg: 0.3 },
    reason: "Explicit operator-authorized test intervention.",
  };
}

test("renewal preserves old deaths, ownership, clock and supplies; it is atomic and idempotent", () => {
  const world = createWorld(1847, 64, 64),
    store = new Store(":memory:");
  try {
    const oldIds = new Set(world.citizens.map((p) => p.id));
    for (const p of world.citizens) p.health = 0;
    processDeaths(world);
    const deaths = world.deaths,
      oldCivs = world.civilizations.map((c) => ({
        ...c,
        stock: { ...c.stock },
      }));
    store.save(world);
    store.resumeClock(world.tick, 12345);
    const session = store.session().session;
    store.claim(session, world.civilizations[0].id, world);
    const before = ledger(world),
      eventsBefore = store.journal().events.length;
    const input = request(world);
    assert.throws(() =>
      applyRenewal(store, world, {
        ...input,
        civilizationIds: [input.civilizationIds[0], "missing"],
      }),
    );
    assert.equal(world.citizens.length, 0);
    const renewed = applyRenewal(store, world, input);
    assert.equal(renewed.tick, world.tick);
    assert.equal(renewed.seed, world.seed);
    assert.equal(renewed.deaths, deaths);
    assert.equal(renewed.citizens.length, 96);
    assert.ok(renewed.citizens.every((p) => !oldIds.has(p.id)));
    assert.equal(new Set(renewed.citizens.map((p) => p.id)).size, 96);
    for (const [i, civ] of renewed.civilizations.entries()) {
      assert.equal(civ.id, oldCivs[i].id);
      assert.equal(civ.deaths, oldCivs[i].deaths);
      assert.equal(civ.foundedTick, oldCivs[i].foundedTick);
      assert.equal(civ.stock.biomass, oldCivs[i].stock.biomass + 32 * 180);
      assert.equal(peopleOf(renewed, civ.id).length, 32);
      assert.equal(
        store.communityRecord(civ.id, renewed.tick).renewals?.[0].arrivals,
        32,
      );
    }
    const after = ledger(renewed);
    for (const key of ["carbon", "mineral", "water", "chemical"] as const)
      assert.ok(
        Math.abs(
          after[key] -
            before[key] -
            (renewed.boundary[key] - world.boundary[key]),
        ) < 1e-5,
        key,
      );
    validateWorld(renewed);
    assert.equal(store.journal().events.length, eventsBefore + 3);
    assert.equal(
      store.db.prepare("SELECT civ_id FROM sessions").get()?.civ_id,
      world.civilizations[0].id,
    );
    assert.equal(
      store.db.prepare("SELECT wall_ms FROM world_clock").get()?.wall_ms,
      12345,
    );
    const fingerprint = JSON.stringify(renewed);
    assert.equal(applyRenewal(store, renewed, input), renewed);
    assert.equal(JSON.stringify(renewed), fingerprint);
    assert.throws(
      () => applyRenewal(store, renewed, { ...input, peoplePerCommunity: 48 }),
      /different instructions/,
    );
    assert.equal(store.interventions().length, 1);
  } finally {
    store.close();
  }
});

test("thermal protection, frozen drinking water and extra metabolism require conserved material", () => {
  const world = createWorld(1847, 64, 64),
    civ = world.civilizations[0],
    person = world.citizens[0];
  person.x = civ.x;
  person.y = civ.y;
  person.hydration = 1;
  person.wrapMass = 2;
  person.provisions = 3;
  const tile = getTile(world, civ.x, civ.y)!;
  for (const near of nearbyTiles(world, person, 2)) {
    near.water = 0;
    near.ice = 0;
    near.air.snow = 0;
    near.temperature = -12;
  }
  tile.temperature = -12;
  tile.water = 0;
  tile.ice = 100;
  const before = elementLedger(world),
    oldIce = tile.ice,
    oldFood = person.provisions;
  regulateTemperature(world, person, civ, tile, 1, false, 0);
  assert.ok(person.hydration > 1);
  assert.ok(tile.ice < oldIce);
  assert.ok(person.provisions < oldFood);
  assert.ok(person.health > 95);
  const after = elementLedger(world);
  for (const symbol of Object.keys(before))
    assert.ok(Math.abs(before[symbol] - after[symbol]) < 1e-5, symbol);
  person.provisions = 0;
  person.cargo = null;
  civ.stock.biomass = 0;
  // Empty external stores are not an empty metabolic budget: exhaust the
  // fixture's unoxidized intake and usable reserve subset for this control.
  person.metabolism.intake = 0;
  person.metabolism.reserves = 0;
  person.hydration = 1;
  const hydration = person.hydration,
    ice = tile.ice,
    health = person.health;
  regulateTemperature(world, person, civ, tile, 1, false, 0);
  assert.equal(
    person.hydration,
    hydration,
    "no fuel means no invented meltwater",
  );
  assert.equal(tile.ice, ice);
  assert.ok(person.health < health, "unfunded heat demand has consequences");
});

test("thirst interrupts work and follows remembered water without looking up distant reservoirs", () => {
  const world = createWorld(1847, 64, 64),
    civ = world.civilizations[0],
    person = world.citizens[0];
  person.x = civ.x;
  person.y = civ.y;
  person.hydration = 0.5;
  for (const t of nearbyTiles(world, person, 4)) {
    t.water = 0;
    t.ice = 0;
    t.air.snow = 0;
    t.terrain = "meadow";
  }
  const source = getTile(world, civ.x + 3, civ.y)!;
  source.water = 10;
  person.mind.places.push({
    x: source.x,
    y: source.y,
    tick: world.tick,
    water: 10,
    frozenWater: 0,
    food: 0,
    wood: 0,
    fiber: 0,
    stone: 0,
    clay: 0,
  });
  person.task = {
    kind: "experiment",
    tile: tileIndex(world, civ.x, civ.y),
    path: [],
    progress: 0,
  };
  let waterTask = person.task;
  for (let i = 0; i < 8; i++) {
    world.tick++;
    updateCitizen(world, person, civ, 8);
    if (i === 0) {
      waterTask = person.task!;
      assert.equal(waterTask.need, "water");
      assert.equal(
        person.x,
        civ.x,
        "a new route begins its paid interval next tick",
      );
    }
    if (i === 1) {
      assert.equal(
        person.task,
        waterTask,
        "continued thirst does not repeatedly cancel its own route",
      );
      assert.ok(person.x > civ.x, "the funded route makes actual progress");
    }
  }
  assert.ok(person.hydration > 6);
  assert.ok(source.water < 10);
});

test("observed shortening daylight raises the food reserve and includes finite spoilage", () => {
  const world = createWorld(1847, 64, 64),
    civ = world.civilizations[0];
  let smallest = Infinity,
    largest = 0;
  for (let day = 7; day < 365; day += 7) {
    world.tick = day * 96;
    const target = foodReservePerPerson(world, civ);
    smallest = Math.min(smallest, target);
    largest = Math.max(largest, target);
  }
  assert.ok(largest > smallest * 10);
  assert.ok(largest > 180 * 1.6, "planning includes loss while food is stored");
});

test("winter preparation begins during the long growing-season days", () => {
  const world = createWorld(1847, 64, 64),
    civ = world.civilizations[0];
  let observedLongDays = 0;
  for (let day = 7; day < 365; day += 7) {
    world.tick = day * 96;
    const daylight = astronomy(world.tick, civ.x, civ.y).daylight;
    if (daylight >= 14) {
      observedLongDays++;
      assert.ok(
        foodReservePerPerson(world, civ) >= 180 * 1.6,
        "waiting until autumn would miss the main growing season",
      );
    }
  }
  assert.ok(observedLongDays > 0);
});

test("cold slows the entire biological food-decay rate and spoilage remains conserved", () => {
  const world = createWorld(1847, 64, 64),
    [cold, warm] = world.civilizations;
  for (const [civ, temperature] of [
    [cold, -10],
    [warm, 20],
  ] as const) {
    civ.stock.biomass = 1000;
    for (const tile of campTiles(world, civ)) {
      tile.temperature = temperature;
      tile.air.humidity = 0.8;
      tile.air.rain = 0;
    }
  }
  const before = elementLedger(world),
    energy = ledger(world).chemical;
  for (let day = 0; day < 180; day++) {
    decayStocks(world, cold);
    decayStocks(world, warm);
  }
  assert.ok(
    cold.stock.biomass > 750 && cold.stock.biomass < 1000,
    "frozen storage slows biological loss without making food eternal",
  );
  assert.ok(warm.stock.biomass < 300, "warm humid storage still spoils");
  const after = elementLedger(world);
  for (const symbol of Object.keys(before))
    assert.ok(Math.abs(before[symbol] - after[symbol]) < 1e-5, symbol);
  assert.ok(
    Math.abs(ledger(world).chemical - energy) < 0.01,
    "spoiled food enters litter rather than disappearing",
  );
});

test("carried rations stay usable beside work cargo and deaths return both wraps and food", () => {
  const world = createWorld(1847, 64, 64),
    civ = world.civilizations[0],
    person = world.citizens[0];
  person.x = civ.x + 4;
  person.y = civ.y;
  person.provisions = 0.5;
  person.wrapMass = 2;
  person.cargo = { material: "stone", amount: 3 };
  const stock = civ.stock.biomass;
  assert.equal(feedIntake(world, [{ person, amount: 0.8 }]).get(person), 0.5);
  assert.equal(person.metabolism.intake, 0.5);
  assert.equal(civ.stock.biomass, stock);
  assert.equal(person.cargo.material, "stone");
  person.provisions = 1;
  const before = elementLedger(world);
  person.health = 0;
  processDeaths(world);
  const after = elementLedger(world);
  for (const symbol of Object.keys(before))
    assert.ok(Math.abs(before[symbol] - after[symbol]) < 1e-5, symbol);
});

test("walking integrates metres across multiple cells while preserving terrain path order", () => {
  const world = createWorld(1847, 64, 64),
    civ = world.civilizations[0];
  const cells = [0, 1, 2, 3, 4].map((n) => getTile(world, civ.x + n, civ.y)!);
  for (const t of cells) t.terrain = "meadow";
  const traveler = { x: civ.x, y: civ.y },
    path = cells.slice(1).map((t) => tileIndex(world, t.x, t.y));
  walkPath(world, traveler, path, 0.25, 100);
  assert.equal(path.length, 0);
  assert.equal(traveler.x, civ.x + 4);
  assert.ok(cells.slice(1).every((t) => t.road > 0));
});

test("walking reports zero for blocked or unfunded travel and positive distance after a round trip", () => {
  const world = createWorld(1847, 64, 64),
    civ = world.civilizations[0],
    start = getTile(world, civ.x, civ.y)!,
    next = getTile(world, civ.x + 1, civ.y)!;
  start.terrain = next.terrain = "meadow";
  const traveler = { x: start.x, y: start.y },
    roundTrip = [
      tileIndex(world, next.x, next.y),
      tileIndex(world, start.x, start.y),
    ],
    expected = 2 * groundDistanceMetres(start, next);
  assert.equal(walkPath(world, traveler, roundTrip, 0, 100), 0);
  assert.equal(roundTrip.length, 2);
  next.terrain = "water";
  assert.equal(walkPath(world, traveler, roundTrip, 0.25, 100), 0);
  assert.equal(roundTrip.length, 2);
  next.terrain = "meadow";
  const traveled = walkPath(world, traveler, roundTrip, 0.25, 100);
  assert.ok(Math.abs(traveled - expected) < 1e-9 && traveled > 0);
  assert.deepEqual(traveler, { x: start.x, y: start.y });
  assert.equal(roundTrip.length, 0);
  assert.equal(walkPath(world, traveler, roundTrip, 0.25, 100), 0);
});

test("packing the same food cannot create or destroy a civilization's resilience score", () => {
  const world = createWorld(1847, 64, 64),
    civ = world.civilizations[0];
  const before = measureSuccess(world, civ).resilience;
  civ.stock.biomass -= 3;
  world.citizens[0].provisions += 3;
  assert.equal(measureSuccess(world, civ).resilience, before);
});

test("format eight migration introduces empty personal inventories without changing matter or resurrecting life", () => {
  const world = createWorld(1847, 64, 64);
  world.version = 8;
  world.lawsVersion = "biosphere-1.2";
  const original = ledger(world),
    rng = world.rng,
    nextId = world.nextId;
  const old = structuredClone(world);
  for (const p of old.citizens) {
    old.civilizations.find((c) => c.id === p.civId)!.stock.fiber += p.wrapMass;
    old.civilizations.find((c) => c.id === p.civId)!.stock.biomass +=
      p.provisions + p.metabolism.intake;
    delete (p as Partial<typeof p>).wrapMass;
    delete (p as Partial<typeof p>).provisions;
    delete (p as Partial<typeof p>).metabolism;
  }
  const normalized = structuredClone(old);
  for (const person of normalized.citizens) {
    person.wrapMass = 0;
    person.provisions = 0;
    person.metabolism = initialMetabolism(person.body);
  }
  const before = ledger(normalized);
  for (const key of ["carbon", "mineral", "water", "chemical"] as const)
    assert.ok(Math.abs(before[key] - original[key]) < 1e-4);
  const migrated = migrateWorld(old);
  assert.equal(migrated.interventions.length, 9);
  assert.equal(migrated.world.rng, rng);
  assert.equal(migrated.world.nextId, nextId);
  assert.equal(migrated.world.citizens.length, world.citizens.length);
  assert.deepEqual(ledger(migrated.world), before);
});
