import type {
  Citizen,
  ObserverCitizen,
  ObserverTile,
  Tile,
} from "../simulation/types";

/** Keep visible lives and memories, without repeatedly transmitting their learning machinery. */
export function observerCitizen(person: Citizen): ObserverCitizen {
  const { synapses, pending, activations, places, ...mind } = person.mind;
  return {
    ...person,
    mind: { ...mind, places: places.map(({ x, y }) => ({ x, y })) },
  };
}

/** Dormant tissue is observable; its full inherited genome is authoritative server state. */
export function observerTile(tile: Tile): ObserverTile {
  const rounded: ObserverTile = structuredClone({
    ...tile,
    seedBank: tile.seedBank.map(({ carbon, mineral, lineage, layer }) => ({
      carbon,
      mineral,
      lineage,
      layer,
    })),
  });
  for (const key of [
    "water",
    "mineral",
    "rock",
    "temperature",
    "moisture",
    "fertility",
    "trees",
    "forage",
    "road",
  ] as const)
    rounded[key] = Math.round(rounded[key] * 100) / 100;
  rounded.detritus.carbon = Math.round(rounded.detritus.carbon * 100) / 100;
  rounded.detritus.mineral = Math.round(rounded.detritus.mineral * 100) / 100;
  for (const plant of [rounded.plant, rounded.groundcover]) {
    if (!plant) continue;
    plant.carbon = Math.round(plant.carbon * 1000000) / 1000000;
    plant.mineral = Math.round(plant.mineral * 1000000) / 1000000;
    for (const key of Object.keys(
      plant.genome,
    ) as (keyof typeof plant.genome)[])
      plant.genome[key] = Math.round(plant.genome[key] * 10000) / 10000;
  }
  for (const seed of rounded.seedBank) {
    seed.carbon = Math.round(seed.carbon * 1000000) / 1000000;
    seed.mineral = Math.round(seed.mineral * 1000000) / 1000000;
  }
  for (const key of Object.keys(rounded.air) as (keyof typeof rounded.air)[])
    rounded.air[key] = Math.round(rounded.air[key] * 1000000) / 1000000;
  for (const symbol of Object.keys(rounded.nutrients))
    rounded.nutrients[symbol] =
      Math.round(rounded.nutrients[symbol] * 1000000) / 1000000;
  return rounded;
}
