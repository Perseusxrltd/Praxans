import test from "node:test";
import assert from "node:assert/strict";
import { shelter, smallWorld } from "./fixtures";
import {
  createWorld,
  findPath,
  getTile,
  peopleOf,
  tileIndex,
} from "../../src/simulation/world";
import { stepWorld, validateWorld } from "../../src/simulation/engine";
import {
  canAfford,
  designScore,
  requestAssembly,
  RuleError,
  runExperiment,
} from "../../src/simulation/economy";
import { evaluateDesign, ledger } from "../../src/simulation/laws";
import type { Design } from "../../src/simulation/types";
import { updateCitizen } from "../../src/simulation/citizens";
import { foodReservePerPerson } from "../../src/simulation/subsistence";
import { random } from "../../src/simulation/random";

const large: Design = {
  name: "Larger load trial",
  components: [
    {
      material: "wood",
      x: 0,
      y: 0,
      z: 0,
      width: 0.5,
      depth: 0.5,
      height: 1.8,
    },
    {
      material: "wood",
      x: -2.75,
      y: -2.75,
      z: 1.8,
      width: 6,
      depth: 6,
      height: 0.1,
    },
  ],
};

function planningWorld() {
  // Pool existing founder wood; the test neither adds matter nor relaxes the
  // assembly limit to make its larger, higher-scoring observation affordable.
  const world = createWorld(1847, 64, 64, "planet-1", 64),
    civ = world.civilizations[0],
    person = world.citizens.find((p) => p.civId === civ.id)!;
  for (const other of world.civilizations.slice(1)) {
    civ.stock.wood += other.stock.wood;
    other.stock.wood = 0;
  }
  assert.equal(runExperiment(world, civ, large, person), true);
  assert.equal(runExperiment(world, civ, shelter, person), true);
  world.tick = 63;
  civ.lastBuildingTick = 0;
  for (const resident of world.citizens)
    resident.task = {
      kind: "rest",
      tile: tileIndex(world, resident.x, resident.y),
      path: [],
      progress: 0,
    };
  validateWorld(world);
  return { world, civ };
}

test("an oversized but affordable assembly is rejected without spending matter, work, IDs or randomness", () => {
  const { world, civ } = planningWorld(),
    properties = evaluateDesign(large),
    before = JSON.stringify(world);
  assert.equal(properties.stable, true);
  assert.ok(properties.mass > 1600);
  assert.ok(canAfford(civ.stock, properties.cost));
  assert.throws(
    () => requestAssembly(world, civ, large),
    (error) => error instanceof RuleError && error.message.includes("1,600"),
  );
  assert.equal(JSON.stringify(world), before);
});

test("an infeasible preferred observation does not block a remembered buildable alternative", () => {
  const { world, civ } = planningWorld(),
    properties = evaluateDesign(shelter),
    control = structuredClone(world);
  assert.ok(designScore(evaluateDesign(large)) > designScore(properties));
  // The control performs the same physical tick, with planning on cooldown.
  control.civilizations[0].lastBuildingTick = control.tick;
  stepWorld(control);
  stepWorld(world);
  const projects = world.structures.filter((s) => s.civId === civ.id);
  assert.equal(projects.length, 1);
  assert.deepEqual(projects[0].design.components, shelter.components);
  assert.equal(
    projects[0].progress,
    0,
    "starting a project does not do its work",
  );
  assert.equal(
    civ.stock.wood,
    control.civilizations[0].stock.wood - properties.cost.wood,
    "reserve only the successful alternative's actual material, exactly once",
  );
  assert.equal(world.rng, control.rng, "request rejection consumes no RNG");
  assert.equal(world.events.length, control.events.length + 1);
  assert.equal(world.events.at(-1)?.category, "building");
  assert.equal(world.events.at(-1)?.civId, civ.id);
  assert.equal(civ.lastBuildingTick, world.tick);
  assert.equal(
    civ.observations.length,
    2,
    "a rejected design is not forgotten",
  );
  const actualMatter = ledger(world),
    controlMatter = ledger(control);
  for (const element of ["carbon", "water", "mineral"] as const)
    assert.ok(Math.abs(actualMatter[element] - controlMatter[element]) < 1e-6);
  validateWorld(world);
});

test("planning respects who remembers an alternative and keeps the failed-attempt cooldown", () => {
  const { world, civ } = planningWorld(),
    alternative = civ.observations[1];
  for (const person of world.citizens)
    person.mind.knowledge = person.mind.knowledge.filter(
      (trace) => trace.id !== alternative.id,
    );
  const control = structuredClone(world);
  control.civilizations[0].lastBuildingTick = control.tick;
  stepWorld(control);
  stepWorld(world);
  assert.equal(world.structures.length, 0);
  assert.deepEqual(civ.stock, control.civilizations[0].stock);
  assert.equal(world.nextId, control.nextId);
  assert.equal(world.rng, control.rng);
  assert.equal(civ.lastBuildingTick, world.tick);
  validateWorld(world);
});

function laborWorld(urgent: boolean) {
  const world = smallWorld(1847, 64, 64),
    civ = world.civilizations[0],
    person = world.citizens[0],
    population = peopleOf(world, civ.id).length;
  world.tick = 49; // Daylight, before the next hourly perception/disease draw.
  civ.focus = "balance";
  person.x = civ.x;
  person.y = civ.y;
  person.task = null;
  person.mind.sleepPressure = 0;
  person.hunger = 85;
  person.energy = 95;
  getTile(world, civ.x, civ.y)!.water -= 8 - person.hydration;
  person.hydration = 8;
  civ.stock.biomass -= 3 - person.provisions;
  person.provisions = 3;
  requestAssembly(world, civ, shelter);
  const project = world.structures[0],
    food = world.tiles.find(
      (tile) =>
        tile.terrain !== "water" &&
        tile.forage > 2 &&
        Math.hypot(tile.x - civ.x, tile.y - civ.y) > 0.5 &&
        Math.hypot(tile.x - civ.x, tile.y - civ.y) < 7 &&
        findPath(world, person, tile, 1100),
    )!;
  assert.ok(food);
  assert.ok(findPath(world, person, project, 1100)?.length);
  person.mind.places = [
    {
      x: food.x,
      y: food.y,
      tick: world.tick,
      food: food.forage,
      wood: 0,
      fiber: 0,
      stone: 0,
      clay: 0,
    },
  ];
  const urgentThreshold = population * (2 + civ.policies.sharing * 2),
    reserve = population * foodReservePerPerson(world, civ),
    stock = urgent ? urgentThreshold / 2 : (urgentThreshold + reserve) / 2;
  assert.ok(reserve > urgentThreshold);
  // Transfer surplus to another camp rather than inventing/removing food.
  world.civilizations[1].stock.biomass += civ.stock.biomass - stock;
  civ.stock.biomass = stock;
  world.rng = 3; // First draw is 0.7202267837710679: reserve-food is declined.
  validateWorld(world);
  return { world, civ, person, population, project, food };
}

test("reserving food leaves a feasible non-build project available to a willing adult", () => {
  const { world, civ, person, population, project } = laborWorld(false),
    before = ledger(world),
    wood = civ.stock.wood,
    expected = { rng: world.rng };
  random(expected);
  updateCitizen(world, person, civ, population);
  assert.equal(person.task?.kind, "assemble");
  assert.equal(person.task?.structureId, project.id);
  assert.equal(project.progress, 0, "walking to work does not finish it");
  assert.equal(
    civ.stock.wood,
    wood,
    "assembly does not reserve material twice",
  );
  assert.equal(world.rng, expected.rng, "one lottery draw for this decision");
  const after = ledger(world);
  for (const element of ["carbon", "water", "mineral"] as const)
    assert.ok(Math.abs(after[element] - before[element]) < 1e-6, element);
  validateWorld(world);
});

test("urgent food gathering still takes priority over the same feasible project", () => {
  const { world, civ, person, population, project, food } = laborWorld(true),
    expected = { rng: world.rng };
  random(expected);
  updateCitizen(world, person, civ, population);
  assert.equal(person.task?.kind, "gather");
  assert.equal(person.task?.material, "biomass");
  assert.equal(person.task?.tile, tileIndex(world, food.x, food.y));
  assert.equal(project.progress, 0);
  assert.equal(world.rng, expected.rng);
  validateWorld(world);
});

test("an unreachable remembered food patch does not consume the chance to do reachable work", () => {
  const { world, civ, person, population, project, food } = laborWorld(false);
  // Keep a small connected island containing the project. The remembered
  // food and every unexplored alternative within the search radius are cut off.
  for (const tile of world.tiles) {
    const radius = Math.hypot(tile.x - civ.x, tile.y - civ.y);
    if (radius > 2 && radius <= 11) tile.terrain = "water";
  }
  assert.equal(findPath(world, person, food, 1100), null);
  assert.ok(findPath(world, person, project, 1100)?.length);
  world.rng = 7; // Selects the food attempt, which cannot assign a task.
  const expected = { rng: world.rng };
  assert.ok(random(expected) < 0.65);
  updateCitizen(world, person, civ, population);
  assert.equal(person.task?.kind, "assemble");
  assert.equal(person.task?.structureId, project.id);
  assert.equal(world.rng, expected.rng);
  assert.equal(project.progress, 0);
});
