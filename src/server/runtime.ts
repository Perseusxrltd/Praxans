import { resolve } from "node:path";
import { createServer } from "node:http";
import express from "express";
import { startWithLease } from "./startup";

export async function startRuntime(production: boolean, supervised = false) {
  const port = supervised ? 0 : Number(process.env.PORT ?? 5173);
  if (
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535 ||
    (!supervised && port === 0)
  )
    throw new Error("PORT must be 1–65535.");
  const game = await startWithLease({
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
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(
      port,
      supervised ? "127.0.0.1" : (process.env.HOST ?? "0.0.0.0"),
      resolve,
    );
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Runtime did not bind.");
  if (supervised)
    process.send?.({
      type: "ready",
      port: address.port,
      tick: game.getWorld().tick,
      id: game.getWorld().id,
      seed: game.getWorld().seed,
    });
  else
    console.log(
      `Praxans is growing at http://localhost:${address.port} (development).`,
    );
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    game.close();
    await vite?.close();
    server.closeAllConnections();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  process.on("message", (message) => {
    if ((message as { type?: string })?.type === "drain") void shutdown();
  });
}
