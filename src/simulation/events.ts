import type { World, WorldEvent } from "./types";

/** The small observer window is separate from the durable event queue. */
export function recordEvent(
  world: World,
  event: Omit<WorldEvent, "id" | "tick">,
): void {
  const entry = { id: `event-${world.nextId++}`, tick: world.tick, ...event };
  world.events.push(entry);
  world.pendingEvents.push(entry);
  if (world.events.length > 300)
    world.events.splice(0, world.events.length - 300);
}
