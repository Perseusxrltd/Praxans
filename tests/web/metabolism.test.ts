import test from "node:test";
import assert from "node:assert/strict";
import { smallWorld } from "./fixtures";
import { CHEMISTRY, elementLedger } from "../../src/simulation/chemistry";
import { MATERIALS } from "../../src/simulation/content";
import { LAWS, ledger } from "../../src/simulation/laws";
import { getTile, tileIndex } from "../../src/simulation/world";
import { nearbyTiles } from "../../src/simulation/terrain";
import { astronomy, PLANET } from "../../src/simulation/planet";
import {
  METABOLISM,
  PHYSIOLOGY,
  bodyHeatBalance,
  initialMetabolism,
  prepareMetabolism,
  feedMetabolicNeeds,
  finishMetabolism,
  refillMetabolicIntake,
  regulateTemperature,
  withdrawBodyMatter,
} from "../../src/simulation/physiology";
import { updateCitizens, processDeaths } from "../../src/simulation/citizens";
import { updateJourneys } from "../../src/simulation/diplomacy";
import { feedIntake } from "../../src/simulation/subsistence";
import { stepWorld, validateWorld } from "../../src/simulation/engine";
import { Store, digest } from "../../src/server/store";
import { migrateWorld } from "../../src/server/migrations";
import {
  verifyWorldArchives,
  worldArchiveBytes,
} from "../../src/server/archives";
import type { Citizen, World } from "../../src/simulation/types";

const FOOD_KJ = MATERIALS.biomass.carbon * LAWS.chemicalEnergy;
const REST_WATTS = PHYSIOLOGY.basalWatts + PHYSIOLOGY.restingWatts;

function close(actual: number, expected: number, tolerance = 1e-8) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected}`,
  );
}
function neutral(person: Citizen, active = false) {
  const balance = bodyHeatBalance(person, 0, active, 0);
  return (
    PHYSIOLOGY.skinTemperature -
    (balance.metabolicDemandW * PHYSIOLOGY.airResistance) / balance.area
  );
}
function fixture(count = 1) {
  const world = smallWorld(1847, 64, 64),
    civ = world.civilizations[0];
  world.citizens = world.citizens.slice(0, count);
  world.animals = [];
  world.structures = [];
  world.caravans = [];
  for (const c of world.civilizations) c.stock.biomass = 0;
  world.tick = Array.from({ length: 96 }, (_, tick) => tick).find(
    (tick) =>
      tick % 4 !== 0 && astronomy(tick, civ.x, civ.y).solarAltitude > 10,
  )!;
  for (const person of world.citizens) {
    person.civId = civ.id;
    person.x = civ.x;
    person.y = civ.y;
    person.age = 30;
    person.body = 18;
    person.metabolism = initialMetabolism(18);
    person.provisions = 0;
    person.wrapMass = 0;
    person.cargo = null;
    person.health = 80;
    person.hunger = 95;
    person.energy = 70;
    person.hydration = 8;
    person.sick = 0;
    person.journeyId = null;
    person.mind.sleepPressure = 0;
    person.mind.sleeping = false;
    person.task = {
      kind: "rest",
      tile: tileIndex(world, civ.x, civ.y),
      path: [],
      progress: 0,
    };
  }
  for (const tile of nearbyTiles(world, civ, 4)) {
    tile.terrain = "meadow";
    tile.water = 10;
    tile.ice = 0;
    tile.air.snow = 0;
    tile.temperature = neutral(world.citizens[0]);
  }
  const person = world.citizens[0],
    tile = getTile(world, civ.x, civ.y)!;
  return { world, civ, person, tile };
}
function balances(world: World) {
  return {
    elements: elementLedger(world),
    chemical:
      ledger(world).chemical + world.energy.released - world.energy.captured,
  };
}
function conserved(
  world: World,
  before: ReturnType<typeof balances>,
  coupled = false,
) {
  const after = balances(world);
  // A full ecological tick reorders billion-kilogram sums. Keep local transfer
  // checks tighter; the coupled check allows only bounded floating-point error.
  const tolerance = (expected: number) =>
    coupled ? Math.max(1e-5, Math.abs(expected) * Number.EPSILON * 256) : 1e-5;
  for (const element of Object.keys(before.elements))
    close(
      after.elements[element],
      before.elements[element],
      tolerance(before.elements[element]),
    );
  close(after.chemical, before.chemical, tolerance(before.chemical));
}
function rebaseFixture(world: World) {
  // This is a newly constructed disposable fixture, never a loaded world.
  const matter = ledger(world);
  world.boundary = { carbon: 0, mineral: 0, water: 0, chemical: 0 };
  world.incomingElements = {};
  world.initialMatter = {
    carbon: matter.carbon,
    mineral: matter.mineral,
    water: matter.water,
  };
  world.initialElements = elementLedger(world);
  world.energy.initialChemical =
    matter.chemical + world.energy.released - world.energy.captured;
}
function interval(f: ReturnType<typeof fixture>, hours = 0.25, active = false) {
  return regulateTemperature(
    f.world,
    f.person,
    f.civ,
    f.tile,
    hours,
    active,
    0,
  );
}

test("a high nourishment score cannot fund maintenance without substrate", () => {
  const results = [];
  for (const hunger of [0, 100]) {
    const f = fixture();
    f.person.metabolism.reserves = 0;
    f.person.hunger = hunger;
    const before = balances(f.world),
      health = f.person.health;
    const result = interval(f);
    close(result.releasedKJ, 0);
    close(result.unmetMaintenanceKJ, 99);
    close(health - f.person.health, 99 / 240);
    assert.equal(f.person.body, 18);
    conserved(f.world, before);
    results.push(result.healthLoss);
  }
  assert.equal(results[0], results[1]);
});

test("equal intake and reserve oxidation produce the same energy and products without burning structure", () => {
  const outcomes = [];
  for (const source of ["intake", "reserve"] as const) {
    const f = fixture();
    const needed = 99 / FOOD_KJ;
    f.person.metabolism.intake = source === "intake" ? needed : 0;
    f.person.metabolism.reserves = source === "reserve" ? needed : 0;
    f.person.hunger = 0;
    const structure = f.person.body - f.person.metabolism.reserves;
    const before = balances(f.world),
      oxygen = f.world.atmosphere.oxygen;
    const flux = interval(f);
    close(flux.releasedKJ, 99);
    close(flux.healthLoss, 0);
    close(flux.foodOxidizedKg + flux.reserveOxidizedKg, needed);
    close(f.person.body - f.person.metabolism.reserves, structure);
    close(
      oxygen - f.world.atmosphere.oxygen,
      needed * MATERIALS.biomass.carbon * CHEMISTRY.oxygenPerOrganic,
      1e-7,
    );
    conserved(f.world, before);
    outcomes.push(flux.releasedKJ);
  }
  assert.deepEqual(outcomes, [99, 99]);
});

test("a pulsed meal funds every intervening interval and agrees across time subdivisions", () => {
  const outcomes = [];
  for (const hours of [1, 0.25, 0.125]) {
    const f = fixture();
    f.person.metabolism.intake = 0.3;
    const before = balances(f.world),
      reserve = f.person.metabolism.reserves;
    let released = 0;
    for (let time = 0; time < 4; time += hours) {
      f.world.tick++;
      // Explicit constant-temperature bath isolates metabolism from weather.
      f.tile.temperature = neutral(f.person);
      const flux = interval(f, hours);
      close(flux.releasedKJ, REST_WATTS * 3.6 * hours);
      close(flux.reserveOxidizedKg, 0);
      close(flux.healthLoss, 0);
      released += flux.releasedKJ;
    }
    close(released, 1584);
    close(f.person.metabolism.intake, 0.3 - 1584 / FOOD_KJ);
    close(f.person.metabolism.reserves, reserve);
    conserved(f.world, before);
    outcomes.push(f.person.metabolism.intake);
  }
  close(outcomes[0], outcomes[1]);
  close(outcomes[1], outcomes[2]);
});

test("oxygen shortage limits both food and reserve oxidation and cannot pay for growth", () => {
  const f = fixture();
  f.person.metabolism.intake = 0.2;
  f.world.atmosphere.oxygen =
    (99 / FOOD_KJ) *
    MATERIALS.biomass.carbon *
    CHEMISTRY.oxygenPerOrganic *
    0.5;
  f.world.atmosphereCompensation.oxygen = 0;
  const before = balances(f.world),
    reserve = f.person.metabolism.reserves;
  const flux = interval(f);
  close(flux.releasedKJ, 49.5);
  close(flux.unmetMaintenanceKJ, 49.5);
  close(flux.reserveOxidizedKg, 0);
  close(f.person.metabolism.reserves, reserve);
  close(flux.reserveStoredKg + flux.structureStoredKg, 0);
  close(f.world.atmosphere.oxygen, 0, 1e-12);
  conserved(f.world, before);
});

test("finite ice can use already released baseline heat without a second oxidation payment", () => {
  const f = fixture();
  f.person.metabolism.intake = 0.4;
  f.person.hydration = 6;
  for (const tile of nearbyTiles(f.world, f.person, 1.5)) {
    tile.water = 0;
    tile.ice = 0;
    tile.air.snow = 0;
  }
  f.tile.temperature = PHYSIOLOGY.skinTemperature;
  f.tile.ice = 0.1;
  const before = balances(f.world),
    hydration = f.person.hydration;
  const flux = interval(f);
  close(flux.releasedKJ, 99);
  close(flux.meltKJ, 0.1 * PLANET.fusionHeat);
  close(f.tile.ice, 0);
  close(
    f.person.hydration,
    hydration + 0.1 - (99 - flux.meltKJ) / PLANET.vaporizationHeat,
  );
  close(flux.healthLoss, 0);
  conserved(f.world, before);
});

test("sweating reflects actual oxidation plus signed ambient heat rather than requested baseline", () => {
  const outcomes = [];
  for (const fed of [false, true]) {
    const f = fixture();
    f.tile.temperature = 40;
    f.person.metabolism.intake = fed ? 0.1 : 0;
    f.person.metabolism.reserves = 0;
    const hydration = f.person.hydration,
      before = balances(f.world);
    const flux = interval(f);
    const incoming =
      ((PHYSIOLOGY.adultArea * (40 - PHYSIOLOGY.skinTemperature)) /
        PHYSIOLOGY.airResistance) *
      0.25 *
      3.6;
    close(flux.releasedKJ, fed ? 99 : 0);
    close(
      (hydration - f.person.hydration) * PLANET.vaporizationHeat,
      incoming + flux.releasedKJ,
    );
    conserved(f.world, before);
    outcomes.push(hydration - f.person.hydration);
  }
  assert.ok(outcomes[1] > outcomes[0]);
});

test("insulation reduces substrate demand and the power ceiling does not grow with the cold", () => {
  const outcomes = [];
  for (const covering of [0, 2]) {
    const f = fixture();
    f.tile.temperature = 0;
    f.person.metabolism.intake = 0.4;
    f.person.wrapMass = covering;
    f.civ.stock.fiber -= covering;
    const before = balances(f.world),
      flux = interval(f);
    assert.ok(
      flux.releasedKJ <=
        REST_WATTS * METABOLISM.maximumPowerMultiple * 0.25 * 3.6 + 1e-8,
    );
    conserved(f.world, before);
    outcomes.push(flux);
  }
  assert.ok(outcomes[0].unmetColdKJ > 0);
  close(outcomes[1].unmetColdKJ, 0);
  assert.ok(outcomes[0].foodOxidizedKg > outcomes[1].foodOxidizedKg);
});

test("reserve amount and release capacity have separate measurable effects", () => {
  for (const fraction of [0, 0.05, 0.1, 0.2]) {
    for (const multiple of [0.5, 1, 2, 4]) {
      const f = fixture();
      f.tile.temperature = 20;
      f.person.metabolism.reserves = f.person.body * fraction;
      const structure = f.person.body - f.person.metabolism.reserves;
      const before = balances(f.world);
      const flux = regulateTemperature(
        f.world,
        f.person,
        f.civ,
        f.tile,
        1,
        false,
        0,
        {
          ...METABOLISM,
          reserveFraction: fraction,
          reservePowerMultiple: multiple,
        },
      );
      const wanted =
        ((PHYSIOLOGY.adultArea * 13) / PHYSIOLOGY.airResistance) * 3.6;
      close(
        flux.releasedKJ,
        Math.min(wanted, REST_WATTS * multiple * 3.6, 18 * fraction * FOOD_KJ),
      );
      close(f.person.body - f.person.metabolism.reserves, structure);
      if (fraction && multiple >= 2) close(flux.healthLoss, 0);
      else assert.ok(flux.healthLoss > 0);
      conserved(f.world, before);
    }
  }
});

test("reserve restoration and growth share one processed-food allowance without repeated buffer retention", () => {
  const outcomes = [];
  for (const hours of [1, 0.25, 0.125]) {
    const f = fixture();
    f.person.body = 16.2;
    f.person.metabolism = { intake: 0.4, reserves: 0, last: null };
    let oxidized = 0,
      retained = 0;
    const before = balances(f.world);
    for (let time = 0; time < 1; time += hours) {
      f.world.tick++;
      f.tile.temperature = neutral(f.person);
      const flux = interval(f, hours);
      close(flux.structureStoredKg, 0);
      oxidized += flux.foodOxidizedKg;
      retained += flux.reserveStoredKg;
      close(f.person.body - f.person.metabolism.reserves, 16.2);
    }
    close(retained, (oxidized * 0.35) / 0.65);
    assert.ok(
      retained < 0.02,
      "one hour cannot repeatedly retain 35% of the buffered balance",
    );
    conserved(f.world, before);
    outcomes.push(retained);
  }
  assert.ok(
    Math.max(...outcomes) - Math.min(...outcomes) < 0.00002,
    "only the changing-body integration error remains",
  );
});

test("current shared needs precede optional internal top-ups in either person order", () => {
  const outcomes = [];
  for (const reversed of [false, true]) {
    const f = fixture(2),
      [buffered, empty] = f.world.citizens;
    buffered.metabolism.intake = 0.3;
    empty.metabolism.reserves = 0;
    f.civ.stock.biomass = 99 / FOOD_KJ;
    const before = balances(f.world);
    const people = reversed ? [empty, buffered] : [buffered, empty];
    const steps = people.map((person) =>
      prepareMetabolism(f.world, person, f.tile, 0.25, false, 0),
    );
    feedMetabolicNeeds(f.world, steps);
    for (const step of steps) finishMetabolism(f.world, step);
    refillMetabolicIntake(f.world, steps);
    close(empty.metabolism.last!.releasedKJ, 99);
    close(empty.metabolism.last!.healthLoss, 0);
    close(f.civ.stock.biomass, 0);
    conserved(f.world, before);
    outcomes.push([
      buffered.metabolism.intake,
      empty.metabolism.intake,
      empty.health,
    ]);
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
});

test("scarce current food shares one budget while private food stays with its holder", () => {
  for (const privatelyFed of [false, true]) {
    const f = fixture(2),
      [first, second] = f.world.citizens;
    first.metabolism.reserves = second.metabolism.reserves = 0;
    first.provisions = privatelyFed ? 0.1 : 0;
    f.civ.stock.biomass = 99 / FOOD_KJ;
    const before = balances(f.world);
    const steps = f.world.citizens.map((person) =>
      prepareMetabolism(f.world, person, f.tile, 0.25, false, 0),
    );
    feedMetabolicNeeds(f.world, steps);
    for (const step of steps) finishMetabolism(f.world, step);
    close(first.metabolism.last!.releasedKJ, privatelyFed ? 99 : 49.5);
    close(second.metabolism.last!.releasedKJ, privatelyFed ? 99 : 49.5);
    close(f.civ.stock.biomass, 0);
    if (privatelyFed) assert.ok(first.provisions > 0.09);
    conserved(f.world, before);
  }
});

test("ingestion has no heat credit and duplicate/stale phases cannot repeat a transfer", () => {
  const f = fixture();
  f.civ.stock.biomass = 1;
  const before = balances(f.world),
    released = f.world.energy.released;
  feedIntake(f.world, [
    { person: f.person, amount: 0.1 },
    { person: f.person, amount: 0.1 },
  ]);
  close(f.person.metabolism.intake, 0.1);
  close(f.civ.stock.biomass, 0.9);
  close(f.world.energy.released, released);
  const step = prepareMetabolism(f.world, f.person, f.tile, 0.25, false, 0);
  feedMetabolicNeeds(f.world, [step]);
  assert.throws(() => feedMetabolicNeeds(f.world, [step]), /once/);
  finishMetabolism(f.world, step);
  assert.throws(() => finishMetabolism(f.world, step), /once/);
  refillMetabolicIntake(f.world, [step]);
  assert.throws(() => refillMetabolicIntake(f.world, [step]), /once/);
  const stale = prepareMetabolism(f.world, f.person, f.tile, 0.25, false, 0);
  f.world.tick++;
  assert.throws(
    () => feedMetabolicNeeds(f.world, [stale]),
    /original world tick/,
  );
  conserved(f.world, before);
});

test("competing melt requests cannot reserve food for the same ice twice while another person lacks heat", () => {
  const outcomes = [];
  for (const reversed of [false, true]) {
    const f = fixture(3),
      [privateMeal, meltAndHeat, heatOnly] = f.world.citizens;
    for (const tile of nearbyTiles(f.world, f.person, 1.5)) tile.water = 0;
    f.tile.temperature = 20;
    f.tile.ice = 0.5;
    privateMeal.metabolism.intake = 0.5;
    privateMeal.hydration = meltAndHeat.hydration = 2;
    meltAndHeat.metabolism.reserves = heatOnly.metabolism.reserves = 0;
    f.civ.stock.biomass = 351 / FOOD_KJ;
    const before = balances(f.world);
    const people = reversed
      ? [...f.world.citizens].reverse()
      : f.world.citizens;
    const steps = people.map((person) =>
      prepareMetabolism(f.world, person, f.tile, 0.25, false, 0),
    );
    feedMetabolicNeeds(f.world, steps);
    close(
      steps.reduce((total, step) => total + step.meltRequestedKg, 0),
      0.5,
    );
    for (const step of steps) finishMetabolism(f.world, step);
    refillMetabolicIntake(f.world, steps);
    assert.ok(
      heatOnly.metabolism.last!.unmetColdKJ > 0,
      "this fixture actually has competing scarce energy",
    );
    close(meltAndHeat.metabolism.intake, 0, 1e-12);
    close(meltAndHeat.metabolism.last!.reserveStoredKg, 0);
    close(
      meltAndHeat.metabolism.last!.releasedKJ +
        heatOnly.metabolism.last!.releasedKJ,
      351,
    );
    assert.ok(
      f.tile.ice > 0,
      "unused heat-limited reservations remain real ice",
    );
    conserved(f.world, before);
    outcomes.push(
      [privateMeal, meltAndHeat, heatOnly].map((person) => [
        person.hydration,
        person.health,
        person.metabolism.intake,
      ]),
    );
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
});

test("partially funded existing work receives only its paid activity interval", () => {
  const progress = [];
  for (const fraction of [0, 0.5, 1]) {
    const f = fixture();
    f.person.metabolism.reserves = 0;
    const restingKJ = 99,
      activeKJ = 144;
    f.person.metabolism.intake =
      (restingKJ + (activeKJ - restingKJ) * fraction) / FOOD_KJ;
    f.person.task = {
      kind: "gather",
      material: "biomass",
      tile: tileIndex(f.world, f.person.x, f.person.y),
      path: [],
      progress: 0,
    };
    updateCitizens(f.world);
    close(f.person.metabolism.last!.activityFraction, fraction);
    assert.equal(f.person.task?.kind, "gather");
    progress.push(f.person.task!.progress);
  }
  close(progress[0], 0);
  assert.ok(progress[2] > 0);
  close(progress[1], progress[2] / 2);
});

test("a journey cannot move until its carriers have funded that journey's interval", () => {
  const f = fixture();
  const destination = tileIndex(f.world, f.civ.x + 1, f.civ.y);
  f.person.journeyId = "funded-trip";
  f.person.metabolism.intake = 0.2;
  const caravan = {
    id: "funded-trip",
    from: f.civ.id,
    to: f.world.civilizations[1].id,
    x: f.civ.x,
    y: f.civ.y,
    path: [destination],
    offer: { material: "wood" as const, amount: 1 },
    receive: { material: "stone" as const, amount: 0 },
    departedTick: f.world.tick,
    kind: "trade" as const,
    stage: "outbound" as const,
    partyIds: [f.person.id],
    provisions: 0,
    request: null,
    messageId: null,
    accordId: null,
    result: "",
    returnContact: null,
  };
  f.world.caravans.push(caravan);
  updateJourneys(f.world);
  close(caravan.x, f.civ.x);
  close(caravan.y, f.civ.y);
  interval(f, 0.25, true);
  updateJourneys(f.world);
  assert.ok(caravan.x !== f.civ.x || caravan.y !== f.civ.y);
  assert.equal(f.person.x, caravan.x);
});

test("stationary conversation can progress on paid resting metabolism but not on an empty body budget", () => {
  for (const fed of [false, true]) {
    const f = fixture();
    f.person.metabolism.reserves = 0;
    f.person.metabolism.intake = fed ? 0.2 : 0;
    f.person.task = {
      kind: "social",
      tile: tileIndex(f.world, f.person.x, f.person.y),
      path: [],
      progress: 0,
    };
    updateCitizens(f.world);
    assert.equal(f.person.task?.kind, "social");
    if (fed) assert.ok(f.person.task!.progress > 0);
    else close(f.person.task!.progress, 0);
  }
});

test("death returns intake and total body exactly once and records the measured energy interval", () => {
  const f = fixture();
  f.person.metabolism.intake = 0.3;
  interval(f);
  const before = balances(f.world),
    expected = structuredClone(f.person.metabolism.last);
  f.person.health = 0;
  processDeaths(f.world);
  assert.equal(f.world.citizens.length, 0);
  conserved(f.world, before);
  const event = [...f.world.events]
    .reverse()
    .find((event) => event.citizenId === f.person.id)!;
  assert.deepEqual(event.lifeState!.metabolism!.last, expected);
  assert.ok(event.lifeState!.metabolism!.intakeKg > 0);
});

test("parental body transfer spends the reserve tag first without creating or duplicating mass", () => {
  const f = fixture();
  const before = f.person.body;
  close(withdrawBodyMatter(f.person, 1), 1);
  close(f.person.body, before - 1);
  close(f.person.metabolism.reserves, 0.8);
  close(withdrawBodyMatter(f.person, 1), 1);
  close(f.person.body, before - 2);
  close(f.person.metabolism.reserves, 0);
});

test("actual childbirth funds the newborn's whole body and reserve subset from existing matter", () => {
  const f = fixture(2),
    [parent, partner] = f.world.citizens;
  f.world.tick = 95;
  parent.pregnancy = {
    partner: {
      id: partner.id,
      name: partner.name,
      generation: partner.generation,
      traits: { ...partner.traits },
    },
    dueTick: 96,
  };
  const parentBody = parent.body;
  rebaseFixture(f.world);
  const before = balances(f.world);
  stepWorld(f.world);
  const child = f.world.citizens.find(
    (p) => p.id !== parent.id && p.id !== partner.id,
  )!;
  assert.ok(child);
  close(child.body, 2);
  close(child.metabolism.intake, 0);
  close(child.metabolism.reserves, 0.2);
  close(
    parent.body,
    parentBody - parent.metabolism.last!.reserveOxidizedKg - child.body,
  );
  close(parent.metabolism.reserves, 0);
  conserved(f.world, before, true);
  validateWorld(f.world);
});

test("format-11 migration partitions existing bodies and starts no invented intake or past measurement", () => {
  const world = smallWorld(1847, 64, 64),
    store = new Store(":memory:");
  try {
    store.save(world);
    const old = structuredClone(world);
    old.version = 11;
    old.lawsVersion = "biosphere-1.5";
    for (const person of old.citizens)
      delete (person as Partial<Citizen>).metabolism;
    const original = JSON.stringify(old),
      { tiles, ...metadata } = old;
    const json = JSON.stringify(metadata);
    store.db
      .prepare("UPDATE world SET json=?,checksum=?")
      .run(json, digest(json));
    const migrated = migrateWorld(old);
    assert.equal(JSON.stringify(old), original);
    const projected = structuredClone(migrated.world);
    for (const person of projected.citizens) {
      close(person.metabolism.reserves, person.body * 0.1);
      close(person.metabolism.intake, 0);
      assert.equal(person.metabolism.last, null);
      delete (person as Partial<Citizen>).metabolism;
    }
    assert.deepEqual(projected, {
      ...old,
      version: 12,
      lawsVersion: "biosphere-1.6",
    });
    assert.deepEqual(
      migrated.interventions.map((i) => i.id),
      ["012-funded-human-metabolism"],
    );
    const loaded = store.load(0, true);
    assert.deepEqual(loaded, migrated.world);
    const archives = verifyWorldArchives(store.db);
    assert.equal(archives.length, 1);
    const archived = Buffer.concat([
      ...worldArchiveBytes(store.db, archives[0].id),
    ]).toString();
    assert.equal(
      digest(archived),
      digest(JSON.stringify({ ...metadata, tiles })),
    );
    const repeat = structuredClone(loaded);
    stepWorld(loaded, 8);
    stepWorld(repeat, 8);
    assert.deepEqual(loaded, repeat);
    store.save(loaded);
    assert.deepEqual(store.load(0, true), loaded);
    assert.equal(store.interventions().length, 1);
  } finally {
    store.close();
  }
});
