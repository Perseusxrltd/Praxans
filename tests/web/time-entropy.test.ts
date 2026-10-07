import test from "node:test";
import assert from "node:assert/strict";
import { worldClock } from "../../src/simulation/chronology";
import {
  radiationEntropy,
  passiveHeat,
  kelvin,
} from "../../src/simulation/thermodynamics";
import { createWorld } from "../../src/simulation/world";
import { updateEcology } from "../../src/simulation/ecology";
import { validateWorld } from "../../src/simulation/engine";
import { PLANET, STAR } from "../../src/simulation/planet";
import { Store, digest } from "../../src/server/store";

test("a full clock preserves fine time separately from geological age and inserts calendar days", () => {
  assert.equal(worldClock(0).universalTime, "00:00:00");
  assert.equal(worldClock(1).universalTime, "00:15:00");
  assert.equal(worldClock(95).universalTime, "23:45:00");
  assert.equal(worldClock(96).dayOfYear, 2);
  assert.equal(worldClock(365 * 96).year, 2);
  assert.equal(worldClock(365 * 96).dayOfYear, 1);
  const fourth = worldClock(Math.floor(3 * PLANET.yearDays) * 96);
  assert.equal(fourth.year, 4);
  assert.equal(fourth.daysInYear, 366);
  assert.deepEqual(worldClock(1).planetAge, {
    yearsAtEpoch: 4.54e9,
    secondsSinceEpoch: 900,
  });
  assert.notEqual(
    worldClock(20, 0, 0).localSolarTime,
    worldClock(20, 200000, 0).localSolarTime,
  );
  assert.throws(() => worldClock(-1), /non-negative/);
});
test("passive heat respects the second law, preserves energy, and cannot overshoot equilibrium", () => {
  const world = createWorld(42, 64, 64),
    hot = world.tiles[0],
    cold = world.tiles[1];
  hot.temperature = 30;
  cold.temperature = 10;
  const a = kelvin(hot.temperature),
    b = kelvin(cold.temperature);
  const ca = 105000 + hot.water * PLANET.waterHeatCapacity,
    cb = 105000 + cold.water * PLANET.waterHeatCapacity;
  const energy = ca * a + cb * b,
    heat = passiveHeat(world, hot, cold, 1e20);
  assert.ok(heat > 0);
  hot.temperature -= heat / ca;
  cold.temperature += heat / cb;
  assert.ok(Math.abs(hot.temperature - cold.temperature) < 1e-10);
  assert.ok(
    Math.abs(
      ca * kelvin(hot.temperature) + cb * kelvin(cold.temperature) - energy,
    ) < 1e-6,
  );
  assert.ok(world.entropy.heatMixing > 0);
  assert.equal(passiveHeat(world, hot, cold, 5000), 0);
  hot.temperature = 10;
  cold.temperature = 30;
  assert.ok(
    passiveHeat(world, hot, cold, 1000) < 0,
    "sign reverses so heat still leaves the warmer reservoir",
  );
  assert.throws(() => kelvin(-273.15), /absolute zero/);
});
test("equal energy carries more entropy as low-temperature heat than as stellar radiation", () => {
  assert.ok(
    radiationEntropy(100, 288) > radiationEntropy(100, STAR.temperature) * 15,
  );
  assert.equal(radiationEntropy(0, 288), 0);
  assert.throws(() => radiationEntropy(-1, 288), /Invalid/);
});
test("live ecological fluxes accumulate entropy records without altering conserved elements", () => {
  const world = createWorld(1847, 64, 64);
  world.tick = 48;
  updateEcology(world);
  assert.ok(world.entropy.solarIn > 0);
  assert.ok(world.entropy.longwaveOut > 0);
  assert.ok(world.entropy.atmosphericReturn > 0);
  assert.ok(world.entropy.metabolicHeat > 0);
  const mixing = world.entropy.heatMixing;
  world.tick += 4;
  updateEcology(world);
  assert.ok(world.entropy.heatMixing >= mixing);
  validateWorld(world);
  const restored = JSON.parse(JSON.stringify(world));
  assert.deepEqual(worldClock(restored.tick), worldClock(world.tick));
  assert.deepEqual(restored.entropy, world.entropy);
  restored.entropy.heatMixing = -1;
  assert.throws(() => validateWorld(restored), /entropy/);
});
test("an entropy hotfix starts an honest measurement epoch while preserving an older live clock", () => {
  const store = new Store(":memory:");
  try {
    const world = createWorld(8, 64, 64);
    world.tick = 9123;
    store.save(world);
    const row = store.db.prepare("SELECT json FROM world").get() as {
      json: string;
    };
    const old = JSON.parse(row.json);
    old.version = 6;
    old.lawsVersion = "biosphere-1.0";
    delete old.entropy;
    const json = JSON.stringify(old);
    store.db
      .prepare("UPDATE world SET json=?,checksum=?")
      .run(json, digest(json));
    const restored = store.load(0);
    assert.equal(restored.tick, 9123);
    assert.equal(restored.entropy.sinceTick, 9123);
    assert.equal(restored.entropy.heatMixing, 0);
    assert.equal(restored.lawsVersion, "biosphere-1.1");
    assert.deepEqual(restored.tiles, world.tiles);
    assert.equal(store.interventions().length, 1);
  } finally {
    store.close();
  }
});
