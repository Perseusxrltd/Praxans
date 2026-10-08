import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { Store } from "../../src/server/store";
import { createGameServer } from "../../src/server/app";
import { processDeaths } from "../../src/simulation/citizens";
import { recordEvent } from "../../src/simulation/events";
import type { CommunityRecord } from "../../src/simulation/types";

test("community and category filters precede archive pagination and respect observation time", () => {
  const store = new Store(":memory:");
  try {
    const world = store.load(1847),
      [first, second] = world.civilizations;
    for (let i = 0; i < 12; i++) {
      recordEvent(world, {
        category: "discovery",
        civId: first.id,
        title: `A remembered trial ${i}`,
        detail: "An archived observation.",
      });
    }
    for (let i = 0; i < 130; i++) {
      recordEvent(world, {
        category: "culture",
        civId: second.id,
        title: `Another community's day ${i}`,
        detail: "Unrelated to the requested community.",
      });
    }
    store.save(world);
    const firstPage = store.journal(undefined, 5, {
      civilizationIds: [first.id],
      category: "discovery",
      throughTick: 0,
    });
    assert.equal(firstPage.events.length, 5);
    assert.ok(
      firstPage.events.every(
        (e) => e.civId === first.id && e.category === "discovery",
      ),
    );
    const secondPage = store.journal(firstPage.next!, 5, {
      civilizationIds: [first.id],
      category: "discovery",
      throughTick: 0,
    });
    assert.equal(secondPage.events.length, 5);
    assert.ok(
      secondPage.events.every(
        (e) => !firstPage.events.some((earlier) => earlier.id === e.id),
      ),
    );
    assert.equal(
      store.journal(secondPage.next!, 5, {
        civilizationIds: [first.id],
        category: "discovery",
      }).events.length,
      2,
    );
    world.tick = 1;
    recordEvent(world, {
      category: "culture",
      civId: second.id,
      relatedId: first.id,
      title: "A new chapter in the same world",
      detail: "A later beginning with separate founders.",
    });
    store.save(world);
    const oldView = store.journal(undefined, 60, {
      civilizationIds: [first.id],
      category: "culture",
      throughTick: 0,
    });
    assert.equal(
      oldView.events.length,
      0,
      "a paused view does not acquire a future chapter",
    );
    assert.equal(
      store.journal(undefined, 60, {
        civilizationIds: [first.id],
        category: "culture",
        throughTick: 1,
      }).events.length,
      1,
    );
    assert.equal(
      store.communityRecord(first.id, 1).connections[0].relationship,
      "later-chapter",
    );
    assert.equal(
      store.communityRecord(second.id, 1).connections[0].relationship,
      "earlier-chapter",
    );
    assert.equal(store.communityRecord(first.id, 0).connections.length, 0);
  } finally {
    store.close();
  }
});

test("public community records preserve extinct histories without inventing a date or exposing management", async () => {
  const game = createGameServer({ database: ":memory:", autoTick: false });
  const server = game.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const world = game.getWorld(),
      civ = world.civilizations[0];
    for (const person of world.citizens)
      if (person.civId === civ.id) person.health = 0;
    processDeaths(world);
    game.store.save(world);
    const before = game.store.db
      .prepare("SELECT checksum FROM world WHERE id=1")
      .get();
    const response = await fetch(`${base}/api/communities/${civ.id}/record`);
    assert.equal(response.status, 200);
    const record = (await response.json()) as CommunityRecord;
    assert.equal(record.recordedDeaths, civ.deaths);
    assert.equal(
      record.lastDeath?.tick,
      0,
      "zero is a valid recorded ending tick",
    );
    assert.equal(record.firstEvent?.category, "founding");
    assert.equal(record.communityId, civ.id);
    assert.ok(!JSON.stringify(record).includes("hash"));
    const scoped = await (
      await fetch(
        `${base}/api/journal?communities=${civ.id}&category=life&through=0`,
      )
    ).json();
    assert.equal(scoped.events.length, Math.min(60, civ.deaths));
    let cursor = scoped.next;
    const allDeaths = [...scoped.events];
    while (cursor !== null) {
      const page = await (
        await fetch(
          `${base}/api/journal?communities=${civ.id}&category=life&through=0&before=${cursor}`,
        )
      ).json();
      allDeaths.push(...page.events);
      cursor = page.next;
    }
    assert.equal(allDeaths.length, civ.deaths);
    assert.equal(
      new Set(allDeaths.map((e: { id: string }) => e.id)).size,
      civ.deaths,
    );
    assert.ok(allDeaths.every((e: { civId: string }) => e.civId === civ.id));
    assert.equal(
      (await fetch(`${base}/api/communities/missing/record`)).status,
      404,
    );
    assert.equal(
      (await fetch(`${base}/api/communities/${civ.id}/record?through=1`))
        .status,
      400,
    );
    assert.equal(
      (await fetch(`${base}/api/journal?communities=missing`)).status,
      400,
    );
    assert.equal((await fetch(`${base}/api/journal?communities=`)).status, 400);
    assert.equal(
      (await fetch(`${base}/api/journal?category=unrecorded`)).status,
      400,
    );
    assert.equal((await fetch(`${base}/api/journal?through=1`)).status, 400);
    assert.deepEqual(
      game.store.db.prepare("SELECT checksum FROM world WHERE id=1").get(),
      before,
      "reading history cannot change the world",
    );
    game.store.db
      .prepare("DELETE FROM world_events WHERE id=?")
      .run(record.lastDeath!.id);
    const incomplete = game.store.communityRecord(civ.id, world.tick);
    assert.notEqual(
      incomplete.recordedDeaths,
      civ.deaths,
      "an incomplete archive cannot establish the final loss from an earlier death",
    );
  } finally {
    game.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
