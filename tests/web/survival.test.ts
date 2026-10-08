import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorld,
  getTile,
  tileIndex,
  findPath,
  distance,
} from "../../src/simulation/world";
import { updateCitizen } from "../../src/simulation/citizens";
import { elementLedger } from "../../src/simulation/chemistry";
import { built } from "./fixtures";

test("nourishment and fatigue interrupt unfinished work while material progress stays intact", () => {
  for (const need of ["food", "rest"] as const) {
    const world = createWorld(1847, 64, 64);
    world.tick = 48;
    const civ = world.civilizations[0],
      person = world.citizens[0];
    const site = world.tiles.find(
      (tile) =>
        tile.terrain !== "water" &&
        distance(tile, civ) > 4 &&
        distance(tile, civ) < 5 &&
        findPath(world, civ, tile),
    )!;
    assert.ok(site);
    const structure = built(world);
    structure.x = site.x;
    structure.y = site.y;
    structure.progress = 0.25;
    person.x = site.x;
    person.y = site.y;
    person.hunger = need === "food" ? 20 : 85;
    person.energy = need === "rest" ? 15 : 80;
    person.mind.sleepPressure = 0.1;
    person.task = {
      kind: "assemble",
      tile: tileIndex(world, site.x, site.y),
      path: [],
      progress: 0,
      structureId: structure.id,
    };
    const material = structuredClone(structure.properties.cost);
    updateCitizen(world, person, civ, 8);
    assert.ok(person.task?.kind === "move" || person.task?.kind === "rest");
    assert.equal(structure.progress, 0.25);
    assert.deepEqual(structure.properties.cost, material);
    if (need === "food") {
      for (let n = 0; n < 96 && person.hunger < 62; n++) {
        world.tick++;
        updateCitizen(world, person, civ, 8);
      }
      assert.ok(person.hunger >= 62, "the worker returns and actually eats");
      assert.ok(person.health > 90);
    }
  }
});

test("small rations and carried food can sustain a person without creating matter", () => {
  for (const location of ["home", "away"] as const) {
    const world = createWorld(1847, 64, 64);
    world.tick = 48;
    const civ = world.civilizations[0],
      person = world.citizens[0];
    person.hunger = 20;
    person.body = 18;
    if (location === "home") {
      world.civilizations[1].stock.biomass += civ.stock.biomass - 0.3;
      civ.stock.biomass = 0.3;
      person.x = civ.x;
      person.y = civ.y;
    } else {
      person.x = civ.x + 5;
      person.y = civ.y;
      assert.ok(getTile(world, person.x, person.y));
      civ.stock.biomass -= 0.3;
      person.cargo = { material: "biomass", amount: 0.3 };
    }
    const before = elementLedger(world);
    updateCitizen(world, person, civ, 8);
    assert.ok(
      person.hunger > 30,
      "less than the old meal threshold is still usable food",
    );
    if (location === "home") assert.equal(civ.stock.biomass, 0);
    else assert.equal(person.cargo, null);
    const after = elementLedger(world);
    for (const symbol of Object.keys(before))
      assert.ok(Math.abs(before[symbol] - after[symbol]) < 1e-5, symbol);
  }
});
