import type { WorldClock } from "./chronology";
import type { EntropyRecord } from "./thermodynamics";
export const WORLD_VERSION = 7;
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
  mineral: number;
  rock: number;
  detritus: { carbon: number; mineral: number };
  plant: Plant | null;
  groundcover: Plant | null;
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
  | "move";
export interface Task {
  kind: Activity;
  tile: number;
  path: number[];
  progress: number;
  material?: Material;
  structureId?: string;
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
  body: number;
  hydration: number;
  traits: Traits;
  skill: number;
  specialty: Activity;
  cargo: { material: Material; amount: number } | null;
  task: Task | null;
  memories: Memory[];
  lastBirthTick: number;
  clothing: number;
  experience: Partial<Record<Activity, number>>;
  pregnancy: {
    partner: Pick<Citizen, "id" | "name" | "generation" | "traits">;
    dueTick: number;
  } | null;
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
}
export interface Observation {
  id: string;
  tick: number;
  statement: string;
  evidence: string;
  design: Design;
  properties: PhysicalProperties;
  trials: number;
}
export interface Relation {
  affinity: number;
  tradeCount: number;
  lastDiplomacyTick: number;
  lastRaidTick: number;
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
export interface EnergyLedger {
  captured: number;
  released: number;
  initialChemical: number;
}
export interface Chunk {
  id: string;
  x: number;
  y: number;
  start: number;
  createdTick: number;
  geology: PlateState;
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
export interface WorldFrame {
  tick: number;
  summary: WorldSummary;
  civilizations: Civilization[];
  citizens: Citizen[];
  animals: Animal[];
  structures: Structure[];
  caravans: Caravan[];
  events: WorldEvent[];
  history: HistoryPoint[];
  agents: AgentPublic[];
  tileChanges: Tile[];
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
  tiles: Tile[];
}
