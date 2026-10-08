import { clamp } from "./random";
import { edibleReserves } from "./subsistence";
import { nearbyTiles } from "./terrain";
import { housing, peopleOf, recordEvent } from "./world";
import type {
  Civilization,
  Civics,
  SuccessAxis,
  SuccessVector,
  World,
} from "./types";

export const SUCCESS_AXES: SuccessAxis[] = [
  "wellbeing",
  "resilience",
  "knowledge",
  "ecology",
  "connection",
  "reach",
];
export const vector = (value = 0): SuccessVector =>
  Object.fromEntries(
    SUCCESS_AXES.map((axis) => [axis, value]),
  ) as SuccessVector;
export const difference = (a: SuccessVector, b: SuccessVector): SuccessVector =>
  Object.fromEntries(
    SUCCESS_AXES.map((axis) => [axis, a[axis] - b[axis]]),
  ) as SuccessVector;

export function createCivics(tick: number): Civics {
  return {
    sinceTick: tick,
    institution: { quorum: 0.5, consent: 0.6, foodReserveDays: 1 },
    aspiration: {
      statement: "Build a continuing life in which our people can flourish.",
      weights: vector(1),
    },
    proposals: [],
    lastSubmissionTick: tick - 16,
    accepted: 0,
    refused: 0,
    progress: {
      sinceTick: tick,
      lastSampleTick: tick,
      samples: 0,
      ecologicalReference: 0,
      baseline: null,
      current: vector(),
      delta: vector(),
      peak: vector(),
      achievements: [],
    },
  };
}

const localLife = (world: World, civ: Civilization) =>
  nearbyTiles(world, civ, 7).reduce(
    (sum, tile) =>
      sum + (tile.plant?.carbon ?? 0) + (tile.groundcover?.carbon ?? 0),
    0,
  );

/** An inspectable set of bounded potentials, not a currency or a compulsory scalar winner. */
export function measureSuccess(world: World, civ: Civilization): SuccessVector {
  const people = peopleOf(world, civ.id),
    population = people.length;
  if (!population) return vector();
  const welfare = people.map(
    (p) => (p.health + p.hunger + p.energy + p.happiness) / 4,
  );
  const mean = welfare.reduce((s, n) => s + n, 0) / population;
  const storesPerPerson = edibleReserves(world, civ) / population;
  // Distinct tested functional hypotheses, with greater weight for construction and living transmission.
  // Labels, duplicate geometries and the number of requests do not count as evidence.
  const evidence = new Map<string, number>();
  for (const observation of civ.observations) {
    const holders = people
      .map((p) => p.mind.knowledge.find((k) => k.id === observation.id))
      .filter((k) => k && k.retention > 0.18);
    if (!holders.length) continue;
    const p = observation.properties;
    const family = [
      ...new Set(
        observation.design.components.map((part) => {
          const dimensions = [part.width, part.depth, part.height];
          return `${part.material}:${dimensions.indexOf(Math.max(...dimensions))}`;
        }),
      ),
    ]
      .sort()
      .join("/");
    const key = `${family}:${p.stable}:${Math.min(4, Math.floor(p.coveredArea))}:${Math.min(3, Math.floor(p.workSurface))}:${Math.min(3, Math.floor(p.storageVolume * 4))}`;
    const value =
      observation.research.confidence *
      Math.max(...holders.map((k) => k!.retention)) *
      (observation.research.method === "construction" ? 1 : 0.25) *
      Math.min(1, holders.length / 2);
    evidence.set(key, Math.max(evidence.get(key) ?? 0, value));
  }
  const knowledge = [...evidence.values()].reduce((sum, n) => sum + n, 0);
  const connections = Object.values(civ.relations).reduce((sum, relation) => {
    const freshness = Math.exp(
      -(world.tick - relation.contact.lastSeenTick) / (96 * 90),
    );
    return (
      sum +
      freshness *
        Math.max(0, relation.affinity / 100) *
        (1 - Math.exp(-(relation.tradeCount + relation.kept) / 3))
    );
  }, 0);
  const reference =
    civ.civics.progress.ecologicalReference || localLife(world, civ) || 1;
  const standing = world.structures.filter(
    (s) => s.civId === civ.id && !s.collapsed && s.progress >= 1,
  );
  return {
    wellbeing: clamp(mean * 0.7 + Math.min(...welfare) * 0.3, 0, 100),
    resilience: clamp(
      65 * (1 - Math.exp(-storesPerPerson / 5)) +
        35 * Math.min(1, housing(world, civ.id) / population),
      0,
      100,
    ),
    knowledge: 100 * (1 - Math.exp(-knowledge / 8)),
    ecology: clamp((50 * localLife(world, civ)) / reference, 0, 100),
    connection: 100 * (1 - Math.exp(-connections / 3)),
    reach: clamp(
      50 * (1 - Math.exp(-population / 30)) +
        50 *
          (1 -
            Math.exp(
              -standing.reduce((s, x) => s + x.properties.mass, 0) / 2000,
            )),
      0,
      100,
    ),
  };
}

export function sampleProgress(world: World, civ: Civilization): void {
  const progress = civ.civics.progress;
  if (progress.baseline && world.tick - progress.lastSampleTick < 96) return;
  if (!progress.baseline) progress.ecologicalReference = localLife(world, civ);
  const current = measureSuccess(world, civ);
  if (!progress.baseline) {
    progress.baseline = { ...current };
    progress.peak = { ...current };
    progress.delta = vector();
  } else {
    progress.delta = difference(current, progress.current);
    for (const axis of SUCCESS_AXES) {
      for (let threshold = 20; threshold <= 100; threshold += 20) {
        if (
          progress.peak[axis] < threshold &&
          current[axis] >= threshold &&
          !progress.achievements.some(
            (a) => a.axis === axis && a.threshold === threshold,
          )
        ) {
          progress.achievements.push({ axis, threshold, tick: world.tick });
          recordEvent(world, {
            category: "culture",
            title: `${civ.name}: a new ${axis} milestone`,
            detail: `The measured ${axis} potential first crossed ${threshold}/100 since the measurement epoch. This records an outcome and grants no material or authority.`,
            civId: civ.id,
          });
        }
      }
      progress.peak[axis] = Math.max(progress.peak[axis], current[axis]);
    }
  }
  progress.current = current;
  progress.lastSampleTick = world.tick;
  progress.samples++;
}

export function progressReport(world: World, civ: Civilization) {
  const progress = civ.civics.progress;
  const measured = progress.baseline
    ? progress.current
    : measureSuccess(world, civ);
  const weights = civ.civics.aspiration.weights;
  const weight = SUCCESS_AXES.reduce((s, axis) => s + weights[axis], 0);
  return {
    ...progress,
    current: measured,
    sinceBaseline: difference(measured, progress.baseline ?? measured),
    aspiration: civ.civics.aspiration,
    interpretedSuccess:
      SUCCESS_AXES.reduce((s, axis) => s + measured[axis] * weights[axis], 0) /
      Math.max(weight, 1),
    ageDays: (world.tick - civ.foundedTick) / 96,
    note: "Daily signed outcome feedback, not causal attribution or spendable points. Reading this report grants no reward. Weights express this community's interpretation, not a universal ranking.",
  };
}
