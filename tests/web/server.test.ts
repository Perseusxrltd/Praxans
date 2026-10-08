import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { get as httpGet } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createGameServer } from "../../src/server/app";
import { Store } from "../../src/server/store";
import { stepWorld } from "../../src/simulation/engine";

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
