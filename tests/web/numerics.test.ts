import test from "node:test";
import assert from "node:assert/strict";
import { smallWorld as createWorld } from "./fixtures";
import { accumulateEnergy } from "../../src/simulation/laws";
import { validateWorld } from "../../src/simulation/engine";
import { infraredColumn } from "../../src/simulation/thermodynamics";
import { surfaceAlbedo } from "../../src/simulation/weather";
import { accumulateAtmosphere } from "../../src/simulation/chemistry";
import { conditionalChoice } from "../../src/simulation/random";

test("conditional choices retain reachable work after declined or infeasible earlier tasks", () => {
  const counts = { food: 0, assemble: 0, neither: 0, afterFailedFood: 0 };
  for (let index = 0; index < 10_000; index++) {
    const draw = (index + 0.5) / 10_000,
      feasible = conditionalChoice(draw),
      failed = conditionalChoice(draw);
    if (feasible(0.65)) counts.food++;
    else if (feasible(0.42)) counts.assemble++;
    else counts.neither++;
    // Either result continues when the attempted first task is infeasible.
    failed(0.65);
    if (failed(0.42)) counts.afterFailedFood++;
  }
  assert.deepEqual(counts, {
    food: 6500,
    assemble: 1470,
    neither: 2030,
    afterFailedFood: 4200,
  });
});

test("conditional choices handle certain events, interval boundaries and invalid input", () => {
  const choose = conditionalChoice(0.65);
  assert.equal(choose(-1), false);
  assert.equal(choose(2), true);
  assert.equal(choose(0.65), false, "the boundary belongs to rejection");
  assert.equal(choose(Number.MIN_VALUE), true, "its remainder is zero");
  for (const draw of [NaN, Infinity, -Infinity, -1, 1])
    assert.throws(() => conditionalChoice(draw), RangeError);
  const valid = conditionalChoice(0.5);
  for (const probability of [NaN, Infinity, -Infinity])
    assert.throws(() => valid(probability), RangeError);
  assert.equal(valid(0.6), true, "invalid input leaves the remainder intact");
});

test("a rounded conditional remainder stays below one across failed attempts", () => {
  const draw = 0.5 - 2 ** -32,
    choose = conditionalChoice(draw);
  assert.equal(choose(draw + Number.EPSILON / 4), true);
  assert.equal(choose(0.35000000000000003), false);
  // The preceding raw division rounds to 1. Saturation keeps the final
  // interval reachable, including its boundary, instead of poisoning it.
  assert.equal(choose(1 - Number.EPSILON / 2), false);
  assert.equal(choose(Number.MIN_VALUE), true);
});

test("small metabolic increments survive old counters and a serialization boundary", () => {
  const world = createWorld(1847, 64, 64);
  world.energy.released = 50_000_000_000;
  for (let n = 0; n < 5000; n++) accumulateEnergy(world, "released", 0.000001);
  const restored = JSON.parse(JSON.stringify(world));
  for (let n = 0; n < 5000; n++) {
    accumulateEnergy(world, "released", 0.000001);
    accumulateEnergy(restored, "released", 0.000001);
  }
  assert.equal(world.energy.released, 50_000_000_000.01);
  assert.deepEqual(restored.energy, world.energy);
});

test("small atmospheric exchanges survive large reservoirs and restarts", () => {
  const world = createWorld(1847, 64, 64);
  world.atmosphere.oxygen = 9_000_000_000;
  for (let n = 0; n < 5000; n++)
    accumulateAtmosphere(world, "oxygen", 0.000001);
  const restored = JSON.parse(JSON.stringify(world));
  for (let n = 0; n < 5000; n++) {
    accumulateAtmosphere(world, "oxygen", 0.000001);
    accumulateAtmosphere(restored, "oxygen", 0.000001);
  }
  assert.equal(world.atmosphere.oxygen, 9_000_000_000.01);
  assert.deepEqual(restored.atmosphere, world.atmosphere);
  assert.deepEqual(
    restored.atmosphereCompensation,
    world.atmosphereCompensation,
  );
  accumulateAtmosphere(world, "oxygen", -world.atmosphere.oxygen);
  assert.equal(world.atmosphere.oxygen, 0);
  assert.equal(world.atmosphereCompensation.oxygen, 0);
});

test("energy tolerance follows processed energy while still rejecting material-scale violations", () => {
  const world = createWorld(1847, 64, 64);
  world.energy.captured = 50_000_000_000;
  world.energy.released = 50_000_000_000 - 0.88;
  assert.doesNotThrow(() => validateWorld(world));
  world.energy.captured += 100;
  assert.throws(() => validateWorld(world), /biochemical energy conservation/);
});

test("the infrared column emits only energy it has absorbed", () => {
  for (const opacity of [0, 0.3, 0.76, 0.95, 1]) {
    for (const solar of opacity ? [0, 70] : [0]) {
      const incoming = 390,
        column = infraredColumn(incoming, 288, opacity, solar);
      assert.ok(
        Math.abs(column.returned + column.escaped - incoming - solar) < 1e-10,
      );
      assert.ok(
        Math.abs(2 * column.returned - opacity * incoming - solar) < 1e-10,
      );
    }
  }
  assert.equal(infraredColumn(390, 288, 0).returned, 0);
  assert.ok(
    infraredColumn(390, 288, 0.95).returned >
      infraredColumn(390, 288, 0.3).returned,
  );
});

test("freezing buried water does not turn soil into a reflective snow blanket", () => {
  const world = createWorld(1847, 64, 64),
    tile = world.tiles.find((t) => t.terrain === "hill")!;
  tile.plant = null;
  tile.air.snow = 0;
  tile.ice = 0;
  const bare = surfaceAlbedo(tile);
  tile.ice = 16000;
  assert.equal(surfaceAlbedo(tile), bare);
  tile.air.snow = 300;
  assert.ok(surfaceAlbedo(tile) > bare + 0.4);
});
