import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store, WorldLeaseError } from "../../src/server/store";
import { startWithLease } from "../../src/server/startup";

test("startup waits for an interrupted lease without replacing the world or clearing ownership", async () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-startup-"));
  const database = join(directory, "world.sqlite");
  const owner = new Store(database);
  let resumed: Awaited<ReturnType<typeof startWithLease>> | undefined;
  try {
    const original = owner.load(1847);
    owner.acquireLease(Date.now() - 29500);
    const held = owner.db
      .prepare("SELECT token,expires_at FROM world_lease")
      .get()!;
    const starting = startWithLease(
      { database, seed: 9999, autoTick: false, requireExistingWorld: true },
      3000,
    );
    assert.deepEqual(
      owner.db.prepare("SELECT token,expires_at FROM world_lease").get(),
      held,
    );
    resumed = await starting;
    assert.ok(Date.now() >= Number(held.expires_at));
    assert.deepEqual(resumed.getWorld(), original);
    assert.notEqual(
      resumed.store.db.prepare("SELECT token FROM world_lease").get()!.token,
      held.token,
    );
  } finally {
    resumed?.close();
    owner.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("startup stops after its bounded wait when a different world owner remains active", async () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-active-owner-"));
  const database = join(directory, "world.sqlite");
  const owner = new Store(database);
  try {
    const original = owner.load(1847);
    owner.acquireLease();
    const held = owner.db
      .prepare("SELECT token,expires_at FROM world_lease")
      .get();
    await assert.rejects(
      startWithLease(
        { database, autoTick: false, requireExistingWorld: true },
        75,
      ),
      WorldLeaseError,
    );
    assert.deepEqual(
      owner.db.prepare("SELECT token,expires_at FROM world_lease").get(),
      held,
    );
    assert.deepEqual(owner.load(0, true), original);
  } finally {
    owner.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
