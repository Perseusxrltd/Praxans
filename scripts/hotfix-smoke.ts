import assert from "node:assert/strict";
import { get } from "node:http";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import { WorldGateway, controlSocket } from "../src/server/gateway";
import {
  bytesHash,
  dependencyHash,
  type RuntimeArtifact,
} from "../src/server/artifact";
import { SseRecords } from "../src/server/sse";

const temporary = await mkdtemp(join(tmpdir(), "praxans-handover-")),
  database = join(temporary, "world.sqlite"),
  output = "output/playwright/hotfix-smoke";
await mkdir(output, { recursive: true });
process.env.PRAXANS_MANUAL_CLOCK = "0";
process.env.PRAXANS_TEST_CONTROLS = "0";
process.env.PRAXANS_REQUIRE_EXISTING_WORLD = "0";
process.env.PRAXANS_RELEASE = "handover-baseline";
process.env.PUBLIC_ORIGIN = "";
process.env.SERVER_ORIGIN = "";
let gateway = new WorldGateway(database, resolve("dist/server/runtime.mjs"));
const checks: string[] = [],
  errors: string[] = [];
const check = (label: string, value: unknown) => {
  assert.ok(value, label);
  checks.push(label);
  console.log(`Verified: ${label}`);
};
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let stream: ReturnType<typeof get> | undefined;
let base = "";
async function bind() {
  await gateway.start();
  await new Promise<void>((done) =>
    gateway.server.listen(0, "127.0.0.1", done),
  );
  const address = gateway.server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
}
async function artifact(release: string, prefix = "") {
  const directory = join(temporary, release);
  await mkdir(directory);
  const code = prefix + (await readFile("dist/server/runtime.mjs", "utf8"));
  const manifest: RuntimeArtifact = {
    protocol: 1,
    release,
    notes:
      "A continuity trial on a disposable world; natural laws stay unchanged.",
    sha256: bytesHash(code),
    dependencies: await dependencyHash(),
    nodeMajor: Number(process.versions.node.split(".")[0]),
  };
  await writeFile(join(directory, "runtime.mjs"), code);
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  return directory;
}
try {
  await bind();
  const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...options,
      signal: AbortSignal.timeout(90000),
    }).catch((cause) => {
      throw new Error(
        `Request failed: ${path}; gateway ${JSON.stringify(gateway.status())}`,
        { cause },
      );
    });
    assert.ok(
      response.ok,
      `${path}: HTTP ${response.status}: ${response.ok ? "" : await response.text()}`,
    );
    return response;
  };
  const initial = await (await request("/api/world")).json();
  const session = await request("/api/session");
  const cookie = session.headers.get("set-cookie")!.split(";")[0];
  const headers = {
    "Content-Type": "application/json",
    "X-Praxans-Client": "browser",
    Cookie: cookie,
  };
  await request("/api/claim", {
    method: "POST",
    headers,
    body: JSON.stringify({ civilizationId: initial.civilizations[0].id }),
  });
  const connection = await (
    await request("/api/agents", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Continuing adviser",
        provider: "Continuity trial",
      }),
    })
  ).json();
  const authorization = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${connection.token}`,
  };
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto(base);
  await page
    .getByRole("button", { name: "Watch the world", exact: true })
    .click();
  await page.locator(".community-list .community-row").first().click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const view = await page.evaluate(() =>
    JSON.parse(window.render_game_to_text()),
  );
  await page.screenshot({ path: `${output}/01-before.png`, fullPage: true });
  let snapshots = 0,
    ended = false,
    previousTick = -1,
    backward = false;
  let streamStatus = 0,
    receivedBytes = 0;
  stream = get(`${base}/api/stream`, (response) => {
    streamStatus = response.statusCode ?? 0;
    const records = new SseRecords((buffer) => {
      const record = buffer.toString("utf8");
      const data = record.split("\n").find((line) => line.startsWith("data: "));
      if (!data) return;
      const value = JSON.parse(data.slice(6));
      if (record.startsWith("event: snapshot")) snapshots++;
      if (typeof value.tick === "number") {
        if (value.tick < previousTick) backward = true;
        previousTick = value.tick;
      }
    });
    response.on("data", (part: Buffer) => {
      receivedBytes += part.length;
      records.push(part);
    });
    response.on("end", () => {
      ended = true;
    });
  });
  stream.on("error", () => {
    ended = true;
  });
  for (let n = 0; snapshots < 1 && !ended && n < 600; n++) await sleep(50);
  assert.ok(
    snapshots >= 1,
    `initial observer snapshot: HTTP ${streamStatus}, ${receivedBytes} bytes, ended=${ended}`,
  );
  check(
    "the operator endpoint is a private local socket",
    ((await stat(controlSocket(database))).mode & 0o777) === 0o600,
  );
  const bad = await artifact(
    "handover-rejected",
    'throw new Error("Deliberate failed candidate");\n',
  );
  const oldPid = gateway.status().runtimePid;
  const beforeRejected = (await (await request("/api/health")).json()).tick;
  await assert.rejects(gateway.activate(bad), /Candidate validation failed/);
  check(
    "failed candidate validation leaves the current runtime alive",
    gateway.status().runtimePid === oldPid,
  );
  await sleep(1000);
  check(
    "the world continues while an invalid hotfix is rejected",
    (await (await request("/api/health")).json()).tick > beforeRejected,
  );
  const candidate = await artifact("handover-accepted");
  const activation = gateway.activate(candidate);
  let activationEnded = false;
  void activation
    .finally(() => {
      activationEnded = true;
    })
    .catch(() => {});
  for (
    let n = 0;
    gateway.status().phase !== "handover" && !activationEnded && n < 1800;
    n++
  )
    await sleep(50);
  assert.equal(gateway.status().phase, "handover");
  const payload = {
    requestId: "handover-request-0001",
    actions: [
      {
        type: "focus",
        focus: "preserve",
        reason: "Retain living roots and future food.",
      },
    ],
  };
  const queued = request("/api/agent/actions", {
    method: "POST",
    headers: authorization,
    body: JSON.stringify(payload),
  });
  const activationResult = await activation;
  console.log(`Activation completed: ${JSON.stringify(gateway.status())}`);
  const receipt = await (await queued).json();
  check(
    "a request arriving during handover completes through the new runtime",
    receipt.replayed === false && receipt.proposals.length === 1,
  );
  const replayed = await (
    await request("/api/agent/actions", {
      method: "POST",
      headers: authorization,
      body: JSON.stringify(payload),
    })
  ).json();
  check(
    "the same request ID cannot duplicate an intention across a hotfix",
    replayed.replayed === true,
  );
  check(
    "the runtime process changes while the gateway stays in place",
    gateway.status().runtimePid !== oldPid,
  );
  for (let n = 0; snapshots < 2 && n < 200; n++) await sleep(50);
  check(
    "the same observer connection receives the new runtime snapshot without ending",
    snapshots >= 2 && !ended,
  );
  check("stream time stays monotonic through the handover", !backward);
  const observed = await (
    await request("/api/agent/observe", { headers: authorization })
  ).json();
  check(
    "the agent still observes its original community",
    observed.civilization.id === initial.civilizations[0].id,
  );
  const after = await (await request("/api/world")).json();
  check(
    "the same world, inhabitants and increasing clock survive",
    after.seed === initial.seed &&
      after.tick > initial.tick &&
      JSON.stringify(after.citizens.map((p: { id: string }) => p.id)) ===
        JSON.stringify(initial.citizens.map((p: { id: string }) => p.id)),
  );
  const afterView = await page.evaluate(() =>
    JSON.parse(window.render_game_to_text()),
  );
  check(
    "the browser retains its inspection and camera",
    afterView.viewport.zoom === view.viewport.zoom &&
      JSON.stringify(afterView.selection) === JSON.stringify(view.selection),
  );
  await page.screenshot({ path: `${output}/02-after.png`, fullPage: true });
  const interventions = await (await request("/api/interventions")).json();
  check(
    "activation has one permanent release record",
    interventions.interventions.filter(
      (i: { id: string }) => i.id === "release:handover-accepted",
    ).length === 1,
  );
  await browser.close();
  browser = undefined;
  stream.destroy();
  stream = undefined;
  await gateway.close();
  gateway = new WorldGateway(
    database,
    join(temporary, "must-not-start-old-binary.mjs"),
  );
  await bind();
  check(
    "a full process restart uses the durable active runtime pointer",
    gateway.status().release === "handover-accepted",
  );
  const continued = await (
    await request("/api/agent/observe", { headers: authorization })
  ).json();
  check(
    "ownership and accepted intentions persist after gateway restart",
    continued.civilization.id === initial.civilizations[0].id &&
      continued.civilization.civics.proposals.length === 1,
  );
  check(
    `the browser reports no errors during runtime replacement: ${errors.join("; ")}`,
    errors.length === 0,
  );
  const slow = await artifact(
    "handover-shutdown",
    'if (process.argv.includes("--preflight")) await new Promise((done) => setTimeout(done, 60000));\n',
  );
  const interrupted = gateway.activate(slow);
  const rejected = assert.rejects(interrupted, /validation failed|stopping/);
  for (let n = 0; gateway.status().managedProcesses < 2 && n < 200; n++)
    await sleep(25);
  check(
    "the next candidate validates while the active world remains running",
    gateway.status().managedProcesses === 2,
  );
  await gateway.close();
  await rejected;
  check(
    "shutdown during validation leaves no candidate or runtime orphan",
    gateway.status().managedProcesses === 0,
  );
  const report = {
    checks,
    errors,
    activation: activationResult,
    observerSnapshots: snapshots,
  };
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(
    join(output, "last-checks.json"),
    JSON.stringify({ checks, errors }, null, 2) + "\n",
  );
  stream?.destroy();
  await browser?.close();
  await gateway.close();
  await rm(temporary, { recursive: true, force: true });
}
