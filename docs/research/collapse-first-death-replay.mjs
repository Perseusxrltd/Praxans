// Historical diagnostic only. Run against the explicitly prepared detached
// checkout and independent backups described in collapse-reproduction.md.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const baselineCommit = "4ed610b48c604ab9734a301ecdddda55fc9f6111";
const sourceSha256 =
  "a973f2a1e4e3df17eab5d11e63467b635c13eddfed8124ef6b53d480f5da94ce";
const historySha256 =
  "4beed425fdc4ba9b4bd70d84b1054977a88571caff72be30582df7dd28681811";
const instrumentedPhysiologySha256 =
  "087b1b6c833d780cba1b8f63e9c6c7ff2f4d9e18661c1bc53e4abdb388eeed34";
const root = path.resolve(import.meta.dirname, "../..");
const [baselineArg, outputArg] = process.argv.slice(2);
const verifyInputsOnly = outputArg === "--verify-inputs";
if (!baselineArg) {
  throw new Error(
    "Pass the prepared detached historical checkout. See collapse-reproduction.md; this is a bounded 3,113-tick replay, not a live-world operation.",
  );
}
const baseline = path.resolve(baselineArg);
const source = path.join(
  root,
  "output/backups/before-construction-planning-20261008.sqlite",
);
const history = path.join(
  root,
  "output/backups/before-work-planning-release-20261008.sqlite",
);
const output =
  outputArg && !verifyInputsOnly
    ? path.resolve(outputArg)
    : path.join(root, "output/research/collapse-first-death-recheck.json");
assert.ok(!fs.existsSync(output), "Recheck output already exists");
const sha = (value) => createHash("sha256").update(value).digest("hex");
async function fingerprint(file) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
const git = (...args) =>
  execFileSync("git", ["-C", baseline, ...args], { encoding: "utf8" }).trim();
assert.equal(git("rev-parse", "HEAD"), baselineCommit);
assert.equal(
  git("diff", "--name-only", "--", "src"),
  "src/simulation/physiology.ts",
);
assert.equal(git("diff", "--cached", "--name-only", "--", "src"), "");
assert.equal(
  await fingerprint(path.join(baseline, "src/simulation/physiology.ts")),
  instrumentedPhysiologySha256,
  "Historical wrapper differs from the recorded observational patch",
);
assert.equal(await fingerprint(source), sourceSha256);
assert.equal(await fingerprint(history), historySha256);
if (verifyInputsOnly) {
  console.log(
    JSON.stringify({
      baselineCommit,
      instrumentedPhysiologySha256,
      sourceSha256,
      historySha256,
      verifiedInputsOnly: true,
      simulationAdvanced: false,
    }),
  );
  process.exit(0);
}

const { stepWorld, validateWorld } = await import(
  pathToFileURL(path.join(baseline, "src/simulation/engine.ts")).href
);
const { canReachCampStocks } = await import(
  pathToFileURL(path.join(baseline, "src/simulation/settlement.ts")).href
);
const sourceDb = new DatabaseSync(source, { readOnly: true });
let world;
try {
  const metadata = sourceDb
    .prepare("SELECT json,checksum FROM world WHERE id=1")
    .get();
  assert.equal(sha(metadata.json), metadata.checksum);
  world = JSON.parse(metadata.json);
  world.tiles = [];
  const query = sourceDb.prepare("SELECT json,checksum FROM chunks WHERE id=?");
  for (const chunk of world.chunks) {
    const row = query.get(chunk.id);
    assert.equal(chunk.start, world.tiles.length);
    assert.equal(sha(row.json), row.checksum);
    world.tiles.push(...JSON.parse(row.json));
  }
} finally {
  sourceDb.close();
}
const historyDb = new DatabaseSync(history, { readOnly: true });
let first;
try {
  first = JSON.parse(
    historyDb
      .prepare(
        "SELECT json FROM world_events WHERE tick>195860 AND json_type(json,'$.lifeState')='object' ORDER BY tick,sequence LIMIT 1",
      )
      .get().json,
  );
} finally {
  historyDb.close();
}
assert.equal(world.tick, 228436);
assert.equal(first.tick, 231549);
const targetId = first.citizenId;
assert.ok(world.citizens.some((person) => person.id === targetId));
validateWorld(world);

const started = performance.now();
const sourceTick = world.tick;
const trace = [];
const daily = [];
globalThis.__praxansThermalProbe = (
  phase,
  current,
  person,
  civ,
  tile,
  dt,
  active,
  shelterResistance,
) => {
  if (person.id !== targetId) return;
  trace.push({
    phase,
    tick: current.tick,
    dt,
    active,
    shelterResistance,
    ageYears: person.age,
    bodyKg: person.body,
    health: person.health,
    hunger: person.hunger,
    hydrationKg: person.hydration,
    provisionsKg: person.provisions,
    wrapKg: person.wrapMass,
    stockFoodKg: civ.stock.biomass,
    stockFiberKg: civ.stock.fiber,
    atHome: canReachCampStocks(current, civ, person),
    position: { x: person.x, y: person.y },
    task: person.task?.kind ?? null,
    temperatureC: tile.temperature,
    sickness: person.sick,
  });
  if (trace.length > 96) trace.shift();
};
let actual = null;
try {
  while (world.tick <= first.tick + 1) {
    const previousDeaths = world.deaths;
    stepWorld(world);
    if (world.tick % 96 === 0) {
      const person = world.citizens.find((p) => p.id === targetId);
      const row = {
        tick: world.tick,
        population: world.citizens.length,
        births: world.births,
        deaths: world.deaths,
        elapsedSeconds: (performance.now() - started) / 1000,
        target: person
          ? {
              health: person.health,
              bodyKg: person.body,
              hunger: person.hunger,
              wrapKg: person.wrapMass,
            }
          : null,
      };
      daily.push(row);
      console.log(JSON.stringify(row));
      await new Promise((resolve) => setImmediate(resolve));
    }
    if (world.deaths > previousDeaths) {
      actual =
        world.events.find(
          (event) => event.citizenId === targetId && event.lifeState,
        ) ?? null;
      if (actual) break;
    }
  }
} finally {
  delete globalThis.__praxansThermalProbe;
}
validateWorld(world);
assert.equal(await fingerprint(source), sourceSha256);
assert.equal(await fingerprint(history), historySha256);
const exact = JSON.stringify(actual) === JSON.stringify(first);
const report = {
  recordedAtUTC: new Date().toISOString(),
  source,
  sourceSha256,
  history,
  historySha256,
  sourceTick,
  finalTick: world.tick,
  baselineCommit,
  instrumentedPhysiologySha256,
  method:
    "Historical source with the recorded observational wrapper; detached in-memory replay on independent verified backups. The wrapper reads one person before and after heat regulation without changing physical state.",
  elapsedSeconds: (performance.now() - started) / 1000,
  sourceUnchanged: true,
  historyUnchanged: true,
  expected: first,
  actual,
  deathEventExactlyReproduced: exact,
  trace,
  daily,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
  flag: "wx",
});
console.log(
  JSON.stringify({
    output,
    tick: world.tick,
    deathEventExactlyReproduced: exact,
  }),
);
assert.ok(exact, "Historical first death was not exactly reproduced");
