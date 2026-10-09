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
  {
    id: "013-local-inventory-exposure-and-access",
    from: 12,
    to: 13,
    fromLaws: "biosphere-1.6",
    toLaws: "biosphere-1.7",
    description:
      "Preserve every existing person, body, intake, ration, cargo, caravan, stock, task, region, identity, RNG, clock and historical record. Loose camp, personal and journey materials share an hourly temperature/moisture exposure law; only represented camp storage supplies its existing protection. This migration debits no inventory. Subsequent hourly boundaries apply a full hour at the current location, including goods acquired within that interval; detailed exposure histories are not represented. Spoiled material returns once to local reservoirs. Journey payload includes living carriers' personal food, covering and work cargo; loss of carriers limits shared goods before movement, and return exchanges and raids respect remaining capacity. The fixed 30 kg adult load and party-size limit remain controller approximations. New founding screens count standing food and wood only on represented land connected within the survey radius; a screen is neither ownership, discovered personal knowledge nor sustainable annual yield. Legacy escrow keeps its identity and delivery path, with future physical spoilage applied to its actual goods. No supplies, people, historical meals or clock time are created; infant feeding, growth, hauling and seasonal community viability still require validation.",
    apply() {
      // Future physical rules only; every saved inventory remains exact here.
    },
  },
  {
    id: "014-performed-local-food-handoff",
    from: 13,
    to: 14,
    fromLaws: "biosphere-1.7",
    toLaws: "biosphere-1.8",
    description:
      "Preserve every existing person, task, memory, body, intake, reserve, ration, cargo, stock, caravan, region, identity, RNG, clock and historical record. From this boundary, people may choose to hand their own carried food to a nearby person through paid delivery work. Contact uses the existing stationary-cell approximation. Capture finite holder budgets after current meals and ration pickup, and debit all donors before crediting recipients; received food cannot fund another handoff in the same interval. Donor choice uses coarse local hunger and empty-bundle signals, existing social disposition and urgent personal needs. Kinship and community labels confer no physical permission. Handling rate and buffer targets are explicit controller approximations. Delivery changes provisions only; subsequent ordinary physiology performs ingestion. This does not represent recipient consent, lactation, food preparation or assisted swallowing, nor validate childhood growth or seasonal survival. No people, food, past care, meals or clock time are created.",
    apply() {
      // Optional personal-delivery fields begin only when new work is chosen.
    },
  },
  {
    id: "015-age-bounded-structural-growth",
    from: 14,
    to: 15,
    fromLaws: "biosphere-1.8",
    toLaws: "biosphere-1.9",
    description:
      "Preserve every existing person, age, body, reserve subset, intake, measured interval, task, material, region, identity, RNG, clock and historical record. From this boundary, extra oxidation for cold, melting or work grants no additional tissue-processing allowance. Processing remains included in coarse resting maintenance; its inherited fraction is not a measured synthesis cost. Restore finite reserves before allowing structural deposition within an age-resolved capacity and finite recovery rate, using actual remaining food. The existing 2 and 18 kg dry-equivalent body references, a concave 18-year maturation curve and 90-day structural recovery time constant are explicit uncalibrated model assumptions. Older deficient bodies may recover, but no body is resized to a target, no missed growth is credited as matter and all pre-existing oversized children remain intact. Infant motor development, feeding biology, gestational costs and seasonal survival still require validation. No people, supplies, historical development or clock time are created.",
    apply() {
      // The deposition budget is transient; existing body/history fields stay exact.
    },
  },
  {
    id: "016-performed-resource-harvesting",
    from: 15,
    to: 16,
    fromLaws: "biosphere-1.9",
    toLaws: "biosphere-1.10",
    description:
      "Preserve every existing person, task, progress, cargo, memory, material, region, identity, RNG, clock and historical record. From this boundary, newly funded resource work incrementally earns private carried products. Old progress earns no retroactive products; completion performs no second extraction. Simultaneous attempts in an occupied cell share finite plant organic/mineral compartments, rock or the actual clay element mixture, with one handling budget across both vegetation layers. Pooled exponential plant exposure reuses the existing cut fractions and attempt durations; these remain uncalibrated whole-cell accessibility and handling conventions, not conserved anatomical tissues or measured productivity. Bounded bisection locates mineral exhaustion within the funded interval; only remaining effort can then use surviving vegetation layers. Handling transitions still introduce declared timestep approximation. Cold-weather reconsideration counts both provisions and edible work cargo as personal food. Other source-changing task completions follow the harvest boundary. Actual credited yield alone updates the optional task observation; it is not additional matter, and interruption or ingestion does not erase products already earned. No cooperation, communal delivery, food priority, seasonal carrying capacity or general simultaneous economy is implied. No people, supplies, past effort refunds or clock time are created.",
    apply() {
      // The optional yield observation begins only with an actual new product credit.
    },
  },
  {
    id: "017-contact-from-actual-movement",
    from: 16,
    to: 17,
    fromLaws: "biosphere-1.10",
    toLaws: "biosphere-1.11",
    description:
      "Preserve every existing person, body, intake, reserves, task, pending route, cargo, material, region, identity, RNG, clock and historical record. From this boundary, local body maintenance, food handoffs and harvesting distinguish actual movement from a planned route. Stationary people remain eligible for physical contact when travel is unfunded or blocked. Positive distance traveled invalidates the shared contact for the whole interval, including returning to the initial position; subsequent intervals start a fresh contact account. Position, living membership, journey and task checks still precede finite transfer allocation. Travel spends its funded interval and cannot also earn work on arrival. The transient motion account is not saved or inferred for past time. This is a coarse occupied-cell constraint, not calibrated reach, continuous interaction, recipient consent or guaranteed assistance. Donor choice, finite resources, paid work and later ingestion remain necessary. No people, supplies, nutrition, care, movement, historical survival or clock time are granted.",
    apply() {
      // Contact evidence exists only within the new interval; saved fields stay exact.
    },
  },
  {
    id: "018-mandatory-resting-metabolism",
    from: 17,
    to: 18,
    fromLaws: "biosphere-1.11",
    toLaws: "biosphere-1.12",
    description:
      "Preserve every existing person, body, intake, reserves, measured interval, task, material, region, identity, RNG, clock and historical record. From this boundary, mandatory resting demand rather than an unfunded optional activity request governs metabolic injury and the existing recovery and finite retention gates. Desired work still requests fuel; one finite, oxygen-limited oxidation supplies resting metabolism, activity and subsequent heat or melting. Unfunded activity earns no additional work. Cold and unremoved heat still cause injury, with overlapping deficits counted once. New intervals record captured restingKJ and unmetRestingKJ alongside the unchanged total-request observations. Old measurements remain exact and gain no inferred resting values. Planned fatigue/water, coarse heat injury and retention energetics remain uncalibrated limitations. No people, resources, past recovery, historical survival or clock time are granted.",
    apply() {
      // Optional resting observations begin only in a newly measured interval.
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
