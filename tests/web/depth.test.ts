import test from "node:test";
import assert from "node:assert/strict";
import { getTile } from "../../src/simulation/world";
import { smallWorld as createWorld } from "./fixtures";
import { evaluateDesign, ledger } from "../../src/simulation/laws";
import { elementLedger } from "../../src/simulation/chemistry";
import {
  updateWeathering,
  refreshStructure,
  repairStructure,
  salvageMaterial,
  decayStocks,
} from "../../src/simulation/weathering";
import {
  entrainSediment,
  depositSediment,
  weatherSediment,
} from "../../src/simulation/landscape";
import {
  createMind,
  perceive,
  knows,
  teachNearby,
  updateMind,
  beginExperience,
  reinforce,
} from "../../src/simulation/cognition";
import { runExperiment } from "../../src/simulation/economy";
import { validateWorld } from "../../src/simulation/engine";
import { migrateWorld } from "../../src/server/migrations";
import { Store } from "../../src/server/store";
import { built, box, shelter, legacyCheckpoint } from "./fixtures";

const smallWorld = () => createWorld(1847, 64, 64);
const close = (a: number, b: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test("surface and storage affordances follow exact cuboid extents, including translations and missing walls", () => {
  const p = evaluateDesign(box);
  assert.equal(p.stable, true);
  close(p.storageVolume, 0.9 * 0.9 * 0.5);
  const translated = structuredClone(box);
  translated.name = "The impossible magic warehouse";
  for (const part of translated.components) {
    part.x += 0.123;
    part.y -= 0.234;
  }
  close(evaluateDesign(translated).storageVolume, p.storageVolume);
  const open = structuredClone(box);
  open.components.pop();
  assert.equal(evaluateDesign(open).storageVolume, 0);
  const tiny = evaluateDesign({
    name: "A tiny post",
    components: [
      {
        material: "wood",
        x: 0,
        y: 0,
        z: 0,
        width: 0.025,
        depth: 0.025,
        height: 0.5,
      },
    ],
  });
  close(tiny.workSurface, 0.025 ** 2);
  const floating = structuredClone(box);
  floating.components[1].z += 0.1;
  assert.equal(evaluateDesign(floating).storageVolume, 0);
  const detached = structuredClone(box);
  detached.components[1].x = -2;
  detached.components[2].x = 2;
  detached.components[3].y = -2;
  detached.components[4].y = 2;
  assert.equal(
    evaluateDesign(detached).storageVolume,
    0,
    "detached walls do not enclose the floor",
  );
  const spillway = structuredClone(box);
  spillway.components[1].height = 0.2;
  close(evaluateDesign(spillway).storageVolume, 0.9 * 0.9 * 0.2);
  const bottomless = structuredClone(box);
  bottomless.components.shift();
  assert.equal(
    evaluateDesign(bottomless).storageVolume,
    0,
    "a missing floor cannot retain contents",
  );
});

test("wet warmth and actual frost weaken fabric while its lost elements remain in the world", () => {
  const wet = smallWorld(),
    s = built(wet),
    dry = structuredClone(wet);
  const wetTile = getTile(wet, s.x, s.y)!,
    dryTile = getTile(dry, s.x, s.y)!;
  wetTile.temperature = 35;
  wetTile.air.humidity = 1;
  wetTile.air.rain = 2;
  dryTile.temperature = 5;
  dryTile.air.humidity = 0;
  dryTile.air.rain = 0;
  dry.atmosphere.water += dryTile.water;
  dryTile.water = 0;
  const before = elementLedger(wet);
  wet.tick += 960;
  dry.tick += 960;
  updateWeathering(wet, 240);
  updateWeathering(dry, 240);
  assert.ok(s.fabric.lostMass > dry.structures[0].fabric.lostMass);
  for (const [symbol, mass] of Object.entries(before))
    close(elementLedger(wet)[symbol], mass, 0.001);
  const frozen = structuredClone(wet),
    steady = structuredClone(wet);
  for (const w of [frozen, steady]) getTile(w, s.x, s.y)!.temperature = -2;
  frozen.structures[0].fabric.previousTemperature = 2;
  steady.structures[0].fabric.previousTemperature = -2;
  updateWeathering(frozen);
  updateWeathering(steady);
  assert.ok(
    frozen.structures[0].fabric.parts[0].damage >
      steady.structures[0].fabric.parts[0].damage,
  );
  validateWorld(wet);
  validateWorld(dry);
});

test("repair needs actual replacement stock and work; collapse retains a finite salvageable inventory", () => {
  const world = smallWorld(),
    s = built(world),
    civ = world.civilizations[0],
    other = world.civilizations[1];
  s.fabric.parts[0].damage = 0.3;
  refreshStructure(s);
  other.stock.wood += civ.stock.wood;
  civ.stock.wood = 0;
  const damaged = s.condition;
  assert.equal(repairStructure(world, civ, s, 10), 0);
  other.stock.wood -= 12;
  civ.stock.wood += 12;
  assert.equal(repairStructure(world, civ, s, 0), 0);
  const before = ledger(world);
  assert.ok(repairStructure(world, civ, s, 10) > 0);
  assert.ok(s.condition > damaged);
  close(ledger(world).carbon, before.carbon);
  s.fabric.parts[0].damage = 0.999;
  updateWeathering(world);
  assert.equal(s.collapsed, true);
  assert.equal(s.properties.capacity, 0);
  assert.ok(s.properties.mass > 1);
  const oldMass = s.properties.mass,
    beforeSalvage = ledger(world);
  const recovered = salvageMaterial(world, s, "wood", 2);
  civ.stock.wood += recovered;
  assert.ok(recovered >= 0 && recovered < 2);
  close(oldMass - s.properties.mass, 2);
  close(ledger(world).carbon, beforeSalvage.carbon);
  validateWorld(world);
});

test("enclosed storage reduces exposure losses without preventing spoilage or creating food", () => {
  const sheltered = smallWorld();
  built(sheltered, box);
  const exposed = structuredClone(sheltered);
  exposed.structures[0].properties.storageVolume = 0;
  const before = sheltered.civilizations[0].stock.biomass;
  decayStocks(sheltered, sheltered.civilizations[0]);
  decayStocks(exposed, exposed.civilizations[0]);
  assert.ok(
    sheltered.civilizations[0].stock.biomass >
      exposed.civilizations[0].stock.biomass,
  );
  assert.ok(sheltered.civilizations[0].stock.biomass < before);
  validateWorld(sheltered);
  validateWorld(exposed);
});

test("roots resist erosion; detached rock and soil arrive downstream with conserved atoms and signed surface change", () => {
  const rooted = smallWorld(),
    from = rooted.tiles.find((t) => t.plant && t.plant.carbon > 20)!,
    to = rooted.tiles.find((t) => t !== from)!;
  const bare = structuredClone(rooted),
    bareFrom = getTile(bare, from.x, from.y)!,
    bareTo = getTile(bare, to.x, to.y)!;
  for (const plant of [bareFrom.plant, bareFrom.groundcover])
    if (plant) {
      bareFrom.detritus.carbon += plant.carbon;
      bareFrom.detritus.mineral += plant.mineral;
    }
  bareFrom.plant = null;
  bareFrom.groundcover = null;
  const before = elementLedger(rooted);
  const low = entrainSediment(rooted, from, to, 1000, 20),
    high = entrainSediment(bare, bareFrom, bareTo, 1000, 20);
  assert.ok(high.sediment + high.soilMass > low.sediment + low.soilMass);
  depositSediment(rooted, low);
  depositSediment(bare, high);
  assert.ok(from.surfaceChange < 0 && to.surfaceChange > 0);
  close(from.surfaceChange + to.surfaceChange, 0);
  const sediment = to.sediment;
  weatherSediment(to);
  assert.ok(to.sediment < sediment);
  for (const [symbol, mass] of Object.entries(before))
    close(elementLedger(rooted)[symbol], mass, 0.001);
  validateWorld(rooted);
  validateWorld(bare);
});

test("experiments spend samples, retain failed evidence, and do not grant every person the discovery", () => {
  const world = smallWorld(),
    civ = world.civilizations[0],
    actor = world.citizens[0],
    listener = world.citizens[1];
  const before = ledger(world),
    wood = civ.stock.wood;
  const failing = structuredClone(shelter);
  failing.components[1].z += 0.5;
  assert.equal(runExperiment(world, civ, failing, actor), true);
  const observation = civ.observations[0];
  assert.equal(observation.properties.stable, false);
  assert.equal(observation.research.authorId, actor.id);
  assert.ok(civ.stock.wood < wood);
  assert.ok(knows(actor, observation.id));
  assert.equal(knows(listener, observation.id), false);
  close(ledger(world).carbon, before.carbon);
  world.tick = 8;
  for (const p of world.citizens)
    if (p !== actor) {
      p.x = actor.x + 8;
      p.y = actor.y;
    }
  assert.equal(teachNearby(world, actor), false);
  listener.x = actor.x;
  listener.y = actor.y;
  assert.equal(teachNearby(world, actor), true);
  assert.ok(knows(listener, observation.id));
  assert.equal(listener.mind.knowledge[0].sourceId, actor.id);
  validateWorld(world);
});

test("sensory range, fatigue, sleep consolidation and experienced reward change personal cognition", () => {
  const world = smallWorld(),
    actor = world.citizens[0],
    civ = world.civilizations[0];
  perceive(world, actor, 1);
  assert.ok(
    actor.mind.places.every(
      (p) => Math.hypot(p.x - actor.x, p.y - actor.y) <= 1,
    ),
  );
  runExperiment(world, civ, shelter, actor);
  const rested = structuredClone(actor),
    awake = structuredClone(actor);
  rested.task = { kind: "rest", tile: 0, path: [], progress: 0 };
  rested.mind.sleepPressure = 0.9;
  awake.task = { kind: "experiment", tile: 0, path: [], progress: 0 };
  awake.mind.sleepPressure = 0.9;
  updateMind(world, rested, 8);
  updateMind(world, awake, 8);
  assert.ok(
    rested.mind.knowledge[0].consolidation >
      awake.mind.knowledge[0].consolidation,
  );
  assert.ok(rested.mind.attention > awake.mind.attention);
  beginExperience(actor, "experiment", world.tick);
  const prior = [...actor.mind.synapses.experiment!];
  reinforce(actor, 0.9, world.tick + 4);
  assert.notDeepEqual(actor.mind.synapses.experiment, prior);
  assert.ok(actor.mind.reward > 0);
  actor.mind.knowledge[0].retention = 0.121;
  actor.mind.knowledge[0].consolidation = 0;
  actor.task = { kind: "experiment", tile: 0, path: [], progress: 0 };
  updateMind(world, actor, 96);
  assert.equal(actor.mind.knowledge.length, 0);
  assert.ok(actor.mind.forgotten > 0);
});

test("format 7 migration preserves existing matter, identities, decisions and RNG, and begins new measurements now", () => {
  const world = smallWorld();
  built(world);
  runExperiment(world, world.civilizations[0], shelter, world.citizens[0]);
  world.tick = 512;
  const store = new Store(":memory:");
  try {
    const old = legacyCheckpoint(store, world, 7);
    const { world: next, interventions } = migrateWorld(old);
    assert.equal(next.version, 13);
    assert.equal(interventions.length, 6);
    assert.equal(next.tick, old.tick);
    assert.equal(next.rng, old.rng);
    assert.equal(next.nextId, old.nextId);
    assert.equal(next.generationVersion, old.generationVersion);
    assert.deepEqual(
      next.citizens.map((p) => ({
        ...p,
        mind: undefined,
        journeyId: undefined,
        wrapMass: undefined,
        provisions: undefined,
        metabolism: undefined,
      })),
      old.citizens.map((p) => ({
        ...p,
        mind: undefined,
        journeyId: undefined,
        wrapMass: undefined,
        provisions: undefined,
        metabolism: undefined,
      })),
    );
    assert.deepEqual(
      next.structures[0].properties.cost,
      old.structures[0].properties.cost,
    );
    assert.deepEqual(next.civilizations[0].stock, old.civilizations[0].stock);
    assert.equal(next.evolution.sinceTick, 512);
    assert.equal(next.citizens[0].mind.sinceTick, 512);
    assert.equal(next.citizens[0].mind.knowledge[0].source, "inherited-record");
    assert.equal(next.citizens[0].mind.learned, 0);
    assert.equal(next.civilizations[0].civics.progress.achievements.length, 0);
    // The legacy fixture returns modern carried supplies to communal stock.
    // That changes floating-point summation order, not the retained matter.
    const before = elementLedger(world);
    for (const [element, mass] of Object.entries(elementLedger(next)))
      assert.ok(
        Math.abs(mass - (before[element] ?? 0)) <
          Math.max(1e-8, Math.abs(before[element] ?? 0) * Number.EPSILON * 8),
        element,
      );
    validateWorld(next);
    assert.deepEqual(store.load(999), next);
    assert.deepEqual(store.load(999), next);
    assert.equal(store.interventions().length, 6);
  } finally {
    store.close();
  }
});

test("malformed new cognitive, fabric and outcome state is rejected rather than silently repaired", () => {
  const source = smallWorld();
  built(source);
  for (const corrupt of [
    (w: typeof source) => {
      w.citizens[0].mind.adviceTrust = 2;
    },
    (w: typeof source) => {
      w.citizens[0].mind.synapses.rest![0] = NaN;
    },
    (w: typeof source) => {
      w.structures[0].fabric.parts[0].mass += 1;
    },
    (w: typeof source) => {
      w.civilizations[0].civics.progress.current.knowledge = Infinity;
    },
  ]) {
    const world = structuredClone(source);
    corrupt(world);
    assert.throws(() => validateWorld(world), /Invalid saved world/);
  }
});
