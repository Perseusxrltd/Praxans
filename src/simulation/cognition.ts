import { clamp } from "./random";
import { astronomy } from "./planet";
import { nearbyTiles } from "./terrain";
import { CLAY, availableMixture } from "./chemistry";
import type { Activity, Citizen, Mind, Observation, World } from "./types";

export const COGNITIVE_ACTIVITIES: Activity[] = [
  "gather",
  "extract",
  "assemble",
  "experiment",
  "tend",
  "deliver",
  "rest",
  "social",
  "repair",
  "salvage",
  "explore",
  "move",
];
export const MEMORY_LIMIT = 32;
const sigmoid = (value: number) => 1 / (1 + Math.exp(-clamp(value, -12, 12)));

export function createMind(
  person: Pick<Citizen, "age" | "traits" | "energy" | "experience">,
  tick: number,
): Mind {
  const synapses: Mind["synapses"] = {};
  for (const activity of COGNITIVE_ACTIVITIES) {
    const practiced = Math.min(0.4, (person.experience[activity] ?? 0) * 0.005);
    // Bias, hunger, sleep pressure, affiliation, curiosity, threat, injury, energy.
    synapses[activity] = [-0.6 + practiced, 0, -0.5, 0, 0, -0.2, -0.4, 0.5];
  }
  synapses.gather![1] = 1.7;
  synapses.deliver![1] = 0.9;
  synapses.rest = [-1.2, -0.1, 2.4, 0, -0.2, 0.4, 1.2, -0.8];
  synapses.social![3] = 1.8;
  synapses.experiment![4] = 1.3;
  synapses.explore![4] = 0.9;
  synapses.repair![5] = 0.7;
  return {
    sinceTick: tick,
    sleepPressure: clamp((100 - person.energy) / 100, 0, 1),
    stress: 0,
    attention: 0.9,
    socialNeed: 0.2,
    sleeping: false,
    reward: 0,
    predictionError: 0,
    activations: {},
    synapses,
    pending: null,
    places: [],
    knowledge: [],
    learned: 0,
    taught: 0,
    forgotten: 0,
    lastLessonTick: tick,
    adviceTrust: 0.4,
  };
}

function signals(person: Citizen): number[] {
  const mind = person.mind;
  return [
    1,
    1 - person.hunger / 100,
    mind.sleepPressure,
    mind.socialNeed,
    person.traits.curiosity,
    mind.stress,
    1 - person.health / 100,
    person.energy / 100,
  ];
}

export function updateMind(world: World, person: Citizen, dt = 0.25): void {
  const mind = person.mind;
  const night = astronomy(world.tick, person.x, person.y).solarAltitude < -6;
  mind.sleeping =
    person.task?.kind === "rest" &&
    !person.task.path.length &&
    (night || mind.sleepPressure > 0.35);
  mind.sleepPressure = clamp(
    mind.sleepPressure + dt * (mind.sleeping ? -0.085 : 0.032),
    0,
    1,
  );
  const threat = clamp(
    (40 - person.hunger) / 50 +
      (75 - person.health) / 100 +
      person.sick / 200 +
      Math.max(0, 2 - person.hydration) * 0.15,
    0,
    1,
  );
  mind.stress = clamp(
    mind.stress + (threat - mind.stress) * Math.min(1, dt * 0.2),
    0,
    1,
  );
  mind.socialNeed = clamp(
    mind.socialNeed +
      dt *
        (person.task?.kind === "social" && !person.task.path.length
          ? -0.16
          : 0.018),
    0,
    1,
  );
  mind.attention = clamp(
    (0.45 + person.energy / 180) *
      (1 - mind.sleepPressure * 0.55) *
      (1 - mind.stress * 0.4) *
      (0.65 + person.health / 285),
    0.08,
    1,
  );
  const input = signals(person);
  for (const activity of COGNITIVE_ACTIVITIES) {
    const weights = mind.synapses[activity]!;
    const activation = sigmoid(
      weights.reduce((sum, weight, i) => sum + weight * input[i], 0),
    );
    mind.activations[activity] =
      (mind.activations[activity] ?? activation) * 0.2 + activation * 0.8;
  }
  for (const trace of mind.knowledge) {
    if (mind.sleeping)
      trace.consolidation += (1 - trace.consolidation) * dt * 0.045;
    trace.retention *= Math.exp(-dt / (600 + trace.consolidation * 3000));
  }
  const retained = mind.knowledge.filter((trace) => trace.retention >= 0.12);
  mind.forgotten += mind.knowledge.length - retained.length;
  mind.knowledge = retained;
  if (!mind.sleeping && world.tick % 4 === 0)
    perceive(world, person, night ? 1 : 2.6);
}

export function perceive(world: World, person: Citizen, radius: number): void {
  const places = person.mind.places;
  for (const tile of nearbyTiles(world, person, radius)) {
    if (Math.hypot(tile.x - person.x, tile.y - person.y) > radius) continue;
    const plants = [tile.plant, tile.groundcover];
    const memory = {
      x: tile.x,
      y: tile.y,
      tick: world.tick,
      food: tile.forage,
      water: tile.water,
      frozenWater: tile.ice + tile.air.snow,
      wood: plants.reduce(
        (sum, p) => sum + (p ? p.carbon * p.genome.woodiness : 0),
        0,
      ),
      fiber: plants.reduce(
        (sum, p) => sum + (p ? p.carbon * (1 - p.genome.woodiness) : 0),
        0,
      ),
      stone: tile.rock,
      clay: availableMixture(tile, CLAY),
    };
    const old = places.findIndex(
      (entry) => entry.x === tile.x && entry.y === tile.y,
    );
    if (old >= 0) places.splice(old, 1);
    places.push(memory);
  }
  if (places.length > 48) places.splice(0, places.length - 48);
}

/** Output activations bias choices; urgent bodily needs and physical feasibility still constrain actions. */
export function disposition(person: Citizen, activity: Activity): number {
  return 0.55 + (person.mind.activations[activity] ?? 0.5);
}

export function beginExperience(
  person: Citizen,
  activity: Activity,
  tick: number,
): void {
  person.mind.pending = {
    activity,
    inputs: signals(person),
    prediction: person.mind.activations[activity] ?? 0.5,
    tick,
  };
}

/** Bounded prediction-error plasticity: an action's actual outcome changes its future preference. */
export function reinforce(person: Citizen, reward: number, tick: number): void {
  const mind = person.mind,
    pending = mind.pending;
  if (!pending) return;
  const utility = clamp(
    reward - Math.min(0.2, (tick - pending.tick) / 800),
    -1,
    1,
  );
  const expected = pending.prediction * 2 - 1;
  mind.reward = utility;
  mind.predictionError = utility - expected;
  const weights = mind.synapses[pending.activity]!;
  const plasticity =
    (person.age < 25 ? 0.08 : 0.045) * mind.attention * (1 - mind.stress * 0.5);
  for (let i = 0; i < weights.length; i++)
    weights[i] = clamp(
      weights[i] + plasticity * mind.predictionError * pending.inputs[i],
      -4,
      4,
    );
  mind.pending = null;
}

export function learnObservation(
  world: World,
  person: Citizen,
  observation: Observation,
  source: "experience" | "teaching" | "inherited-record" = "experience",
  sourceId: string | null = null,
): void {
  const old = person.mind.knowledge.find(
    (trace) => trace.id === observation.id,
  );
  if (old) {
    old.retention = 1;
    old.lastRecalledTick = world.tick;
    old.consolidation = Math.min(1, old.consolidation + 0.08);
    return;
  }
  person.mind.knowledge.push({
    id: observation.id,
    learnedTick: world.tick,
    lastRecalledTick: world.tick,
    sourceId,
    source,
    retention: 1,
    consolidation: source === "inherited-record" ? 0.6 : 0.1,
  });
  person.mind.learned++;
  if (person.mind.knowledge.length > MEMORY_LIMIT) {
    person.mind.knowledge.sort(
      (a, b) =>
        a.retention * (0.5 + a.consolidation) -
        b.retention * (0.5 + b.consolidation),
    );
    person.mind.knowledge.shift();
    person.mind.forgotten++;
  }
  if (source !== "inherited-record") {
    person.memories.push({
      tick: world.tick,
      feeling: "warm",
      text:
        source === "teaching"
          ? `Learned an account of ${observation.design.name} from someone nearby.`
          : `Tested ${observation.design.name}: ${observation.statement}.`,
    });
    if (person.memories.length > 6) person.memories.shift();
  }
}

export function knows(person: Citizen, observationId: string): boolean {
  return person.mind.knowledge.some(
    (trace) => trace.id === observationId && trace.retention > 0.18,
  );
}

export function teachNearby(world: World, teacher: Citizen): boolean {
  if (
    world.tick - teacher.mind.lastLessonTick < 8 ||
    teacher.mind.attention < 0.2
  )
    return false;
  const civ = world.civilizations.find((c) => c.id === teacher.civId)!;
  const listener = world.citizens.find(
    (p) =>
      p !== teacher &&
      p.civId === teacher.civId &&
      !p.mind.sleeping &&
      p.mind.attention >= 0.2 &&
      Math.hypot(p.x - teacher.x, p.y - teacher.y) < 1.5 &&
      civ.observations.some((o) => knows(teacher, o.id) && !knows(p, o.id)),
  );
  if (!listener) return false;
  const value = (o: Observation) =>
    o.properties.coveredArea * 8 +
    o.properties.storageVolume * 6 +
    o.properties.workSurface * 2 +
    o.research.confidence;
  const idea = civ.observations
    .filter((o) => knows(teacher, o.id) && !knows(listener, o.id))
    .sort((a, b) => value(b) - value(a))[0];
  learnObservation(world, listener, idea, "teaching", teacher.id);
  teacher.mind.taught++;
  teacher.mind.lastLessonTick = world.tick;
  const trace = teacher.mind.knowledge.find((k) => k.id === idea.id)!;
  trace.retention = 1;
  trace.lastRecalledTick = world.tick;
  return true;
}
