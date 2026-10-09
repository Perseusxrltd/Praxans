import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorld,
  getTile,
  peopleOf,
  tileIndex,
} from "../../src/simulation/world";
import { FOUNDING } from "../../src/simulation/founding";
import { stepWorld, validateWorld } from "../../src/simulation/engine";
import {
  groundDistanceMetres,
  PLANET,
  LONGITUDE_TILES,
} from "../../src/simulation/planet";
import { updateCitizen } from "../../src/simulation/citizens";
import { smallWorld } from "./fixtures";
import {
  campTiles,
  campRestPlace,
  canReachCampStocks,
} from "../../src/simulation/settlement";
import { decayStocks } from "../../src/simulation/weathering";
import { elementLedger } from "../../src/simulation/chemistry";
import { initializeFounders } from "../../src/simulation/world";

test("production founding represents three hundred distinct adults and finite material per community", (t) => {
  const started = performance.now();
  const world = createWorld(1847, 64, 64);
  assert.equal(FOUNDING.people, 300);
  assert.equal(world.civilizations.length, 3);
  assert.equal(world.citizens.length, 900);
  assert.equal(new Set(world.citizens.map((p) => p.id)).size, 900);
  for (const civ of world.civilizations) {
    const people = peopleOf(world, civ.id);
    assert.equal(people.length, 300);
    assert.equal(civ.stock.biomass, 14_400);
    assert.equal(
      civ.stock.fiber + people.reduce((sum, p) => sum + p.wrapMass, 0),
      1_200,
    );
    assert.ok(
      people.every(
        (p) => p.age >= 18 && getTile(world, p.x, p.y)?.terrain !== "water",
      ),
    );
    assert.ok(
      new Set(
        people.map((p) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`),
      ).size > 250,
    );
    const mean = 0.6;
    const covariance = people.reduce(
      (sum, p) =>
        sum + (p.traits.diligence - mean) * (p.traits.sociability - mean),
      0,
    );
    const variance = people.reduce(
      (sum, p) => sum + (p.traits.diligence - mean) ** 2,
      0,
    );
    assert.ok(
      Math.abs(covariance / variance) < 0.3,
      "trait dimensions must not become the same ordering at larger counts",
    );
  }
  const stepping = performance.now();
  stepWorld(world, 32);
  validateWorld(world);
  assert.equal(world.citizens.length, 900);
  t.diagnostic(
    JSON.stringify({
      people: 900,
      setupMs: stepping - started,
      ticks: 32,
      stepMs: performance.now() - stepping,
    }),
  );
});

test("ground distance respects latitude and the date line", () => {
  const yAt = (degrees: number) =>
    ((Math.SQRT1_2 - Math.sin((degrees * Math.PI) / 180)) * PLANET.radius) /
    (PLANET.tileSide * Math.SQRT1_2);
  const east = (latitude: number) =>
    groundDistanceMetres(
      { x: 0, y: yAt(latitude) },
      { x: 1, y: yAt(latitude) },
    );
  assert.ok(Math.abs(east(0) - Math.sqrt(200)) < 0.001);
  assert.ok(Math.abs(east(60) - Math.sqrt(50)) < 0.001);
  assert.ok(
    Math.abs(
      groundDistanceMetres(
        { x: LONGITUDE_TILES / 2 - 1, y: 0 },
        { x: -LONGITUDE_TILES / 2, y: 0 },
      ) - 10,
    ) < 0.001,
  );
});

test("large camps distribute rest and exposed stock decay over connected land without losing material", () => {
  const world = smallWorld(1847, 64, 64),
    civ = world.civilizations[0];
  world.citizens = world.citizens.filter((p) => p.civId !== civ.id);
  initializeFounders(world, civ, 300);
  civ.stock.biomass = 144_000;
  const cells = campTiles(world, civ),
    people = peopleOf(world, civ.id);
  assert.ok(cells.length > 30);
  const positions = people.map((p) =>
    campRestPlace(world, civ, p, people.length),
  );
  assert.ok(new Set(positions).size > 25);
  for (const [index, person] of people.entries()) {
    person.x = positions[index].x;
    person.y = positions[index].y;
    assert.ok(canReachCampStocks(world, civ, person));
  }
  const before = elementLedger(world),
    litter = cells.map((t) => t.detritus.carbon);
  decayStocks(world, civ);
  assert.ok(cells.every((tile, index) => tile.detritus.carbon > litter[index]));
  const after = elementLedger(world);
  for (const symbol of Object.keys(before))
    assert.ok(Math.abs(after[symbol] - before[symbol]) < 1e-5, symbol);
});

test("gathering can follow personally observed food beyond the former tiny camp radius", () => {
  const world = smallWorld(1847, 64, 64),
    civ = world.civilizations[0],
    person = world.citizens[0];
  world.tick = 49;
  person.x = civ.x;
  person.y = civ.y;
  person.task = null;
  person.mind.sleepPressure = 0;
  person.hunger = 85;
  person.energy = 95;
  person.hydration = 8;
  civ.stock.biomass = 0;
  for (let x = civ.x; x <= civ.x + 20; x++)
    getTile(world, x, civ.y)!.terrain = "meadow";
  const target = getTile(world, civ.x + 20, civ.y)!;
  person.mind.places = [
    {
      x: target.x,
      y: target.y,
      tick: world.tick,
      food: 40,
      wood: 0,
      fiber: 0,
      stone: 0,
      clay: 0,
    },
  ];
  updateCitizen(world, person, civ, 8);
  const task = world.citizens[0].task;
  assert.equal(task?.kind, "gather");
  assert.equal(task?.tile, tileIndex(world, target.x, target.y));
});

test("camp access cannot cross a diagonal water gap", () => {
  const world = smallWorld(1847, 64, 64),
    civ = world.civilizations[0],
    person = world.citizens[0];
  for (let y = civ.y - 4; y <= civ.y + 4; y++)
    for (let x = civ.x - 4; x <= civ.x + 4; x++) {
      const tile = getTile(world, x, y);
      if (tile) tile.terrain = "water";
    }
  getTile(world, civ.x, civ.y)!.terrain = "meadow";
  getTile(world, civ.x + 1, civ.y + 1)!.terrain = "meadow";
  person.x = civ.x + 1;
  person.y = civ.y + 1;
  assert.equal(campTiles(world, civ).length, 1);
  assert.equal(canReachCampStocks(world, civ, person), false);
  person.x = civ.x;
  person.y = civ.y;
  assert.equal(canReachCampStocks(world, civ, person), true);
});
