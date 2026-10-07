import { resolve } from "node:path";
import { createServer } from "node:http";
import express from "express";
import { createGameServer } from "./app";

const production =
  process.env.NODE_ENV === "production" ||
  process.argv.includes("--production");
const port = Number(process.env.PORT ?? 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be 1–65535.");
const game = createGameServer({
  database: resolve(process.env.PRAXANS_DB ?? "data/praxans.sqlite"),
  seed: Number(process.env.WORLD_SEED ?? 1847),
  autoTick: process.env.PRAXANS_MANUAL_CLOCK !== "1",
  testControls: !production && process.env.PRAXANS_TEST_CONTROLS === "1",
  publicOrigin: process.env.PUBLIC_ORIGIN,
  serverOrigin: process.env.SERVER_ORIGIN,
  trustProxy: process.env.TRUST_PROXY === "1",
  release: process.env.PRAXANS_RELEASE ?? "browser-foundation-1",
  releaseNotes: process.env.PRAXANS_RELEASE_NOTES,
  requireExistingWorld: process.env.PRAXANS_REQUIRE_EXISTING_WORLD === "1",
});
const server = createServer(game.app);
let vite:
  Awaited<ReturnType<(typeof import("vite"))["createServer"]>> | undefined;
if (!production) {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({
    server: { middlewareMode: true, ws: { server } },
    appType: "spa",
  });
  game.app.use(vite.middlewares);
} else {
  const client = resolve("dist/client");
  game.app.use(express.static(client, { maxAge: "1h" }));
  game.app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve(client, "index.html")),
  );
}
server.listen(port, process.env.HOST ?? "0.0.0.0", () =>
  console.log(
    `Praxans is growing at http://localhost:${port} (${production ? "production" : "development"}). World data: ${process.env.PRAXANS_DB ?? "data/praxans.sqlite"}`,
  ),
);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  game.close();
  await vite?.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
