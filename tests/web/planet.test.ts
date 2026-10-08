import test from "node:test";
import assert from "node:assert/strict";
import {
  ELEMENTS,
  addElements,
  composition,
  elementPhase,
  totalElements,
} from "../../src/simulation/elements";
import {
  BIO_NUTRIENTS,
  CHEMISTRY,
  CO2,
  ORGANIC,
  WATER,
  elementLedger,
  elementalErrors,
  oxygenFraction,
} from "../../src/simulation/chemistry";
import {
  astronomy,
  celestialState,
  LUNAR_PERIOD,
  LONGITUDE_TILES,
  ORBITAL_PERIOD,
  PLANET,
  climatePrior,
  saturationVapor,
} from "../../src/simulation/planet";
import { smallWorld as createWorld } from "./fixtures";
import { stepWorld, validateWorld } from "../../src/simulation/engine";
import { equilibrateCloud, updateWeather } from "../../src/simulation/weather";
import { updateEcology } from "../../src/simulation/ecology";
import { updateGeology } from "../../src/simulation/geology";
import { generateTile } from "../../src/simulation/terrain";
import { ledger, respirable, respire } from "../../src/simulation/laws";
import { updateCitizen } from "../../src/simulation/citizens";
import type { ElementMass, World } from "../../src/simulation/types";

function rebase(world: World): void {
  const mass = ledger(world);
  world.initialMatter = {
    carbon: mass.carbon,
    mineral: mass.mineral,
    water: mass.water,
  };
  world.energy = { captured: 0, released: 0, initialChemical: mass.chemical };
  world.boundary = { carbon: 0, mineral: 0, water: 0, chemical: 0 };
  world.initialElements = elementLedger(world);
  world.incomingElements = {};
}

test("118 elements, valid formulas, and atom-balanced aerobic chemistry", () => {
  assert.equal(ELEMENTS.length, 118);
  assert.deepEqual(
    ELEMENTS.map((e) => e.number),
    Array.from({ length: 118 }, (_, i) => i + 1),
  );
  assert.throws(() => composition("Unobtainium4"));
  assert.throws(() => composition("H2O)"));
  assert.ok(Math.abs(totalElements(composition("Al2Si2O5(OH)4")) - 1) < 1e-12);
  const before: ElementMass = {},
    after: ElementMass = {};
  addElements(before, CO2, CHEMISTRY.co2PerOrganic);
  addElements(before, WATER, CHEMISTRY.waterPerOrganic);
  addElements(after, ORGANIC);
  addElements(after, { O: 1 }, CHEMISTRY.oxygenPerOrganic);
  for (const symbol of Object.keys(before))
    assert.ok(Math.abs(before[symbol] - after[symbol]) < 1e-12, symbol);
  assert.equal(elementPhase("Fe", 300), "solid");
  assert.equal(elementPhase("Fe", 4000), "gas");
});

test("stellar orbit and obliquity cause day/night and seasons; the moon moves and drives tides", () => {
  assert.ok(PLANET.ageYears > 4e9);
  assert.ok(ORBITAL_PERIOD > 365 && ORBITAL_PERIOD < 366);
  assert.ok(LUNAR_PERIOD > 27 && LUNAR_PERIOD < 28);
  const midnight = astronomy(0),
    noon = astronomy(48);
  assert.equal(midnight.irradiance, 0);
  assert.ok(noon.irradiance > 800);
  const summer = astronomy((ORBITAL_PERIOD * 96) / 4 + 48),
    winter = astronomy(ORBITAL_PERIOD * 96 * 0.75 + 48);
  assert.ok(summer.daylight > 15);
  assert.ok(winter.daylight < 9);
  assert.notDeepEqual(
    celestialState(0).planetPosition,
    celestialState(96).planetPosition,
  );
  assert.notDeepEqual(
    celestialState(0).moonPosition,
    celestialState(96).moonPosition,
  );
  assert.ok(Math.abs(midnight.tide - astronomy(24).tide) > 0.02);
  assert.deepEqual(
    generateTile(42, 20, 25),
    generateTile(42, 20 + LONGITUDE_TILES, 25),
  );
  assert.ok(climatePrior(0, 0, 0.3).temperature > 5);
});

test("oxygen depletion prevents aerobic fuel use and harms living people", () => {
  const world = createWorld(18, 64, 64);
  assert.ok(oxygenFraction(world) > 0.2 && oxygenFraction(world) < 0.22);
  world.atmosphere.oxygen = 0;
  rebase(world);
  assert.equal(respirable(world, 1), 0);
  assert.throws(() => respire(world, 1), /oxygen/);
  const person = world.citizens[0],
    health = person.health;
  updateCitizen(world, person, world.civilizations[0], 8);
  assert.ok(person.health < health);
  validateWorld(world);
});

test("individual nutrient absence limits life even when other soil elements remain plentiful", () => {
  const control = createWorld(18, 64, 64);
  control.tick = 48;
  updateEcology(control);
  assert.ok(control.energy.captured > 0);
  for (const missing of ["N", "P"]) {
    const world = createWorld(18, 64, 64);
    world.tick = 48;
    world.atmosphere.nitrogen = 0;
    for (const tile of world.tiles) {
      tile.nutrients[missing] = 0;
      tile.mineral = totalElements(tile.nutrients);
      tile.detritus.mineral = 0;
      tile.rock = 0;
    }
    rebase(world);
    updateEcology(world);
    assert.equal(world.energy.captured, 0, `Growth without ${missing}`);
    validateWorld(world);
  }
});

test("cloud condensation conserves water and couples saturation to released latent heat", () => {
  const tile = generateTile(42, 20, 25);
  tile.temperature = 7;
  tile.air.vapor = saturationVapor(7) * 1.8;
  const water = tile.air.vapor + tile.air.cloud,
    initialTemperature = tile.temperature;
  equilibrateCloud(tile, 150000);
  assert.ok(tile.air.cloud > 0);
  assert.ok(tile.temperature > initialTemperature);
  assert.ok(Math.abs(tile.air.vapor + tile.air.cloud - water) < 1e-9);
  assert.ok(
    Math.abs(tile.air.vapor / saturationVapor(tile.temperature) - 1) < 0.00001,
  );
});

test("wind lifts finite rock dust and rain deposits its phosphorus in a remote forest", () => {
  const world = createWorld(18, 64, 64);
  world.tick = 48;
  const dry = world.tiles.find((t) => t.terrain === "hill")!;
  const forest = world.tiles.find(
    (t) => t.plant && Math.hypot(t.x - dry.x, t.y - dry.y) > 10,
  )!;
  dry.plant = null;
  dry.water = 0;
  dry.temperature = 30;
  dry.air.windX = 15;
  // A pre-existing upper-air plume is part of this controlled initial condition.
  world.atmosphere.dust = 2000;
  forest.air.cloud = 300;
  forest.air.vapor = saturationVapor(forest.temperature);
  rebase(world);
  const rock = dry.rock,
    phosphorus = forest.nutrients.P;
  updateWeather(world);
  assert.ok(dry.rock < rock);
  assert.ok(world.climate.dustLifted > 0);
  assert.ok(forest.air.rain > 0);
  assert.ok(forest.nutrients.P > phosphorus);
  assert.ok(world.climate.dustDeposited > 0);
  validateWorld(world);
});

test("forests return actual soil water to the atmosphere and all modeled elements survive the feedback", () => {
  const world = createWorld(33, 64, 64);
  world.tick = 48;
  rebase(world);
  updateEcology(world);
  assert.ok(world.climate.transpired > 0);
  assert.ok(world.atmosphere.oxygen !== 239130 * world.tiles.length);
  assert.ok(elementalErrors(world).relative < 1e-10);
  validateWorld(world);
});

test("tectonic strain, weathering, and exposed minerals are slow physical consequences", () => {
  const world = createWorld(4, 64, 64),
    chunk = world.chunks[0];
  chunk.geology.convergence = 8;
  chunk.geology.boundaryDistance = 0;
  chunk.geology.stress = 0.999999;
  const original = {
    elevation: world.tiles[0].elevation,
    rock: world.tiles[0].rock,
    exposed: totalElements(chunk.geology.exposed),
  };
  world.tick = 96;
  updateGeology(world);
  assert.ok(chunk.geology.uplift > 0 && chunk.geology.uplift < 0.001);
  assert.ok(world.tiles[0].elevation > original.elevation);
  assert.ok(world.tiles[0].rock < original.rock);
  assert.ok(totalElements(chunk.geology.exposed) > original.exposed);
  assert.equal(chunk.geology.earthquakes, 1);
  validateWorld(world);
});

test("birth after a completed gestation transfers existing matter and retains inherited parentage", () => {
  const world = createWorld(33, 64, 64),
    [parent, partner] = world.citizens;
  parent.pregnancy = {
    partner: {
      id: partner.id,
      name: partner.name,
      generation: partner.generation,
      traits: { ...partner.traits },
    },
    dueTick: 96,
  };
  stepWorld(world, 96);
  validateWorld(world);
  assert.equal(world.births, 1);
  const child = world.citizens.find((p) => p.parentIds.includes(parent.id))!;
  assert.equal(child.generation, 1);
  assert.ok(child.parentIds.includes(partner.id));
});

test("the element ledger catches invented trace matter as well as bulk resources", () => {
  const world = createWorld(19, 64, 64);
  world.chunks[0].geology.exposed.Au += 0.1;
  assert.throws(() => validateWorld(world), /elemental conservation/);
});
