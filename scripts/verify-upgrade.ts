import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store, digest } from "../src/server/store";
import { stepWorld, validateWorld } from "../src/simulation/engine";
import { elementLedger, elementalErrors } from "../src/simulation/chemistry";
import type { World } from "../src/simulation/types";
import { backupDatabase } from "../src/server/backup";
import { verifyWorldArchives, type WorldArchive } from "../src/server/archives";

const sourcePath = process.argv[2],
  ticks = Number(process.argv[3] ?? 288),
  reportPath = process.argv[4];
if (!sourcePath || !Number.isInteger(ticks) || ticks < 0 || ticks > 3000)
  throw new Error(
    "Usage: tsx scripts/verify-upgrade.ts <offline-backup.sqlite> [0–3000 forward ticks] [report.json]. Never use the active service database.",
  );
const fileHash = () =>
  createHash("sha256").update(readFileSync(sourcePath)).digest("hex");
const sourceHash = fileHash(),
  directory = mkdtempSync(join(tmpdir(), "praxans-upgrade-"));
let store: Store | undefined;
try {
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  let old: World;
  let oldArchives: WorldArchive[] = [];
  const counts: Record<string, number> = {};
  const protectedRows: Record<string, string> = {};
  const ordering = {
    sessions: "hash",
    agents: "id",
    receipts: "agent_id,request_id",
    world_events: "sequence",
    world_history: "tick",
    world_clock: "id",
  };
  try {
    assert.equal(
      (source.prepare("PRAGMA integrity_check").get() as Record<string, string>)
        .integrity_check,
      "ok",
    );
    const head = source
      .prepare("SELECT json,checksum FROM world WHERE id=1")
      .get() as { json: string; checksum: string };
    assert.equal(digest(head.json), head.checksum);
    old = JSON.parse(head.json);
    oldArchives = verifyWorldArchives(source);
    old.tiles = [];
    for (const chunk of old.chunks) {
      const row = source
        .prepare("SELECT json,checksum FROM chunks WHERE id=?")
        .get(chunk.id) as { json: string; checksum: string };
      assert.equal(digest(row.json), row.checksum);
      old.tiles.push(...JSON.parse(row.json));
    }
    for (const [table, order] of Object.entries(ordering)) {
      const rows: Record<string, unknown>[] = source
        .prepare(`SELECT * FROM ${table} ORDER BY ${order}`)
        .all();
      counts[table] = rows.length;
      protectedRows[table] = digest(JSON.stringify(rows));
    }
    await backupDatabase(source, join(directory, "copy.sqlite"));
  } finally {
    source.close();
  }
  store = new Store(join(directory, "copy.sqlite"));
  const next = store.load(0, true);
  const archives = verifyWorldArchives(store.db);
  for (const archive of oldArchives)
    assert.deepEqual(
      archives.find((item) => item.id === archive.id),
      archive,
      "Every earlier archive must remain unchanged and verifiable",
    );
  for (const key of [
    "id",
    "seed",
    "rng",
    "tick",
    "nextId",
    "generationVersion",
  ] as const)
    assert.equal(next[key], old![key], key);
  assert.deepEqual(
    next.citizens.map(({ mind, journeyId, ...p }) => p),
    old!.citizens.map(({ mind, journeyId, ...p }) => p),
  );
  assert.deepEqual(
    next.civilizations.map((c) => c.stock),
    old!.civilizations.map((c) => c.stock),
  );
  assert.deepEqual(
    next.structures.map((s) => s.properties.cost),
    old!.structures.map((s) => s.properties.cost),
  );
  assert.deepEqual(
    next.tiles.map(({ sediment, surfaceChange, ice, seedBank, ...t }) => t),
    old!.tiles.map(({ sediment, surfaceChange, ice, seedBank, ...t }) => t),
  );
  for (const [table, order] of Object.entries(ordering)) {
    const rows: Record<string, unknown>[] = store.db
      .prepare(`SELECT * FROM ${table} ORDER BY ${order}`)
      .all();
    assert.equal(rows.length, counts[table]);
    assert.equal(
      digest(JSON.stringify(rows)),
      protectedRows[table],
      `${table} rows must be unchanged by migration`,
    );
  }
  const normalized = structuredClone(old!);
  for (const tile of normalized.tiles) {
    tile.sediment ??= 0;
    tile.ice ??= 0;
    tile.seedBank ??= [];
  }
  for (const caravan of normalized.caravans) caravan.provisions ??= 0;
  const before = elementLedger(normalized),
    after = elementLedger(next);
  const migrationElementDifference = Math.max(
    ...Object.keys(before).map((symbol) =>
      Math.abs(before[symbol] - after[symbol]),
    ),
  );
  assert.ok(migrationElementDifference < 0.000001);
  const sourceTick = next.tick,
    people = next.citizens.length;
  store.resumeClock(next.tick);
  const simulationStarted = performance.now();
  for (let n = 0; n < ticks; n += 96) {
    stepWorld(next, Math.min(96, ticks - n));
    validateWorld(next);
    if (process.env.PRAXANS_VERIFY_PROGRESS === "1")
      console.log(
        JSON.stringify({
          tick: next.tick,
          people: next.citizens.length,
          communities: next.civilizations.map((c) => ({
            name: c.name,
            people: next.citizens.filter((p) => p.civId === c.id).length,
            food: Math.round(c.stock.biomass),
          })),
          minimumNourishment: next.citizens.length
            ? Math.min(...next.citizens.map((p) => p.hunger))
            : null,
          minimumHealth: next.citizens.length
            ? Math.min(...next.citizens.map((p) => p.health))
            : null,
        }),
      );
  }
  const simulationMs = performance.now() - simulationStarted;
  store.advanceClock(next.tick);
  store.save(next);
  assert.deepEqual(store.load(0, true), next);
  store.resumeClock(next.tick);
  assert.equal(
    fileHash(),
    sourceHash,
    "the original backup must remain byte-for-byte unchanged",
  );
  const report = {
    checkedAt: new Date().toISOString(),
    backupSha256: sourceHash,
    fromFormat: old!.version,
    toFormat: next.version,
    laws: next.lawsVersion,
    seed: next.seed,
    sourceTick,
    sourcePeople: people,
    sourceRegions: old!.chunks.length,
    archives: {
      retained: oldArchives.length,
      total: archives.length,
      checksums: "valid",
    },
    preserved: [
      "source backup bytes",
      "seed",
      "RNG",
      "next identity",
      "clock",
      "generator",
      "existing citizen fields",
      "terrain fields",
      "stocks",
      "reserved structure matter",
      "ownership/key/receipt/archive/clock rows",
    ],
    migrationElementDifferenceKg: migrationElementDifference,
    forwardTicks: ticks,
    simulationMs,
    resultingStateChecksum: digest(JSON.stringify(next)),
    resultingTick: next.tick,
    resultingPeople: next.citizens.length,
    resultingEcosystem: {
      plants: next.tiles.reduce(
        (n, t) => n + Number(!!t.plant) + Number(!!t.groundcover),
        0,
      ),
      producerKg: next.tiles.reduce(
        (n, t) => n + (t.plant?.carbon ?? 0) + (t.groundcover?.carbon ?? 0),
        0,
      ),
      dormantCohorts: next.tiles.reduce((n, t) => n + t.seedBank.length, 0),
      dormantKg: next.tiles.reduce(
        (n, t) => n + t.seedBank.reduce((m, seed) => m + seed.carbon, 0),
        0,
      ),
      animalCohorts: next.animals.length,
      temperatureRange: next.tiles.reduce(
        ([low, high], t) => [
          Math.min(low, t.temperature),
          Math.max(high, t.temperature),
        ],
        [Infinity, -Infinity],
      ),
    },
    resultingElementErrors: elementalErrors(next, elementLedger(next)),
    restart: "exact",
    integrity: "ok",
  };
  if (reportPath)
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  store?.close();
  rmSync(directory, { recursive: true, force: true });
}
