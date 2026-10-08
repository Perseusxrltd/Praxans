import test from "node:test";
import assert from "node:assert/strict";
import { getTile } from "../../src/simulation/world";
import { smallWorld as createWorld } from "./fixtures";
import { elementLedger } from "../../src/simulation/chemistry";
import { FAUNA_BY_ID, habitatSuitability } from "../../src/simulation/life";
import {
  eatPlant,
  hunt,
  pollinate,
  updateFauna,
} from "../../src/simulation/fauna";
import { seedPlant } from "../../src/simulation/ecology";
import { ledger } from "../../src/simulation/laws";
import type { ElementMass, World } from "../../src/simulation/types";

function conserved(world: World, before: ElementMass) {
  const after = elementLedger(world);
  for (const symbol of new Set([...Object.keys(before), ...Object.keys(after)]))
    assert.ok(
      Math.abs((after[symbol] ?? 0) - (before[symbol] ?? 0)) <
        Math.max(1e-7, (before[symbol] ?? 0) * 1e-12),
      `${symbol} must move between organisms and their environment`,
    );
}
test("the mature biosphere has diverse niches, with aquatic animals in water and suitable habitats", () => {
  const world = createWorld(1847, 64, 64);
  assert.ok(new Set(world.animals.map((a) => a.species)).size >= 15);
  assert.ok(
    new Set(
      world.tiles
        .flatMap((t) => [t.plant?.lineage, t.groundcover?.lineage])
        .filter((n) => n !== undefined),
    ).size >= 14,
  );
  for (const animal of world.animals) {
    const tile = getTile(world, animal.x, animal.y)!;
    assert.ok(habitatSuitability(FAUNA_BY_ID[animal.species], tile) >= 0.25);
    if (FAUNA_BY_ID[animal.species].habitat === "water")
      assert.equal(tile.terrain, "water");
  }
  world.animals = [];
  for (let i = 0; i < 24; i++) updateFauna(world);
  assert.equal(
    world.animals.length,
    0,
    "empty populations do not automatically regenerate",
  );
});
test("pollinator visits enable flowering reproduction, funded by the parent plant", () => {
  const world = createWorld(1847, 64, 64),
    bee = world.animals.find((a) => a.species === "bee")!;
  const source = world.tiles.find(
    (t) => t.plant && t.plant.genome.pollination > 0.5,
  )!;
  const target = world.tiles.find((t) => !t.plant && t.terrain === "hill")!;
  assert.ok(bee && source && target);
  const before = elementLedger(world),
    carbon = source.plant!.carbon;
  assert.equal(seedPlant(world, source, target), false);
  pollinate(world, bee, source);
  assert.ok(source.pollination >= 0.2);
  assert.equal(seedPlant(world, source, target), true);
  assert.ok(source.plant!.carbon < carbon);
  assert.equal(target.seedBank[0].generation, source.plant!.generation + 1);
  conserved(world, before);
});
test("grazing and predation transfer finite tissue, water and waste through the food web", () => {
  const world = createWorld(1847, 64, 64),
    grazer = world.animals.find((a) => a.species === "vole")!;
  const tile = world.tiles.find((t) => t.terrain === "meadow" && t.forage > 8)!;
  grazer.x = tile.x;
  grazer.y = tile.y;
  let before = elementLedger(world),
    body = grazer.body;
  assert.ok(eatPlant(grazer, tile, 0.04) > 0);
  assert.ok(grazer.body > body);
  conserved(world, before);
  const predator = world.animals.find(
    (a) =>
      FAUNA_BY_ID[a.species].diet === "predator" &&
      FAUNA_BY_ID[a.species].dryMass > 0.01 &&
      FAUNA_BY_ID[a.species].habitat !== "water",
  )!;
  predator.x = grazer.x;
  predator.y = grazer.y;
  before = elementLedger(world);
  const count = grazer.count;
  body = predator.body;
  assert.ok(hunt(world, predator, grazer, tile, 0.002) > 0);
  assert.ok(grazer.count < count);
  assert.ok(predator.body > body);
  assert.ok(world.ecology.predation > 0);
  conserved(world, before);
});
test("dissolved oxygen loss kills aquatic cohorts even when the atmosphere remains oxygenated", () => {
  const healthy = createWorld(1847, 64, 64),
    depleted = structuredClone(healthy);
  for (const world of [healthy, depleted])
    world.animals = world.animals.filter(
      (a) => FAUNA_BY_ID[a.species].habitat === "water",
    );
  for (const tile of depleted.tiles) {
    depleted.atmosphere.oxygen += tile.dissolvedOxygen;
    tile.dissolvedOxygen = 0;
  }
  const before = elementLedger(depleted);
  for (let hour = 0; hour < 16; hour++) {
    updateFauna(healthy);
    updateFauna(depleted);
  }
  assert.ok(healthy.animals.length > 0);
  assert.equal(depleted.animals.length, 0);
  assert.ok(depleted.atmosphere.oxygen > 0);
  conserved(depleted, before);
});
test("animal offspring share existing stored tissue instead of adding biological matter", () => {
  const world = createWorld(1847, 64, 64),
    animal = world.animals.find((a) => a.species === "vole")!;
  world.animals = [animal];
  const tile = world.tiles.find((t) => t.terrain === "meadow" && t.forage > 8)!;
  animal.x = tile.x;
  animal.y = tile.y;
  eatPlant(animal, tile, animal.body * 0.6);
  animal.lastBirthTick = -100000;
  const count = animal.count,
    before = elementLedger(world),
    energy =
      ledger(world).chemical + world.energy.released - world.energy.captured;
  updateFauna(world);
  assert.ok(animal.count > count);
  assert.ok(animal.generation > 0);
  conserved(world, before);
  assert.ok(
    Math.abs(
      ledger(world).chemical +
        world.energy.released -
        world.energy.captured -
        energy,
    ) < 0.1,
  );
});
test("foraging birds carry inherited propagules into real gaps in vegetation", () => {
  const world = createWorld(1847, 64, 64),
    bird = world.animals.find((a) => a.species === "songbird")!;
  assert.ok(bird);
  const source = world.tiles.find(
    (t) => t.terrain === "meadow" && t.plant && t.x > 20 && t.y > 15,
  )!;
  bird.x = source.x;
  bird.y = source.y;
  world.animals = [bird];
  source.pollination = 1;
  for (const tile of world.tiles)
    if (tile !== source)
      for (const layer of ["plant", "groundcover"] as const) {
        const plant = tile[layer];
        if (!plant) continue;
        tile.detritus.carbon += plant.carbon;
        tile.detritus.mineral += plant.mineral;
        tile[layer] = null;
      }
  const before = elementLedger(world);
  for (let hour = 0; hour < 30; hour++) {
    world.tick += 4;
    updateFauna(world);
  }
  assert.ok(world.ecology.dispersedSeeds > 0);
  assert.ok(
    world.tiles.some(
      (t) => t !== source && t.seedBank.some((seed) => seed.generation > 0),
    ),
  );
  conserved(world, before);
});
