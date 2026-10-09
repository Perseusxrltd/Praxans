import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";
import { createGameServer } from "../src/server/app";

// Real clipboard and authenticated requests in a disposable, manually clocked world.
// Native messaging and email are intercepted; this never sends a message.
const temporary = await mkdtemp(join(tmpdir(), "praxans-invitation-")),
  output = "output/playwright/connection-smoke";
await mkdir(output, { recursive: true });
const game = createGameServer({
  database: join(temporary, "world.sqlite"),
  autoTick: false,
});
const world = game.getWorld(),
  community = world.civilizations[0],
  session = game.store.session();
community.claimed = true;
game.store.claim(session.session, community.id, world);
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
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addCookies([
    {
      name: "praxans_session",
      value: session.token!,
      url: base,
      httpOnly: true,
    },
  ]);
  // Plain JS keeps TypeScript's function-name helpers out of the browser context.
  await context.addInitScript(`
    Object.defineProperty(navigator, "share", { configurable: true, value: async data => { window.invitationShared = data; } });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    document.addEventListener("click", event => {
      const link = event.target.closest('a[href^="mailto:"]');
      if (link) { event.preventDefault(); window.invitationEmail = link.href; }
    }, true);
  `);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(base);
  await page
    .getByRole("button", { name: "Watch the world", exact: true })
    .click();
  await page.getByRole("button", { name: "Your agent", exact: true }).click();
  await page.getByLabel("Agent name", { exact: true }).fill("Invitation trial");
  await page
    .getByRole("button", { name: "Create an agent connection", exact: true })
    .click();
  const key = page.getByLabel("Private civilization key", { exact: true });
  await key.waitFor();
  const token = await key.inputValue();
  const invitation = page.getByRole("region", {
    name: "Send instructions to your agent",
  });
  check(
    "one-message handoff appears with the new connection",
    await invitation.isVisible(),
  );
  check(
    "the full private message is closed by default",
    (await invitation.locator("details").getAttribute("open")) === null,
  );
  await invitation
    .getByRole("button", { name: "Copy instructions", exact: true })
    .click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  check(
    "the copied brief identifies the actual world and community",
    text.includes(world.id) &&
      text.includes(community.id) &&
      text.includes(community.name),
  );
  check(
    "the copied brief includes the issued key and both connection paths",
    text.includes(`Bearer ${token}`) &&
      text.includes(`${base}/mcp`) &&
      text.includes(`${base}/api/agent/observe`),
  );
  check(
    "the brief explains local consent, current laws and retry identity",
    text.includes("inhabitants can refuse") &&
      text.includes("/api/laws") &&
      text.includes("same ID and unchanged body"),
  );
  const copiedToken = text.match(
    /Private authentication header: Authorization: Bearer (\S+)/,
  )?.[1];
  const observed = await fetch(`${base}/api/agent/observe`, {
    headers: { Authorization: `Bearer ${copiedToken}` },
  });
  const observation = await observed.json();
  check(
    "credentials from the pasted message authenticate the intended community",
    observed.ok && observation.civilization.id === community.id,
  );
  const example = JSON.parse(text.match(/^\{"requestId":.+$/m)![0]);
  const sent = await fetch(`${base}/api/agent/actions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${copiedToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(example),
  });
  check(
    "the pasted HTTP example is accepted as a proposal",
    sent.ok && (await sent.json()).outcomes.length === 1,
  );
  await invitation.getByRole("button", { name: "Share", exact: true }).click();
  check(
    "native share receives the same complete private message",
    await page.evaluate(
      (expected) => (window as any).invitationShared?.text === expected,
      text,
    ),
  );
  await invitation
    .getByRole("link", { name: "Email agent instructions" })
    .click();
  check(
    "email opens a draft containing the same complete message",
    await page.evaluate(
      (expected) =>
        new URL((window as any).invitationEmail).searchParams.get("body") ===
        expected,
      text,
    ),
  );
  await page.screenshot({
    path: `${output}/01-invitation.png`,
    fullPage: true,
  });
  await page.evaluate(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    }),
  );
  await invitation.getByRole("button", { name: "Share", exact: true }).click();
  check(
    "browsers without native sharing copy the complete message",
    (await page.evaluate(() => navigator.clipboard.readText())) === text,
  );
  await page.evaluate(
    `Object.defineProperty(navigator, "share", { configurable: true, value: async () => { throw new DOMException("Cancelled", "AbortError"); } })`,
  );
  await invitation.getByRole("button", { name: "Share", exact: true }).click();
  check(
    "cancelling the share sheet does not report a connection error",
    (await invitation.getByRole("alert").count()) === 0,
  );
  await page.evaluate(
    `Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: async () => { throw new DOMException("Denied", "NotAllowedError"); } })`,
  );
  await invitation
    .getByRole("button", { name: "Copy instructions", exact: true })
    .click();
  const message = invitation.getByLabel(
    "Full agent instructions, including private key",
  );
  await message.waitFor();
  // Mounting and selecting happen in separate browser work. Wait for the
  // completed fallback, rather than asserting selection at first visibility.
  await page.waitForFunction(
    () => {
      const input = document.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Full agent instructions, including private key"]',
      );
      return (
        input &&
        document.activeElement === input &&
        input.selectionStart === 0 &&
        input.selectionEnd === input.value.length
      );
    },
    undefined,
    { timeout: 5000 },
  );
  check(
    "clipboard denial exposes a selectable complete message",
    (await message.inputValue()) === text &&
      (await message.evaluate((node) => {
        const input = node as HTMLTextAreaElement;
        return (
          input.selectionStart === 0 &&
          input.selectionEnd === input.value.length
        );
      })),
  );
  // Close private text before every screenshot; credentials stay out of artifacts.
  await invitation.getByText("Read the full message", { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/02-mobile.png`, fullPage: true });
  await page.evaluate(() => {
    delete (navigator.clipboard as any).writeText;
  });
  await invitation
    .getByRole("button", { name: "Copy instructions", exact: true })
    .click();
  await page.screenshot({
    path: `${output}/03-mobile-ready.png`,
    fullPage: true,
  });
  check(
    "the connection dialog fits a mobile screen",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Your agent", exact: true }).click();
  check(
    "closing the dialog does not persist a recoverable plaintext invitation",
    (await page
      .getByRole("region", { name: "Send instructions to your agent" })
      .count()) === 0,
  );
  check(
    "connection work leaves the manually clocked universe at the same tick",
    game.getWorld().tick === 0,
  );
  check("browser reports no page or console errors", errors.length === 0);
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ checks, passed: checks.length, errors }, null, 2) + "\n",
  );
  console.log(
    `${checks.length} connection checks passed. Screenshots: ${output}`,
  );
} finally {
  await writeFile(
    `${output}/last-checks.json`,
    JSON.stringify({ checks, errors }, null, 2) + "\n",
  );
  await browser?.close();
  await vite.close();
  game.close();
  await new Promise<void>((done) => server.close(() => done()));
  await rm(temporary, { recursive: true, force: true });
}
