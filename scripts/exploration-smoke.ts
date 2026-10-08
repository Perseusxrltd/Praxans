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
import { wrapX } from "../src/simulation/planet";

// The compiled observer talks only to a disposable, manually clocked world.
const temporary = await mkdtemp(join(tmpdir(), "praxans-exploration-"));
const output = "output/playwright/exploration-smoke";
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
const base = `http://127.0.0.1:${address.port}`;
const checks: string[] = [],
  errors: string[] = [];
const check = (label: string, condition: unknown) => {
  assert.ok(condition, label);
  checks.push(label);
  console.log(`Verified: ${label}`);
};
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const before = digest(JSON.stringify(game.getWorld()));
  check(
    "ordinary fresh communities have 300 distinct people each",
    game.getWorld().citizens.length === 900,
  );
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const state = () =>
    page
      .locator(".survey-stage canvas")
      .evaluate((el) =>
        JSON.parse((el as HTMLCanvasElement).dataset.exploration!),
      );
  const settled = async () => {
    await page.waitForTimeout(160);
    await page.waitForFunction(
      () => {
        const data = document.querySelector<HTMLCanvasElement>(
          ".survey-stage canvas",
        )?.dataset.exploration;
        return data && !JSON.parse(data).pending;
      },
      null,
      { timeout: 60000 },
    );
  };
  await page.goto(base);
  await page.locator(".planet-survey-link").click({ timeout: 60000 });
  await settled();
  check(
    "the entrance opens a resolved whole-planet survey",
    (await state()).scale === "Planet",
  );
  check(
    "the observer hook identifies planetary exploration",
    (await page.evaluate(
      () => JSON.parse(window.render_game_to_text()).mode,
    )) === "planet-survey",
  );
  await page.screenshot({ path: `${output}/01-planet.png`, fullPage: true });
  for (const level of ["Continent", "Region", "Ground"]) {
    await page.getByRole("button", { name: level, exact: true }).click();
    await settled();
    check(
      `${level.toLowerCase()} scale resolves without loading simulated regions`,
      (await state()).scale === level,
    );
  }
  const canvas = page.locator(".survey-stage canvas");
  await canvas.focus();
  const keyBefore = await state();
  await page.keyboard.press("ArrowRight");
  await settled();
  check(
    "arrow navigation moves the survey east",
    (await state()).x !== keyBefore.x,
  );
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 120, box.y + box.height / 2);
  const wheelBefore = await state();
  const anchorBefore = wrapX(
    wheelBefore.x + (120 - box.width / 2) * wheelBefore.tilesPerPixel,
  );
  await page.mouse.wheel(0, -200);
  await settled();
  const wheelAfter = await state();
  const anchorAfter = wrapX(
    wheelAfter.x + (120 - box.width / 2) * wheelAfter.tilesPerPixel,
  );
  check(
    "wheel zoom keeps the pointed ground location fixed",
    Math.abs(anchorBefore - anchorAfter) < 1e-6 &&
      wheelAfter.tilesPerPixel < wheelBefore.tilesPerPixel,
  );
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 90,
    box.y + box.height / 2 + 30,
    { steps: 8 },
  );
  await page.mouse.up();
  await settled();
  check(
    "drag navigation changes the viewed ground",
    (await state()).x !== wheelAfter.x,
  );
  await page.locator(".survey-communities button").first().click();
  await settled();
  await page.getByRole("button", { name: "Ground", exact: true }).click();
  await settled();
  await page.screenshot({
    path: `${output}/02-community-ground.png`,
    fullPage: true,
  });
  const bounded = await state();
  check(
    "survey rasters and retained cache stay bounded",
    bounded.textures <= 3 &&
      bounded.sampledPixels <= 100000 &&
      bounded.pixels <= 1503000,
  );
  check(
    "local detail identifies the real surface-cell area",
    (await page.locator(".survey-caption").innerText()).includes("100 m²"),
  );
  await page.locator(".survey-visit").click();
  await page.locator(".planet-explorer").waitFor({ state: "detached" });
  check(
    "visiting the selected community returns to its live local observer",
    (await page.evaluate(
      () => JSON.parse(window.render_game_to_text()).mode,
    )) !== "planet-survey",
  );
  await page.screenshot({ path: `${output}/03-community.png`, fullPage: true });
  await page
    .getByRole("button", { name: "Explore the whole planet", exact: true })
    .click();
  await settled();
  await page.setViewportSize({ width: 390, height: 844 });
  await settled();
  await page.locator(".survey-communities button").first().click();
  await settled();
  await page.screenshot({ path: `${output}/04-mobile.png`, fullPage: true });
  check(
    "mobile controls stay inside the viewport",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  const mobile = await state();
  await page
    .getByRole("button", { name: "Zoom into planet", exact: true })
    .click();
  await settled();
  check(
    "mobile zoom control resolves closer ground",
    (await state()).tilesPerPixel < mobile.tilesPerPixel,
  );
  await page.keyboard.press("Escape");
  await page.locator(".planet-explorer").waitFor({ state: "detached" });
  check(
    "closing the survey leaves the local observer usable",
    await page
      .getByRole("button", { name: "Explore the whole planet", exact: true })
      .isVisible(),
  );
  check(
    "camera travel preserves the world, clock, RNG, materialized terrain and inventories exactly",
    digest(JSON.stringify(game.getWorld())) === before,
  );
  check(
    "desktop and mobile exploration produce no browser errors",
    errors.length === 0,
  );
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ checks, errors, bounded, mobile }, null, 2),
  );
} finally {
  await browser?.close();
  game.close();
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await rm(temporary, { recursive: true, force: true });
}
