import { MATERIALS } from "./content";
import { emptyStock, evaluateDesign, returnMaterial } from "./laws";
import { knows, learnObservation } from "./cognition";
import { initialFabric } from "./weathering";
import { between, clamp, pick, random } from "./random";
import type {
  Civilization,
  Citizen,
  Component,
  Design,
  Material,
  PhysicalProperties,
  Stock,
  World,
  Structure,
} from "./types";
import {
  distance,
  findPath,
  getTile,
  peopleOf,
  recordEvent,
  tileIndex,
  touchTile,
  uid,
} from "./world";
import { materializeCorridor, nearbyTiles } from "./terrain";

export class RuleError extends Error {
  override name = "RuleError";
}
export const canAfford = (stock: Stock, cost: Stock) =>
  (Object.keys(cost) as Material[]).every((m) => stock[m] + 1e-8 >= cost[m]);
export const designScore = (p: PhysicalProperties) =>
  p.stable
    ? p.coveredArea * 8 +
      p.storageVolume * 6 +
      p.workSurface * 2 +
      Math.min(p.height, 1.8) * 0.2 -
      p.mass * 0.008
    : -10 - p.mass * 0.008;

// Keep different material/orientation hypotheses alive. A light object may be
// useful on its own but too weak to carry the next addition; a single winning
// design cannot represent everything a community has learned.
const hypothesisFamily = (design: Design) =>
  design.components
    .map((part) => {
      const dimensions = [part.width, part.depth, part.height];
      return `${part.material}:${dimensions.indexOf(Math.max(...dimensions))}`;
    })
    .sort()
    .join("/");

const practicalScore = (properties: PhysicalProperties, stock: Stock) =>
  designScore(properties) -
  (Object.keys(stock) as Material[]).reduce(
    (shortage, material) =>
      shortage + Math.max(0, properties.cost[material] - stock[material]),
    0,
  ) *
    0.04;

/** Search a space of cuboids and contact surfaces; there are no named building templates. */
export function varyDesign(
  world: World,
  parent: Design | null,
  serial: number,
): Design {
  const components = parent ? structuredClone(parent.components) : [];
  const material = pick(world, [
    "wood",
    "wood",
    "fiber",
    "stone",
    "clay",
  ] as const);
  if (!components.length) {
    const dimensions = [
      between(world, 0.1, 0.3),
      between(world, 0.1, 0.3),
      between(world, 1.7, 2.4),
    ];
    const axis = Math.floor(random(world) * 3),
      rotated = [
        dimensions[axis],
        dimensions[(axis + 1) % 3],
        dimensions[(axis + 2) % 3],
      ];
    components.push({
      material,
      x: 0,
      y: 0,
      z: 0,
      width: rotated[0],
      depth: rotated[1],
      height: rotated[2],
    });
  } else if (components.length < 32 && random(world) < 0.48) {
    const anchor = pick(world, components);
    const flat = random(world) < 0.7;
    const width = flat ? between(world, 1.3, 3.2) : between(world, 0.12, 0.4),
      depth = flat ? between(world, 1.3, 3.2) : between(world, 0.12, 0.4),
      height = flat ? between(world, 0.028, 0.07) : between(world, 0.6, 1.8);
    const beside = random(world) < 0.3;
    const z = beside ? 0 : anchor.z + anchor.height;
    if (z + height <= 6)
      components.push({
        material,
        width,
        depth,
        height,
        x: beside
          ? anchor.x + anchor.width
          : anchor.x + anchor.width / 2 - width / 2,
        y: anchor.y + anchor.depth / 2 - depth / 2,
        z,
      });
  } else {
    const index = Math.floor(random(world) * components.length),
      part = components[index];
    if (components.length > 1 && random(world) < 0.15)
      components.splice(index, 1);
    else if (random(world) < 0.35) part.material = material;
    else {
      const key = pick(world, ["width", "depth", "height"] as const),
        previous = part[key];
      part[key] = clamp(part[key] * between(world, 0.8, 1.2), 0.025, 4);
      if (key === "height")
        for (const other of components)
          if (other !== part && Math.abs(other.z - part.z - previous) < 0.008)
            other.z += part.height - previous;
      if (part.z + part.height > 8) part.height = previous;
    }
  }
  const candidate = { name: `Assembly ${serial}`, components };
  if (
    components.some(
      (p) => Math.abs(p.x) > 5 || Math.abs(p.y) > 5 || p.z + p.height > 8,
    )
  )
    return parent
      ? { ...structuredClone(parent), name: candidate.name }
      : candidate;
  return candidate;
}
export function runExperiment(
  world: World,
  civ: Civilization,
  supplied?: Design,
  investigator?: Citizen,
): boolean {
  const actor =
    investigator ??
    peopleOf(world, civ.id).find((p) => p.age >= 12 && !p.mind.sleeping);
  if (!actor || actor.mind.attention < 0.12) return false;
  const value = (properties: PhysicalProperties) =>
    practicalScore(properties, civ.stock);
  const recollections = civ.observations.filter((o) => knows(actor, o.id));
  const best = [...recollections].sort(
    (a, b) => value(b.properties) - value(a.properties),
  )[0];
  const parent =
    recollections.length && random(world) < 0.5
      ? pick(world, recollections).design
      : (best?.design ?? null);
  if (parent) {
    const recollection = recollections.find((o) => o.design === parent);
    const trace = actor.mind.knowledge.find((k) => k.id === recollection?.id);
    if (trace) {
      trace.retention = 1;
      trace.lastRecalledTick = world.tick;
    }
  }
  const candidate =
    supplied ??
    varyDesign(world, random(world) < 0.2 ? null : parent, civ.experiments + 1);
  const properties = evaluateDesign(candidate);
  const samples = emptyStock();
  for (const material of Object.keys(samples) as Material[]) {
    samples[material] =
      properties.cost[material] > 0
        ? Math.min(0.4, Math.max(0.01, properties.cost[material] * 0.004))
        : 0;
    if (civ.stock[material] < samples[material]) return false;
  }
  const site = getTile(world, actor.x, actor.y)!;
  for (const material of Object.keys(samples) as Material[]) {
    civ.stock[material] -= samples[material];
    returnMaterial(world, site, material, samples[material]);
  }
  civ.experiments++;
  const related = recollections.find(
    (o) => hypothesisFamily(o.design) === hypothesisFamily(candidate),
  );
  const prediction = {
    stable: related?.properties.stable ?? true,
    coveredArea: related?.properties.coveredArea ?? 0,
    storageVolume: related?.properties.storageVolume ?? 0,
  };
  const surprise =
    (prediction.stable === properties.stable ? 0 : 1) +
    Math.abs(prediction.coveredArea - properties.coveredArea) /
      (1 + properties.coveredArea) +
    Math.abs(prediction.storageVolume - properties.storageVolume) /
      (1 + properties.storageVolume);
  const previous = civ.observations.find(
    (o) =>
      JSON.stringify(o.design.components) ===
      JSON.stringify(candidate.components),
  );
  if (!previous) {
    const statement = properties.stable
      ? `${properties.coveredArea.toFixed(1)} m² of cover, ${properties.workSurface.toFixed(1)} m² of working surface, and ${properties.storageVolume.toFixed(2)} m³ of enclosed space`
      : "This geometry cannot carry its own weight";
    const observation = {
      id: uid(world, "observation"),
      tick: world.tick,
      statement,
      evidence: `${actor.name} handled samples of the actual materials. ${properties.explanation.join(" ")} These are idealized static estimates; construction and exposure provide further evidence.`,
      design: candidate,
      properties,
      trials: 1,
      research: {
        authorId: actor.id,
        method: "material-trial" as const,
        prediction,
        surprise,
        confidence: 0.2 + actor.mind.attention * 0.45,
        samples,
      },
    };
    civ.observations.push(observation);
    learnObservation(world, actor, observation);
    if (civ.observations.length > 64) {
      const removable = civ.observations
        .filter((o) => o !== observation)
        .sort((a, b) => value(a.properties) - value(b.properties))[0];
      civ.observations = civ.observations.filter((o) => o !== removable);
      for (const person of peopleOf(world, civ.id)) {
        const old = person.mind.knowledge.length;
        person.mind.knowledge = person.mind.knowledge.filter(
          (trace) => trace.id !== removable.id,
        );
        person.mind.forgotten += old - person.mind.knowledge.length;
      }
    }
    recordEvent(world, {
      category: "discovery",
      title: `${actor.name.split(" ")[0]} tests an idea`,
      detail: `${candidate.name}: ${statement}. ${surprise > 0.5 ? "The result challenged an expectation." : "The result adds evidence to a working idea."}`,
      civId: civ.id,
      citizenId: actor.id,
      x: actor.x,
      y: actor.y,
    });
  } else {
    previous.trials++;
    previous.research.confidence = Math.min(
      0.9,
      previous.research.confidence + actor.mind.attention * 0.08,
    );
    previous.research.surprise = surprise;
    learnObservation(world, actor, previous);
  }
  return true;
}
export function requestAssembly(
  world: World,
  civ: Civilization,
  design: Design,
): string {
  const properties = evaluateDesign(design);
  if (properties.mass > 1600)
    throw new RuleError("An assembly is limited to 1,600 kg in this world.");
  if (
    world.structures.filter((s) => s.civId === civ.id && s.progress < 1)
      .length >= 2
  )
    throw new RuleError(
      "This community already has two unfinished assemblies.",
    );
  if (!canAfford(civ.stock, properties.cost))
    throw new RuleError(
      "The community does not have the matter required for this geometry. Inspect the design cost and gather or trade first.",
    );
  const sites = nearbyTiles(world, civ, 6).filter(
    (t) =>
      distance(t, civ) > 1.5 &&
      distance(t, civ) < 6 &&
      t.terrain !== "water" &&
      t.terrain !== "shore" &&
      (!t.owner || t.owner === civ.id) &&
      !world.structures.some((s) => distance(s, t) < 1.8),
  );
  sites.sort((a, b) => distance(a, civ) - distance(b, civ) + a.trees - b.trees);
  const site = sites.find((t) => findPath(world, civ, t, 400));
  if (!site)
    throw new RuleError(
      "There is no reachable, unoccupied construction site nearby.",
    );
  for (const material of Object.keys(properties.cost) as Material[])
    civ.stock[material] = Math.max(
      0,
      civ.stock[material] - properties.cost[material],
    );
  if (site.plant) {
    site.detritus.carbon += site.plant.carbon;
    site.detritus.mineral += site.plant.mineral;
    site.plant = null;
  }
  const id = uid(world, "structure");
  const structure: Structure = {
    id,
    civId: civ.id,
    x: site.x,
    y: site.y,
    design: structuredClone(design),
    properties,
    progress: 0,
    condition: 100,
    foundedTick: world.tick,
    collapsed: false,
    maintenance: false,
    fabric: {
      parts: [],
      exposureHours: 0,
      previousTemperature: site.temperature,
      lostMass: 0,
      repairedMass: 0,
    },
  };
  structure.fabric = initialFabric(structure, site.temperature);
  world.structures.push(structure);
  site.owner = civ.id;
  touchTile(world, tileIndex(world, site.x, site.y));
  civ.lastBuildingTick = world.tick;
  recordEvent(world, {
    category: "building",
    title: `A new idea takes shape in ${civ.name}`,
    detail: `${design.name} reserves ${properties.mass.toFixed(1)} kg of actual materials. People must now carry out the work.`,
    civId: civ.id,
    x: site.x,
    y: site.y,
  });
  return id;
}
export function updateRelations(
  a: Civilization,
  b: Civilization,
  amount: number,
): void {
  for (const [from, to] of [
    [a, b],
    [b, a],
  ])
    if (from.relations[to.id])
      from.relations[to.id].affinity = clamp(
        from.relations[to.id].affinity + amount,
        -100,
        100,
      );
}
export { sendTrade as dispatchTrade } from "./diplomacy";
