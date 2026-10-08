import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/simulation/world";
import { updateEcology } from "../../src/simulation/ecology";
import { ledger } from "../../src/simulation/laws";
import { elementLedger } from "../../src/simulation/chemistry";
import { validateWorld } from "../../src/simulation/engine";

test("a temperate ecosystem remains viable through winter and the following spring", (t) => {
  const world = createWorld(1847, 64, 64);
  // Controlled finite-volume ecological trial; no civilization or demographic claim.
  world.tiles = world.tiles.slice(0, 1024);
  world.chunks = world.chunks.slice(0, 1);
  world.citizens = [];
  world.civilizations = [];
  world.animals = [];
  world.structures = [];
  for (const tile of world.tiles) tile.owner = null;
  for (const key of Object.keys(
    world.atmosphere,
  ) as (keyof typeof world.atmosphere)[])
    world.atmosphere[key] /= 4;
  const mass = ledger(world);
  world.initialMatter = {
    carbon: mass.carbon,
    mineral: mass.mineral,
    water: mass.water,
  };
  world.energy = { captured: 0, released: 0, initialChemical: mass.chemical };
  world.initialElements = elementLedger(world);
  world.incomingElements = {};
  world.boundary = { carbon: 0, mineral: 0, water: 0, chemical: 0 };
  const producers = () =>
    world.tiles.reduce(
      (sum, tile) =>
        sum + (tile.plant?.carbon ?? 0) + (tile.groundcover?.carbon ?? 0),
      0,
    );
  const initial = producers();
  let maximum = -Infinity,
    minimum = Infinity;
  for (let day = 0; day < 400; day++) {
    for (let hour = 0; hour < 24; hour++) {
      world.tick += 4;
      updateEcology(world);
      for (const tile of world.tiles) {
        maximum = Math.max(maximum, tile.temperature);
        minimum = Math.min(minimum, tile.temperature);
      }
    }
    validateWorld(world);
  }
  t.diagnostic(
    JSON.stringify({
      days: 400,
      minimum,
      maximum,
      initialProducerKg: initial,
      finalProducerKg: producers(),
      dormantCohorts: world.tiles.reduce(
        (n, tile) => n + tile.seedBank.length,
        0,
      ),
      finalPlantLineages: new Set(
        world.tiles
          .flatMap((tile) => [tile.plant, tile.groundcover, ...tile.seedBank])
          .filter((plant) => plant !== null)
          .map((plant) => plant!.lineage),
      ).size,
    }),
  );
  assert.ok(maximum < 45, `temperate surface exceeded 45 C: ${maximum}`);
  assert.ok(minimum > -25, `temperate winter became too cold: ${minimum}`);
  assert.ok(
    producers() > initial * 0.02,
    "the reduced producers must remain viable across the tested season",
  );
});
