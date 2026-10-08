import { resolve } from "node:path";
import { preflight } from "./preflight";
import { startRuntime } from "./runtime";

if (process.argv.includes("--preflight")) {
  const result = preflight(
    resolve(process.env.PRAXANS_DB ?? "data/praxans.sqlite"),
  );
  process.send?.({ type: "preflight", ...result });
  process.disconnect?.();
} else await startRuntime(true, true);
