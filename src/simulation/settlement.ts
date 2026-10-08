import { MATERIALS } from "./content";
import { LAWS } from "./laws";
import { hash } from "./random";
import { getTile, nearbyTiles } from "./terrain";
import type { Citizen, Civilization, Material, Tile, World } from "./types";

export const SETTLEMENT_SPACE = Object.freeze({
  campAreaPerPerson: 16,
  openStockpileHeight: 0.5,
  description:
    "An unhoused camp targets 16 m² per resident, or enough land for its finite material volume in 0.5 m open piles, limited by connected land. Rest and exposed stocks occupy that footprint. This is an explicit spatial approximation, not a house grant, carrying capacity, or a resolved warehouse layout.",
});

const populations = new WeakMap<
  World,
  {
    tick: number;
    source: Citizen[];
    length: number;
    counts: Map<string, number>;
  }
>();
/** Membership changes without births/deaths must invalidate the derived count. */
export function invalidateCampPopulation(world: World) {
  populations.delete(world);
}
function campPopulation(world: World, civ: Civilization) {
  let cached = populations.get(world);
  if (
    !cached ||
    cached.tick !== world.tick ||
    cached.source !== world.citizens ||
    cached.length !== world.citizens.length
  ) {
    const counts = new Map<string, number>();
    for (const person of world.citizens)
      counts.set(person.civId, (counts.get(person.civId) ?? 0) + 1);
    cached = {
      tick: world.tick,
      source: world.citizens,
      length: world.citizens.length,
      counts,
    };
    populations.set(world, cached);
  }
  return cached.counts.get(civ.id) ?? 0;
}

export function campFootprint(
  world: World,
  civ: Civilization,
  population?: number,
) {
  const people = population ?? campPopulation(world, civ);
  const stockVolume = Object.entries(civ.stock).reduce(
    (sum, [material, amount]) =>
      sum + amount / MATERIALS[material as Material].density,
    0,
  );
  const area = Math.max(
    LAWS.tileArea,
    people * SETTLEMENT_SPACE.campAreaPerPerson,
    stockVolume / SETTLEMENT_SPACE.openStockpileHeight,
  );
  return {
    area,
    radius: Math.sqrt(area / (Math.PI * LAWS.tileArea)),
    stockVolume,
  };
}

const layouts = new WeakMap<
  World,
  Map<
    string,
    {
      tick: number;
      population: number;
      radius: number;
      source: Tile[];
      sourceLength: number;
      cells: Tile[];
      access: Set<Tile>;
    }
  >
>();
function campLayout(world: World, civ: Civilization, population?: number) {
  const people = population ?? campPopulation(world, civ);
  const { radius, area } = campFootprint(world, civ, people);
  let byCommunity = layouts.get(world);
  if (!byCommunity) {
    byCommunity = new Map();
    layouts.set(world, byCommunity);
  }
  const old = byCommunity.get(civ.id);
  if (
    old &&
    old.tick === world.tick &&
    old.population === people &&
    old.radius === radius &&
    old.source === world.tiles &&
    old.sourceLength === world.tiles.length
  )
    return old;
  const home = getTile(world, civ.x, civ.y)!;
  const available = new Set(
    nearbyTiles(world, civ, radius + 1).filter((t) => t.terrain !== "water"),
  );
  const wanted = Math.ceil(area / LAWS.tileArea);
  const cells = [home],
    visited = new Set([home]);
  for (let at = 0; at < cells.length; at++) {
    const cell = cells[at];
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const next = getTile(world, cell.x + dx, cell.y + dy);
      if (cells.length >= wanted) break;
      if (next && available.has(next) && !visited.has(next)) {
        visited.add(next);
        cells.push(next);
      }
    }
  }
  const access = new Set<Tile>(cells);
  // As with a drinking bank, a person can reach an adjacent represented stock
  // cell during a coarse quarter-hour step; distant stores remain inaccessible.
  for (const cell of cells)
    for (const near of nearbyTiles(world, cell, 1))
      if (near.terrain !== "water") access.add(near);
  const layout = {
    tick: world.tick,
    population: people,
    radius,
    source: world.tiles,
    sourceLength: world.tiles.length,
    cells,
    access,
  };
  byCommunity.set(civ.id, layout);
  return layout;
}
export function campTiles(world: World, civ: Civilization) {
  return campLayout(world, civ).cells;
}
export function canReachCampStocks(
  world: World,
  civ: Civilization,
  person: Citizen,
) {
  return campLayout(world, civ).access.has(getTile(world, person.x, person.y)!);
}

/** A person's shelterless rest place is a real piece of nearby land, not one crowded point. */
export function campRestPlace(
  world: World,
  civ: Civilization,
  person: Citizen,
  population: number,
) {
  const identity = Number(person.id.split("-").at(-1)) || 0;
  const cells = campLayout(world, civ, population).cells;
  return cells[
    Math.min(
      cells.length - 1,
      Math.floor(hash(identity, 17, world.seed) * cells.length),
    )
  ];
}
