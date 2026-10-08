import { join, resolve } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { getHeapStatistics, setFlagsFromString } from "node:v8";
import {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} from "node:worker_threads";

const oldGenerationMiB = 192,
  youngGenerationMiB = 16,
  maximumHeapBytes = (oldGenerationMiB + youngGenerationMiB * 2) * 1024 ** 2;
type ValidationReport = ReturnType<typeof import("./preflight").preflight> & {
  type: "preflight";
  validationHeapLimitBytes: number;
};

if (!isMainThread) {
  if (workerData?.purpose !== "world-preflight")
    throw new Error("Unknown validation worker purpose.");
  const validationHeapLimitBytes = getHeapStatistics().heap_size_limit;
  if (validationHeapLimitBytes > maximumHeapBytes)
    throw new Error("The candidate validation heap limit was not applied.");
  const { preflight } = await import("./preflight");
  const result = preflight(workerData.database, workerData.directory);
  parentPort!.postMessage({
    type: "preflight",
    ...result,
    validationHeapLimitBytes,
  } satisfies ValidationReport);
} else if (process.argv.includes("--preflight")) {
  // On Linux a disposable candidate is expendable before the continuing owner.
  // Other hosts may not expose this control; validation still works there.
  if (process.platform === "linux") {
    try {
      writeFileSync("/proc/self/oom_score_adj", "1000");
    } catch {
      /* host-managed */
    }
  }
  // NODE_OPTIONS can override Worker resourceLimits. Set construction flags
  // only in this disposable supervisor, before creating the fresh isolate;
  // that isolate checks its effective heap limit before loading any world.
  setFlagsFromString(
    `--max_old_space_size=${oldGenerationMiB} --max_semi_space_size=${youngGenerationMiB / 2}`,
  );
  const directory = mkdtempSync(join(tmpdir(), "praxans-preflight-"));
  let validation: Worker | undefined;
  const stop = () => {
    void validation?.terminate();
  };
  try {
    validation = new Worker(new URL(import.meta.url), {
      workerData: {
        purpose: "world-preflight",
        database: resolve(process.env.PRAXANS_DB ?? "data/praxans.sqlite"),
        directory,
      },
      resourceLimits: {
        maxOldGenerationSizeMb: oldGenerationMiB,
        maxYoungGenerationSizeMb: youngGenerationMiB,
      },
    });
    process.once("SIGTERM", stop);
    const result = await new Promise<ValidationReport>((done, reject) => {
      let report: ValidationReport | undefined;
      validation!.on("message", (value: ValidationReport) => {
        if (value?.type === "preflight") report = value;
      });
      validation!.once("error", reject);
      validation!.once("exit", (code) => {
        if (code === 0 && report) done(report);
        else reject(new Error(`Candidate validation worker exited (${code}).`));
      });
    });
    process.send?.(result);
  } finally {
    process.off("SIGTERM", stop);
    await validation?.terminate();
    // The supervisor also cleans up when heap exhaustion stops the worker
    // before its own finally block. This directory is always a private copy.
    rmSync(directory, { recursive: true, force: true });
  }
  process.disconnect?.();
} else {
  const { startRuntime } = await import("./runtime");
  await startRuntime(true, true);
}
