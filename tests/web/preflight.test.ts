import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { smallWorld as createWorld } from "./fixtures";
import { processDeaths } from "../../src/simulation/citizens";
import { digest, Store } from "../../src/server/store";
import { preflight } from "../../src/server/preflight";

test("candidate migration and renewal never write to the source world or operator request", async () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-preflight-source-")),
    database = join(directory, "world.sqlite"),
    requestPath = join(directory, "runtime", "intervention.json");
  try {
    const world = createWorld(1847, 64, 64),
      store = new Store(database);
    for (const person of world.citizens) person.health = 0;
    processDeaths(world);
    store.resumeClock(world.tick, 12345);
    store.save(world);
    const row = store.db.prepare("SELECT json FROM world WHERE id=1").get() as {
      json: string;
    };
    const metadata = JSON.parse(row.json);
    metadata.version = 8;
    metadata.lawsVersion = "biosphere-1.2";
    const json = JSON.stringify(metadata);
    store.db
      .prepare("UPDATE world SET json=?,checksum=? WHERE id=1")
      .run(json, digest(json));
    store.close();
    mkdirSync(join(directory, "runtime"));
    writeFileSync(
      requestPath,
      JSON.stringify({
        id: "private-preflight-renewal",
        worldId: world.id,
        seed: world.seed,
        civilizationIds: world.civilizations.map((c) => c.id),
        peoplePerCommunity: 32,
        suppliesPerPerson: {
          biomass: 480,
          wood: 80,
          fiber: 6,
          stone: 5,
          clay: 2,
        },
        habitat: { radius: 5, plantKg: 8, groundcoverKg: 2, seedKg: 0.3 },
        reason: "Disposable candidate validation.",
      }),
      { mode: 0o600 },
    );
    const before = readFileSync(database),
      requestBefore = readFileSync(requestPath);
    const report = await preflight(database);
    assert.equal(report.id, world.id);
    assert.equal(report.sourceTick, world.tick);
    assert.equal(report.tick, world.tick + 32);
    assert.equal(report.format, 10);
    assert.equal(report.laws, "biosphere-1.4");
    assert.ok(
      before.equals(readFileSync(database)),
      "the original checkpoint, clock, lease and history are byte-for-byte unchanged",
    );
    assert.ok(requestBefore.equals(readFileSync(requestPath)));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
