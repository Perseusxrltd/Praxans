import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { get as httpGet } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createGameServer } from "../../src/server/app";
import { Store } from "../../src/server/store";
import { stepWorld } from "../../src/simulation/engine";
import { smallWorld } from "./fixtures";

test("reader-delayed saving pauses unsaved time and resumes the same world automatically", async () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-checkpoint-retry-")),
    path = join(directory, "world.sqlite");
  const fixture = new Store(path),
    world = smallWorld(1847);
  fixture.resumeClock(world.tick, Date.now() - 20000);
  fixture.save(world);
  fixture.close();
  const game = createGameServer({ database: path, requireExistingWorld: true });
  game.store.db.exec("PRAGMA busy_timeout=2");
  const created = game.store.createAgent(
    world.civilizations[0].id,
    "Continuity steward",
    "Test",
  );
  const agent = game.store.authenticate(created.token)!;
  const batch = {
    requestId: "before-storage-wait-0001",
    actions: [{ type: "focus", focus: "build", reason: "Consider shelter." }],
  };
  const receipt = game.act(agent, batch);
  const initialClock = game.store.db
    .prepare("SELECT tick,wall_ms FROM world_clock WHERE id=1")
    .get()!;
  game.store.db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
  let reader: DatabaseSync | undefined = new DatabaseSync(path, {
    readOnly: true,
  });
  reader.exec("BEGIN");
  reader.prepare("SELECT checksum FROM world WHERE id=1").get();
  const server = game.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const health = async () => await (await fetch(`${base}/api/health`)).json();
  try {
    let status = await health();
    for (
      let n = 0;
      status.simulation !== "waiting-for-storage" && n < 200;
      n++
    ) {
      await new Promise((done) => setTimeout(done, 25));
      status = await health();
    }
    assert.equal(status.simulation, "waiting-for-storage");
    assert.equal(status.ok, true);
    assert.equal(status.acceptingProposals, false);
    const pausedTick = status.tick,
      paused = JSON.stringify(game.getWorld());
    const rejected = await fetch(`${base}/api/agent/actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${created.token}`,
      },
      body: JSON.stringify({ ...batch, requestId: "during-storage-wait-0001" }),
    });
    assert.equal(rejected.status, 503);
    assert.equal((await rejected.json()).code, "WORLD_STORAGE_BUSY");
    assert.equal(rejected.headers.get("retry-after"), "5");
    assert.deepEqual(game.act(agent, batch), { ...receipt, replayed: true });
    await new Promise((done) => setTimeout(done, 550));
    assert.equal((await health()).tick, pausedTick);
    assert.equal(JSON.stringify(game.getWorld()), paused);
    assert.equal(
      game.store.receipt(agent.id, "during-storage-wait-0001"),
      undefined,
    );
    reader.close();
    reader = undefined;
    for (let n = 0; n < 200; n++) {
      status = await health();
      if (status.acceptingProposals && status.tick > pausedTick) break;
      await new Promise((done) => setTimeout(done, 25));
    }
    assert.equal(status.acceptingProposals, true);
    assert.ok(status.tick > pausedTick);
    assert.notEqual(status.simulation, "halted");
    const clock = game.store.db
      .prepare("SELECT tick,wall_ms FROM world_clock WHERE id=1")
      .get()!;
    assert.ok(Number(clock.tick) >= pausedTick);
    assert.equal(
      Number(clock.wall_ms) - Number(initialClock.wall_ms),
      (Number(clock.tick) - Number(initialClock.tick)) * 250,
    );
    assert.equal(game.getWorld().id, world.id);
    assert.deepEqual(game.act(agent, batch), { ...receipt, replayed: true });
  } finally {
    reader?.close();
    game.close();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    rmSync(directory, { recursive: true, force: true });
  }
});

async function advanceWithIO(
  world: Parameters<typeof stepWorld>[0],
  ticks: number,
) {
  for (let i = 0; i < ticks; i += 4) {
    stepWorld(world, Math.min(4, ticks - i));
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

test("SQLite restores the exact world and rejects a modified checkpoint", () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-save-")),
    path = join(directory, "world.sqlite");
  try {
    const first = new Store(path),
      world = first.load(1847);
    stepWorld(world, 120);
    first.save(world);
    first.close();
    const second = new Store(path);
    assert.deepEqual(second.load(0), world);
    second.db.prepare("UPDATE world SET checksum=?").run("broken");
    assert.throws(() => second.load(0), /checksum/);
    second.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("HTTP and actual MCP clients share scoped, atomic, idempotent world actions", async () => {
  const game = createGameServer({ database: ":memory:", autoTick: false });
  const server = game.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const call = (
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  let mcp: Client | undefined;
  try {
    // Native fetch owns Host; use a raw HTTP request to exercise Railway's probe.
    const railwayProbe = (path: string) =>
      new Promise<number | undefined>((resolve, reject) => {
        httpGet(
          `${base}${path}`,
          { headers: { Host: "healthcheck.railway.app" }, agent: false },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        ).on("error", reject);
      });
    assert.equal(await railwayProbe("/api/health"), 200);
    assert.equal(await railwayProbe("/api/world"), 403);
    const session = await call("/api/session"),
      cookie = session.headers.get("set-cookie")!.split(";")[0];
    const owner = { Cookie: cookie, "X-Praxans-Client": "browser" },
      civId = game.getWorld().civilizations[0].id;
    assert.equal(
      (await call("/api/claim", "POST", { civilizationId: civId }, owner))
        .status,
      200,
    );
    assert.equal(
      (await (await call("/api/session", "GET", undefined, owner)).json())
        .civilizationId,
      civId,
    );
    const created = await (
      await call(
        "/api/agents",
        "POST",
        { name: "Test steward", provider: "HTTP test client" },
        owner,
      )
    ).json();
    const bearer = { Authorization: `Bearer ${created.token}` };
    assert.equal((await call("/api/agent/observe")).status, 401);
    const observed = await (
      await call("/api/agent/observe", "GET", undefined, bearer)
    ).json();
    assert.equal(observed.civilization.id, civId);
    assert.equal(observed.protocol, "praxans/2");
    assert.equal(observed.neighbors.length, 0);
    assert.ok(observed.progress && observed.authority);
    const batch = {
      requestId: "test-action-0001",
      actions: [
        {
          type: "focus",
          focus: "preserve",
          reason: "Leave viable plants and preserve future growth.",
        },
      ],
    };
    const applied = await call("/api/agent/actions", "POST", batch, bearer);
    assert.equal(applied.status, 200);
    const receipt = await applied.json();
    assert.equal(receipt.replayed, false);
    assert.equal(receipt.proposals[0].status, "pending");
    assert.equal(game.getWorld().civilizations[0].focus, "nourish");
    assert.equal(
      (await (await call("/api/agent/actions", "POST", batch, bearer)).json())
        .replayed,
      true,
    );
    assert.equal(
      (
        await call(
          "/api/agent/actions",
          "POST",
          { ...batch, actions: [{ ...batch.actions[0], focus: "build" }] },
          bearer,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          "/api/agent/actions",
          "POST",
          { ...batch, civilizationId: game.getWorld().civilizations[1].id },
          bearer,
        )
      ).status,
      400,
    );
    assert.equal(game.getWorld().civilizations[1].focus, "discover");
    await advanceWithIO(game.getWorld(), 96);
    assert.equal(
      game.getWorld().civilizations[0].civics.proposals[0].status,
      "accepted",
    );
    assert.equal(game.getWorld().civilizations[0].focus, "preserve");
    const pub = JSON.stringify(await (await call("/api/world")).json());
    assert.ok(!pub.includes(created.token));
    assert.ok(!pub.includes('"hash"'));
    assert.equal(
      (await call("/api/dev/advance", "POST", { ticks: 1 })).status,
      404,
    );
    assert.equal(
      (
        await call(
          "/api/claim",
          "POST",
          { civilizationId: civId },
          { ...owner, Origin: "https://unrelated.example" },
        )
      ).status,
      403,
    );
    mcp = new Client({ name: "praxans-integration-test", version: "1.0" });
    await mcp.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: bearer },
      }),
    );
    const tools = await mcp.listTools();
    assert.deepEqual(tools.tools.map((t) => t.name).sort(), [
      "evaluate_assembly",
      "inspect_element",
      "inspect_sky",
      "observe_world",
      "read_natural_laws",
      "steward_civilization",
    ]);
    const observation = await mcp.callTool({
      name: "observe_world",
      arguments: {},
    });
    assert.ok(JSON.stringify(observation).includes(civId));
    const result = await mcp.callTool({
      name: "steward_civilization",
      arguments: {
        requestId: "mcp-action-0001",
        actions: [
          {
            type: "policy",
            policy: "sharing",
            value: 0.75,
            reason: "Share food with those who need it.",
          },
        ],
      },
    });
    assert.notEqual(result.isError, true);
    assert.equal(game.getWorld().civilizations[0].policies.sharing, 0.7);
    assert.equal(
      game.getWorld().civilizations[0].civics.proposals.at(-1)!.status,
      "pending",
    );
    await advanceWithIO(game.getWorld(), 96);
    const finalProposal = game
      .getWorld()
      .civilizations[0].civics.proposals.at(-1)!;
    assert.equal(finalProposal.status, "accepted");
    assert.equal(game.getWorld().civilizations[0].policies.sharing, 0.75);
    // Only this disposable manual-clock fixture receives artificial debt.
    game.store.resumeClock(game.getWorld().tick, Date.now() - 60000);
    game.store.save(game.getWorld());
    const debtClock = game.store.db
      .prepare("SELECT tick,wall_ms FROM world_clock WHERE id=1")
      .get();
    const physicalState = () =>
      JSON.stringify({
        tick: game.getWorld().tick,
        rng: game.getWorld().rng,
        tiles: game.getWorld().tiles,
        people: game.getWorld().citizens,
        animals: game.getWorld().animals,
        structures: game.getWorld().structures,
        stocks: game.getWorld().civilizations.map((c) => c.stock),
      });
    const beforeDebtAdvice = physicalState();
    const replayDuringDebt = await call(
      "/api/agent/actions",
      "POST",
      batch,
      bearer,
    );
    assert.equal(replayDuringDebt.status, 200);
    assert.equal((await replayDuringDebt.json()).replayed, true);
    const debtBatch = { ...batch, requestId: "debt-http-new-0001" };
    const beforeFailedCommit = JSON.stringify(game.getWorld());
    game.store.db.exec(
      "CREATE TEMP TRIGGER receipt_failure BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'disposable receipt failure'); END",
    );
    assert.equal(
      (await call("/api/agent/actions", "POST", debtBatch, bearer)).status,
      500,
    );
    game.store.db.exec("DROP TRIGGER receipt_failure");
    assert.equal(
      JSON.stringify(game.getWorld()),
      beforeFailedCommit,
      "a failed database commit must not leak a staged proposal into live state",
    );
    assert.deepEqual(
      game.store.db
        .prepare("SELECT tick,wall_ms FROM world_clock WHERE id=1")
        .get(),
      debtClock,
    );
    const submittedDuringDebt = await call(
      "/api/agent/actions",
      "POST",
      debtBatch,
      bearer,
    );
    assert.equal(submittedDuringDebt.status, 200);
    const debtReceipt = await submittedDuringDebt.json();
    assert.equal(debtReceipt.tick, game.getWorld().tick);
    assert.equal(debtReceipt.proposals[0].status, "pending");
    assert.equal(debtReceipt.proposals[0].dueTick, game.getWorld().tick + 16);
    assert.equal(
      physicalState(),
      beforeDebtAdvice,
      "recovery advice does not execute work, move inhabitants, change resources or skip time",
    );
    assert.deepEqual(
      game.store.db
        .prepare("SELECT tick,wall_ms FROM world_clock WHERE id=1")
        .get(),
      debtClock,
      "accepting advice does not erase accumulated clock debt",
    );
    const beforeDebtReads = JSON.stringify(game.getWorld());
    assert.equal(
      (await (await call("/api/health")).json()).acceptingProposals,
      true,
    );
    const observationDuringDebt = await mcp.callTool({
      name: "observe_world",
      arguments: {},
    });
    assert.notEqual(observationDuringDebt.isError, true);
    assert.ok(JSON.stringify(observationDuringDebt).includes(civId));
    assert.match(JSON.stringify(observationDuringDebt), /catching-up/);
    assert.match(JSON.stringify(observationDuringDebt), /acceptingProposals/);
    const estimateDuringDebt = await call(
      "/api/agent/evaluate",
      "POST",
      {
        name: "A material estimate",
        components: [
          {
            material: "wood",
            x: 0,
            y: 0,
            z: 0,
            width: 0.1,
            depth: 0.1,
            height: 0.1,
          },
        ],
      },
      bearer,
    );
    assert.equal(estimateDuringDebt.status, 200);
    const mcpReplayDuringDebt = await mcp.callTool({
      name: "steward_civilization",
      arguments: batch,
    });
    assert.notEqual(mcpReplayDuringDebt.isError, true);
    assert.ok(JSON.stringify(mcpReplayDuringDebt).includes("replayed"));
    const mcpNewDuringDebt = await mcp.callTool({
      name: "steward_civilization",
      arguments: { ...batch, requestId: "debt-mcp-new-0001" },
    });
    assert.equal(mcpNewDuringDebt.isError, true);
    assert.match(JSON.stringify(mcpNewDuringDebt), /four simulated hours/i);
    assert.equal(
      JSON.stringify(game.getWorld()),
      beforeDebtReads,
      "observations, receipt reads and refused new decisions preserve the world and its tick",
    );
    assert.equal(
      (
        game.store.db
          .prepare("SELECT count(*) AS count FROM receipts")
          .get() as { count: number }
      ).count,
      3,
    );
    const beforeConnection = {
      tick: game.getWorld().tick,
      rng: game.getWorld().rng,
      stock: JSON.stringify(game.getWorld().civilizations.map((c) => c.stock)),
      people: game.getWorld().citizens.map((person) => person.id),
    };
    const issuedDuringDebt = await call(
      "/api/agents",
      "POST",
      { name: "Another adviser", provider: "Test" },
      owner,
    );
    assert.equal(
      issuedDuringDebt.status,
      201,
      "the owner can connect an adviser while the world catches up",
    );
    const additional = await issuedDuringDebt.json();
    const additionalBearer = { Authorization: `Bearer ${additional.token}` };
    assert.equal(
      (
        await (
          await call("/api/agent/observe", "GET", undefined, additionalBearer)
        ).json()
      ).civilization.id,
      civId,
    );
    assert.equal(
      (
        await call(
          "/api/agent/actions",
          "POST",
          { ...batch, requestId: "new-connection-during-debt" },
          additionalBearer,
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await call(
          "/api/agents",
          "POST",
          { name: "Unowned", provider: "Test" },
          bearer,
        )
      ).status,
      403,
      "a scoped agent key cannot issue management credentials",
    );
    assert.equal(
      (
        await call(
          `/api/agents/${additional.agent.id}`,
          "DELETE",
          undefined,
          owner,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call("/api/agent/observe", "GET", undefined, additionalBearer))
        .status,
      401,
      "revocation also takes effect during recovery",
    );
    assert.deepEqual(
      {
        tick: game.getWorld().tick,
        rng: game.getWorld().rng,
        stock: JSON.stringify(
          game.getWorld().civilizations.map((c) => c.stock),
        ),
        people: game.getWorld().citizens.map((person) => person.id),
      },
      beforeConnection,
    );
    game.store.resumeClock(game.getWorld().tick);
    await mcp.close();
    mcp = undefined;
    assert.equal(
      (
        await call(
          `/api/agents/${created.agent.id}`,
          "DELETE",
          undefined,
          owner,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call("/api/agent/observe", "GET", undefined, bearer)).status,
      401,
    );
  } finally {
    await mcp?.close();
    game.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("a halted world reports unavailable advice but can replay a committed receipt", async () => {
  const game = createGameServer({ database: ":memory:" });
  const created = game.store.createAgent(
    game.getWorld().civilizations[0].id,
    "Steward",
    "Test",
  );
  const agent = game.store.authenticate(created.token)!;
  const batch = {
    requestId: "before-halt-receipt-0001",
    actions: [{ type: "focus", focus: "build", reason: "Consider shelter." }],
  };
  const receipt = game.act(agent, batch);
  const beforeFault = JSON.stringify(game.getWorld());
  game.store.heartbeat = () => {
    throw new Error("disposable storage failure");
  };
  const server = game.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const submit = (value: unknown) =>
    fetch(`${base}/api/agent/actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${created.token}`,
      },
      body: JSON.stringify(value),
    });
  try {
    let health;
    for (let n = 0; n < 100; n++) {
      health = await fetch(`${base}/api/health`);
      if (health.status === 503) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(health?.status, 503);
    const status = await health!.json();
    assert.equal(status.simulation, "halted");
    assert.equal(status.acceptingProposals, false);
    const rejected = await submit({
      ...batch,
      requestId: "after-halt-proposal-0001",
    });
    assert.equal(rejected.status, 503);
    assert.equal((await rejected.json()).code, "WORLD_HALTED");
    const replay = await submit(batch);
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), { ...receipt, replayed: true });
    assert.equal(JSON.stringify(game.getWorld()), beforeFault);
  } finally {
    game.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
