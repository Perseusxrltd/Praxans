import test from "node:test";
import assert from "node:assert/strict";
import { smallWorld } from "./fixtures";
import { beginBodyWork } from "../../src/simulation/bodywork";
import {
  beginHarvestWork,
  finishHarvestWork,
  workOnHarvest,
} from "../../src/simulation/harvesting";
import { beginExperience } from "../../src/simulation/cognition";
import {
  addNutrients,
  availableMixture,
  CLAY,
  elementLedger,
} from "../../src/simulation/chemistry";
import { MATERIALS } from "../../src/simulation/content";
import { ledger, refreshTile } from "../../src/simulation/laws";
import { getTile, tileIndex } from "../../src/simulation/world";
import {
  updateCitizen,
  updateCitizens,
  processDeaths,
} from "../../src/simulation/citizens";
import { stepWorld, validateWorld } from "../../src/simulation/engine";
import { Store, digest } from "../../src/server/store";
import { migrateWorld } from "../../src/server/migrations";
import {
  verifyWorldArchives,
  worldArchiveBytes,
} from "../../src/server/archives";
import type { Citizen, Material, World } from "../../src/simulation/types";

function close(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected}`,
  );
}
function rebaseFixture(world: World) {
  // Newly constructed disposable fixture only; never repair a loaded ledger.
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
function fixture(materials: Material[] = ["biomass"], carbon = 4, mineral = 1) {
  const world = smallWorld(1847, 64, 64),
    civ = world.civilizations[0],
    tile = getTile(world, civ.x, civ.y)!;
  world.tick = 49;
  world.citizens = world.citizens.slice(0, materials.length);
  world.structures = [];
  world.animals = [];
  world.caravans = [];
  tile.plant = structuredClone(world.tiles.find((t) => t.plant)!.plant!);
  tile.plant.carbon = carbon;
  tile.plant.mineral = mineral;
  tile.plant.genome.woodiness = 0.4;
  tile.plant.genome.defense = 0.1;
  tile.groundcover = null;
  tile.temperature = 20;
  tile.water = 20;
  tile.rock = 20;
  civ.policies.extraction = 0.5;
  civ.focus = "balance";
  for (const [index, person] of world.citizens.entries()) {
    person.civId = civ.id;
    person.x = tile.x;
    person.y = tile.y;
    person.age = 30;
    person.skill = 0;
    person.health = 90;
    person.energy = 95;
    person.hunger = 90;
    person.hydration = 8;
    person.provisions = 3;
    person.metabolism.intake = 0.4;
    person.sick = 0;
    person.journeyId = null;
    person.mind.sleepPressure = 0;
    person.mind.sleeping = false;
    person.cargo = null;
    person.task = {
      kind: materials[index] === "biomass" ? "gather" : "extract",
      material: materials[index],
      tile: tileIndex(world, tile.x, tile.y),
      path: [],
      progress: 0,
    };
    beginExperience(person, person.task.kind, world.tick);
  }
  refreshTile(tile);
  rebaseFixture(world);
  return { world, civ, tile, person: world.citizens[0] };
}
function conserved(world: World, before: ReturnType<typeof elementLedger>) {
  const after = elementLedger(world);
  for (const key of Object.keys(before)) close(after[key], before[key], 1e-5);
  validateWorld(world);
}
function work(world: World, efforts: number[]) {
  const before = elementLedger(world),
    context = beginHarvestWork(world, beginBodyWork(world));
  for (const [i, person] of world.citizens.entries())
    workOnHarvest(world, person, efforts[i] ?? 0, context);
  finishHarvestWork(world, context);
  conserved(world, before);
  return context;
}

test("only new work earns finite products; old progress, zero work and duplicate claims earn no windfall", () => {
  const { world, person } = fixture(["biomass"], 100, 20);
  person.task!.progress = 2.2;
  const context = beginHarvestWork(world, beginBodyWork(world));
  for (const hours of [0, -1, NaN])
    workOnHarvest(world, person, hours, context);
  assert.equal(person.task!.progress, 2.2);
  assert.equal(person.cargo, null);
  workOnHarvest(world, person, 0.1, context);
  workOnHarvest(world, person, 0.1, context);
  finishHarvestWork(world, context);
  close(person.task!.progress, 2.3);
  close(person.cargo!.amount, 0.25);
  close(person.task!.harvestedKg!, 0.25);
  assert.throws(() => finishHarvestWork(world, context), /commit once/);
  assert.throws(
    () => workOnHarvest(world, person, 1, context),
    /before commit/,
  );
  world.tick++;
  work(world, [10]);
  close(person.task!.progress, 2.4);
  close(person.cargo!.amount, 0.5, 1e-8);
  close(person.task!.harvestedKg!, 0.5, 1e-8);
});

test("uncapped cumulative exposure matches the reference cut and its subdivisions", () => {
  const full = fixture(),
    split = fixture();
  work(full.world, [2.4]);
  for (let i = 0; i < 24; i++) {
    work(split.world, [0.1]);
    split.world.tick++;
  }
  const expected =
    (4 * (1 - 0.4) * (1 - 0.1) * 0.55) / MATERIALS.biomass.carbon;
  close(full.person.cargo!.amount, expected);
  close(split.person.cargo!.amount, expected);
  close(split.tile.plant!.carbon, full.tile.plant!.carbon);
  close(split.tile.plant!.mineral, full.tile.plant!.mineral);
});

test("mixed material attempts share the same organic and mineral pools without actor-order advantage", () => {
  for (const mineral of [1, 0.005]) {
    const a = fixture(["biomass", "wood", "fiber"], 2, mineral),
      b = fixture(["biomass", "wood", "fiber"], 2, mineral);
    b.world.citizens.reverse();
    work(a.world, [0.25, 0.1, 0.2]);
    work(b.world, [0.2, 0.1, 0.25]);
    const holdings = (world: World) =>
      world.citizens.map((p) => [p.id, p.cargo, p.task]).sort();
    assert.deepEqual(holdings(a.world), holdings(b.world));
    assert.deepEqual(a.tile.plant, b.tile.plant);
    let organic = 0,
      minerals = 0;
    for (const person of a.world.citizens) {
      assert.ok(person.cargo!.amount > 0);
      organic +=
        person.cargo!.amount * MATERIALS[person.cargo!.material].carbon;
      minerals +=
        person.cargo!.amount * MATERIALS[person.cargo!.material].mineral;
    }
    close(organic, 2 - a.tile.plant!.carbon);
    close(minerals, mineral - a.tile.plant!.mineral);
    if (mineral < 0.01) close(a.tile.plant!.mineral, 0);
  }
});

test("one worker has one handling budget across layers and homogeneous source splitting changes no yield", () => {
  for (const carbon of [4, 100]) {
    const one = fixture(["biomass"], carbon, 10),
      two = fixture(["biomass"], carbon, 10);
    two.tile.plant!.carbon /= 2;
    two.tile.plant!.mineral /= 2;
    two.tile.groundcover = structuredClone(two.tile.plant);
    refreshTile(two.tile);
    work(one.world, [0.25]);
    work(two.world, [0.25]);
    close(one.person.cargo!.amount, two.person.cargo!.amount);
    assert.ok(two.person.cargo!.amount <= 0.625 + 1e-12);
  }
});

test("a mineral-empty layer does not spend handling capacity on impossible products", () => {
  const one = fixture(["biomass"], 100, 20),
    two = fixture(["biomass"], 100, 20);
  two.tile.groundcover = two.tile.plant;
  two.tile.plant = structuredClone(two.tile.groundcover);
  two.tile.plant!.carbon = 1000000;
  two.tile.plant!.mineral = 0;
  refreshTile(two.tile);
  rebaseFixture(two.world);
  work(one.world, [0.25]);
  work(two.world, [0.25]);
  close(one.person.cargo!.amount, two.person.cargo!.amount);
  close(two.tile.plant!.carbon, 1000000);
});

test("mineral exhaustion matches constant handling rates across interval subdivisions", () => {
  const exhaustionHours = 0.08 / (0.06 * 2.5 + 0.01 * 4 + 0.02 * 4);
  for (const dt of [2.4, 0.25, 0.125, 0.03125]) {
    const f = fixture(["biomass", "wood", "fiber"], 1000, 0.08);
    let elapsed = 0;
    while (elapsed < 2.4 - 1e-12) {
      const h = Math.min(dt, 2.4 - elapsed);
      work(f.world, [h, h, h]);
      elapsed += h;
      f.world.tick++;
    }
    for (const [i, rate] of [2.5, 4, 4].entries())
      close(f.world.citizens[i].cargo!.amount, rate * exhaustionHours);
    close(f.tile.plant!.mineral, 0);
  }
});

test("tiny mineral reservoirs exhaust early without suppressing the viable understory", () => {
  const reference = fixture(["biomass"], 100, 20);
  work(reference.world, [0.25]);
  for (const mineral of [0, 1e-12, 1e-8]) {
    const f = fixture(["biomass"], 100, 20);
    f.tile.groundcover = f.tile.plant;
    f.tile.plant = structuredClone(f.tile.groundcover);
    f.tile.plant!.carbon = 1000000;
    f.tile.plant!.mineral = mineral;
    rebaseFixture(f.world);
    work(f.world, [0.25]);
    close(f.person.cargo!.amount, reference.person.cargo!.amount, 1e-7);
    assert.ok(f.person.cargo!.amount <= 0.625 + 1e-9);
  }
});

test("two differently accessible layers can exhaust in succession without another handling allowance", () => {
  for (const mineral of [0.015, 0.0375, 0.06]) {
    const f = fixture(["biomass"], 1000, mineral);
    f.tile.groundcover = structuredClone(f.tile.plant);
    f.tile.groundcover!.mineral = 0.015;
    f.tile.groundcover!.genome.defense = 0.3;
    rebaseFixture(f.world);
    work(f.world, [0.25]);
    close(f.person.cargo!.amount, Math.min(0.625, (mineral + 0.015) / 0.06));
    assert.ok(f.tile.plant!.mineral >= 0);
    assert.ok(f.tile.groundcover!.mineral >= 0);
  }
});

test("rock and clay competition use finite actual sources, including a scarce clay element", () => {
  for (const material of ["stone", "clay"] as const) {
    for (const source of [0, 0.6, 100]) {
      const f = fixture([material, material]);
      f.tile.rock = source;
      f.tile.nutrients = {};
      f.tile.mineral = 0;
      addNutrients(f.tile, CLAY, source);
      addNutrients(f.tile, { Na: 1 }, 10000);
      rebaseFixture(f.world);
      work(f.world, [0.25, 0.5]);
      const amounts = f.world.citizens.map((p) => p.cargo?.amount ?? 0),
        expected = Math.min(
          source,
          ((material === "stone" ? 8 : 5) * 0.75) / 3,
        );
      close(amounts[0] + amounts[1], expected);
      close(amounts[1], amounts[0] * 2);
      if (material === "clay") {
        close(availableMixture(f.tile, CLAY), source - expected);
        close(f.tile.nutrients.Na!, 10000);
      } else close(f.tile.rock, source - expected);
    }
  }
});

test("claims cannot follow moved, dead, removed, changed-task or incompatible-cargo actors", () => {
  for (const change of [
    "move",
    "die",
    "remove",
    "task",
    "material",
    "cargo",
  ] as const) {
    const f = fixture(),
      before = structuredClone(f.tile.plant),
      context = beginHarvestWork(f.world, beginBodyWork(f.world));
    workOnHarvest(f.world, f.person, 0.25, context);
    if (change === "move") f.person.x += 1;
    if (change === "die") f.person.health = 0;
    if (change === "remove") f.world.citizens = [];
    if (change === "task") f.person.task = { ...f.person.task! };
    if (change === "material") f.person.task!.material = "wood";
    if (change === "cargo") f.person.cargo = { material: "stone", amount: 2 };
    finishHarvestWork(f.world, context);
    assert.deepEqual(f.tile.plant, before, change);
    assert.equal(f.person.task!.harvestedKg, undefined, change);
    if (change === "cargo")
      assert.deepEqual(f.person.cargo, { material: "stone", amount: 2 });
    else assert.equal(f.person.cargo, null, change);
  }
});

test("replaced sources and later additions cannot fund a captured claim", () => {
  for (const mode of ["replacement", "addition", "depletion"] as const) {
    const f = fixture(),
      context = beginHarvestWork(f.world, beginBodyWork(f.world));
    workOnHarvest(f.world, f.person, 0.25, context);
    if (mode === "replacement") f.tile.plant = structuredClone(f.tile.plant);
    if (mode === "addition") f.tile.plant!.carbon += 1000;
    if (mode === "depletion") f.tile.plant!.carbon = 0;
    finishHarvestWork(f.world, context);
    if (mode !== "addition") assert.equal(f.person.cargo, null);
    else {
      const control = fixture();
      work(control.world, [0.25]);
      close(f.person.cargo!.amount, control.person.cargo!.amount);
    }
  }
  const f = fixture(["clay"]);
  f.tile.nutrients = {};
  f.tile.mineral = 0;
  const context = beginHarvestWork(f.world, beginBodyWork(f.world));
  workOnHarvest(f.world, f.person, 0.25, context);
  addNutrients(f.tile, CLAY, 100);
  finishHarvestWork(f.world, context);
  assert.equal(f.person.cargo, null);
  close(availableMixture(f.tile, CLAY), 100);
});

test("partial products persist through interruption, consumption, save/load and completion without a second payout", () => {
  const f = fixture(["biomass"], 100, 20),
    task = f.person.task!;
  f.person.provisions = 0;
  f.person.metabolism.intake = 0;
  f.civ.stock.biomass = 0;
  rebaseFixture(f.world);
  const act = () => updateCitizen(f.world, f.person, f.civ, 1);
  act();
  assert.equal(
    f.person.metabolism.last!.ingestedKg,
    0,
    "new harvest is after the meal boundary",
  );
  assert.ok(task.harvestedKg! > 0);
  close(f.person.cargo!.amount, task.harvestedKg!);
  const carbon = f.tile.plant!.carbon;
  task.progress = 2.4;
  f.world.tick++;
  act();
  assert.equal(f.person.task, null);
  close(f.tile.plant!.carbon, carbon, 1e-8);
  assert.ok(f.person.metabolism.last!.ingestedKg > 0);
  assert.ok((f.person.cargo?.amount ?? 0) < task.harvestedKg!);
  assert.equal(f.person.experience.gather, 1);
  const store = new Store(":memory:");
  try {
    store.save(f.world);
    assert.deepEqual(store.load(0, true), f.world);
  } finally {
    store.close();
  }

  const wood = fixture(["wood"], 100, 20);
  work(wood.world, [0.25]);
  const amount = wood.person.cargo!.amount;
  wood.person.task = {
    kind: "rest",
    tile: wood.person.task!.tile,
    path: [],
    progress: 0,
  };
  wood.world.tick++;
  updateCitizen(wood.world, wood.person, wood.civ, 1);
  close(wood.person.cargo!.amount, amount);
  const stock = wood.civ.stock.wood;
  wood.person.task = {
    kind: "deliver",
    tile: tileIndex(wood.world, wood.person.x, wood.person.y),
    path: [],
    progress: 0,
  };
  wood.world.tick++;
  updateCitizen(wood.world, wood.person, wood.civ, 1);
  close(wood.civ.stock.wood, stock + amount);
  assert.equal(wood.person.cargo, null);
});

test("unfunded physiology performs no harvesting even with abundant material", () => {
  const f = fixture(["wood"], 100, 20);
  f.person.provisions = 0;
  f.person.metabolism.intake = 0;
  f.person.metabolism.reserves = 0;
  f.civ.stock.biomass = 0;
  rebaseFixture(f.world);
  const before = structuredClone(f.tile.plant),
    task = f.person.task!;
  updateCitizen(f.world, f.person, f.civ, 1);
  assert.equal(f.person.metabolism.last!.activityFraction, 0);
  assert.equal(task.progress, 0);
  assert.deepEqual(f.tile.plant, before);
  assert.equal(f.person.cargo, null);
  validateWorld(f.world);
});

test("returning to a resource spends the interval traveling and cannot also earn a harvest", () => {
  const { world, civ, tile, person } = fixture(["wood"], 100, 20),
    origin = tileIndex(world, tile.x, tile.y),
    next = tileIndex(world, tile.x + 1, tile.y);
  world.tiles[next].terrain = "meadow";
  const task = person.task!;
  task.path = [next, origin];
  const contacts = beginBodyWork(world),
    before = elementLedger(world),
    plant = structuredClone(tile.plant);
  updateCitizen(world, person, civ, 1, contacts);
  assert.ok(person.metabolism.last!.activityFraction > 0);
  assert.equal(task.path.length, 0);
  assert.deepEqual({ x: person.x, y: person.y }, { x: tile.x, y: tile.y });
  assert.equal(task.progress, 0);
  assert.equal(person.cargo, null);
  // A captured work context must still reject the returned traveler, even if a
  // caller offers additional effort. Equal endpoints do not prove contact.
  const harvest = beginHarvestWork(world, contacts);
  workOnHarvest(world, person, 0.25, harvest);
  finishHarvestWork(world, harvest);
  assert.equal(task.progress, 0);
  assert.equal(person.cargo, null);
  assert.deepEqual(tile.plant, plant);
  world.tick++;
  updateCitizen(world, person, civ, 1);
  const cargo = person.cargo as Citizen["cargo"];
  assert.ok(cargo?.material === "wood" && cargo.amount > 0);
  assert.ok(task.progress > 0);
  conserved(world, before);
});

test("cold-weather reconsideration counts edible cargo as accessible personal food", () => {
  const f = fixture(["biomass"], 100, 20),
    site = f.world.tiles.find(
      (t) =>
        t.terrain !== "water" &&
        Math.hypot(t.x - f.civ.x, t.y - f.civ.y) > 5 &&
        Math.hypot(t.x - f.civ.x, t.y - f.civ.y) < 7,
    )!;
  assert.ok(site);
  site.temperature = 9;
  site.water = 20;
  site.plant = structuredClone(f.tile.plant);
  site.groundcover = null;
  refreshTile(site);
  f.person.x = site.x;
  f.person.y = site.y;
  f.person.provisions = 1;
  f.person.task!.tile = tileIndex(f.world, site.x, site.y);
  rebaseFixture(f.world);
  const carried = structuredClone(f.world),
    other = carried.citizens[0];
  other.provisions = 0;
  other.cargo = { material: "biomass", amount: 1 };
  const tasks = [f.person.task!, other.task!];
  updateCitizen(f.world, f.person, f.civ, 1);
  updateCitizen(carried, other, carried.civilizations[0], 1);
  assert.equal(f.person.task, tasks[0]);
  assert.equal(other.task, tasks[1]);
  assert.ok(tasks[0].progress > 0);
  close(tasks[0].progress, tasks[1].progress);
  close(tasks[0].harvestedKg!, tasks[1].harvestedKg!);
});

test("saved partial products and their observation survive loading and append deterministically", () => {
  const f = fixture(["wood"], 100, 20),
    store = new Store(":memory:");
  try {
    work(f.world, [0.25]);
    store.save(f.world);
    const loaded = store.load(0, true);
    assert.deepEqual(loaded, f.world);
    close(
      loaded.citizens[0].task!.harvestedKg!,
      loaded.citizens[0].cargo!.amount,
    );
    f.world.tick++;
    loaded.tick++;
    work(f.world, [0.25]);
    work(loaded, [0.25]);
    assert.deepEqual(loaded, f.world);
    close(loaded.citizens[0].cargo!.amount, 2);
    const invalid = structuredClone(loaded);
    invalid.citizens[0].task!.harvestedKg = -1;
    assert.throws(() => validateWorld(invalid), /observed harvested mass/);
  } finally {
    store.close();
  }
});

test("invalid accessibility or exposure inputs fail before work and never rewrite the saved genome", () => {
  for (const key of ["woodiness", "defense"] as const) {
    const f = fixture();
    f.tile.plant!.genome[key] = 2;
    const original = structuredClone(f.tile.plant);
    assert.throws(
      () => beginHarvestWork(f.world, beginBodyWork(f.world)),
      /accessibility fractions/,
    );
    assert.throws(() => validateWorld(f.world), /plant genome/);
    assert.deepEqual(f.tile.plant, original);
    assert.equal(f.person.task!.progress, 0);
    assert.equal(f.person.cargo, null);
  }
  const f = fixture();
  f.civ.policies.extraction = 2;
  assert.throws(
    () => beginHarvestWork(f.world, beginBodyWork(f.world)),
    /cutting fraction/,
  );
  assert.equal(f.person.task!.progress, 0);
});

test("tending and experiment completions cannot replenish a source before simultaneous harvest claims", () => {
  for (const kind of ["tend", "experiment"] as const) {
    const f = fixture(["clay", "clay"]),
      [other, extractor] = f.world.citizens,
      home = f.tile,
      site = f.world.tiles.find(
        (t) => t.terrain !== "water" && t.x === home.x + 1 && t.y === home.y,
      )!;
    assert.ok(site);
    site.plant = structuredClone(home.plant);
    site.nutrients = {};
    site.mineral = 0;
    site.temperature = 20;
    site.water = 20;
    home.nutrients = {};
    home.mineral = 0;
    addNutrients(home, CLAY, 10);
    f.civ.stock.clay = 10;
    f.civ.hypothesis = {
      name: "Clay sample",
      components: [
        { material: "clay", x: 0, y: 0, z: 0, width: 1, depth: 1, height: 0.1 },
      ],
    };
    for (const person of f.world.citizens) {
      person.x = site.x;
      person.y = site.y;
      person.task!.tile = tileIndex(f.world, site.x, site.y);
    }
    other.task!.kind = kind;
    other.task!.progress = kind === "tend" ? 2 : 4;
    extractor.task!.progress = 2.99;
    rebaseFixture(f.world);
    const before = elementLedger(f.world);
    updateCitizens(f.world);
    assert.equal(extractor.task, null);
    assert.equal(extractor.cargo, null, kind);
    assert.ok(availableMixture(site, CLAY) > 0, kind);
    conserved(f.world, before);
  }
});

test("format-15 migration preserves inhabited/extinct saves, tasks, cargo, archives and deterministic continuation", () => {
  for (const extinct of [false, true]) {
    const f = fixture(["wood"]),
      store = new Store(":memory:");
    try {
      f.person.task!.progress = 1.7;
      f.person.cargo = { material: "wood", amount: 0.4 };
      rebaseFixture(f.world);
      if (extinct) {
        f.person.health = 0;
        processDeaths(f.world);
      }
      store.save(f.world);
      const old = structuredClone(f.world);
      old.version = 15;
      old.lawsVersion = "biosphere-1.9";
      const original = JSON.stringify(old),
        { tiles, ...metadata } = old,
        json = JSON.stringify(metadata);
      store.db
        .prepare("UPDATE world SET json=?,checksum=?")
        .run(json, digest(json));
      const result = migrateWorld(old);
      assert.equal(JSON.stringify(old), original);
      assert.deepEqual(result.world, {
        ...old,
        version: 17,
        lawsVersion: "biosphere-1.11",
      });
      assert.deepEqual(
        result.interventions.map((i) => i.id),
        [
          "016-performed-resource-harvesting",
          "017-contact-from-actual-movement",
        ],
      );
      const loaded = store.load(0, true);
      assert.deepEqual(loaded, result.world);
      const [archive] = verifyWorldArchives(store.db);
      assert.equal(
        archive.id,
        "016-performed-resource-harvesting+017-contact-from-actual-movement",
      );
      assert.equal(
        Buffer.concat([...worldArchiveBytes(store.db, archive.id)]).toString(),
        JSON.stringify({ ...metadata, tiles }),
      );
      if (!extinct) {
        assert.equal(loaded.citizens[0].task!.harvestedKg, undefined);
        close(loaded.citizens[0].cargo!.amount, 0.4);
      }
      const replay = structuredClone(loaded);
      stepWorld(loaded, 8);
      stepWorld(replay, 8);
      assert.deepEqual(loaded, replay);
      store.save(loaded);
      assert.deepEqual(store.load(0, true), loaded);
      assert.equal(store.interventions().length, 2);
    } finally {
      store.close();
    }
  }
});
