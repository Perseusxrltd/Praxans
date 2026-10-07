import { MATERIALS } from "./content";
import { evaluateDesign, returnMaterial } from "./laws";
import { between, clamp, pick, random } from "./random";
import type {
  Civilization,
  Component,
  Design,
  Material,
  PhysicalProperties,
  Stock,
  World,
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

export class RuleError extends Error {}
export const canAfford = (stock: Stock, cost: Stock) =>
  (Object.keys(cost) as Material[]).every((m) => stock[m] + 1e-8 >= cost[m]);
export const designScore = (p: PhysicalProperties) =>
  p.stable
    ? p.coveredArea * 8 + Math.min(p.height, 1.8) * 0.2 - p.mass * 0.008
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
    2;

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
  } else if (components.length < 10 && random(world) < 0.48) {
    const anchor = pick(world, components);
    const flat = random(world) < 0.7;
    const width = flat ? between(world, 1.3, 3.2) : between(world, 0.12, 0.4),
      depth = flat ? between(world, 1.3, 3.2) : between(world, 0.12, 0.4),
      height = flat ? between(world, 0.028, 0.07) : between(world, 0.6, 1.8);
    const z = anchor.z + anchor.height;
    if (z + height <= 6)
      components.push({
        material,
        width,
        depth,
        height,
        x: anchor.x + anchor.width / 2 - width / 2,
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
  return { name: `Assembly ${serial}`, components };
}
export function runExperiment(
  world: World,
  civ: Civilization,
  supplied?: Design,
): boolean {
  if (civ.stock.wood < 0.12 || civ.stock.fiber < 0.02) return false;
  // Small material samples are spent testing stiffness and attachment. Their matter returns to the soil.
  const home = getTile(world, civ.x, civ.y)!;
  civ.stock.wood -= 0.12;
  civ.stock.fiber -= 0.02;
  returnMaterial(world, home, "wood", 0.12);
  returnMaterial(world, home, "fiber", 0.02);
  civ.experiments++;
  const value = (properties: PhysicalProperties) =>
    practicalScore(properties, civ.stock);
  const best = [...civ.observations].sort(
    (a, b) => value(b.properties) - value(a.properties),
  )[0];
  const trials: { design: Design; properties: PhysicalProperties }[] = [];
  if (supplied)
    trials.push({ design: supplied, properties: evaluateDesign(supplied) });
  else
    for (let i = 0; i < 5; i++) {
      const parent =
        random(world) < 0.6 && civ.observations.length
          ? pick(world, civ.observations).design
          : (best?.design ?? null);
      const next = varyDesign(
        world,
        random(world) < 0.2 ? null : parent,
        civ.experiments,
      );
      trials.push({ design: next, properties: evaluateDesign(next) });
    }
  const known = (design: Design) =>
    civ.observations.find(
      (observation) =>
        hypothesisFamily(observation.design) === hypothesisFamily(design),
    );
  const novel = trials.filter(
    (trial) => trial.properties.stable && !known(trial.design),
  );
  const pool =
    !supplied && novel.length && random(world) < 0.65 ? novel : trials;
  const { design: candidate, properties } = pool.sort(
    (a, b) => value(b.properties) - value(a.properties),
  )[0];
  const previous = known(candidate);
  if (
    supplied ||
    !civ.observations.length ||
    (!previous && properties.stable) ||
    (previous && value(properties) > value(previous.properties) + 0.04)
  ) {
    const statement = properties.stable
      ? `${properties.coveredArea.toFixed(1)} m² of cover from ${properties.mass.toFixed(1)} kg of material`
      : "This geometry cannot carry its own weight";
    if (previous && !supplied)
      civ.observations.splice(civ.observations.indexOf(previous), 1);
    civ.observations.push({
      id: uid(world, "observation"),
      tick: world.tick,
      statement,
      evidence: `${properties.explanation.join(" ")} Estimated from material trials and the world’s static-load model.`,
      design: candidate,
      properties,
      trials: 1,
    });
    if (civ.observations.length > 18) {
      const useful = [...civ.observations]
        .sort((a, b) => value(b.properties) - value(a.properties))
        .slice(0, 12);
      const recent = civ.observations
        .filter((observation) => !useful.includes(observation))
        .slice(-6);
      const retained = new Set([...useful, ...recent]);
      civ.observations = civ.observations.filter((observation) =>
        retained.has(observation),
      );
    }
    recordEvent(world, {
      category: "discovery",
      title: `${civ.name} learns by trying`,
      detail: `${candidate.name}: ${statement}.`,
      civId: civ.id,
      x: civ.x,
      y: civ.y,
    });
  } else if (best) best.trials++;
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
  world.structures.push({
    id,
    civId: civ.id,
    x: site.x,
    y: site.y,
    design: structuredClone(design),
    properties,
    progress: 0,
    condition: 100,
    foundedTick: world.tick,
  });
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
export function dispatchTrade(
  world: World,
  civ: Civilization,
  targetId: string,
  offer: { material: Material; amount: number },
  receive: { material: Material; amount: number },
): string {
  const target = world.civilizations.find((c) => c.id === targetId);
  if (!target || target === civ)
    throw new RuleError("Choose another existing community.");
  if (offer.material === receive.material)
    throw new RuleError("An exchange must involve different materials.");
  for (const item of [offer, receive])
    if (
      !MATERIALS[item.material] ||
      !Number.isFinite(item.amount) ||
      item.amount < 1 ||
      item.amount > 80
    )
      throw new RuleError("Trade amounts must be between 1 and 80 kg.");
  if (
    civ.stock[offer.material] < offer.amount ||
    target.stock[receive.material] < receive.amount
  )
    throw new RuleError(
      "Both communities must already hold the materials they exchange.",
    );
  if (civ.relations[target.id]?.affinity < -20)
    throw new RuleError(
      "The other community does not currently trust this exchange.",
    );
  if (
    world.caravans.some(
      (c) =>
        (c.from === civ.id && c.to === target.id) ||
        (c.from === target.id && c.to === civ.id),
    )
  )
    throw new RuleError(
      "An exchange is already traveling between these communities.",
    );
  // Marginal scarcity sets local value. There is no universal currency or fixed resource price.
  const population = peopleOf(world, target.id).length;
  const need = (material: Material) =>
    material === "biomass"
      ? Math.max(population * 2, 10)
      : material === "wood"
        ? 60
        : 20;
  const utility = (material: Material, amount: number) =>
    need(material) * Math.log(1 + amount / Math.max(target.stock[material], 1));
  const loss =
    need(receive.material) *
    Math.log(
      Math.max(target.stock[receive.material], 1) /
        Math.max(target.stock[receive.material] - receive.amount, 0.5),
    );
  if (
    utility(offer.material, offer.amount) < loss * 0.85 ||
    (receive.material === "biomass" &&
      target.stock.biomass - receive.amount < population)
  )
    throw new RuleError(
      "The other community declines: the exchange would leave it worse off or short of food.",
    );
  if (distance(civ, target) > 640)
    throw new RuleError(
      "This community is beyond the current overland journey horizon of 640 tiles.",
    );
  let path = findPath(world, civ, target, Math.min(world.tiles.length, 12000));
  if (!path) {
    materializeCorridor(world, civ, target);
    path = findPath(world, civ, target, Math.min(world.tiles.length, 12000));
  }
  if (!path)
    throw new RuleError(
      "There is no traversable route between the communities.",
    );
  civ.stock[offer.material] -= offer.amount;
  target.stock[receive.material] -= receive.amount;
  const id = uid(world, "caravan");
  world.caravans.push({
    id,
    from: civ.id,
    to: target.id,
    x: civ.x,
    y: civ.y,
    path,
    offer: { ...offer },
    receive: { ...receive },
    departedTick: world.tick,
  });
  civ.lastTradeTick = world.tick;
  recordEvent(world, {
    category: "trade",
    title: `A path between ${civ.name} and ${target.name}`,
    detail: `${offer.amount.toFixed(1)} kg of ${offer.material} for ${receive.amount.toFixed(1)} kg of ${receive.material}. Both shares are reserved until the journey finishes.`,
    civId: civ.id,
    x: civ.x,
    y: civ.y,
  });
  return id;
}
