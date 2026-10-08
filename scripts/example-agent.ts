import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import type {
  AgentAction,
  Citizen,
  Civilization,
  WorldSummary,
} from "../src/simulation/types";

if (process.argv.includes("--help")) {
  console.log(
    "PRAXANS_URL=http://localhost:5173 PRAXANS_AGENT_TOKEN=<your private key> npm run agent:example -- [--once]\nA small HTTP steward demonstrating the protocol. Replace decide() with your agent's reasoning; no model API is required by the world.",
  );
  process.exit(0);
}
const base = (process.env.PRAXANS_URL ?? "http://localhost:5173").replace(
  /\/$/,
  "",
);
const token = process.env.PRAXANS_AGENT_TOKEN;
if (!token)
  throw new Error(
    "Create a connection in the browser and set PRAXANS_AGENT_TOKEN in your local environment. Do not put the key in source control.",
  );
interface Observation {
  tick: number;
  civilization: Civilization;
  people: Citizen[];
  world: WorldSummary;
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      `Praxans ${response.status}: ${data.error ?? "Request failed"}`,
    );
  return data;
}
function decide(observation: Observation): AgentAction[] {
  const people = observation.people.length;
  if (!people) return [];
  const civic = observation.civilization.civics;
  if (
    civic &&
    (civic.proposals.some((p) => p.status === "pending") ||
      observation.tick - civic.lastSubmissionTick < 16)
  )
    return [];
  const perPerson = observation.civilization.stock.biomass / people;
  const focus =
    perPerson < 3 ? "nourish" : perPerson > 8 ? "discover" : "balance";
  if (observation.civilization.focus === focus) return [];
  return [
    {
      type: "focus",
      focus,
      reason: `There are ${perPerson.toFixed(1)} kg of stored plant food per person. Give daily needs room, then leave time for learning.`,
    },
  ];
}
let stopped = false;
process.once("SIGINT", () => {
  stopped = true;
});
process.once("SIGTERM", () => {
  stopped = true;
});
do {
  try {
    const observation = await request<Observation>("/api/agent/observe"),
      actions = decide(observation);
    if (actions.length) {
      const batch = { requestId: randomUUID(), actions };
      // Retrying this exact requestId/body is safe within the retained receipt window.
      await request("/api/agent/actions", batch);
    }
    console.log(
      `Tick ${observation.tick}: ${observation.civilization.name}, ${observation.people.length} people; ${actions.length ? "guidance sent" : "watching"}.`,
    );
  } catch (error) {
    console.error((error as Error).message);
    if (process.argv.includes("--once")) process.exitCode = 1;
  }
  if (process.argv.includes("--once")) break;
  for (let n = 0; n < 30 && !stopped; n++) await setTimeout(1000);
} while (!stopped);
