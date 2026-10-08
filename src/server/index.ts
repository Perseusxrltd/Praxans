import { resolve } from "node:path";
import { WorldGateway } from "./gateway";
import { startRuntime } from "./runtime";

const production =
  process.env.NODE_ENV === "production" ||
  process.argv.includes("--production");
if (!production) await startRuntime(false);
else {
  const port = Number(process.env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be 1–65535.");
  const gateway = new WorldGateway(
    process.env.PRAXANS_DB ?? "data/praxans.sqlite",
    resolve("dist/server/runtime.mjs"),
  );
  await gateway.start();
  gateway.server.listen(port, process.env.HOST ?? "0.0.0.0", () =>
    console.log(
      `Praxans gateway is listening on port ${port}; the world runtime can be replaced in place.`,
    ),
  );
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await gateway.close();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
