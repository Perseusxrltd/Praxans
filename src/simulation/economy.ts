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
  Observation,
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

/** Repeated evidence supports the same result and method, not just the same shape. */
export function matchingObservation(
  civ: Civilization,
  design: Design,
  properties: PhysicalProperties,
  method: Observation["research"]["method"],
): Observation | undefined {
  const geometry = JSON.stringify(design.components),
    result = JSON.stringify(properties);
  return civ.observations.find(
    (observation) =>
      observation.research.method === method &&
      JSON.stringify(observation.design.components) === geometry &&
      JSON.stringify(observation.properties) === result,
  );
}

/** Propose material arrangements through general component operations, not building forms. */
export function varyDesign(
  world: World,
  parent: Design | null,
  serial: number,
  stock?: Stock,
): Design {
  const components = parent ? structuredClone(parent.components) : [];
  const materials = (Object.keys(MATERIALS) as Material[]).filter(
    (material) => !stock || stock[material] > 0.01,
  );
  const material = pick(
    world,
    materials.length ? materials : (Object.keys(MATERIALS) as Material[]),
  );
  const dimension = () =>
    Math.exp(between(world, Math.log(0.025), Math.log(3)));
  const part: Component = {
    material,
    x: 0,
    y: 0,
    z: 0,
    width: dimension(),
    depth: dimension(),
    height: dimension(),
  };
  if (!components.length) components.push(part);
  else if (components.length < 32 && random(world) < 0.48) {
    const anchor = pick(world, components);
    const positions = ["x", "y", "z"] as const,
      sizes = ["width", "depth", "height"] as const;
    for (let axis = 0; axis < 3; axis++)
      part[positions[axis]] =
        anchor[positions[axis]] +
        (anchor[sizes[axis]] - part[sizes[axis]]) * random(world);
    const axis = Math.floor(random(world) * 3),
      positive = random(world) < 0.5;
    part[positions[axis]] = positive
      ? anchor[positions[axis]] + anchor[sizes[axis]]
      : anchor[positions[axis]] - part[sizes[axis]];
    if (part.z < 0 && axis !== 2) part.z = 0;
    components.push(part);
  } else {
    const index = Math.floor(random(world) * components.length),
      selected = components[index];
    const operation = random(world);
    if (components.length > 1 && operation < 0.15) components.splice(index, 1);
    else if (operation < 0.35) selected.material = material;
    else if (operation < 0.5) {
      const sizes = ["width", "depth", "height"] as const;
      const a = Math.floor(random(world) * 3),
        b = (a + 1 + Math.floor(random(world) * 2)) % 3;
      [selected[sizes[a]], selected[sizes[b]]] = [
        selected[sizes[b]],
        selected[sizes[a]],
      ];
    } else if (operation < 0.7) {
      const position = pick(world, ["x", "y", "z"] as const);
      selected[position] += between(world, -0.3, 0.3);
    } else {
      const key = pick(world, ["width", "depth", "height"] as const),
        previous = selected[key];
      selected[key] = clamp(previous * between(world, 0.7, 1.4), 0.025, 6);
      if (key === "height")
        for (const other of components)
          if (
            other !== selected &&
            Math.abs(other.z - selected.z - previous) < 0.008
          )
            other.z += selected.height - previous;
    }
  }
  const candidate = { name: `Assembly ${serial}`, components };
  if (
    components.some(
      (p) =>
        Math.abs(p.x) > 5 || Math.abs(p.y) > 5 || p.z < 0 || p.z + p.height > 8,
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
    varyDesign(
      world,
      random(world) < 0.2 ? null : parent,
      civ.experiments + 1,
      civ.stock,
    );
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
  const previous = matchingObservation(
    civ,
    candidate,
    properties,
    "material-trial",
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
