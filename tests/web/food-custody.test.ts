import test from "node:test";
import assert from "node:assert/strict";
import { smallWorld } from "./fixtures";
import { emptyStock, ledger } from "../../src/simulation/laws";
import { elementLedger } from "../../src/simulation/chemistry";
import { decayInventories } from "../../src/simulation/weathering";
import { stepWorld, validateWorld } from "../../src/simulation/engine";
import { Store, digest } from "../../src/server/store";
import { migrateWorld } from "../../src/server/migrations";
import {
  verifyWorldArchives,
  worldArchiveBytes,
} from "../../src/server/archives";
import {
  findSettlementSite,
  getTile,
  peopleOf,
} from "../../src/simulation/world";
import { connectedResourceTiles } from "../../src/simulation/settlement";
import {
  dispatchExpedition,
  encounter,
  sendTrade,
  tradeUtility,
  updateAccords,
  updateJourneys,
} from "../../src/simulation/diplomacy";
import { processDeaths } from "../../src/simulation/citizens";
import type { Accord, World } from "../../src/simulation/types";

function conserved(
  before: ReturnType<typeof elementLedger>,
  chemical: number,
  world: World,
) {
  const after = elementLedger(world);
  for (const symbol of Object.keys(before))
    assert.ok(Math.abs(after[symbol] - before[symbol]) < 2e-6, symbol);
  assert.ok(Math.abs(ledger(world).chemical - chemical) < 1e-5);
}

function stores(temperature = 20) {
  const world = smallWorld(1847, 64, 64),
    civ = world.civilizations[0],
    person = world.citizens[0];
  world.structures = [];
  for (const tile of world.tiles) {
    tile.temperature = temperature;
    tile.air.humidity = 1;
    tile.air.rain = 0;
  }
  for (const community of world.civilizations) community.stock = emptyStock();
  for (const citizen of world.citizens) {
    citizen.provisions = 0;
    citizen.cargo = null;
  }
  civ.stock.biomass = person.provisions = 12;
  person.x = civ.x;
  person.y = civ.y;
  person.cargo = { material: "biomass", amount: 12 };
  person.metabolism.intake = 0.4;
  world.caravans = [
    {
      id: "storage-trial",
      from: civ.id,
      to: world.civilizations[1].id,
      x: civ.x,
      y: civ.y,
      path: [],
      offer: { material: "biomass", amount: 12 },
      receive: { material: "biomass", amount: 12 },
      departedTick: world.tick,
      kind: "trade",
      stage: "outbound",
      partyIds: [person.id],
      provisions: 12,
      request: { material: "biomass", amount: 12 },
      messageId: null,
      accordId: null,
      result: "Stored during the exposure trial",
      returnContact: null,
    },
  ];
  return { world, civ, person, caravan: world.caravans[0] };
}

const quantities = (f: ReturnType<typeof stores>) => [
  f.civ.stock.biomass,
  f.person.provisions,
  f.person.cargo!.amount,
  f.caravan.provisions,
  f.caravan.offer.amount,
  f.caravan.receive.amount,
];

test("equal exposed food cannot avoid spoilage by moving into another custody", () => {
  const f = stores(),
    before = elementLedger(f.world),
    chemical = ledger(f.world).chemical;
  const body = f.person.body,
    reserve = f.person.metabolism.reserves;
  decayInventories(f.world, 24);
  const expected = 12 * Math.exp(-0.004 * 2.3);
  for (const amount of quantities(f))
    assert.ok(Math.abs(amount - expected) < 1e-12);
  assert.equal(f.person.metabolism.intake, 0.4);
  assert.equal(f.person.body, body);
  assert.equal(f.person.metabolism.reserves, reserve);
  conserved(before, chemical, f.world);
});

test("exposure uses elapsed hours without a free daily reset or duplicated material loss", () => {
  const whole = stores(),
    split = stores();
  decayInventories(whole.world, 24);
  for (let hour = 0; hour < 24; hour++) decayInventories(split.world, 1);
  for (const [index, amount] of quantities(whole).entries())
    assert.ok(Math.abs(amount - quantities(split)[index]) < 1e-11);
  const a = elementLedger(whole.world),
    b = elementLedger(split.world);
  for (const symbol of Object.keys(a))
    assert.ok(Math.abs(a[symbol] - b[symbol]) < 2e-6, symbol);
  const snapshot = JSON.stringify(split.world);
  decayInventories(split.world, 0);
  assert.equal(JSON.stringify(split.world), snapshot);
  assert.throws(() => decayInventories(split.world, -1), /hours/);
  assert.throws(() => decayInventories(split.world, NaN), /hours/);
  assert.equal(JSON.stringify(split.world), snapshot);
});

test("carried food follows the actual local temperature rather than a custody exemption", () => {
  const cold = stores(0),
    warm = stores(20);
  decayInventories(cold.world, 24);
  decayInventories(warm.world, 24);
  for (const [index, amount] of quantities(cold).entries())
    assert.ok(amount < 12 && amount > quantities(warm)[index]);
});

test("the continuing clock spoils uninhabited camp food hourly without a second daily charge", () => {
  const world = smallWorld(1847, 64, 64),
    civ = world.civilizations[0];
  for (const person of world.citizens) person.health = 0;
  processDeaths(world);
  const beginning = civ.stock.biomass;
  stepWorld(world, 3);
  assert.equal(civ.stock.biomass, beginning);
  stepWorld(world, 1);
  assert.ok(civ.stock.biomass < beginning);
  stepWorld(world, 91);
  const beforeDay = civ.stock.biomass;
  stepWorld(world, 1);
  // The declared worst one-hour rate is 0.004/24 * Q10 cap 8 * (1.3 + damp cap 1).
  // A former extra daily charge would exceed this bound at these mild temperatures.
  assert.ok(beforeDay - civ.stock.biomass > 0);
  assert.ok(
    civ.stock.biomass >= beforeDay * Math.exp((-0.004 / 24) * 8 * 2.3) - 1e-9,
  );
  validateWorld(world);
});

function trip() {
  const world = smallWorld(1847, 64, 64),
    [from, to] = world.civilizations;
  world.tick = 48;
  to.x = from.x + 2;
  to.y = from.y;
  for (const tile of world.tiles) tile.terrain = "meadow";
  for (const person of peopleOf(world, from.id)) {
    person.x = from.x;
    person.y = from.y;
    person.energy = 95;
    person.hunger = 95;
    person.health = 98;
    person.cargo = null;
    person.pregnancy = null;
    from.stock.biomass -= 3;
    person.provisions = 3;
  }
  encounter(world, from, to, true);
  return { world, from, to };
}

function externalLoad(world: World) {
  const caravan = world.caravans[0];
  const party = world.citizens.filter(
    (p) => caravan.partyIds.includes(p.id) && p.health > 0,
  );
  return {
    party,
    load:
      caravan.offer.amount +
      caravan.receive.amount +
      caravan.provisions +
      party.reduce(
        (sum, p) => sum + p.provisions + p.wrapMass + (p.cargo?.amount ?? 0),
        0,
      ),
  };
}

test("journey formation reserves room for personal food and actual covering", () => {
  const loaded = trip(),
    unladen = trip();
  for (const person of peopleOf(unladen.world, unladen.from.id)) {
    unladen.from.stock.biomass += person.provisions;
    person.provisions = 0;
  }
  for (const f of [loaded, unladen]) {
    const before = elementLedger(f.world),
      chemical = ledger(f.world).chemical;
    sendTrade(
      f.world,
      f.from,
      f.to.id,
      { material: "wood", amount: 25 },
      { material: "stone", amount: 1 },
    );
    const carried = externalLoad(f.world);
    assert.ok(carried.load <= carried.party.length * 30 + 1e-10);
    conserved(before, chemical, f.world);
  }
  assert.equal(loaded.world.caravans[0].partyIds.length, 2);
  assert.equal(unladen.world.caravans[0].partyIds.length, 1);
  assert.ok(externalLoad(loaded.world).party.every((p) => p.provisions === 3));
});

test("losing a carrier sheds only finite shared goods and retains private custody", () => {
  const f = trip();
  sendTrade(
    f.world,
    f.from,
    f.to.id,
    { material: "wood", amount: 40 },
    { material: "stone", amount: 1 },
  );
  assert.equal(f.world.caravans[0].partyIds.length, 2);
  const before = elementLedger(f.world),
    chemical = ledger(f.world).chemical;
  externalLoad(f.world).party[0].health = 0;
  processDeaths(f.world);
  updateJourneys(f.world);
  const carried = externalLoad(f.world);
  assert.equal(carried.party.length, 1);
  assert.ok(carried.load <= 30 + 1e-10);
  assert.equal(carried.party[0].provisions, 3);
  assert.ok(f.world.caravans[0].offer.amount < 40);
  conserved(before, chemical, f.world);
});

test("a willing recipient cannot load return goods beyond the surviving carriers' actual capacity", () => {
  const f = trip();
  f.to.stock.stone = 1000;
  f.to.stock.wood = 0;
  sendTrade(
    f.world,
    f.from,
    f.to.id,
    { material: "wood", amount: 1 },
    { material: "stone", amount: 25 },
  );
  const caravan = f.world.caravans[0];
  assert.equal(caravan.partyIds.length, 2);
  externalLoad(f.world).party[0].health = 0;
  processDeaths(f.world);
  caravan.path = [];
  caravan.x = f.to.x;
  caravan.y = f.to.y;
  for (const person of externalLoad(f.world).party) {
    person.x = f.to.x;
    person.y = f.to.y;
  }
  assert.ok(tradeUtility(f.world, f.to, caravan.offer, caravan.request!));
  const before = elementLedger(f.world),
    chemical = ledger(f.world).chemical;
  updateJourneys(f.world);
  assert.match(caravan.result, /declined/);
  assert.equal(caravan.receive.amount, 0);
  assert.equal(f.to.stock.stone, 1000);
  conserved(before, chemical, f.world);
});

test("a raid cannot take goods beyond its surviving carriers' finite external load", () => {
  const f = trip();
  for (const person of peopleOf(f.world, f.from.id)) {
    person.traits.resilience = 1;
    person.mind.adviceTrust = 1;
  }
  f.from.relations[f.to.id].lastRaidTick = f.world.tick - 96 * 7;
  for (const person of peopleOf(f.world, f.to.id)) {
    person.x = f.to.x + 8;
    person.y = f.to.y;
  }
  dispatchExpedition(f.world, f.from, f.to.id, 2, "wood");
  const caravan = f.world.caravans[0];
  externalLoad(f.world).party[0].health = 0;
  processDeaths(f.world);
  caravan.x = f.to.x;
  caravan.y = f.to.y;
  caravan.path = [];
  for (const person of externalLoad(f.world).party) {
    person.x = f.to.x;
    person.y = f.to.y;
  }
  const before = elementLedger(f.world),
    chemical = ledger(f.world).chemical;
  const stock = f.to.stock.wood;
  updateJourneys(f.world);
  assert.equal(caravan.stage, "returning");
  assert.ok(caravan.receive.amount > 0 && caravan.receive.amount < 40);
  assert.ok(externalLoad(f.world).load <= 30 + 1e-10);
  assert.ok(Math.abs(stock - f.to.stock.wood - caravan.receive.amount) < 1e-10);
  conserved(before, chemical, f.world);
});

test("exposed deliveries credit actual food, retry a finite shortfall and retain missed-deadline consequences", () => {
  const f = trip();
  const accord: Accord = {
    id: "agreed-food-delivery",
    messageId: "earlier-accepted-letter",
    from: f.from.id,
    to: f.to.id,
    terms: [
      {
        kind: "transfer",
        from: "sender",
        goods: { material: "biomass", amount: 2 },
        days: 2,
      },
    ],
    ratifiedTick: f.world.tick,
    expiresTick: f.world.tick + 192,
    status: "active",
    obligations: [
      {
        from: f.from.id,
        to: f.to.id,
        goods: { material: "biomass", amount: 2 },
        delivered: 0,
        deadlineTick: f.world.tick + 192,
        inTransit: null,
      },
    ],
  };
  f.world.diplomacy.accords.push(accord);
  updateAccords(f.world);
  const first = f.world.caravans.find((c) => c.accordId === accord.id)!;
  assert.ok(first);
  // A real rest stop keeps this cargo exposed across at least one hourly boundary.
  for (const person of f.world.citizens.filter((p) =>
    first.partyIds.includes(p.id),
  ))
    person.energy = 0;
  const journeys = new Set([first.id]);
  let receivedFirst = 0,
    missed: World | null = null;
  for (let i = 0; i < 200 && accord.status === "active"; i++) {
    stepWorld(f.world, 1);
    for (const caravan of f.world.caravans)
      if (caravan.accordId === accord.id) journeys.add(caravan.id);
    if (!receivedFirst && accord.obligations[0].delivered > 0) {
      receivedFirst = accord.obligations[0].delivered;
      assert.ok(receivedFirst < 2 && accord.status === "active");
      missed = structuredClone(f.world);
    }
  }
  assert.ok(receivedFirst > 0 && receivedFirst < 2);
  assert.ok(journeys.size >= 2);
  assert.equal(accord.status, "fulfilled");
  assert.ok(Math.abs(accord.obligations[0].delivered - 2) <= 1e-8);
  assert.ok(missed);
  const unpaid = missed.diplomacy.accords.find((a) => a.id === accord.id)!;
  unpaid.obligations[0].deadlineTick = missed.tick - 1;
  updateAccords(missed);
  assert.equal(unpaid.status, "breached");
  assert.equal(unpaid.obligations[0].delivered, receivedFirst);
  validateWorld(f.world);
  validateWorld(missed);
});

test("founding cannot count an island's food until a represented land route connects it", () => {
  const world = smallWorld(1847, 64, 64);
  const tree = structuredClone(
    world.tiles.find((t) => t.plant && t.plant.genome.woodiness > 0.3)!.plant!,
  );
  world.civilizations = [];
  world.citizens = [];
  world.structures = [];
  for (const tile of world.tiles) {
    tile.terrain = "water";
    tile.plant = null;
    tile.groundcover = null;
    tile.forage = 0;
    tile.temperature = 20;
    tile.water = 5000;
  }
  const origin = { x: 8, y: 8 };
  for (let y = 5; y <= 11; y++)
    for (let x = 5; x <= 11; x++) getTile(world, x, y)!.terrain = "meadow";
  for (let y = 6; y <= 10; y++)
    for (let x = 23; x <= 27; x++) getTile(world, x, y)!.terrain = "meadow";
  const food = getTile(world, 25, 8)!;
  food.plant = tree;
  tree.carbon = 100000;
  food.forage = 100000;
  const rng = world.rng,
    cells = world.tiles.length;
  assert.equal(findSettlementSite(world, origin, 300), null);
  assert.equal(connectedResourceTiles(world, origin, 48).length, 49);
  for (let x = 12; x <= 22; x++) getTile(world, x, 8)!.terrain = "meadow";
  assert.deepEqual(findSettlementSite(world, origin, 300), origin);
  const connected = connectedResourceTiles(world, origin, 48);
  assert.ok(connected.includes(food));
  assert.equal(new Set(connected).size, connected.length);
  getTile(world, 18, 8)!.terrain = "water";
  assert.equal(findSettlementSite(world, origin, 300), null);
  assert.equal(world.rng, rng);
  assert.equal(world.tiles.length, cells);
});

test("format-12 migration retains actual goods, escrow and every other saved value at its boundary", () => {
  const world = smallWorld(1847, 64, 64),
    store = new Store(":memory:");
  try {
    store.save(world);
    const old = structuredClone(world);
    old.version = 12;
    old.lawsVersion = "biosphere-1.6";
    const [from, to] = old.civilizations,
      person = old.citizens[0];
    person.provisions = 3;
    person.metabolism.intake = 0.4;
    person.cargo = { material: "wood", amount: 4 };
    from.stock.biomass -= 5.4;
    from.stock.wood -= 4;
    to.stock.wood -= 1;
    old.caravans = [
      {
        id: "retained-escrow",
        from: from.id,
        to: to.id,
        x: from.x,
        y: from.y,
        path: [],
        offer: { material: "biomass", amount: 2 },
        receive: { material: "wood", amount: 1 },
        departedTick: old.tick,
        kind: "trade",
        stage: "legacy",
        partyIds: [],
        provisions: 0,
        request: null,
        messageId: null,
        accordId: null,
        returnContact: null,
        result: "An already escrowed exchange",
      },
    ];
    const { tiles, ...metadata } = old,
      json = JSON.stringify(metadata);
    store.db
      .prepare("UPDATE world SET json=?,checksum=?")
      .run(json, digest(json));
    const original = JSON.stringify(old),
      migrated = migrateWorld(old);
    assert.equal(JSON.stringify(old), original);
    assert.deepEqual(migrated.world, {
      ...old,
      version: 17,
      lawsVersion: "biosphere-1.11",
    });
    assert.deepEqual(
      migrated.interventions.map((i) => i.id),
      [
        "013-local-inventory-exposure-and-access",
        "014-performed-local-food-handoff",
        "015-age-bounded-structural-growth",
        "016-performed-resource-harvesting",
        "017-contact-from-actual-movement",
      ],
    );
    const loaded = store.load(0, true);
    assert.deepEqual(loaded, migrated.world);
    const [archive] = verifyWorldArchives(store.db);
    assert.equal(
      archive.id,
      "013-local-inventory-exposure-and-access+014-performed-local-food-handoff+015-age-bounded-structural-growth+016-performed-resource-harvesting+017-contact-from-actual-movement",
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
    assert.equal(store.interventions().length, 5);
  } finally {
    store.close();
  }
});
