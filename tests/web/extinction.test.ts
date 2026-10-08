import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createGameServer } from "../../src/server/app";
import { Store, digest } from "../../src/server/store";
import { processDeaths } from "../../src/simulation/citizens";
import { FOUNDING } from "../../src/simulation/founding";
import { validateWorld } from "../../src/simulation/engine";

test("a new beginning preserves the extinct community and scopes new ownership after explicit choice", async () => {
  const game = createGameServer({ database: ":memory:", autoTick: false });
  const server = game.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const session = game.store.session();
  const owner = {
    Cookie: `praxans_session=${session.token}`,
    "Content-Type": "application/json",
    "X-Praxans-Client": "browser",
  };
  const claim = (body: unknown, headers = owner) =>
    fetch(`${base}/api/claim`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  try {
    const original = game.getWorld(),
      oldId = original.civilizations[0].id,
      identity = { id: original.id, seed: original.seed, tick: original.tick };
    assert.equal((await claim({ civilizationId: oldId })).status, 200);
    const key = game.store.createAgent(oldId, "First adviser", "Test");
    assert.equal(
      (await claim({ name: "Another beginning", afterExtinction: true }))
        .status,
      409,
      "living communities cannot be abandoned for repeated founder supplies",
    );
    for (const p of game.getWorld().citizens)
      if (p.civId === oldId) p.health = 0;
    processDeaths(game.getWorld());
    game.store.save(game.getWorld());
    const oldCommunity = structuredClone(game.getWorld().civilizations[0]),
      oldEvents = game.store.journal().events,
      otherPeople = structuredClone(game.getWorld().citizens);
    assert.equal((await claim({ name: "Another beginning" })).status, 409);
    assert.equal(
      (await claim({ civilizationId: oldId, afterExtinction: true })).status,
      400,
    );
    const visitor = { ...owner, Cookie: "" };
    assert.equal((await claim({ civilizationId: oldId }, visitor)).status, 409);
    assert.equal(
      (
        await claim(
          { name: "Another beginning", afterExtinction: true },
          visitor,
        )
      ).status,
      409,
    );
    const response = await claim({
      name: "Another beginning",
      afterExtinction: true,
    });
    assert.equal(response.status, 200);
    const { civilizationId } = (await response.json()) as {
      civilizationId: string;
    };
    const next = game.getWorld();
    assert.notEqual(civilizationId, oldId);
    assert.deepEqual(
      { id: next.id, seed: next.seed, tick: next.tick },
      identity,
    );
    assert.deepEqual(
      next.civilizations.find((c) => c.id === oldId),
      oldCommunity,
    );
    assert.equal(next.civilizations.length, 4);
    assert.equal(
      next.citizens.filter((p) => p.civId === civilizationId).length,
      FOUNDING.people,
    );
    assert.deepEqual(
      next.citizens.filter((p) => p.civId !== civilizationId),
      otherPeople,
    );
    assert.equal(game.store.authenticate(key.token), null);
    assert.equal(
      game.store.session(session.token).session.civId,
      civilizationId,
    );
    const journal = game.store.journal().events;
    for (const event of oldEvents)
      assert.deepEqual(
        journal.find((e) => e.id === event.id),
        event,
      );
    assert.ok(
      journal.some((e) => e.relatedId === oldId && e.civId === civilizationId),
    );
    const oldRecord = game.store.communityRecord(oldId, next.tick);
    const newRecord = game.store.communityRecord(civilizationId, next.tick);
    assert.ok(
      oldRecord.connections.some(
        (link) =>
          link.communityId === civilizationId &&
          link.relationship === "later-chapter",
      ),
    );
    assert.ok(
      newRecord.connections.some(
        (link) =>
          link.communityId === oldId && link.relationship === "earlier-chapter",
      ),
    );
    const restored = game.store.load(0, true);
    for (const field of Object.keys(next) as (keyof typeof next)[])
      if (field !== "changedTiles")
        assert.equal(
          digest(JSON.stringify(restored[field])),
          digest(JSON.stringify(next[field])),
          `persisted ${field}`,
        );
    assert.equal(
      (await claim({ name: "Repeated supplies", afterExtinction: true }))
        .status,
      409,
    );
    validateWorld(next);
  } finally {
    game.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("a stale stewardship change rolls back its world save and retains existing keys", () => {
  const store = new Store(":memory:");
  try {
    const world = store.load(1847),
      session = store.session(),
      oldId = world.civilizations[0].id;
    store.claim(session.session, oldId, world);
    const key = store.createAgent(oldId, "Still scoped", "Test");
    const speculative = structuredClone(world);
    speculative.civilizations[1].name = "Uncommitted change";
    assert.throws(
      () =>
        store.claim(session.session, world.civilizations[1].id, speculative),
      /stewardship changed/,
    );
    const restored = store.load(0, true);
    for (const field of Object.keys(world) as (keyof typeof world)[])
      assert.equal(
        digest(JSON.stringify(restored[field])),
        digest(JSON.stringify(world[field])),
        `rolled back ${field}`,
      );
    assert.equal(store.session(session.token).session.civId, oldId);
    assert.equal(store.authenticate(key.token)?.civId, oldId);
  } finally {
    store.close();
  }
});
