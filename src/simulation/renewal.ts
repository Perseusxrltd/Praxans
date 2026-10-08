import { elementLedger } from "./chemistry";
import { initialPlant } from "./life";
import { ledger, refreshTile } from "./laws";
import { surfaceFields } from "./surface";
import { nearbyTiles } from "./terrain";
import {
  initializeFounders,
  peopleOf,
  recordEvent,
  remember,
  tileIndex,
  touchTile,
} from "./world";
import type { Material, Stock, World } from "./types";

export interface CommunityRenewal {
  id: string;
  worldId: string;
  seed: number;
  civilizationIds: string[];
  peoplePerCommunity: number;
  suppliesPerPerson: Stock;
  habitat: {
    radius: number;
    plantKg: number;
    groundcoverKg: number;
    seedKg: number;
  };
  reason: string;
}

/** Explicit operator intervention, never invoked by autonomous ecology or a player action. */
export function renewCommunities(world: World, request: CommunityRenewal) {
  if (world.id !== request.worldId || world.seed !== request.seed)
    throw new Error("The renewal targets a different world.");
  if (new Set(request.civilizationIds).size !== request.civilizationIds.length)
    throw new Error("Duplicate community in renewal.");
  const communities = request.civilizationIds.map((id) => {
    const civ = world.civilizations.find((c) => c.id === id);
    if (!civ || peopleOf(world, id).length)
      throw new Error(
        "Renewal requires an existing community with no living residents.",
      );
    return civ;
  });
  const before = ledger(world),
    beforeElements = elementLedger(world);
  const arrivals = [];
  for (const civ of communities) {
    civ.renewal = {
      tick: world.tick,
      arrivals: request.peoplePerCommunity,
      interventionId: request.id,
    };
    const retained = { ...civ.stock };
    // Do not publish progress for the temporary opening stocks. Normal daily
    // measurements resume after the complete, recorded intervention.
    initializeFounders(world, civ, request.peoplePerCommunity, false);
    for (const material of Object.keys(civ.stock) as Material[])
      civ.stock[material] =
        retained[material] +
        request.suppliesPerPerson[material] * request.peoplePerCommunity;
    const newcomers = peopleOf(world, civ.id);
    newcomers.forEach((person, i) => {
      person.age = 18 + ((i * 7) % 25);
      person.memories = [];
      remember(
        world,
        person,
        `Arrived to renew ${civ.name}; the former residents' lives remain in its history.`,
      );
      const wrap = Math.min(2, civ.stock.fiber);
      civ.stock.fiber -= wrap;
      person.wrapMass = wrap;
    });
    let plantKg = 0,
      seedKg = 0,
      patches = 0;
    for (const tile of nearbyTiles(world, civ, request.habitat.radius)) {
      if (tile.terrain === "water" || tile.terrain === "shore") continue;
      const prior = surfaceFields(
        world.seed,
        tile.x,
        tile.y,
        world.generationVersion,
      );
      let changed = false;
      for (const layer of ["plant", "groundcover"] as const) {
        const template = initialPlant(
          world.seed + 71611,
          { ...tile, terrain: prior.terrain, temperature: prior.temperature },
          layer === "groundcover",
        );
        if (!template) continue;
        const organic =
          layer === "plant"
            ? request.habitat.plantKg
            : request.habitat.groundcoverKg;
        if (!tile[layer] && organic > 0) {
          tile[layer] = {
            ...structuredClone(template),
            carbon: organic,
            mineral: organic * 0.04,
          };
          plantKg += organic;
          changed = true;
        }
        if (tile.seedBank.length < 4 && request.habitat.seedKg > 0) {
          tile.seedBank.push({
            ...structuredClone(template),
            carbon: request.habitat.seedKg,
            mineral: request.habitat.seedKg * 0.04,
            layer,
            depositedTick: world.tick,
            germinationTick: world.tick + 96 * 2,
          });
          seedKg += request.habitat.seedKg;
          changed = true;
        }
      }
      if (changed) {
        patches++;
        refreshTile(tile);
        touchTile(world, tileIndex(world, tile.x, tile.y));
      }
    }
    const arrival = {
      civId: civ.id,
      people: newcomers.length,
      plantKg,
      seedKg,
      patches,
    };
    arrivals.push(arrival);
    recordEvent(world, {
      category: "founding",
      civId: civ.id,
      relatedId: request.id,
      renewal: { interventionId: request.id, arrivals: newcomers.length },
      title: `A new chapter for ${civ.name}`,
      detail: `${request.peoplePerCommunity} new people arrive by an explicit world intervention. Earlier deaths, ownership and memories of the community remain recorded. They bring finite supplies and ${plantKg.toFixed(1)} kg of land-plant tissue with ${seedKg.toFixed(1)} kg of dormant propagules across ${patches} patches. ${request.reason}`,
      x: civ.x,
      y: civ.y,
    });
  }
  const after = ledger(world),
    afterElements = elementLedger(world);
  const matter = { carbon: 0, mineral: 0, water: 0, chemical: 0 };
  for (const key of ["carbon", "mineral", "water", "chemical"] as const) {
    matter[key] = after[key] - before[key];
    world.boundary[key] += matter[key];
  }
  for (const symbol of new Set([
    ...Object.keys(beforeElements),
    ...Object.keys(afterElements),
  ]))
    world.incomingElements[symbol] =
      (world.incomingElements[symbol] ?? 0) +
      (afterElements[symbol] ?? 0) -
      (beforeElements[symbol] ?? 0);
  return { arrivals, matter };
}
