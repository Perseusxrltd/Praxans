import test from "node:test";
import assert from "node:assert/strict";
import { smallWorld as createWorld } from "./fixtures";
import {
  growPlant,
  seedPlant,
  updateSeedBank,
} from "../../src/simulation/ecology";
import { elementLedger } from "../../src/simulation/chemistry";
import { ledger } from "../../src/simulation/laws";
import type {
  ElementMass,
  Plant,
  Tile,
  World,
} from "../../src/simulation/types";

function killPlant(tile: Tile) {
  if (!tile.plant) return;
  tile.detritus.carbon += tile.plant.carbon;
  tile.detritus.mineral += tile.plant.mineral;
  tile.plant = null;
}
function conserved(world: World, before: ElementMass, energy: number) {
  const after = elementLedger(world);
  for (const symbol of Object.keys(before))
    assert.ok(
      Math.abs(before[symbol] - after[symbol]) <
        Math.max(1e-7, before[symbol] * 1e-12),
      symbol,
    );
  assert.ok(
    Math.abs(
      ledger(world).chemical +
        world.energy.released -
        world.energy.captured -
        energy,
    ) < 0.05,
  );
}

test("parent-funded dormant seeds survive a dry interval and regrow after the parent dies", () => {
  const world = createWorld(1847, 64, 64);
  const source = world.tiles.find((t) => t.plant && t.terrain === "meadow")!;
  const target = world.tiles.find((t) => !t.plant && t.terrain === "hill")!;
  source.pollination = 1;
  const before = elementLedger(world),
    energy = ledger(world).chemical;
  assert.ok(seedPlant(world, source, target));
  const lineage = source.plant!.lineage,
    inherited = target.seedBank[0].genome;
  killPlant(source);
  world.atmosphere.water += target.water;
  target.water = 0;
  target.temperature = inherited.temperature;
  target.air.sunlight = 600;
  const start = target.seedBank[0].carbon;
  for (let hour = 0; hour < 30 * 24; hour++) {
    world.tick += 4;
    updateSeedBank(world, target);
  }
  assert.equal(target.plant, null);
  assert.equal(target.seedBank.length, 1);
  assert.ok(
    target.seedBank[0].carbon < start,
    "dormancy spends finite reserves",
  );
  const water = Math.min(world.atmosphere.water, 12000);
  world.atmosphere.water -= water;
  target.water += water;
  for (let hour = 0; hour < 20 * 24 && !target.plant; hour++) {
    world.tick += 4;
    updateSeedBank(world, target);
  }
  assert.ok(
    target.plant,
    "germination needs a surviving seed and suitable conditions",
  );
  assert.equal(target.plant!.lineage, lineage);
  assert.deepEqual((target.plant as Plant).genome, inherited);
  assert.equal(target.seedBank.length, 0);
  conserved(world, before, energy);
});

test("seed reserves are bounded and a sterile gap cannot invent lost life", () => {
  const world = createWorld(1847, 64, 64);
  const source = world.tiles.find((t) => t.plant && t.terrain === "meadow")!;
  const target = world.tiles.find((t) => !t.plant && t.terrain === "hill")!;
  source.pollination = 1;
  const before = elementLedger(world),
    energy = ledger(world).chemical;
  for (let n = 0; n < 4; n++) assert.ok(seedPlant(world, source, target));
  assert.equal(seedPlant(world, source, target), false);
  target.temperature = 80;
  updateSeedBank(world, target);
  assert.equal(target.seedBank.length, 0);
  target.temperature = 20;
  target.air.sunlight = 600;
  for (let hour = 0; hour < 100; hour++) {
    world.tick += 4;
    updateSeedBank(world, target);
  }
  assert.equal(target.plant, null);
  conserved(world, before, energy);
});

test("small surviving plants can capture enough light to rebuild tissue without free energy", () => {
  const world = createWorld(1847, 64, 64),
    tile = world.tiles.find((t) => t.plant && t.terrain === "meadow")!;
  const plant = tile.plant!;
  tile.detritus.carbon += plant.carbon - 0.06;
  plant.carbon = 0.06;
  const before = elementLedger(world),
    energy = ledger(world).chemical;
  for (let hour = 0; hour < 30 * 24 && tile.plant; hour++) {
    world.tick += 4;
    tile.temperature = plant.genome.temperature;
    tile.air.sunlight =
      Math.max(0, Math.sin((((hour % 24) - 6) * Math.PI) / 12)) * 850;
    growPlant(world, tile, plant, "plant", 1);
  }
  assert.ok(
    tile.plant && tile.plant.carbon > 0.066,
    "a viable small canopy must not be trapped below its own light threshold",
  );
  conserved(world, before, energy);
});

test("structural wood survives longer than leaf tissue under the same dark conditions", () => {
  const world = createWorld(1847, 64, 64);
  const tiles = world.tiles
    .filter((t) => t.plant && t.terrain === "meadow")
    .slice(0, 2);
  for (let i = 0; i < tiles.length; i++) {
    const plant = tiles[i].plant!;
    plant.genome = {
      ...plant.genome,
      woodiness: i ? 0.02 : 0.9,
      deciduous: 0,
      growth: 0.8,
      temperature: 20,
    };
  }
  const initial = tiles.map((t) => t.plant!.carbon);
  const before = elementLedger(world),
    energy = ledger(world).chemical;
  for (let hour = 0; hour < 60 * 24; hour++) {
    world.tick += 4;
    for (const tile of tiles) {
      tile.temperature = 20;
      tile.air.sunlight = 0;
      if (tile.plant) growPlant(world, tile, tile.plant, "plant", 1);
    }
  }
  assert.ok(tiles[0].plant!.carbon / initial[0] > 0.8);
  assert.ok((tiles[1].plant?.carbon ?? 0) / initial[1] < 0.4);
  conserved(world, before, energy);
});

test("frozen dormancy spends reserves without treating ice as drought; lethal exposure still kills", () => {
  const world = createWorld(1847, 64, 64),
    tiles = world.tiles
      .filter((t) => t.plant && t.terrain === "meadow")
      .slice(0, 4);
  const template = structuredClone(tiles[0].plant!);
  template.carbon = 10;
  template.mineral = 0.4;
  template.genome = {
    ...template.genome,
    temperature: 12,
    woodiness: 0.55,
    roots: 0.9,
    deciduous: 0.6,
  };
  for (const [i, tile] of tiles.entries()) {
    tile.plant = structuredClone(template);
    tile.water = 0;
    tile.ice = i === 1 ? 0 : 1000;
    tile.air.snow = 0;
    tile.air.sunlight = 0;
  }
  const before = elementLedger(world),
    energy = ledger(world).chemical,
    temperatures = [-5, -5, -65, 75];
  for (let hour = 0; hour < 100 * 24; hour++) {
    world.tick += 4;
    for (const [i, tile] of tiles.entries()) {
      tile.temperature = temperatures[i];
      if (tile.plant) growPlant(world, tile, tile.plant, "plant", 1);
    }
  }
  const remaining = tiles.map((t) => t.plant?.carbon ?? 0);
  assert.ok(
    remaining[0] > 1,
    "cold-tolerant perennial tissue survives a winter without growth",
  );
  assert.ok(remaining[0] < 10, "dormancy still consumes finite reserves");
  assert.ok(
    remaining[1] < remaining[0] / 2,
    "absence of soil water causes real drought stress",
  );
  assert.equal(remaining[2], 0, "cold beyond tissue tolerance remains lethal");
  assert.equal(remaining[3], 0, "heat beyond tissue tolerance remains lethal");
  conserved(world, before, energy);
});
