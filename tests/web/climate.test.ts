import test from "node:test";
import assert from "node:assert/strict";
import {
  initialPlanetaryClimate,
  diffusePlanetaryHeat,
  regionalTemperature,
  climateBand,
  exchangeRegionalHeat,
  advancePlanetaryClimate,
} from "../../src/simulation/climate";
import { heatCapacity } from "../../src/simulation/thermodynamics";
import { createWorld } from "../../src/simulation/world";
import { validateWorld } from "../../src/simulation/engine";

test("planetary heat transport warms colder bands with equal and opposite energy transfers", () => {
  const climate = initialPlanetaryClimate(0);
  const temperatures = climate.bands.map((_, i) =>
    regionalTemperature(climate, i),
  );
  diffusePlanetaryHeat(climate, 1);
  const heat = climate.bands.reduce((sum, band) => sum + band.heat, 0);
  const scale = climate.bands.reduce(
    (sum, band) => sum + Math.abs(band.heat),
    0,
  );
  assert.ok(Math.abs(heat) < scale * 1e-12);
  assert.ok(regionalTemperature(climate, 0) > temperatures[0]);
  assert.ok(regionalTemperature(climate, 18) < temperatures[18]);
  assert.throws(() => diffusePlanetaryHeat(climate, 1000), /hourly/);
});

test("local warming withdraws real heat from the regional reservoir and produces entropy", () => {
  const world = createWorld(1847, 64, 64),
    tile = world.tiles[0];
  const band = climateBand(tile.x, tile.y);
  tile.temperature = -20;
  const original = tile.temperature,
    localCapacity = heatCapacity(tile);
  const heat = exchangeRegionalHeat(world, tile);
  assert.ok(heat < 0 && tile.temperature > original);
  assert.ok(
    Math.abs(localCapacity * (tile.temperature - original) + heat) < 1e-7,
  );
  assert.equal(world.planetaryClimate.bands[band].heat, heat);
  assert.equal(world.planetaryClimate.surfaceExchange, heat);
  assert.ok(world.entropy.heatMixing > 0);
  validateWorld(world);
});

test("planetary solar forcing, heat transport and emission retain their budget and exact restart", () => {
  const world = createWorld(1847, 64, 64);
  world.tick = 96 * 30;
  advancePlanetaryClimate(world);
  validateWorld(world);
  assert.ok(world.planetaryClimate.solarAbsorbed > 0);
  assert.ok(world.planetaryClimate.radiated > 0);
  const restored = structuredClone(world);
  world.tick += 96;
  restored.tick += 96;
  advancePlanetaryClimate(world);
  advancePlanetaryClimate(restored);
  assert.deepEqual(restored.planetaryClimate, world.planetaryClimate);
  validateWorld(restored);
});
