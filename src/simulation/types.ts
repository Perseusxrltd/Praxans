import type { WorldClock } from "./chronology";
import type { EntropyRecord } from "./thermodynamics";
export const WORLD_VERSION = 16;
export type GenerationVersion = "archipelago-1" | "planet-1";
export const TICK_MS = 250;
export const HOURS_PER_TICK = 0.25;
export const DAYS_PER_YEAR =
  (2 *
    Math.PI *
    Math.sqrt(149597870700 ** 3 / (6.6743e-11 * (1.98847e30 + 5.9722e24)))) /
  86400;
export const CHUNK_SIZE = 32;

/** Sparse kilograms by chemical symbol. Missing elements have zero mass. */
export type ElementMass = Record<string, number>;
export interface AirCell {
  vapor: number;
  cloud: number;
  snow: number;
  pressure: number;
  windX: number;
  windY: number;
  rain: number;
  humidity: number;
  sunlight: number;
  dust: number;
  tide: number;
}
export interface PlateState {
  id: string;
  velocityX: number;
  velocityY: number;
  convergence: number;
  boundaryDistance: number;
  stress: number;
  uplift: number;
  heatFlux: number;
  earthquakes: number;
  buried: ElementMass;
  exposed: ElementMass;
}

export type Terrain =
  | "water"
  | "shore"
  | "meadow"
  | "forest"
  | "hill"
  | "marsh"
  | "desert"
  | "tundra"
  | "unknown";
export type Material = "biomass" | "wood" | "fiber" | "stone" | "clay";
export type Stock = Record<Material, number>;
export type Focus =
  "balance" | "nourish" | "build" | "discover" | "connect" | "preserve";
export type EventCategory =
  | "founding"
  | "life"
  | "building"
  | "discovery"
  | "nature"
  | "trade"
  | "diplomacy"
  | "culture"
  | "agent";
export type Weather = "clear" | "rain" | "mist" | "storm" | "drought" | "snow";
export interface Matter {
  carbon: number;
  mineral: number;
  water: number;
}
export interface Genome {
  woodiness: number;
  growth: number;
  roots: number;
  seedSize: number;
  temperature: number;
  defense: number;
  shadeTolerance: number;
  waterNeed: number;
  deciduous: number;
  pollination: number;
}
export interface Plant {
  carbon: number;
  mineral: number;
  genome: Genome;
  generation: number;
  lineage: number;
}
/** A finite cohort of dormant seeds/spores, retaining its parent's material and traits. */
export interface Propagule extends Plant {
  layer: "plant" | "groundcover";
  depositedTick: number;
  germinationTick: number;
}
export type FaunaDiet =
  "grazer" | "nectar" | "predator" | "detritivore" | "omnivore";
export interface FaunaSpecies {
  id: string;
  name: string;
  diet: FaunaDiet;
  habitat: "land" | "water" | "wetland" | "air";
  dryMass: number;
  groupSize: number;
  prevalence: number;
  metabolism: number;
  temperature: number;
  tolerance: number;
  lifespanDays: number;
  reproductionDays: number;
  litter: number;
  canopy: number;
  moisture: number;
  mobility: number;
  seedDispersal: number;
  color: string;
}
/** An ecological cohort; insects and worms are not individually ticked. Mass is authoritative. */
export interface Animal {
  id: string;
  species: string;
  x: number;
  y: number;
  count: number;
  body: number;
  hydration: number;
  health: number;
  ageDays: number;
  generation: number;
  lastBirthTick: number;
  traits: { size: number; temperature: number; efficiency: number };
  activity: string;
}
export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  biome: string;
  elevation: number;
  variation: number;
  road: number;
  owner: string | null;
  water: number;
  /** Frozen soil/lake water; distinct from snowfall on the surface. */
  ice: number;
  mineral: number;
  rock: number;
  sediment: number;
  /** Change in surface height, metres, measured since the landscape intervention. */
  surfaceChange: number;
  detritus: { carbon: number; mineral: number };
  plant: Plant | null;
  groundcover: Plant | null;
  seedBank: Propagule[];
  pollination: number;
  dissolvedOxygen: number;
  temperature: number;
  moisture: number;
  fertility: number;
  trees: number;
  forage: number;
  nutrients: ElementMass;
  air: AirCell;
}
export interface Memory {
  tick: number;
  text: string;
  feeling: "warm" | "neutral" | "sad";
}
export interface Traits {
  diligence: number;
  sociability: number;
  curiosity: number;
  resilience: number;
}
export type Activity =
  | "gather"
  | "extract"
  | "assemble"
  | "experiment"
  | "tend"
  | "deliver"
  | "rest"
  | "social"
  | "repair"
  | "salvage"
  | "explore"
  | "move";
export interface PlaceMemory {
  x: number;
  y: number;
  tick: number;
  food: number;
  water?: number;
  frozenWater?: number;
  wood: number;
  fiber: number;
  stone: number;
  clay: number;
}
export interface KnowledgeTrace {
  id: string;
  learnedTick: number;
  lastRecalledTick: number;
  sourceId: string | null;
  source: "experience" | "teaching" | "inherited-record";
  retention: number;
  consolidation: number;
}
/** Small adaptive sensorimotor network and bounded memory, not a cellular brain model. */
export interface Mind {
  sinceTick: number;
  sleepPressure: number;
  stress: number;
  attention: number;
  socialNeed: number;
  sleeping: boolean;
  reward: number;
  predictionError: number;
  activations: Partial<Record<Activity, number>>;
  synapses: Partial<Record<Activity, number[]>>;
  pending: {
    activity: Activity;
    inputs: number[];
    prediction: number;
    tick: number;
  } | null;
  places: PlaceMemory[];
  knowledge: KnowledgeTrace[];
  learned: number;
  taught: number;
  forgotten: number;
  lastLessonTick: number;
  adviceTrust: number;
}
export interface Task {
  /** The remembered bodily purpose of a route, not a guaranteed resource. */
  need?: "water";
  kind: Activity;
  tile: number;
  path: number[];
  progress: number;
  material?: Material;
  structureId?: string;
  /** Recipient of personal fiber work or a local food handoff. */
  recipientId?: string;
  /** Intended kilograms on that body; progress records kilograms actually moved. */
  targetWrapMass?: number;
  /** Intended kilograms in the recipient's food bundle; not swallowed intake. */
  targetProvisionMass?: number;
  /** Actual product credits during this attempt; an observation, not stored matter. */
  harvestedKg?: number;
}
/** Kilograms use the existing biomass-equivalent material, not anatomical fat. */
export interface Metabolism {
  /** Unoxidized food, counted separately from body and carried provisions. */
  intake: number;
  /** A mobilizable subset of body; never add this tag again in a material ledger. */
  reserves: number;
  /** Last measured interval; null means no interval has been measured yet. */
  last: MetabolicFlux | null;
}
export interface MetabolicFlux {
  tick: number;
  hours: number;
  ingestedKg: number;
  foodOxidizedKg: number;
  reserveOxidizedKg: number;
  reserveStoredKg: number;
  structureStoredKg: number;
  maintenanceKJ: number;
  heatLossKJ: number;
  releasedKJ: number;
  meltKJ: number;
  unmetMaintenanceKJ: number;
  unmetColdKJ: number;
  unremovedHeatKJ: number;
  healthLoss: number;
  /** Fraction of the planned active interval funded after resting maintenance. */
  activityFraction: number;
  journeyId: string | null;
}
export interface Citizen {
  id: string;
  civId: string;
  name: string;
  x: number;
  y: number;
  age: number;
  generation: number;
  parentIds: string[];
  partnerId: string | null;
  health: number;
  hunger: number;
  energy: number;
  happiness: number;
  sick: number;
  /** Total dry-equivalent body material, including metabolism.reserves. */
  body: number;
  metabolism: Metabolism;
  hydration: number;
  traits: Traits;
  skill: number;
  specialty: Activity;
  cargo: { material: Material; amount: number } | null;
  task: Task | null;
  memories: Memory[];
  lastBirthTick: number;
  clothing: number;
  /** Kilograms of real plant fiber arranged around the body for insulation. */
  wrapMass: number;
  /** Carried edible biomass, separate from work cargo. */
  provisions: number;
  experience: Partial<Record<Activity, number>>;
  pregnancy: {
    partner: Pick<Citizen, "id" | "name" | "generation" | "traits">;
    dueTick: number;
  } | null;
  mind: Mind;
  journeyId: string | null;
}
/** Axis-aligned solid components in metres. No catalog of buildings or crafting recipes. */
export interface Component {
  material: Material;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}
export interface Design {
  name: string;
  components: Component[];
}
export interface PhysicalProperties {
  mass: number;
  cost: Stock;
  stable: boolean;
  stability: number;
  coveredArea: number;
  height: number;
  insulation: number;
  capacity: number;
  workSurface: number;
  storageVolume: number;
  work: number;
  weakestStress: number;
  explanation: string[];
}
export interface Structure {
  id: string;
  civId: string;
  x: number;
  y: number;
  design: Design;
  properties: PhysicalProperties;
  progress: number;
  condition: number;
  foundedTick: number;
  collapsed: boolean;
  maintenance: boolean;
  fabric: {
    parts: { mass: number; damage: number }[];
    exposureHours: number;
    previousTemperature: number;
    lostMass: number;
    repairedMass: number;
  };
}
export interface Observation {
  id: string;
  tick: number;
  statement: string;
  evidence: string;
  design: Design;
  properties: PhysicalProperties;
  trials: number;
  research: {
    authorId: string | null;
    method: "material-trial" | "construction" | "inherited-record";
    prediction: { stable: boolean; coveredArea: number; storageVolume: number };
    surprise: number;
    confidence: number;
    samples: Stock;
  };
}
export interface Relation {
  affinity: number;
  tradeCount: number;
  lastDiplomacyTick: number;
  lastRaidTick: number;
  kept: number;
  broken: number;
  contact: {
    sinceTick: number;
    lastSeenTick: number;
    encounters: number;
    comprehension: number;
    origin: "encounter" | "inherited-record";
    report: {
      tick: number;
      name: string;
      x: number;
      y: number;
      population: number;
      stock: Partial<Stock>;
      confidence: number;
    };
  };
}
export type SuccessAxis =
  "wellbeing" | "resilience" | "knowledge" | "ecology" | "connection" | "reach";
export type SuccessVector = Record<SuccessAxis, number>;
export interface CivicProposal {
  id: string;
  source: "agent" | "inhabitants";
  agentName: string;
  action: AgentAction;
  submittedTick: number;
  dueTick: number;
  expiresTick: number;
  decidedTick: number | null;
  status: "pending" | "accepted" | "refused" | "expired" | "failed";
  ballots: { citizenId: string; support: boolean; reason: string }[];
  outcome: string;
  review: {
    dueTick: number;
    baseline: SuccessVector;
    result: SuccessVector | null;
    tick: number | null;
  } | null;
}
export interface Civics {
  sinceTick: number;
  institution: { quorum: number; consent: number; foodReserveDays: number };
  aspiration: { statement: string; weights: SuccessVector };
  proposals: CivicProposal[];
  lastSubmissionTick: number;
  accepted: number;
  refused: number;
  progress: {
    sinceTick: number;
    lastSampleTick: number;
    samples: number;
    ecologicalReference: number;
    baseline: SuccessVector | null;
    current: SuccessVector;
    delta: SuccessVector;
    peak: SuccessVector;
    achievements: { axis: SuccessAxis; threshold: number; tick: number }[];
  };
}
export interface Civilization {
  id: string;
  name: string;
  color: string;
  accent: string;
  motto: string;
  x: number;
  y: number;
  foundedTick: number;
  renewal?: { tick: number; arrivals: number; interventionId: string };
  focus: Focus;
  stock: Stock;
  policies: { sharing: number; effort: number; extraction: number };
  culture: { care: number; curiosity: number; ambition: number };
  traditions: string[];
  observations: Observation[];
  hypothesis: Design | null;
  relations: Record<string, Relation>;
  births: number;
  deaths: number;
  harvests: number;
  trades: number;
  claimed: boolean;
  lastAgentTick: number | null;
  lastIntent: string;
  lastBirthTick: number;
  lastBuildingTick: number;
  lastTradeTick: number;
  experiments: number;
  civics: Civics;
}
export interface Goods {
  material: Material;
  amount: number;
}
export type AccordTerm =
  | { kind: "peace"; days: number }
  | { kind: "passage"; from: "sender" | "recipient"; days: number }
  | {
      kind: "transfer";
      from: "sender" | "recipient";
      goods: Goods;
      days: number;
    };
export interface DiplomaticMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  stance: "friendship" | "neutrality" | "rivalry" | null;
  terms: AccordTerm[];
  replyTo: string | null;
  decision: "accept" | "decline" | null;
  sentTick: number;
  deliveredTick: number | null;
  expiresTick: number;
  status: "traveling" | "delivered" | "lost";
  answeredBy: string | null;
  comprehension: number;
}
export interface Accord {
  id: string;
  messageId: string;
  from: string;
  to: string;
  terms: AccordTerm[];
  ratifiedTick: number;
  expiresTick: number;
  status: "active" | "fulfilled" | "expired" | "breached";
  obligations: {
    from: string;
    to: string;
    goods: Goods;
    delivered: number;
    deadlineTick: number;
    inTransit: string | null;
  }[];
}
export interface Caravan {
  id: string;
  from: string;
  to: string;
  x: number;
  y: number;
  path: number[];
  offer: { material: Material; amount: number };
  receive: { material: Material; amount: number };
  departedTick: number;
  kind: "trade" | "message" | "raid" | "delivery";
  stage: "outbound" | "returning" | "legacy";
  partyIds: string[];
  provisions: number;
  request: Goods | null;
  messageId: string | null;
  accordId: string | null;
  result: string;
  returnContact: Relation["contact"] | null;
}
export interface WorldEvent {
  id: string;
  tick: number;
  category: EventCategory;
  title: string;
  detail: string;
  civId?: string;
  citizenId?: string;
  x?: number;
  y?: number;
  referenceId?: string;
  relatedId?: string;
  renewal?: { interventionId: string; arrivals: number };
  lifeState?: {
    nourishment: number;
    rest: number;
    hydration: number;
    temperature: number;
    oxygenFraction: number;
    sickness: number;
    metabolism?: {
      bodyKg: number;
      intakeKg: number;
      reserveKg: number;
      last: MetabolicFlux | null;
    };
  };
}
export interface HistoryPoint {
  tick: number;
  population: number;
  food: number;
  forest: number;
  happiness: number;
  civilizations: number;
  carbon: number;
  biodiversity: number;
}
/** Read-only facts from the permanent journal, separate from physical state. */
export interface CommunityRecord {
  communityId: string;
  throughTick: number;
  eventCount: number;
  recordedDeaths: number;
  lastDeath: WorldEvent | null;
  firstEvent: WorldEvent | null;
  lastEvent: WorldEvent | null;
  renewals?: { tick: number; arrivals: number; interventionId: string }[];
  connections: {
    communityId: string;
    relationship:
      "branched-from" | "branch" | "earlier-chapter" | "later-chapter";
    tick: number;
  }[];
}
export interface EnergyLedger {
  captured: number;
  released: number;
  initialChemical: number;
  compensation?: { captured: number; released: number };
}
export interface Chunk {
  id: string;
  x: number;
  y: number;
  start: number;
  createdTick: number;
  geology: PlateState;
}
export interface PlanetaryClimate {
  sinceTick: number;
  tick: number;
  bands: { referenceTemperature: number; heat: number; correction: number }[];
  surfaceExchange: number;
  exchangeCorrection: number;
  solarAbsorbed: number;
  radiated: number;
  solarCorrection: number;
  radiationCorrection: number;
}
export interface World {
  version: number;
  lawsVersion: string;
  generationVersion: GenerationVersion;
  id: string;
  name: string;
  seed: number;
  rng: number;
  tick: number;
  nextId: number;
  width: number;
  height: number;
  tiles: Tile[];
  civilizations: Civilization[];
  citizens: Citizen[];
  animals: Animal[];
  structures: Structure[];
  caravans: Caravan[];
  diplomacy: { messages: DiplomaticMessage[]; accords: Accord[] };
  events: WorldEvent[];
  pendingEvents: WorldEvent[];
  history: HistoryPoint[];
  weather: Weather;
  atmosphere: {
    carbon: number;
    water: number;
    oxygen: number;
    nitrogen: number;
    argon: number;
    dust: number;
  };
  atmosphereCompensation: Partial<Record<keyof World["atmosphere"], number>>;
  planetaryClimate: PlanetaryClimate;
  energy: EnergyLedger;
  entropy: EntropyRecord;
  initialMatter: Matter;
  initialTrees: number;
  births: number;
  deaths: number;
  ecology: {
    births: number;
    deaths: number;
    pollinations: number;
    dispersedSeeds: number;
    grazed: number;
    predation: number;
  };
  changedTiles: number[];
  chunks: Chunk[];
  frontierCursor: number;
  boundary: Matter & { chemical: number };
  initialElements: ElementMass;
  incomingElements: ElementMass;
  climate: {
    solarInput: number;
    thermalOutput: number;
    geothermalInput: number;
    evaporated: number;
    precipitated: number;
    dustLifted: number;
    dustDeposited: number;
    transpired: number;
  };
  evolution: {
    sinceTick: number;
    eroded: number;
    deposited: number;
    structuralLoss: number;
    repaired: number;
    salvaged: number;
  };
}
export type AgentAction =
  | { type: "focus"; focus: Focus; reason: string }
  | {
      type: "policy";
      policy: "sharing" | "effort" | "extraction";
      value: number;
      reason: string;
    }
  | { type: "assemble"; design: Design; reason: string }
  | { type: "experiment"; design: Design; reason: string }
  | { type: "repair"; structureId: string; reason: string }
  | {
      type: "aspiration";
      statement: string;
      weights: SuccessVector;
      reason: string;
    }
  | {
      type: "institution";
      quorum: number;
      consent: number;
      foodReserveDays: number;
      reason: string;
    }
  | {
      type: "communicate";
      target: string;
      text: string;
      terms: AccordTerm[];
      reason: string;
    }
  | {
      type: "respond";
      messageId: string;
      decision: "accept" | "decline";
      text: string;
      reason: string;
    }
  | {
      type: "expedition";
      target: string;
      people: number;
      material: Material;
      reason: string;
    }
  | {
      type: "trade";
      target: string;
      offer: { material: Material; amount: number };
      receive: { material: Material; amount: number };
      reason: string;
    }
  | {
      type: "diplomacy";
      target: string;
      stance: "friendship" | "neutrality" | "rivalry";
      reason: string;
    };
export interface AgentPublic {
  id: string;
  civId: string;
  name: string;
  provider: string;
  lastSeen: number | null;
  actions: number;
}
export interface SessionView {
  civilizationId: string | null;
}
export interface WorldSummary {
  tick: number;
  clock: WorldClock;
  entropy: EntropyRecord;
  day: number;
  year: number;
  hour: number;
  season: string;
  weather: Weather;
  population: number;
  births: number;
  deaths: number;
  happiness: number;
  forest: number;
  discoveries: number;
  biodiversity: number;
  sunlight: number;
  life: {
    plantLineages: number;
    animalLineages: number;
    animals: number;
    cohorts: number;
    pollinators: number;
    predators: number;
    births: number;
    deaths: number;
    pollinations: number;
    dispersedSeeds: number;
  };
  carbonError: number;
  mineralError: number;
  waterError: number;
  energyError: number;
  regions: number;
  elements: ElementMass;
  elementError: number;
  elementRelativeError: number;
  environment: {
    temperature: number;
    humidity: number;
    pressure: number;
    wind: number;
    cloud: number;
    rain: number;
    snow: number;
    daylight: number;
    latitude: number;
    oxygen: number;
    dust: number;
    tide: number;
    moonPhase: number;
  };
  geology: {
    plates: number;
    earthquakes: number;
    meanHeatFlux: number;
    maxUplift: number;
  };
}
/** Observer views are not writable simulation state. Internal cognition stays on the server. */
export interface ObserverCitizen extends Omit<Citizen, "mind"> {
  mind: Omit<Mind, "synapses" | "pending" | "activations" | "places"> & {
    places: Pick<PlaceMemory, "x" | "y">[];
  };
}
export interface ObserverTile extends Omit<Tile, "seedBank"> {
  seedBank: Pick<Propagule, "carbon" | "mineral" | "lineage" | "layer">[];
}
/** The planetary entrance never needs individual inhabitants or local terrain. */
export interface WorldOverview {
  id: string;
  name: string;
  seed: number;
  tick: number;
  lawsVersion: string;
  summary: WorldSummary;
  civilizations: (Pick<Civilization, "id" | "name" | "x" | "y"> & {
    population: number;
  })[];
}
export interface WorldFrame {
  tick: number;
  summary: WorldSummary;
  civilizations: Civilization[];
  citizens: ObserverCitizen[];
  animals: Animal[];
  structures: Structure[];
  caravans: Caravan[];
  diplomacy: World["diplomacy"];
  events: WorldEvent[];
  history: HistoryPoint[];
  agents: AgentPublic[];
  tileChanges: ObserverTile[];
}
export interface WorldSnapshot extends WorldFrame {
  id: string;
  name: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
  seed: number;
  lawsVersion: string;
  tiles: ObserverTile[];
}
