import { setTimeout as sleep } from "node:timers/promises";
import { createGameServer, type AppOptions } from "./app";
import { WorldLeaseError } from "./store";

/** Allow an interrupted owner's lease to expire without burning the host's restart allowance. */
export async function startWithLease(options: AppOptions, maxWaitMs = 35000) {
  const deadline = performance.now() + maxWaitMs;
  let announced = false;
  for (;;) {
    try {
      return createGameServer(options);
    } catch (error) {
      const remaining = deadline - performance.now();
      if (!(error instanceof WorldLeaseError) || remaining <= 0) throw error;
      if (!announced) {
        console.info(
          "Waiting for the existing world owner's lease. No state or ownership is being replaced.",
        );
        announced = true;
      }
      await sleep(
        Math.min(
          remaining,
          1000,
          Math.max(25, error.expiresAt - Date.now() + 10),
        ),
      );
    }
  }
}
