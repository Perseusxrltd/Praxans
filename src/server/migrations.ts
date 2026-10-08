import { validateWorld } from "../simulation/engine";
import { WORLD_VERSION, type World } from "../simulation/types";
import { emptyEntropy } from "../simulation/thermodynamics";
import { createMind, learnObservation } from "../simulation/cognition";
import { initialFabric, refreshStructure } from "../simulation/weathering";
import { emptyStock, evaluateDesign } from "../simulation/laws";
import { createCivics, sampleProgress } from "../simulation/progress";
import { inheritedContact } from "../simulation/diplomacy";
import { getTile } from "../simulation/terrain";
import { initialPlanetaryClimate } from "../simulation/climate";

export interface Intervention {
  id: string;
  from: number;
  to: number;
  description: string;
}

interface RegisteredMigration extends Intervention {
  fromLaws: string;
  toLaws: string;
  apply(world: World): void;
}
const migrations: RegisteredMigration[] = [
  {
    id: "006-permanent-record",
    from: 5,
    to: 6,
    description:
      "Preserve all existing matter, inhabitants, clock, and geography. Pin future terrain to the original generator; begin the permanent event archive.",
    fromLaws: "biosphere-1.0",
    toLaws: "biosphere-1.0",
    apply(world: World) {
      world.generationVersion = "archipelago-1";
      world.pendingEvents = [...world.events];
    },
  },
  {
    id: "007-clock-and-entropy",
    from: 6,
    to: 7,
    description:
      "Retain the world's age, clock, inhabitants, and matter. Begin explicit entropy-flow accounting from this intervention, with a complete observer calendar; no past entropy measurements are invented.",
    fromLaws: "biosphere-1.0",
    toLaws: "biosphere-1.1",
    apply(world: World) {
      world.entropy = emptyEntropy(world.tick);
    },
  },
  {
    id: "008-material-memory-and-agency",
    from: 7,
    to: 8,
    description:
      "Preserve identities, tick, RNG, terrain, existing matter, energy counters and history. Fund atmospheric radiation from absorbed infrared and shortwave energy; separate future soil/lake freezing from snowfall. Compensate future energy additions and evaluate numerical error against processed energy. Correct seedling light response and woody tissue turnover. Begin resource-funded dormant propagules with empty seed banks; no seeds or extinct organisms are invented. Let urgent needs interrupt work and allow carried or fractional meals. Begin measured landscape/fabric aging, personal learning and civic outcome records at this tick. Previous shared observations and relationships become explicitly inherited accounts. New advice needs local consent; new diplomacy travels with provisioned people. Honor already escrowed exchanges under their old terms. No past erosion, neural activity, votes, agreements or achievements are invented.",
    fromLaws: "biosphere-1.1",
    toLaws: "biosphere-1.2",
    apply(world: World) {
      world.energy.compensation = { captured: 0, released: 0 };
      world.atmosphereCompensation = {};
      world.planetaryClimate = initialPlanetaryClimate(world.tick);
      world.evolution = {
        sinceTick: world.tick,
        eroded: 0,
        deposited: 0,
        structuralLoss: 0,
        repaired: 0,
        salvaged: 0,
      };
      world.diplomacy = { messages: [], accords: [] };
      for (const tile of world.tiles) {
        tile.sediment = 0;
        tile.surfaceChange = 0;
        tile.ice = 0;
        tile.seedBank = [];
      }
      for (const structure of world.structures) {
        structure.collapsed = false;
        structure.maintenance = false;
        structure.fabric = initialFabric(
          structure,
          getTile(world, structure.x, structure.y)!.temperature,
        );
        const geometry = evaluateDesign(structure.design);
        structure.properties.workSurface = geometry.workSurface;
        structure.properties.storageVolume = geometry.storageVolume;
      }
      for (const person of world.citizens) {
        person.mind = createMind(person, world.tick);
        person.journeyId = null;
      }
      for (const civ of world.civilizations) {
        civ.civics = createCivics(world.tick);
        for (const observation of civ.observations) {
          const geometry = evaluateDesign(observation.design);
          observation.properties.workSurface = geometry.workSurface;
          observation.properties.storageVolume = geometry.storageVolume;
          observation.research = {
            authorId: null,
            method: "inherited-record",
            prediction: {
              stable: observation.properties.stable,
              coveredArea: observation.properties.coveredArea,
              storageVolume: geometry.storageVolume,
            },
            surprise: 0,
            confidence: 0.4,
            samples: emptyStock(),
          };
          for (const person of world.citizens.filter(
            (p) => p.civId === civ.id,
          )) {
            learnObservation(world, person, observation, "inherited-record");
            person.mind.learned = 0;
          }
        }
        for (const [id, relation] of Object.entries(civ.relations)) {
          const other = world.civilizations.find((c) => c.id === id);
          if (!other)
            throw new Error(
              "A legacy relationship references a missing community. The save has been preserved.",
            );
          relation.kept = 0;
          relation.broken = 0;
          relation.contact = inheritedContact(world, other);
        }
      }
      for (const caravan of world.caravans) {
        // Honor the old, already escrowed transaction without inventing or taking travelers.
        caravan.kind = "trade";
        caravan.stage = "legacy";
        caravan.partyIds = [];
        caravan.provisions = 0;
        caravan.request = null;
        caravan.messageId = null;
        caravan.accordId = null;
        caravan.returnContact = null;
        caravan.result = "An exchange escrowed before the intervention";
      }
      for (const civ of world.civilizations) sampleProgress(world, civ);
    },
  },
  {
    id: "009-human-thermal-and-distance-balance",
    from: 8,
    to: 9,
    description:
      "Preserve the clock, identities, history, terrain, life and all existing matter. New body wraps and personal rations begin empty. Thermal protection requires real fiber; cold metabolism and melting frozen drinking water spend accessible food, while heat stress consumes hydration. Integrate walking in ground metres across the whole time step, respecting latitude and the date line. Resource gathering uses personally remembered places within a walking-time budget. New communities start with 300 individually represented adults and finite per-person supplies. Spread shelterless rest and aggregate exposed stocks over a population/material-volume camp footprint. Derive storage capacity from connected geometry, including gaps and missing floors; retain the old estimates in historical observations. Remember and seek observed water; plan seasonal food reserves through the growing season. Count carried food in community wellbeing and couple the whole biological food-decay rate to temperature. Separate plants' growth optima from lethal tissue temperatures and frozen dormancy from drought, with slower belowground turnover. No populations or habitats are restored by this law migration; any such intervention requires its own explicit operator record.",
    fromLaws: "biosphere-1.2",
    toLaws: "biosphere-1.3",
    apply(world: World) {
      for (const person of world.citizens) {
        person.wrapMass = 0;
        person.provisions = 0;
      }
      for (const structure of world.structures) refreshStructure(structure);
    },
  },
];

function migrationPath(
  saved: Pick<World, "version" | "lawsVersion">,
): RegisteredMigration[] {
  let version = saved.version,
    laws = saved.lawsVersion;
  const path: RegisteredMigration[] = [];
  while (version !== WORLD_VERSION) {
    const next = migrations.find(
      (step) => step.from === version && step.fromLaws === laws,
    );
    if (!next)
      throw new Error(
        `No registered migration from world format ${version} to ${WORLD_VERSION}. The existing world has been preserved; it will not be reset.`,
      );
    path.push(next);
    version = next.to;
    laws = next.toLaws;
  }
  return path;
}

export function describeMigration(
  saved: Pick<World, "version" | "lawsVersion">,
): Intervention[] {
  return migrationPath(saved).map(({ id, from, to, description }) => ({
    id,
    from,
    to,
    description,
  }));
}

/**
 * Registered transformations only. The default preserves its caller's value.
 * inPlace is for exclusively owned, newly loaded state whose original database
 * is archived in the same transaction. Discard that value if migration fails.
 */
export function migrateWorld(
  saved: World,
  options: { inPlace?: boolean } = {},
): {
  world: World;
  interventions: Intervention[];
} {
  const path = migrationPath(saved);
  const world = options.inPlace ? saved : structuredClone(saved);
  for (const step of path) {
    step.apply(world);
    world.version = step.to;
    world.lawsVersion = step.toLaws;
  }
  validateWorld(world);
  return {
    world,
    interventions: path.map(({ id, from, to, description }) => ({
      id,
      from,
      to,
      description,
    })),
  };
}
