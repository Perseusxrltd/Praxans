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
import { initialMetabolism } from "../simulation/physiology";

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
  {
    id: "010-performed-body-maintenance",
    from: 9,
    to: 10,
    description:
      "Preserve every existing person, task, memory, wrap, stock, region, clock, RNG and historical record. From this boundary, arranging or removing body fiber requires performed repair work, elapsed time and accessible material. Nearby people can choose to help any represented person; kinship and community labels grant no physical privilege. Resolve competing body transfers against common inventories after individual movement and needs, without recycling the same fiber twice in a tick. Replace automatic adult wrapping with voluntary local work, using the existing signed heat balance to estimate useful protection. Visible opposing self-adjustment prompts reconsideration; silence is not consent and no force or verbal communication model is implied. Retain all prior protection and the current empty populations. No new people, material, past care or biological reserves are created; metabolism, food allocation and childhood growth require separate corrections.",
    fromLaws: "biosphere-1.3",
    toLaws: "biosphere-1.4",
    apply() {
      // Optional body-repair task fields need no invented state in old tasks.
    },
  },
  {
    id: "011-consumption-before-ration-pickup",
    from: 10,
    to: 11,
    description:
      "Preserve every person, task, memory, private ration, caravan, stock, region, clock, RNG and historical record. From this boundary, all current citizen physiology precedes optional personal ration pickup, which precedes decisions, movement and work. Meals, extra cold fuel and ice melting debit actual accessible food before the remaining camp stock can be packed for later. Snapshot local pickup access and share competing refill requests proportionally against one finite residual budget, retaining private and caravan custody. The inherited 3 kg automatic reserve target and proportional contention are explicit controller conventions, not physical laws, inferred generosity or a learned social agreement. No food, people, retrospective meals or clock time are created. Competition among current physiological withdrawals remains sequential; metabolic energy, childhood growth and performed feeding need further correction.",
    fromLaws: "biosphere-1.4",
    toLaws: "biosphere-1.5",
    apply() {
      // Only future scheduling changes; no saved inventory or task is rewritten.
    },
  },
  {
    id: "012-funded-human-metabolism",
    from: 11,
    to: 12,
    fromLaws: "biosphere-1.5",
    toLaws: "biosphere-1.6",
    description:
      "Preserve all existing body mass, food, materials, identities, ownership, geography, RNG, clock and history. Begin unoxidized intake empty and classify 10 percent of each existing dry-equivalent body as a mobilizable subset, not additional matter or anatomical fat; no historical meals or energy stores are invented. Current metabolic food requests precede optional internal meals and carried rations. One oxygen-limited oxidation path supplies actual maintenance, heat and finite ice melting; reserve use decreases both its tag and total body mass. Retained food restores reserves before structural growth under one processed-food allowance. Satiety becomes an intake signal rather than a separate starvation clock. Work and journeys require a funded prior activity interval. Future death records retain the measured metabolic interval. Reserve fractions, power limits, injury doses, feeding behavior and growth remain declared coarse assumptions requiring calibration; no population is restored and no claim of generational viability is made.",
    apply(world: World) {
      for (const person of world.citizens)
        person.metabolism = initialMetabolism(person.body);
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
