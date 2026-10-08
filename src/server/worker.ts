import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { preflight } from "./preflight";
import { startRuntime } from "./runtime";

if (process.argv.includes("--preflight")) {
  // On Linux a disposable candidate is expendable before the continuing owner.
  // Other hosts may not expose this control; validation still works there.
  if (process.platform === "linux") {
    try {
      writeFileSync("/proc/self/oom_score_adj", "1000");
    } catch {
      /* host-managed */
    }
  }
  const result = preflight(
    resolve(process.env.PRAXANS_DB ?? "data/praxans.sqlite"),
  );
  process.send?.({ type: "preflight", ...result });
  process.disconnect?.();
} else await startRuntime(true, true);
