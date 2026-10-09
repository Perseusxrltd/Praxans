import { createWorld as createSimulationWorld } from "../../src/simulation/world";
import { Store, digest } from "../../src/server/store";
import { regionWriter } from "../../src/server/regions";
import type {
  Design,
  World,
  GenerationVersion,
} from "../../src/simulation/types";
import { requestAssembly } from "../../src/simulation/economy";

export const shelter: Design = {
  name: "Load trial",
  components: [
    {
      material: "wood",
      x: 0,
      y: 0,
      z: 0,
      width: 0.16,
      depth: 0.16,
      height: 1.8,
    },
    {
      material: "wood",
      x: -0.72,
      y: -0.72,
      z: 1.8,
      width: 1.6,
      depth: 1.6,
      height: 0.03,
    },
  ],
};
export const box: Design = {
  name: "An unnamed arrangement",
  components: [
    { material: "wood", x: 0, y: 0, z: 0, width: 1, depth: 1, height: 0.05 },
    {
      material: "wood",
      x: 0,
      y: 0,
      z: 0.05,
      width: 0.05,
      depth: 1,
      height: 0.5,
    },
    {
      material: "wood",
      x: 0.95,
      y: 0,
      z: 0.05,
      width: 0.05,
      depth: 1,
      height: 0.5,
    },
    {
      material: "wood",
      x: 0.05,
      y: 0,
      z: 0.05,
      width: 0.9,
      depth: 0.05,
      height: 0.5,
    },
    {
      material: "wood",
      x: 0.05,
      y: 0.95,
      z: 0.05,
      width: 0.9,
      depth: 0.05,
      height: 0.5,
    },
  ],
};
export function built(world: World, design = shelter) {
  const civ = world.civilizations[0];
  for (const other of world.civilizations.slice(1)) {
    civ.stock.wood += other.stock.wood;
    other.stock.wood = 0;
  }
  const id = requestAssembly(world, civ, design);
  const structure = world.structures.find((s) => s.id === id)!;
  structure.progress = 1;
  return structure;
}

/** Project the current fixture onto the actual old representation, including separately stored chunks. */
export function legacyCheckpoint(
  store: Store,
  world: World,
  version: 5 | 6 | 7,
) {
  store.save(world);
  const old = JSON.parse(JSON.stringify(world));
  old.version = version;
  old.lawsVersion = version < 7 ? "biosphere-1.0" : "biosphere-1.1";
  delete old.evolution;
  delete old.diplomacy;
  delete old.atmosphereCompensation;
  delete old.planetaryClimate;
  if (version < 7) delete old.entropy;
  if (version < 6) {
    delete old.generationVersion;
    delete old.pendingEvents;
  }
  for (const tile of old.tiles) {
    tile.rock += tile.sediment;
    tile.water += tile.ice;
    for (const seed of tile.seedBank) {
      tile.detritus.carbon += seed.carbon;
      tile.detritus.mineral += seed.mineral;
    }
    delete tile.sediment;
    delete tile.surfaceChange;
    delete tile.ice;
    delete tile.seedBank;
  }
  for (const person of old.citizens) {
    const civ = old.civilizations.find(
      (c: { id: string }) => c.id === person.civId,
    );
    civ.stock.fiber += person.wrapMass;
    civ.stock.biomass += person.provisions + person.metabolism.intake;
    delete person.wrapMass;
    delete person.provisions;
    delete person.metabolism;
    delete person.mind;
    delete person.journeyId;
  }
  for (const civ of old.civilizations) {
    delete civ.civics;
    for (const observation of civ.observations) {
      delete observation.research;
      delete observation.properties.workSurface;
      delete observation.properties.storageVolume;
    }
    for (const relation of Object.values(civ.relations) as Record<
      string,
      unknown
    >[]) {
      delete relation.contact;
      delete relation.kept;
      delete relation.broken;
    }
  }
  for (const s of old.structures) {
    delete s.fabric;
    delete s.collapsed;
    delete s.maintenance;
    delete s.properties.workSurface;
    delete s.properties.storageVolume;
  }
  for (const c of old.caravans)
    for (const field of [
      "kind",
      "stage",
      "partyIds",
      "provisions",
      "request",
      "messageId",
      "accordId",
      "result",
      "returnContact",
    ])
      delete c[field];
  const { tiles, ...metadata } = old;
  const writeRegion = regionWriter(store.db);
  for (const chunk of old.chunks) {
    const json = JSON.stringify(
      tiles.slice(chunk.start, chunk.start + 32 ** 2),
    );
    writeRegion(chunk.id, json, digest(json));
  }
  const json = JSON.stringify(metadata);
  store.db
    .prepare("UPDATE world SET json=?,checksum=?")
    .run(json, digest(json));
  return old as World;
}

/** Small explicit populations keep mechanism tests focused; founding-scale trials use the production default. */
export function smallWorld(
  seed = 1847,
  width = 96,
  height = 96,
  generationVersion: GenerationVersion = "planet-1",
) {
  return createSimulationWorld(seed, width, height, generationVersion, 8);
}
