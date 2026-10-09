import assert from "node:assert/strict";
import { createServer, request, type ServerResponse } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import { Store } from "../src/server/store";
import { createWorld } from "../src/simulation/world";
import { WorldGateway } from "../src/server/gateway";

const directory = await mkdtemp(join(tmpdir(), "praxans-reconnect-"));
const database = join(directory, "world.sqlite");
const output = "output/playwright/reconnect-smoke";
await mkdir(output, { recursive: true });
const fixture = new Store(database);
fixture.save(createWorld(1847, 64, 64, "planet-1", 8));
fixture.close();
Object.assign(process.env, {
  PRAXANS_MANUAL_CLOCK: "0",
  PRAXANS_TEST_CONTROLS: "0",
  PRAXANS_REQUIRE_EXISTING_WORLD: "1",
  PRAXANS_RELEASE: "reconnect-trial",
  PUBLIC_ORIGIN: "",
  SERVER_ORIGIN: "",
});
const gateway = new WorldGateway(database, resolve("dist/server/runtime.mjs"));
const streams = new Set<ServerResponse>();
let upstreamPort = 0,
  refusalsRemaining = 0,
  refusals = 0,
  streamRequests = 0;
const proxy = createServer((req, res) => {
  const streaming =
    new URL(req.url!, "http://localhost").pathname === "/api/stream";
  if (streaming) {
    streamRequests++;
    if (refusalsRemaining > 0) {
      refusalsRemaining--;
      refusals++;
      res.writeHead(503, {
        "Content-Type": "application/json",
        "Retry-After": "1",
      });
      res.end('{"error":"Deliberate temporary service outage"}');
      return;
    }
    streams.add(res);
    res.on("close", () => streams.delete(res));
  }
  const upstream = request(
    {
      hostname: "127.0.0.1",
      port: upstreamPort,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (response) => {
      res.writeHead(response.statusCode!, response.headers);
      response.pipe(res);
      res.on("close", () => response.destroy());
    },
  );
  upstream.on("error", () => res.destroy());
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
});
const checks: string[] = [],
  errors: string[] = [];
const check = (label: string, condition: unknown) => {
  assert.ok(condition, label);
  checks.push(label);
};
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await gateway.start();
  await new Promise<void>((done) =>
    gateway.server.listen(0, "127.0.0.1", done),
  );
  const address = gateway.server.address();
  assert.ok(address && typeof address !== "string");
  upstreamPort = address.port;
  await new Promise<void>((done) => proxy.listen(0, "127.0.0.1", done));
  const exposed = proxy.address();
  assert.ok(exposed && typeof exposed !== "string");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !(
        message.location().url.includes("/api/stream") &&
        message.text().includes("503")
      )
    )
      errors.push(message.text());
  });
  const state = () =>
    page.evaluate(() => JSON.parse(window.render_game_to_text()));
  await page.goto(`http://127.0.0.1:${exposed.port}`);
  await page
    .getByRole("button", { name: "Watch the world", exact: true })
    .click();
  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).connected,
  );
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.locator(".community-list .community-row").first().click();
  const before = await state();
  refusalsRemaining = 2;
  for (const response of streams) response.end();
  await page.waitForFunction(
    () => !JSON.parse(window.render_game_to_text()).connected,
  );
  check("an interrupted observer visibly reports disconnection", true);
  await page.screenshot({
    path: `${output}/01-disconnected.png`,
    fullPage: true,
  });
  await page.waitForFunction(
    (tick) => {
      const s = JSON.parse(window.render_game_to_text());
      return s.connected && s.tick > tick;
    },
    before.tick,
    { timeout: 30000 },
  );
  check(
    "two real HTTP 503 responses do not permanently stop observation",
    refusals === 2 && streamRequests >= 4,
  );
  const after = await state();
  await writeFile(
    `${output}/camera-diagnostic.json`,
    JSON.stringify(
      {
        before: { viewport: before.viewport, selection: before.selection },
        after: { viewport: after.viewport, selection: after.selection },
      },
      null,
      2,
    ) + "\n",
  );
  check(
    "reconnection retains the camera and selected community without reloading",
    ["x", "y", "zoom", "width", "height"].every(
      (key) => after.viewport[key] === before.viewport[key],
    ) && JSON.stringify(after.selection) === JSON.stringify(before.selection),
  );
  check(
    "reconnection continues the same world's clock and community identities",
    after.tick > before.tick &&
      JSON.stringify(after.communities.map((c: { id: string }) => c.id)) ===
        JSON.stringify(before.communities.map((c: { id: string }) => c.id)),
  );
  await page.screenshot({
    path: `${output}/02-reconnected.png`,
    fullPage: true,
  });
  refusalsRemaining = 10;
  for (const response of streams) response.end();
  const deadline = Date.now() + 15000;
  while (refusals === 2 && Date.now() < deadline) await sleep(25);
  assert.ok(
    refusals > 2,
    "the next attempt must receive an actual failed HTTP response",
  );
  await page.locator("button.brand").click();
  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).mode === "planet-onboarding",
  );
  const stopped = streamRequests;
  await sleep(3500);
  check(
    "returning to the planet cancels a pending surface reconnect",
    streamRequests === stopped && streams.size === 0,
  );
  check(
    "recovery creates no browser errors beyond the deliberately refused requests",
    errors.length === 0,
  );
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        checks,
        errors,
        refusals,
        streamRequests,
        beforeTick: before.tick,
        afterTick: after.tick,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({ checks, errors, refusals, streamRequests }, null, 2),
  );
} finally {
  await writeFile(
    `${output}/last-checks.json`,
    JSON.stringify({ checks, errors, refusals, streamRequests }, null, 2) +
      "\n",
  );
  await browser?.close();
  for (const response of streams) response.destroy();
  proxy.closeAllConnections();
  await new Promise<void>((done) => proxy.close(() => done()));
  await gateway.close();
  await rm(directory, { recursive: true, force: true });
}
