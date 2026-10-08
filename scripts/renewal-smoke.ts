import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import express from "express";
import { chromium } from "playwright";
import { createGameServer } from "../src/server/app";
import { applyRenewal } from "../src/server/intervention";
import { processDeaths } from "../src/simulation/citizens";
import { stepWorld } from "../src/simulation/engine";

// A private fixture and compiled browser assets; no live service or HMR changes.
const temporary = await mkdtemp(join(tmpdir(), "praxans-renewal-browser-"));
const output = "output/playwright/renewal-smoke";
await mkdir(output, { recursive: true });
const game = createGameServer({
  database: join(temporary, "world.sqlite"),
  autoTick: false,
  testControls: true,
});
game.app.use(express.static(resolve("dist/client")));
const server = createServer(game.app);
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
const checks: string[] = [],
  errors: string[] = [];
const check = (label: string, condition: unknown) => {
  assert.ok(condition, label);
  checks.push(label);
};
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const world = game.getWorld(),
    previous = world.civilizations[0];
  stepWorld(world, 192);
  game.store.advanceClock(world.tick);
  const session = game.store.session();
  previous.claimed = true;
  game.store.claim(session.session, previous.id, world);
  const agent = game.store.createAgent(
    previous.id,
    "Continuing adviser",
    "Test",
  );
  for (const person of world.citizens)
    if (person.civId === previous.id) person.health = 0;
  processDeaths(world);
  game.store.save(world);
  const oldDeaths = previous.deaths,
    foundedTick = previous.foundedTick;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: base,
    viewport: { width: 1440, height: 900 },
  });
  await context.addCookies([
    {
      name: "praxans_session",
      value: session.token!,
      url: base,
      httpOnly: true,
    },
  ]);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(base);
  await page
    .getByRole("button", { name: "Watch the world", exact: true })
    .click();
  const directory = () => page.locator("[data-community-directory]");
  const openDirectory = () =>
    page
      .getByRole("navigation", { name: "World views" })
      .getByRole("button", { name: "Communities", exact: true })
      .click();
  await openDirectory();
  await directory()
    .getByRole("button", { name: `Follow ${previous.name}`, exact: true })
    .click();
  await directory()
    .getByRole("button", { name: `Read ${previous.name} history`, exact: true })
    .click();
  await page.locator(".community-memorial").waitFor();
  await page.screenshot({ path: `${output}/01-before.png`, fullPage: true });
  const renewed = applyRenewal(game.store, world, {
    id: "browser-renewal",
    worldId: world.id,
    seed: world.seed,
    civilizationIds: [previous.id],
    peoplePerCommunity: 300,
    suppliesPerPerson: { biomass: 480, wood: 80, fiber: 6, stone: 5, clay: 2 },
    habitat: { radius: 5, plantKg: 8, groundcoverKg: 2, seedKg: 0.3 },
    reason: "Explicit intervention in a disposable browser fixture.",
  });
  // Only this in-process test replaces its fixture. Production applies the
  // same transaction before the new sole owner starts its persistent clock.
  Object.assign(world, renewed);
  await page.evaluate(() => window.advanceTime(250));
  await page
    .locator(".community-renewal")
    .getByText(/300 new residents arrived/)
    .waitFor();
  check(
    "an already open memorial changes to its new chapter without a reload",
    (await page.locator(".community-memorial").count()) === 0,
  );
  check(
    "earlier losses remain visible",
    (await page
      .getByText(`${oldDeaths} remembered lives`, { exact: true })
      .count()) === 1,
  );
  check(
    "the original founding date stays unchanged",
    game.getWorld().civilizations.find((c) => c.id === previous.id)!
      .foundedTick === foundedTick,
  );
  await page.screenshot({
    path: `${output}/02-renewed-history.png`,
    fullPage: true,
  });
  await openDirectory();
  const entry = directory().locator(`[data-community-id="${previous.id}"]`);
  await entry.getByText("Renewed", { exact: true }).waitFor();
  check(
    "the same followed community becomes living with 300 new residents",
    (await entry.innerText()).includes("300 people") &&
      (await entry.innerText()).includes("Living"),
  );
  check(
    "following survives the renewal",
    (await entry
      .getByRole("button", { name: `Unfollow ${previous.name}`, exact: true })
      .getAttribute("aria-pressed")) === "true",
  );
  check(
    "the original agent key still observes its community",
    (
      await fetch(`${base}/api/agent/observe`, {
        headers: { Authorization: `Bearer ${agent.token}` },
      })
    ).ok,
  );
  await page.screenshot({
    path: `${output}/03-renewed-directory.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/04-mobile.png`, fullPage: true });
  check(
    "renewal fits the mobile observer",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.reload();
  await page.waitForFunction(
    (id) =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).following?.includes(id),
    previous.id,
  );
  check(
    "following and ownership survive reload after renewal",
    game.store.session(session.token).session.civId === previous.id,
  );
  check("renewal produces no browser errors", errors.length === 0);
  await writeFile(
    join(output, "results.json"),
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser?.close();
  game.close();
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await rm(temporary, { recursive: true, force: true });
}
