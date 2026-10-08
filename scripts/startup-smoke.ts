import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import express from "express";
import { chromium } from "playwright";
import { createGameServer } from "../src/server/app";
import { digest } from "../src/server/store";
import { stepWorld } from "../src/simulation/engine";

const temporary = await mkdtemp(join(tmpdir(), "praxans-startup-")),
  output = "output/playwright/startup-smoke";
await mkdir(output, { recursive: true });
const game = createGameServer({
  database: join(temporary, "world.sqlite"),
  autoTick: false,
});
game.app.use(express.static(resolve("dist/client")));
const server = createServer(game.app);
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`,
  checks: string[] = [],
  errors: string[] = [];
const check = (label: string, condition: unknown) => {
  assert.ok(condition, label);
  checks.push(label);
  console.log(`Verified: ${label}`);
};
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let releaseOverview: (() => void) | undefined;
try {
  const before = digest(JSON.stringify(game.getWorld()));
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  let streams = 0,
    detailedWorldRequests = 0,
    overviewRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/stream") streams++;
    if (new URL(request.url()).pathname === "/api/world")
      detailedWorldRequests++;
    if (new URL(request.url()).pathname === "/api/overview") overviewRequests++;
  });
  const started = performance.now();
  await page.goto(base);
  await page.locator(".planet-view.ready").waitFor({ timeout: 60000 });
  await page
    .getByRole("button", { name: "Watch the world", exact: true })
    .waitFor();
  const firstPlanetMs = performance.now() - started;
  check(
    "the actual planet becomes visible without an individual-world transfer",
    streams === 0 && detailedWorldRequests === 0,
  );
  check(
    "the entrance reports the real 900-person population",
    (await page.locator(".planet-vitals").innerText()).includes("900"),
  );
  check(
    "a small initial geographic texture is available",
    Number(
      await page
        .locator(".planet-view canvas")
        .getAttribute("data-atlas-width"),
    ) >= 256,
  );
  await page.screenshot({
    path: `${output}/01-first-planet.png`,
    fullPage: true,
  });
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLCanvasElement>(".planet-view canvas")?.dataset
        .atlasWidth === "1024",
    null,
    { timeout: 60000 },
  );
  check("the real geography refines without reloading the page", streams === 0);
  await page.screenshot({
    path: `${output}/02-refined-planet.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Watch the world", exact: true })
    .click();
  await page.waitForFunction(
    () => {
      const state = JSON.parse(window.render_game_to_text());
      return (
        state.mode === "shared-world" &&
        state.communities?.reduce(
          (n: number, c: { people: number }) => n + c.people,
          0,
        ) === 900
      );
    },
    null,
    { timeout: 60000 },
  );
  check(
    "entering the surface opens the detailed observer stream",
    streams === 1,
  );
  await page.screenshot({ path: `${output}/03-surface.png`, fullPage: true });
  check(
    "browsing leaves the authoritative world unchanged",
    digest(JSON.stringify(game.getWorld())) === before,
  );

  const olderOverview = await (
    await page.request.get(`${base}/api/overview`)
  ).json();
  // Advance only this disposable fixture, then reload directly into observation.
  const world = game.getWorld();
  stepWorld(world, 8);
  game.store.advanceClock(world.tick);
  game.store.save(world);
  const afterAdvance = digest(JSON.stringify(world)),
    overviewsBeforeReload = overviewRequests;
  await page.reload();
  await page.waitForFunction(
    (tick) => {
      const state = JSON.parse(window.render_game_to_text());
      return state.mode === "shared-world" && state.tick === tick;
    },
    world.tick,
    { timeout: 60000 },
  );
  const observed = await page.evaluate(() =>
    JSON.parse(window.render_game_to_text()),
  );
  check(
    "an observer reload obtains current detail without an entrance request",
    streams === 2 && overviewRequests === overviewsBeforeReload,
  );
  const withheldOverview = new Promise<void>((resolve) => {
    releaseOverview = resolve;
  });
  await page.route("**/api/overview", async (route) => {
    await withheldOverview;
    await route.fulfill({ json: olderOverview });
  });
  const overviewRequested = page.waitForRequest("**/api/overview");
  await page.getByRole("button", { name: "Praxans home", exact: true }).click();
  await overviewRequested;
  const returned = await page.evaluate(() =>
    JSON.parse(window.render_game_to_text()),
  );
  check(
    "home immediately retains the observed clock and population while its request waits",
    returned.mode === "planet-onboarding" &&
      returned.tick === observed.tick &&
      JSON.stringify(returned.time) === JSON.stringify(observed.time) &&
      returned.communities.every((community: { id: string; people: number }) =>
        observed.communities.some(
          (previous: { id: string; people: number }) =>
            community.id === previous.id &&
            community.people === previous.people,
        ),
      ) &&
      returned.communities.length === observed.communities.length,
  );
  await page.locator(".planet-view.ready").waitFor();
  await page.screenshot({
    path: `${output}/04-returned-planet.png`,
    fullPage: true,
  });
  const staleResponse = page.waitForResponse("**/api/overview");
  assert.ok(releaseOverview);
  releaseOverview();
  await (await staleResponse).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const afterStale = await page.evaluate(() =>
    JSON.parse(window.render_game_to_text()),
  );
  check(
    "an older cached overview cannot move the displayed clock or totals backwards",
    afterStale.tick === returned.tick &&
      JSON.stringify(afterStale.time) === JSON.stringify(returned.time) &&
      JSON.stringify(afterStale.communities) ===
        JSON.stringify(returned.communities),
  );
  check(
    "returning to the planet does not open another detailed stream",
    streams === 2 && detailedWorldRequests === 0,
  );
  check(
    "reloading and returning home leave the advanced fixture unchanged",
    digest(JSON.stringify(game.getWorld())) === afterAdvance,
  );
  check("no browser errors occurred", errors.length === 0);
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ checks, errors, firstPlanetMs }, null, 2) + "\n",
  );
} finally {
  releaseOverview?.();
  await browser?.close();
  game.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(temporary, { recursive: true, force: true });
}
