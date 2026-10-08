import test from "node:test";
import assert from "node:assert/strict";
import { smallWorld as createWorld } from "./fixtures";
import { accumulateEnergy } from "../../src/simulation/laws";
import { validateWorld } from "../../src/simulation/engine";
import { infraredColumn } from "../../src/simulation/thermodynamics";
import { surfaceAlbedo } from "../../src/simulation/weather";
import { accumulateAtmosphere } from "../../src/simulation/chemistry";

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
