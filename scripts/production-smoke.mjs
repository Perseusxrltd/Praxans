import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as sleep } from "node:timers/promises";

// Exercise the compiled, continuously ticking server only in a disposable world.
const temporary = await mkdtemp(join(tmpdir(), "praxans-production-"));
const database = join(temporary, "world.sqlite"),
  backup = join(temporary, "backup.sqlite");
const port = process.env.PRAXANS_PRODUCTION_TEST_PORT ?? "5175",
  base = `http://127.0.0.1:${port}`;
const environment = {
  ...process.env,
  NODE_ENV: "production",
  HOST: "127.0.0.1",
  PORT: port,
  PRAXANS_DB: database,
  PRAXANS_MANUAL_CLOCK: "0",
  PRAXANS_TEST_CONTROLS: "1",
  PUBLIC_ORIGIN: "",
  SERVER_ORIGIN: "",
};
let server,
  logs = "";
const checks = [];
const check = (label, condition) => {
  assert.ok(condition, label);
  checks.push(label);
};
async function request(path, options) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  return response;
}
async function start(release, seed) {
  server = spawn(process.execPath, ["dist/server/index.js", "--production"], {
    env: { ...environment, WORLD_SEED: seed, PRAXANS_RELEASE: release },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  server.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  for (let attempt = 0; attempt < 300; attempt++) {
    if (server.exitCode !== null)
      throw new Error(`Production server exited: ${logs}`);
    try {
      const health = await (await request("/api/health")).json();
      if (health.ok && health.lagSeconds < 2) return health;
    } catch {}
    await sleep(200);
  }
  throw new Error(`Production server did not recover: ${logs}`);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const closed = once(server, "exit");
  server.kill("SIGTERM");
  await closed;
  server = undefined;
}
function head(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return JSON.parse(
      db.prepare("SELECT json FROM world WHERE id=1").get().json,
    );
  } finally {
    db.close();
  }
}
async function command(args, extra = {}) {
  const process = spawn(globalThis.process.execPath, args, {
    env: { ...environment, ...extra },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  process.stdout.on("data", (chunk) => {
    output += chunk;
  });
  process.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const [code] = await once(process, "exit");
  assert.equal(code, 0, output);
  return output;
}
try {
  await start("production-smoke-1", "1847");
  const initial = await (await request("/api/world")).json();
  await sleep(1500);
  check(
    "the compiled server advances while nobody watches",
    (await (await request("/api/health")).json()).tick > initial.tick,
  );
  check(
    "production never exposes manual time controls",
    (
      await fetch(`${base}/api/dev/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"ticks":10}',
      })
    ).status === 404,
  );
  const session = await request("/api/session"),
    cookie = session.headers.get("set-cookie").split(";")[0];
  const headers = {
    "Content-Type": "application/json",
    "X-Praxans-Client": "browser",
    Cookie: cookie,
  };
  const civilizationId = initial.civilizations[0].id;
  await request("/api/claim", {
    method: "POST",
    headers,
    body: JSON.stringify({ civilizationId }),
  });
  const connection = await (
    await request("/api/agents", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Continuity trial",
        provider: "Custom agent",
      }),
    })
  ).json();
  await command(["--import", "tsx", "scripts/example-agent.ts", "--once"], {
    PRAXANS_URL: base,
    PRAXANS_AGENT_TOKEN: connection.token,
  });
  const afterAgent = await (
    await request("/api/agent/observe", {
      headers: { Authorization: `Bearer ${connection.token}` },
    })
  ).json();
  check(
    "the runnable example agent can observe and guide its community",
    afterAgent.civilization.id === civilizationId &&
      afterAgent.civilization.civics.proposals.some(
        (p) => p.action.type === "focus" && p.action.focus === "balance",
      ),
  );
  await command(["dist/server/maintenance.js", "inspect"]);
  await command(["dist/server/maintenance.js", "backup", backup]);
  const backupHead = head(backup);
  check(
    "online backup captures an existing world and its claimed community",
    backupHead.tick > 0 &&
      backupHead.civilizations.find((civ) => civ.id === civilizationId).claimed,
  );
  await stop();
  const saved = head(database),
    stoppedAt = Date.now();
  environment.PRAXANS_REQUIRE_EXISTING_WORLD = "1";
  await sleep(3500);
  const downtime = Date.now() - stoppedAt;
  await start("production-smoke-2", "9999");
  const continued = await (await request("/api/world")).json();
  check(
    "restart preserves the seed, people, and geography",
    continued.seed === initial.seed &&
      JSON.stringify(continued.citizens.map((person) => person.id)) ===
        JSON.stringify(initial.citizens.map((person) => person.id)) &&
      continued.tiles[0].x === initial.tiles[0].x &&
      continued.tiles[0].y === initial.tiles[0].y &&
      Math.abs(
        continued.tiles[0].elevation * 600 -
          continued.tiles[0].surfaceChange -
          (initial.tiles[0].elevation * 600 - initial.tiles[0].surfaceChange),
      ) < 0.0001,
  );
  check(
    "restart simulates missed time instead of erasing the interruption",
    continued.tick >= saved.tick + Math.floor(downtime / 250) - 2,
  );
  check(
    "browser ownership survives a process restart",
    (await (await request("/api/session", { headers })).json())
      .civilizationId === civilizationId,
  );
  const resumedAdvice = await (
    await request("/api/agent/observe", {
      headers: { Authorization: `Bearer ${connection.token}` },
    })
  ).json();
  check(
    "the same agent key survives a process restart",
    resumedAdvice.civilization.id === civilizationId,
  );
  const submittedProposal = afterAgent.civilization.civics.proposals.find(
    (proposal) =>
      proposal.action.type === "focus" && proposal.action.focus === "balance",
  );
  check(
    "the advice retains its identity and content across process restarts",
    resumedAdvice.civilization.civics.proposals.some(
      (proposal) =>
        proposal.id === submittedProposal.id &&
        JSON.stringify(proposal.action) ===
          JSON.stringify(submittedProposal.action),
    ),
  );
  const interventions = await (await request("/api/interventions")).json();
  check(
    "each service release is recorded once in the continuing world",
    interventions.interventions.length === 2,
  );
  await stop();
  // A backup can retain its owner's unexpired lease. The actual entrypoint must
  // wait for expiry, without clearing that lease or spending host restart attempts.
  const leaseDb = new DatabaseSync(backup, { readOnly: true });
  const expiry =
    leaseDb.prepare("SELECT expires_at FROM world_lease WHERE id=1").get()
      ?.expires_at ?? 0;
  leaseDb.close();
  environment.PRAXANS_DB = backup;
  await start("production-smoke-1", "5555");
  check(
    "restoring a backup respects the previous ownership lease",
    Date.now() >= expiry,
  );
  check(
    "the backup itself can resume with the original owner and key",
    (await (await request("/api/session", { headers })).json())
      .civilizationId === civilizationId &&
      (
        await (
          await request("/api/agent/observe", {
            headers: { Authorization: `Bearer ${connection.token}` },
          })
        ).json()
      ).civilization.id === civilizationId,
  );
  await mkdir("output/validation", { recursive: true });
  const report = {
    checks,
    passed: checks.length,
    savedTick: saved.tick,
    continuedTick: continued.tick,
    backupTick: backupHead.tick,
  };
  await writeFile(
    "output/validation/production-smoke.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await stop();
  await rm(temporary, { recursive: true, force: true });
}
