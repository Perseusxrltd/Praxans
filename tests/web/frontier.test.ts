import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorld,
  distance,
  settleFrontier,
  summarizeWorld,
} from "../../src/simulation/world";
import {
  generateTile,
  materializeChunk,
  getTile,
  spiralSite,
} from "../../src/simulation/terrain";
import { stepWorld, validateWorld } from "../../src/simulation/engine";
import { Store } from "../../src/server/store";

test("terrain depends on seed and coordinates, independent of reveal order", () => {
  const a = createWorld(72),
    b = createWorld(72);
  materializeChunk(a, -9, 12);
  materializeChunk(a, 1000, -2000);
  materializeChunk(b, 1000, -2000);
  materializeChunk(b, -9, 12);
  assert.deepEqual(getTile(a, -280, 390), getTile(b, -280, 390));
  assert.deepEqual(getTile(a, 32000, -64000), generateTile(72, 32000, -64000));
  assert.notDeepEqual(
    generateTile(71, 32000, -64000),
    generateTile(72, 32000, -64000),
  );
  validateWorld(a);
  validateWorld(b);
});
test("frontier allocation has no repeated places across the first ten thousand sites", () => {
  const positions = new Set<string>();
  for (let i = 1; i <= 10000; i++) {
    const p = spiralSite(i),
      key = `${p.x},${p.y}`;
    assert.ok(!positions.has(key));
    positions.add(key);
  }
});
test("new arrivals get genuinely distant untouched land without changing old settlements", () => {
  const world = createWorld(),
    originalTiles = structuredClone(world.tiles),
    originalCivs = structuredClone(world.civilizations);
  const first = settleFrontier(world, "Wildhaven"),
    second = settleFrontier(world, "Far Afield");
  for (const civ of originalCivs) {
    assert.ok(distance(civ, first) > 160);
    assert.ok(distance(civ, second) > 160);
  }
  assert.ok(distance(first, second) > 160);
  assert.equal(world.citizens.filter((p) => p.civId === first.id).length, 8);
  assert.deepEqual(world.tiles.slice(0, originalTiles.length), originalTiles);
  for (const old of originalCivs) {
    const current = world.civilizations.find((c) => c.id === old.id)!;
    assert.deepEqual(current.stock, old.stock);
    assert.deepEqual(current.observations, old.observations);
  }
  validateWorld(world);
  const summary = summarizeWorld(world);
  assert.ok(Math.abs(summary.carbonError) < 0.001);
  assert.ok(Math.abs(summary.waterError) < 0.001);
  assert.ok(world.boundary.carbon > 0);
  assert.ok(world.chunks.length > 9);
});
test("separate region checkpoints retain frontier history and resume the same future", () => {
  const store = new Store(":memory:");
  try {
    const original = store.load(19);
    const civ = settleFrontier(original, "Elsewhere");
    stepWorld(original, 12);
    store.save(original);
    const rows = store.db
      .prepare("SELECT COUNT(*) AS count FROM chunks")
      .get() as { count: number };
    assert.equal(rows.count, original.chunks.length);
    const restored = store.load(0);
    assert.deepEqual(restored, original);
    assert.ok(restored.civilizations.some((c) => c.id === civ.id));
    stepWorld(original, 12);
    stepWorld(restored, 12);
    assert.deepEqual(restored, original);
    store.db
      .prepare("UPDATE chunks SET checksum=? WHERE id=?")
      .run("corrupt", original.chunks.at(-1)!.id);
    assert.throws(() => store.load(0), /Region .*checksum/);
  } finally {
    store.close();
  }
});
