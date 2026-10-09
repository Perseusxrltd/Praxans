import { LAWS } from "./laws";
import { ROCK, addNutrients } from "./chemistry";
import { clamp } from "./random";
import type { ElementMass, Tile, World } from "./types";

/** A transfer changes surface height by its represented solid volume, not an arbitrary tile step. */
export function displaceSurface(world: World, tile: Tile, mass: number): void {
  const metres = mass / (2400 * LAWS.tileArea);
  tile.elevation += metres / 600;
  tile.surfaceChange += metres;
  if (mass < 0) world.evolution.eroded -= mass;
  else world.evolution.deposited += mass;
}

export interface SedimentTransfer {
  to: Tile;
  sediment: number;
  nutrients: ElementMass;
  soilMass: number;
}

/** Detach locally now; receive after all flows are evaluated, avoiding same-hour cascades. */
export function entrainSediment(
  world: World,
  from: Tile,
  to: Tile,
  waterKg: number,
  slope: number,
): SedimentTransfer {
  const roots =
    (from.plant?.carbon ?? 0) * (from.plant?.genome.roots ?? 0) +
    (from.groundcover?.carbon ?? 0) * (from.groundcover?.genome.roots ?? 0);
  const binding = 0.05 + 0.95 * Math.exp(-roots / 25);
  const power = Math.max(0, waterKg) * clamp(slope / 20, 0, 1) * binding;
  const loose = Math.min(from.sediment, power * 0.004);
  const detached = Math.min(from.rock, power * 0.00002);
  const soilMass = Math.min(from.mineral * 0.01, power * 0.0002);
  const nutrients: ElementMass = {};
  const fraction = soilMass / Math.max(from.mineral, 1e-12);
  for (const [symbol, amount] of Object.entries(from.nutrients)) {
    nutrients[symbol] = amount * fraction;
    from.nutrients[symbol] -= nutrients[symbol];
  }
  from.mineral -= soilMass;
  from.sediment -= loose;
  from.rock -= detached;
  displaceSurface(world, from, -(loose + detached + soilMass));
  return { to, sediment: loose + detached, nutrients, soilMass };
}

export function depositSediment(
  world: World,
  transfer: SedimentTransfer,
): void {
  const { to, sediment, nutrients, soilMass } = transfer;
  to.sediment += sediment;
  for (const [symbol, amount] of Object.entries(nutrients))
    to.nutrients[symbol] = (to.nutrients[symbol] ?? 0) + amount;
  to.mineral += soilMass;
  displaceSurface(world, to, sediment + soilMass);
}

export function weatherSediment(tile: Tile): void {
  if (tile.sediment === 0) return;
  const dissolved =
    tile.sediment *
    Math.min(
      0.0005,
      (0.00002 * Math.exp((tile.temperature - 15) / 30) * tile.water) /
        (tile.water + 2000),
    );
  tile.sediment -= dissolved;
  addNutrients(tile, ROCK, dissolved);
}
