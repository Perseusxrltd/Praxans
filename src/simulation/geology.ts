import { ELEMENTS, addElements, totalElements } from "./elements";
import { recordEvent } from "./events";
import { ROCK, addNutrients } from "./chemistry";
import { hash, noise } from "./random";
import {
  CHUNK_SIZE,
  DAYS_PER_YEAR,
  type ElementMass,
  type PlateState,
  type World,
} from "./types";

const PLATE_SPACING = 4096;
/** Coordinate-seeded microplates. Velocities are cm/year, never tiles per game tick. */
export function plateAt(
  seed: number,
  x: number,
  y: number,
): Omit<
  PlateState,
  "buried" | "exposed" | "stress" | "uplift" | "earthquakes"
> {
  const cx = Math.floor(x / PLATE_SPACING),
    cy = Math.floor(y / PLATE_SPACING);
  const sites: {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    distance: number;
  }[] = [];
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const px = cx + dx,
        py = cy + dy;
      const sx = (px + 0.15 + hash(px, py, seed + 318) * 0.7) * PLATE_SPACING;
      const sy = (py + 0.15 + hash(px, py, seed + 571) * 0.7) * PLATE_SPACING;
      sites.push({
        id: `plate:${px},${py}`,
        x: sx,
        y: sy,
        vx: (hash(px, py, seed + 941) - 0.5) * 12,
        vy: (hash(px, py, seed + 9411) - 0.5) * 12,
        distance: Math.hypot(x - sx, y - sy),
      });
    }
  sites.sort((a, b) => a.distance - b.distance);
  const [a, b] = sites,
    separation = Math.hypot(a.x - b.x, a.y - b.y);
  const convergence =
    ((a.vx - b.vx) * (b.x - a.x)) / separation +
    ((a.vy - b.vy) * (b.y - a.y)) / separation;
  const boundaryDistance =
    (b.distance ** 2 - a.distance ** 2) / (2 * separation);
  return {
    id: a.id,
    velocityX: a.vx,
    velocityY: a.vy,
    convergence,
    boundaryDistance,
    heatFlux:
      0.06 +
      0.16 * Math.exp(-boundaryDistance / 100) * Math.max(0, -convergence / 12),
  };
}

export function initialGeology(
  seed: number,
  cx: number,
  cy: number,
): PlateState {
  const plate = plateAt(seed, (cx + 0.5) * CHUNK_SIZE, (cy + 0.5) * CHUNK_SIZE);
  const buried: ElementMass = {},
    exposed: ElementMass = {};
  // Trace inventories live at region resolution. No fictitious stable inventory of synthetic elements.
  for (const e of ELEMENTS) {
    if (
      (e.number > 83 && !["Th", "U"].includes(e.symbol)) ||
      [
        "Tc",
        "Pm",
        "H",
        "C",
        "N",
        "O",
        "He",
        "Ne",
        "Ar",
        "Kr",
        "Xe",
        "Rn",
      ].includes(e.symbol) ||
      ROCK[e.symbol]
    )
      continue;
    const abundance = ["F", "Cl", "Ba", "Sr"].includes(e.symbol)
      ? 12
      : ["Au", "Pt", "Ir", "Os", "Rh", "Re"].includes(e.symbol)
        ? 0.0002
        : 0.15;
    const total =
      abundance * (0.2 + noise(cx / 5, cy / 5, seed + e.number * 71) * 2.5);
    exposed[e.symbol] = total * 0.015;
    buried[e.symbol] = total - exposed[e.symbol];
  }
  return {
    ...plate,
    stress: hash(cx, cy, seed + 404) * 0.7,
    uplift: 0,
    earthquakes: 0,
    buried,
    exposed,
  };
}

/** One day: tectonic strain, surface exposure, and weathering are slow explicit transfers. */
export function updateGeology(world: World): void {
  for (const chunk of world.chunks) {
    const plate = chunk.geology,
      boundary = Math.exp(-plate.boundaryDistance / 100);
    const uplift = (plate.convergence * 0.01 * boundary) / DAYS_PER_YEAR; // metres/day
    plate.uplift += uplift;
    plate.stress +=
      (Math.abs(plate.convergence) * boundary) / (DAYS_PER_YEAR * 60);
    let wetness = 0;
    for (let i = chunk.start; i < chunk.start + CHUNK_SIZE ** 2; i++) {
      const tile = world.tiles[i];
      tile.elevation += uplift / 600;
      const wet = tile.water / (tile.water + 3000);
      wetness += wet;
      const dissolved = Math.min(
        tile.rock,
        0.002 * wet * Math.exp((tile.temperature - 15) / 40),
      );
      tile.rock -= dissolved;
      addNutrients(tile, ROCK, dissolved);
      world.changedTiles.push(i);
    }
    const exposure = Math.min(
      0.001,
      (0.000005 * wetness) / CHUNK_SIZE ** 2 + Math.abs(uplift) * 0.001,
    );
    for (const [symbol, mass] of Object.entries(plate.buried)) {
      const moved = mass * exposure;
      plate.buried[symbol] -= moved;
      plate.exposed[symbol] = (plate.exposed[symbol] ?? 0) + moved;
    }
    if (plate.stress >= 1) {
      plate.stress -= 0.65;
      plate.earthquakes++;
      const x = chunk.x * CHUNK_SIZE + CHUNK_SIZE / 2,
        y = chunk.y * CHUNK_SIZE + CHUNK_SIZE / 2;
      for (const structure of world.structures)
        if (Math.hypot(structure.x - x, structure.y - y) < CHUNK_SIZE)
          structure.condition *= 0.8;
      recordEvent(world, {
        category: "nature",
        title: "Stored strain is released",
        detail: `A fault on ${plate.id} slips. Nearby structures lose condition; plate motion continues at centimetres per year.`,
        x,
        y,
      });
    }
  }
}

export function geologicalElements(geology: PlateState): ElementMass {
  const total = { ...geology.buried };
  addElements(total, geology.exposed);
  return total;
}
export const geologicalMass = (geology: PlateState) =>
  totalElements(geology.buried) + totalElements(geology.exposed);
