import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createGameServer } from "../../src/server/app";
import { digest } from "../../src/server/store";
import { planetAtlas, ATLAS_WIDTH, ATLAS_HEIGHT } from "../../src/server/atlas";
import { smallWorld } from "./fixtures";

test("a planetary overview is independent of individual memory and observer projection preserves the simulation", async () => {
  const game = createGameServer({ database: ":memory:", autoTick: false });
  const world = game.getWorld();
  for (const person of world.citizens) {
    person.mind.places = Array.from({ length: 48 }, (_, i) => ({
      x: person.x + i,
      y: person.y,
      tick: world.tick,
      food: 123.45678912345,
      water: 456.78912345678,
      frozenWater: 234.56789123456,
      wood: 98.76543219876,
      fiber: 12.345678912345,
      stone: 3.456789123456,
      clay: 8.765432198765,
    }));
  }
  const before = digest(JSON.stringify(world));
  const server = game.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/overview`,
    );
    assert.equal(response.status, 200);
    const text = await response.text(),
      overview = JSON.parse(text);
    assert.equal(overview.id, world.id);
    assert.equal(overview.tick, world.tick);
    assert.equal(overview.summary.population, 900);
    assert.deepEqual(
      overview.civilizations.map((c: { population: number }) => c.population),
      [300, 300, 300],
    );
    assert.ok(
      Buffer.byteLength(text) < 16000,
      "opening a planet must not transfer its inhabitants or tiles",
    );
    assert.equal(overview.citizens, undefined);
    assert.equal(overview.tiles, undefined);
    const view = game.snapshot();
    assert.equal(view.citizens.length, world.citizens.length);
    for (let i = 0; i < view.citizens.length; i++) {
      const actual = world.citizens[i],
        visible = view.citizens[i];
      assert.equal(visible.health, actual.health);
      assert.deepEqual(visible.memories, actual.memories);
      assert.deepEqual(visible.task, actual.task);
      assert.deepEqual(visible.mind.knowledge, actual.mind.knowledge);
      assert.equal(visible.mind.places.length, actual.mind.places.length);
      assert.equal("synapses" in visible.mind, false);
      assert.equal("food" in visible.mind.places[0], false);
    }
    assert.ok(
      JSON.stringify(view.citizens).length <
        JSON.stringify(world.citizens).length * 0.4,
      "mature resource memories must not dominate the browser stream",
    );
    assert.equal(
      digest(JSON.stringify(world)),
      before,
      "viewing does not change physical state, memory, time or RNG",
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    game.close();
  }
});

test("cold planet rendering yields to I/O and does not materialize or advance land", async () => {
  const world = smallWorld(1847, 64, 64);
  const before = digest(JSON.stringify(world));
  let yielded = false,
    finished = false;
  setImmediate(() => {
    assert.equal(finished, false);
    yielded = true;
  });
  const pixels = await planetAtlas(world);
  finished = true;
  assert.equal(yielded, true);
  assert.equal(pixels.byteLength, ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  assert.equal(digest(JSON.stringify(world)), before);
});
