import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";
import { createGameServer } from "../src/server/app";
import { processDeaths } from "../src/simulation/citizens";
import { stepWorld } from "../src/simulation/engine";
import { FOUNDING } from "../src/simulation/founding";

// Explicitly extinct fixture in a disposable world; never touch the live universe.
const temporary = await mkdtemp(join(tmpdir(), "praxans-new-chapter-"));
const output = "output/playwright/extinction-smoke";
await mkdir(output, { recursive: true });
const game = createGameServer({
  database: join(temporary, "world.sqlite"),
  autoTick: false,
  testControls: true,
});
const server = createServer(game.app);
const vite = await createViteServer({
  server: { middlewareMode: true, ws: { server } },
  appType: "spa",
});
game.app.use(vite.middlewares);
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
const journalIds = () => {
  const ids = new Set<string>();
  let before: number | undefined;
  for (;;) {
    const page = game.store.journal(before, 100);
    for (const event of page.events) ids.add(event.id);
    if (page.next === null) return ids;
    before = page.next;
  }
};
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const world = game.getWorld(),
    previous = world.civilizations[0],
    session = game.store.session();
  stepWorld(world, 192);
  game.store.advanceClock(world.tick);
  previous.claimed = true;
  game.store.claim(session.session, previous.id, world);
  const oldAgent = game.store.createAgent(
    previous.id,
    "Earlier adviser",
    "Test",
  );
  for (const person of world.citizens)
    if (person.civId === previous.id) person.health = 0;
  processDeaths(world);
  game.store.save(world);
  const identity = { id: world.id, seed: world.seed, tick: world.tick },
    history = journalIds();
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
  check(
    "extinct communities remain discoverable and can be followed",
    (await directory()
      .locator(`[data-community-id="${previous.id}"] .community-status`)
      .textContent()) === "Extinct",
  );
  await directory()
    .getByRole("button", { name: "History", exact: true })
    .click();
  check(
    "the history filter separates extinct groups from living communities",
    (await directory().locator(".community-entry").count()) === 1,
  );
  await directory()
    .getByRole("button", { name: "Living", exact: true })
    .click();
  check(
    "living groups have their own directory view",
    (await directory().locator(".community-entry").count()) === 2,
  );
  await directory().getByRole("button", { name: "All", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Search communities" })
    .fill(previous.name);
  check(
    "community search locates the intended group",
    (await directory().locator(".community-entry").count()) === 1,
  );
  await directory()
    .getByRole("button", { name: `Read ${previous.name} history`, exact: true })
    .click();
  await page.getByText("Final loss", { exact: true }).waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector(".community-lifespan")
      ?.textContent?.includes("Year 1, day 3"),
  );
  check("the archived deaths establish the old community's final date", true);
  await page.screenshot({
    path: `${output}/03-community-memorial.png`,
    fullPage: true,
  });
  await page.reload();
  await page.waitForFunction(
    (id) =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).following?.includes(id),
    previous.id,
  );
  check("following an old community persists across browser reload", true);
  await page.getByRole("button", { name: /Your agent/ }).click();
  await page
    .getByRole("heading", { name: "A new chapter in this world." })
    .waitFor();
  check(
    "an extinct owner's dialog explains the retained history",
    await page
      .getByText(/Its history and remains stay in this world/)
      .isVisible(),
  );
  await page.screenshot({
    path: `${output}/01-new-chapter.png`,
    fullPage: true,
  });
  await page.getByLabel("Community name", { exact: true }).fill("Willow Reach");
  await page
    .getByRole("button", { name: "Begin a new community", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "A steward for Willow Reach." })
    .waitFor();
  const current = game.getWorld(),
    nextId = game.store.session(session.token).session.civId!;
  check(
    "new founders inhabit the same uninterrupted planet",
    current.id === identity.id &&
      current.seed === identity.seed &&
      current.tick === identity.tick,
  );
  check(
    "the new chapter has the normal founder population",
    current.citizens.filter((p) => p.civId === nextId).length ===
      FOUNDING.people,
  );
  check(
    "the earlier community remains and is not resurrected",
    current.civilizations.some((c) => c.id === previous.id) &&
      !current.citizens.some((p) => p.civId === previous.id),
  );
  const journal = journalIds();
  check(
    "earlier events remain readable",
    [...history].every((id) => journal.has(id)),
  );
  check(
    "the earlier key is retired",
    game.store.authenticate(oldAgent.token) === null,
  );
  await page.getByLabel("Agent name", { exact: true }).fill("Willow adviser");
  await page
    .getByRole("button", { name: "Create an agent connection", exact: true })
    .click();
  await page.getByText("Key created", { exact: true }).waitFor();
  const token = await page
    .getByLabel("Private civilization key", { exact: true })
    .inputValue();
  check(
    "the replacement key is scoped only to the new community",
    game.store.authenticate(token)?.civId === nextId,
  );
  await page.screenshot({
    path: `${output}/02-new-connection.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to watching" }).click();
  await page.reload();
  await page.waitForFunction(
    () =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).mode === "shared-world",
  );
  await page.getByRole("button", { name: /Your agent/ }).click();
  await page
    .getByRole("heading", { name: "A steward for Willow Reach." })
    .waitFor();
  check("browser reload retains stewardship of the new community", true);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await openDirectory();
  check(
    "new communities appear first with a beginning marker",
    (await directory()
      .locator(".community-entry")
      .first()
      .getAttribute("data-community-id")) === nextId &&
      (await directory()
        .locator(`[data-community-id="${nextId}"] .new-beginning`)
        .isVisible()),
  );
  await directory()
    .getByRole("button", { name: "Follow Willow Reach", exact: true })
    .click();
  await page.screenshot({
    path: `${output}/04-community-directory.png`,
    fullPage: true,
  });
  await directory()
    .getByRole("button", { name: "Read Willow Reach history", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: new RegExp(
        `An earlier community of this steward.*${previous.name}`,
      ),
    })
    .waitFor();
  await page
    .getByRole("button", {
      name: new RegExp(
        `An earlier community of this steward.*${previous.name}`,
      ),
    })
    .click();
  await page
    .getByRole("button", {
      name: /A later beginning by the same steward.*Willow Reach/,
    })
    .waitFor();
  check("the old history and new beginning link in both directions", true);
  await openDirectory();
  await directory()
    .getByRole("button", { name: "Stories from the communities you follow" })
    .click();
  await page
    .getByRole("combobox", { name: "Journal category" })
    .selectOption("founding");
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".journal-entry strong")].some((e) =>
      e.textContent?.includes("Willow Reach"),
    ),
  );
  check(
    "followed stories can isolate the founding of new communities",
    (await page
      .getByRole("combobox", { name: "Journal community" })
      .inputValue()) === "following",
  );
  await page.screenshot({
    path: `${output}/05-followed-stories.png`,
    fullPage: true,
  });
  await openDirectory();
  for (const person of game.getWorld().citizens)
    if (person.civId === nextId) person.health = 0;
  // Resolve this fixture's deaths before a normal tick can heal zero health.
  processDeaths(game.getWorld());
  await page.evaluate(() => window.advanceTime(250));
  await page.waitForFunction(
    (id) =>
      document.querySelector(`[data-community-id="${id}"] .community-status`)
        ?.textContent === "Extinct",
    nextId,
  );
  check(
    "a followed living group moves into history when its last inhabitant dies",
    (await directory()
      .getByRole("button", { name: "Unfollow Willow Reach", exact: true })
      .getAttribute("aria-pressed")) === "true",
  );
  await directory()
    .getByRole("button", { name: "Following", exact: true })
    .click();
  check(
    "extinction retains both followed community histories",
    (await directory().locator(".community-entry").count()) === 2,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${output}/06-following-mobile.png`,
    fullPage: true,
  });
  check(
    "the community directory fits a mobile screen",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await directory()
    .getByRole("button", { name: `Unfollow ${previous.name}`, exact: true })
    .click();
  await page.reload();
  await page.waitForFunction(
    ({ oldId, newId }) => {
      const state =
        window.render_game_to_text && JSON.parse(window.render_game_to_text());
      return (
        state?.following?.includes(newId) && !state.following.includes(oldId)
      );
    },
    { oldId: previous.id, newId: nextId },
  );
  check(
    "unfollowing persists without erasing either community's history",
    game.getWorld().civilizations.some((c) => c.id === previous.id),
  );
  check("the transition produces no browser errors", errors.length === 0);
  await writeFile(
    join(output, "results.json"),
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser?.close();
  game.close();
  await vite.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(temporary, { recursive: true, force: true });
}
