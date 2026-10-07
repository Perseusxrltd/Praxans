import { validateWorld } from "../simulation/engine";
import { WORLD_VERSION, type World } from "../simulation/types";
import { emptyEntropy } from "../simulation/thermodynamics";

export interface Intervention {
  id: string;
  from: number;
  to: number;
  description: string;
}

/** Registered transformations only. Never reinterpret a save with a new generator. */
export function migrateWorld(saved: World): {
  world: World;
  interventions: Intervention[];
} {
  const world = structuredClone(saved);
  const interventions: Intervention[] = [];
  if (world.version === 5 && world.lawsVersion === "biosphere-1.0") {
    world.generationVersion = "archipelago-1";
    world.pendingEvents = [...world.events];
    world.version = 6;
    interventions.push({
      id: "006-permanent-record",
      from: 5,
      to: 6,
      description:
        "Preserve all existing matter, inhabitants, clock, and geography. Pin future terrain to the original generator; begin the permanent event archive.",
    });
  }
  if (world.version === 6 && world.lawsVersion === "biosphere-1.0") {
    world.entropy = emptyEntropy(world.tick);
    world.version = 7;
    world.lawsVersion = "biosphere-1.1";
    interventions.push({
      id: "007-clock-and-entropy",
      from: 6,
      to: 7,
      description:
        "Retain the world's age, clock, inhabitants, and matter. Begin explicit entropy-flow accounting from this intervention, with a complete observer calendar; no past entropy measurements are invented.",
    });
  }
  if (world.version !== WORLD_VERSION) {
    throw new Error(
      `No registered migration from world format ${world.version} to ${WORLD_VERSION}. The existing world has been preserved; it will not be reset.`,
    );
  }
  validateWorld(world);
  return { world, interventions };
}
