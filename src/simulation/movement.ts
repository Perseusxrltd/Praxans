import { groundDistanceMetres, wrapX } from "./planet";
import { touchTile } from "./world";
import { clamp } from "./random";
import type { World } from "./types";

export const WALKING_METRES_PER_HOUR = 1800;

/** Integrate and report actual metres traveled, including an out-and-back route. */
export function walkPath(
  world: World,
  traveler: { x: number; y: number },
  path: number[],
  hours: number,
  energy: number,
  child = false,
): number {
  let remaining = hours,
    traveled = 0;
  const speed =
    WALKING_METRES_PER_HOUR * (0.6 + energy / 250) * (child ? 0.65 : 1);
  while (path.length && remaining > 0) {
    const nextIndex = path[0],
      next = world.tiles[nextIndex];
    if (!next || next.terrain === "water") break;
    const dx = wrapX(next.x - traveler.x),
      dy = next.y - traveler.y;
    const length = groundDistanceMetres(traveler, next);
    const pace = speed * (next.terrain === "hill" ? 0.7 : 1);
    const moved = Math.min(length, pace * remaining);
    traveled += moved;
    if (length <= moved) {
      traveler.x = next.x;
      traveler.y = next.y;
      path.shift();
    } else {
      traveler.x = wrapX(traveler.x + (dx / length) * moved);
      traveler.y += (dy / length) * moved;
    }
    remaining -= moved / pace;
    next.road = clamp(next.road + 0.002, 0, 1);
    touchTile(world, nextIndex);
  }
  return traveled;
}
