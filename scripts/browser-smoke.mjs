import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

// A separate, disposable world. This script never advances or adopts a live player's world.
const temporary = await mkdtemp(join(tmpdir(), "praxans-browser-"));
const port = process.env.PRAXANS_BROWSER_TEST_PORT ?? "5174",
  base = `http://127.0.0.1:${port}`;
const output = "output/playwright/browser-smoke";
await mkdir(output, { recursive: true });
const server = spawn(
  process.execPath,
  ["--import", "tsx", "src/server/index.ts"],
  {
    env: {
      ...process.env,
      PORT: port,
      HOST: "127.0.0.1",
      PRAXANS_DB: join(temporary, "world.sqlite"),
      PRAXANS_TEST_CONTROLS: "1",
      PRAXANS_MANUAL_CLOCK: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverLog = "";
server.stdout.on("data", (data) => {
  serverLog += data;
});
server.stderr.on("data", (data) => {
  serverLog += data;
});
let browser;
const errors = [],
  checks = [];
const check = (label, condition) => {
  assert.ok(condition, label);
  checks.push(label);
};
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await sleep(150);
  }
  assert.ok(ready, `Test server did not start: ${serverLog}`);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const otherContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage(),
    other = await otherContext.newPage();
  for (const p of [page, other]) {
    p.on("pageerror", (error) => errors.push(String(error)));
    p.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
  }
  const state = (p) =>
    p.evaluate(() => JSON.parse(window.render_game_to_text()));
  await page.goto(base);
  await other.goto(base);
  for (const p of [page, other])
    await p.waitForFunction(
      () =>
        window.render_game_to_text &&
        JSON.parse(window.render_game_to_text()).mode === "planet-onboarding",
    );
  await page.locator(".planet-view.ready").waitFor({ timeout: 60000 });
  check(
    "the opening globe renders the actual seeded world",
    (await state(page)).communities.length === 3,
  );
  await page.screenshot({ path: `${output}/00-planet.png`, fullPage: true });
  for (const p of [page, other])
    await p
      .getByRole("button", { name: "Watch the world", exact: true })
      .click();
  // Establish both initial streams before the test-only HTTP clock response
  // can race a still-buffered initial snapshot from either observer.
  for (const p of [page, other])
    await p.waitForFunction(() => {
      const state = JSON.parse(window.render_game_to_text());
      return (
        state.mode === "shared-world" && state.connected && state.tick === 0
      );
    });
  await page.screenshot({ path: `${output}/01-arrival.png`, fullPage: true });
  await page.evaluate(() => window.advanceTime(96 * 250 * 5));
  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).tick === 480,
  );
  await other.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).tick === 480,
  );
  check(
    "two independent browsers share the same world tick",
    (await state(page)).tick === (await state(other)).tick,
  );
  await page.getByRole("button", { name: /Pause view/ }).click();
  const frozen = (await state(page)).tick;
  await fetch(`${base}/api/dev/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticks: 96 }),
  });
  await other.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).tick === 576,
  );
  check(
    "pausing one observer leaves the world and the other observer running",
    (await state(page)).tick === frozen && (await state(page)).observerPaused,
  );
  await page.getByRole("button", { name: "Resume view", exact: true }).click();
  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).tick === 576,
  );
  for (const layer of ["Water", "Life", "Communities", "Landscape"]) {
    await page
      .locator(".layer-controls")
      .getByRole("button", { name: layer, exact: true })
      .click();
    check(
      `${layer} layer changes actual map state`,
      (await state(page)).layer === layer.toLowerCase(),
    );
  }
  const beforeZoom = (await state(page)).viewport.zoom;
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  check(
    "zoom in changes camera scale",
    (await state(page)).viewport.zoom > beforeZoom,
  );
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  const box = await page.locator("canvas").boundingBox();
  assert.ok(box);
  const beforePan = (await state(page)).viewport.x;
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 360, box.y + 340, { steps: 6 });
  await page.mouse.up();
  check(
    "dragging pans the camera",
    (await state(page)).viewport.x !== beforePan,
  );
  await page.getByRole("button", { name: "Recenter this region" }).click();
  await page.keyboard.press("f");
  await page.waitForFunction(() => !!document.fullscreenElement);
  check(
    "F enters fullscreen",
    await page.evaluate(() => !!document.fullscreenElement),
  );
  await page.keyboard.press("f");
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.locator(".community-list .community-row").first().click();
  check(
    "community inspection selects an actual community",
    (await state(page)).selection.type === "civilization",
  );
  await page
    .getByRole("heading", { name: "What they are becoming", exact: true })
    .scrollIntoViewIfNeeded();
  check(
    "the community exposes six dimensions of success",
    (await page
      .locator('[aria-label="Civilization outcomes"] [role="meter"]')
      .count()) === 6,
  );
  await page.screenshot({
    path: `${output}/02-community-outcomes.png`,
    fullPage: true,
  });
  await page.getByText("Beyond their home", { exact: false }).click();
  check(
    "the observer exposes contact-dependent diplomacy",
    await page
      .getByText("Letters and goods travel with people.", { exact: false })
      .isVisible(),
  );
  await page.locator(".people-list button").first().click();
  check(
    "citizen inspection reveals a real individual",
    (await state(page)).selection.type === "citizen",
  );
  await page.screenshot({ path: `${output}/02-a-life.png`, fullPage: true });
  await page
    .getByRole("heading", { name: "A mind at work", exact: true })
    .scrollIntoViewIfNeeded();
  check(
    "an inhabitant's actual memory and attention are observable",
    (await state(page)).people.some(
      (p) => typeof p.attention === "number" && p.rememberedIdeas > 0,
    ),
  );
  await page.screenshot({
    path: `${output}/02-personal-memory.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Natural laws", exact: true }).click();
  await page.getByText("Conservation, measured live").waitFor();
  check(
    "natural-law inspector exposes conservation measurements",
    (await state(page)).view === "laws",
  );
  const clock = await (await fetch(`${base}/api/clock`)).json();
  check(
    "the visible clock and server clock describe the same elapsed world time",
    (await page.getByTestId("world-clock").textContent()) ===
      clock.clock.universalTime && clock.clock.elapsedSeconds === 576 * 900,
  );
  await page.getByText("Entropy, measured in kJ/K", { exact: true }).click();
  check(
    "entropy flows are real nonnegative measurements",
    clock.entropy.solarIn > 0 &&
      clock.entropy.metabolicHeat > 0 &&
      clock.entropy.heatMixing >= 0,
  );
  await page.getByText("Interventions in this world", { exact: true }).click();
  await page.locator(".intervention-list li").first().waitFor();
  check(
    "the world exposes its recorded interventions",
    (await page.locator(".intervention-list li").count()) > 0,
  );
  await page.getByTestId("world-clock").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${output}/03-natural-laws.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Explore all 118 elements" }).click();
  await page
    .getByRole("button", { name: "Iron, element 26", exact: true })
    .click();
  await page.getByLabel("Reference temperature in kelvin").fill("2000");
  await page
    .getByTestId("element-phase")
    .getByText("liquid", { exact: true })
    .waitFor();
  check(
    "all periodic elements are inspectable and reference phase responds to temperature",
    (await page.locator(".element-cell").count()) === 118,
  );
  await page.screenshot({ path: `${output}/03-elements.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Living ecosystem", exact: true })
    .click();
  await page.getByLabel("Ecological role").selectOption("nectar");
  check(
    "wildlife can be filtered by its ecological role",
    (await page.locator(".wildlife-list button").count()) > 0,
  );
  await page.screenshot({ path: `${output}/03-ecosystem.png`, fullPage: true });
  await page.locator(".wildlife-list button").first().click();
  check(
    "wildlife inspection selects a real living cohort",
    (await state(page)).selection.type === "animal",
  );
  await page.screenshot({ path: `${output}/03-animal.png`, fullPage: true });
  await page
    .getByRole("button", { name: "World journal", exact: true })
    .click();
  await page.getByLabel("Journal category").selectOption("all");
  await page
    .getByRole("button", { name: "Read earlier chapters", exact: true })
    .waitFor();
  const latestEntries = await page.locator(".journal-entry").count();
  await page
    .getByRole("button", { name: "Read earlier chapters", exact: true })
    .click();
  await page.waitForFunction(
    (count) => document.querySelectorAll(".journal-entry").length > count,
    latestEntries,
  );
  check(
    "earlier world events remain accessible beyond the current journal page",
    (await page.locator(".journal-entry").count()) > latestEntries,
  );
  await page.getByLabel("Journal category").selectOption("discovery");
  check(
    "journal filters actual discoveries",
    (await page.locator(".journal-entry").count()) > 0,
  );
  const entry = page.locator(".journal-entry").first();
  const entryTitle = await entry.locator("strong").textContent();
  const entryDetail = await entry.locator("p").textContent();
  const journal = await (await fetch(`${base}/api/journal`)).json();
  const discovery = journal.events.find(
    (event) => event.title === entryTitle && event.detail === entryDetail,
  );
  assert.ok(
    discovery?.citizenId,
    "the visible discovery records its actual author",
  );
  await entry.click();
  check(
    "a discovery journal event leads back to the person who made it",
    (await state(page)).selection.type === "citizen" &&
      (await state(page)).selection.id === discovery.citizenId,
  );
  await page.getByRole("button", { name: "Connect an agent" }).click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: `${output}/04-adopt.png`, fullPage: true });
  await page.getByLabel("Community name", { exact: true }).fill("Wildhaven");
  await page.getByRole("button", { name: "Begin in the wilderness" }).click();
  await page
    .getByLabel("Agent name", { exact: true })
    .fill("Browser test steward");
  await page.getByLabel("Agent type").selectOption("Custom agent");
  await page
    .getByRole("button", { name: "Create an agent connection" })
    .click();
  const keyField = page.getByRole("textbox", {
    name: "Private civilization key",
  });
  await page.getByLabel("Private civilization key", { exact: true }).waitFor();
  const token = await page
    .getByLabel("Private civilization key", { exact: true })
    .inputValue();
  check(
    "a civilization-scoped key is issued and visually masked",
    /^prax_[a-f0-9]{64}$/.test(token) &&
      (await page
        .getByLabel("Private civilization key", { exact: true })
        .getAttribute("type")) === "password",
  );
  await page.getByRole("button", { name: "Copy civilization key" }).click();
  check(
    "copy key uses the actual key",
    (await page.evaluate(() => navigator.clipboard.readText())) === token,
  );
  const observed = await (
    await fetch(`${base}/api/agent/observe`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  check(
    "a new player begins far beyond settled land",
    Math.hypot(observed.civilization.x - 40, observed.civilization.y - 32) >
      160,
  );
  const decision = await fetch(`${base}/api/agent/actions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      requestId: "browser-test-decision",
      actions: [
        {
          type: "focus",
          focus: "preserve",
          reason:
            "Leave living tissue in the landscape and let nutrients return.",
        },
      ],
    }),
  });
  check(
    "an external HTTP agent can act on its own community",
    decision.status === 200,
  );
  await page.getByText("Your agent has made contact.").waitFor();
  await page.screenshot({
    path: `${output}/05-agent-connected.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to watching" }).click();
  check(
    "the HTTP receipt queues advice without imposing policy",
    (await state(other)).communities.find(
      (c) => c.id === observed.civilization.id,
    )?.focus !== "preserve",
  );
  await page.evaluate(() => window.advanceTime(96 * 250));
  await other.waitForFunction(
    (id) =>
      JSON.parse(window.render_game_to_text()).communities.find(
        (c) => c.id === id,
      )?.focus === "preserve",
    observed.civilization.id,
  );
  check(
    "accepted local decisions reach other observers after deliberation",
    (await state(other)).communities.find(
      (c) => c.id === observed.civilization.id,
    ).focus === "preserve",
  );
  await other.getByRole("button", { name: /Wildhaven.*people/ }).click();
  await other.waitForFunction(
    () =>
      JSON.parse(window.render_game_to_text()).region.originX !== 0 ||
      JSON.parse(window.render_game_to_text()).region.originY !== 0,
  );
  check(
    "observers can visit a distant community in the same world",
    (await state(other)).selection.type === "civilization",
  );
  await page.reload();
  await page.getByRole("button", { name: "Your agent", exact: true }).waitFor();
  check(
    "ownership survives a browser reload",
    (await page.request.get(`${base}/api/session`)).ok(),
  );
  await page.getByRole("button", { name: "Your agent", exact: true }).click();
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  check(
    "revocation invalidates the agent key",
    (
      await fetch(`${base}/api/agent/observe`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status === 401,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Praxans home" }).click();
  check(
    "home returns to the same live planet",
    (await state(page)).mode === "planet-onboarding",
  );
  await page
    .getByRole("button", { name: "Watch the world", exact: true })
    .click();
  await page.evaluate(() => window.advanceTime(96 * 250 * 3));
  await page.screenshot({
    path: `${output}/06-growing-world.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "How to observe" }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  check(
    "help opens and Escape closes the dialog",
    (await page.getByRole("dialog").count()) === 0,
  );
  check(
    "desktop has no horizontal overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  mobile.on("pageerror", (error) => errors.push(String(error)));
  await mobile.goto(base);
  await mobile.waitForFunction(
    () =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).mode === "planet-onboarding",
  );
  await mobile.locator(".planet-view.ready").waitFor({ timeout: 60000 });
  await mobile.screenshot({
    path: `${output}/07-mobile-planet.png`,
    fullPage: true,
  });
  await mobile
    .getByRole("button", { name: "Watch the world", exact: true })
    .click();
  await mobile.screenshot({ path: `${output}/07-mobile.png`, fullPage: true });
  check(
    "mobile has no horizontal overflow",
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await mobile.getByRole("button", { name: "Connect an agent" }).click();
  await mobile.getByRole("dialog").waitFor();
  check(
    "mobile onboarding remains usable",
    await mobile
      .getByRole("button", { name: "Begin in the wilderness" })
      .isVisible(),
  );
  await mobile.screenshot({
    path: `${output}/08-mobile-adopt.png`,
    fullPage: true,
  });
  await writeFile(
    `${output}/state.json`,
    JSON.stringify(await state(page), null, 2),
  );
  check(
    "no browser console errors or uncaught exceptions",
    errors.length === 0,
  );
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(`${checks.length} browser checks passed. Screenshots: ${output}`);
} catch (error) {
  console.error(error);
  console.error("Browser errors:", errors);
  process.exitCode = 1;
  await writeFile(
    `${output}/failure.log`,
    `${error}\n${errors.join("\n")}\n${serverLog}`,
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    sleep(5000),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
  await rm(temporary, { recursive: true, force: true });
}
