import { FAUNA_BY_ID } from "./life";
import { initialPlanetaryClimate } from "./climate";
import { NAMES, PALETTES, SEASONS, SURNAMES } from "./content";
import { LAWS, emptyStock, ledger, refreshTile, solarAt } from "./laws";
import { between, clamp, hash, noise, pick, random } from "./random";
import {
  CHUNK_SIZE,
  DAYS_PER_YEAR,
  HOURS_PER_TICK,
  WORLD_VERSION,
  type Citizen,
  type GenerationVersion,
  type Civilization,
  type Terrain,
  type World,
  type WorldEvent,
  type WorldSummary,
} from "./types";
import { elementLedger, elementalErrors, oxygenFraction } from "./chemistry";
import { astronomy, cloudCover } from "./planet";
import { localWeather } from "./weather";
import { recordEvent } from "./events";
import { FOUNDING } from "./founding";
import { emptyEntropy } from "./thermodynamics";
import { worldClock } from "./chronology";
import { createMind } from "./cognition";
import { createCivics, sampleProgress } from "./progress";
export { recordEvent } from "./events";

import {
  getTile,
  tileIndex,
  nearbyTiles,
  materializeArea,
  materializeChunk,
  spiralSite,
} from "./terrain";
export { getTile, tileIndex } from "./terrain";

export const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y);
export const uid = (world: World, prefix: string) =>
  `${prefix}-${world.nextId++}`;
export const hours = (world: World) => world.tick * HOURS_PER_TICK;
export const seasonIndex = (world: World) =>
  Math.floor(hours(world) / ((24 * DAYS_PER_YEAR) / 4)) % 4;
export const peopleOf = (world: World, civId: string) =>
  world.citizens.filter((person) => person.civId === civId);
export const housing = (world: World, civId: string) =>
  world.structures
    .filter((s) => s.civId === civId && !s.collapsed && s.progress >= 1)
    .reduce((sum, s) => sum + (s.properties.capacity * s.condition) / 100, 0);
export function touchTile(world: World, index: number) {
  world.changedTiles.push(index);
}
export function remember(
  world: World,
  person: Citizen,
  text: string,
  feeling: "warm" | "neutral" | "sad" = "warm",
): void {
  person.memories.push({ tick: world.tick, text, feeling });
  if (person.memories.length > 6) person.memories.shift();
}

export function createWorld(
  seed = 1847,
  width = 96,
  height = 96,
  generationVersion: GenerationVersion = "planet-1",
): World {
  if (
    !Number.isInteger(seed) ||
    width % CHUNK_SIZE ||
    height % CHUNK_SIZE ||
    width < 64 ||
    height < 64 ||
    width > 128 ||
    height > 128
  )
    throw new Error("Invalid seed or initial window dimensions.");
  const world: World = {
    version: WORLD_VERSION,
    lawsVersion: LAWS.version,
    generationVersion,
    evolution: {
      sinceTick: 0,
      eroded: 0,
      deposited: 0,
      structuralLoss: 0,
      repaired: 0,
      salvaged: 0,
    },
    id: "praxans-world",
    name: "The Verdant Commons",
    seed,
    rng: seed >>> 0,
    tick: 0,
    nextId: 1,
    width,
    height,
    tiles: [],
    civilizations: [],
    citizens: [],
    animals: [],
    structures: [],
    caravans: [],
    diplomacy: { messages: [], accords: [] },
    events: [],
    pendingEvents: [],
    history: [],
    weather: "clear",
    atmosphereCompensation: {},
    planetaryClimate: initialPlanetaryClimate(0),
    atmosphere: {
      carbon: 0,
      water: 0,
      oxygen: 0,
      nitrogen: 0,
      argon: 0,
      dust: 0,
    },
    energy: { captured: 0, released: 0, initialChemical: 0 },
    entropy: emptyEntropy(),
    initialMatter: { carbon: 0, mineral: 0, water: 0 },
    initialTrees: 0,
    births: 0,
    deaths: 0,
    ecology: {
      births: 0,
      deaths: 0,
      pollinations: 0,
      dispersedSeeds: 0,
      grazed: 0,
      predation: 0,
    },
    changedTiles: [],
    chunks: [],
    frontierCursor: 1,
    boundary: { carbon: 0, mineral: 0, water: 0, chemical: 0 },
    initialElements: {},
    incomingElements: {},
    climate: {
      solarInput: 0,
      thermalOutput: 0,
      geothermalInput: 0,
      evaporated: 0,
      precipitated: 0,
      dustLifted: 0,
      dustDeposited: 0,
      transpired: 0,
    },
  };
  for (let cy = 0; cy < height / CHUNK_SIZE; cy++)
    for (let cx = 0; cx < width / CHUNK_SIZE; cx++)
      materializeChunk(world, cx, cy);
  const starts = [
    {
      x: 26,
      y: 24,
      name: "Fernhaven",
      motto: "From small roots, a generous life.",
      focus: "nourish" as const,
    },
    {
      x: 54,
      y: 26,
      name: "Amber Hollow",
      motto: "There is always something to discover.",
      focus: "discover" as const,
    },
    {
      x: 37,
      y: 46,
      name: "Stonebrook",
      motto: "Together, we make a place called home.",
      focus: "build" as const,
    },
  ];
  for (const start of starts) {
    const site = findSettlementSite(world, start);
    if (site) {
      const civ = createCivilization(world, start.name, site, false);
      civ.focus = start.focus;
      civ.motto = start.motto;
      initializeFounders(world, civ);
      recordEvent(world, {
        category: "founding",
        title: `${civ.name} takes root`,
        detail:
          "Eight people arrive with gathered materials. What they make of this place is still unwritten.",
        civId: civ.id,
        ...site,
      });
    }
  }
  const total = ledger(world);
  world.initialMatter = {
    carbon: total.carbon,
    water: total.water,
    mineral: total.mineral,
  };
  world.energy.initialChemical = total.chemical;
  world.boundary = { carbon: 0, mineral: 0, water: 0, chemical: 0 };
  world.initialElements = elementLedger(world);
  world.incomingElements = {};
  recordEvent(world, {
    category: "nature",
    title: "The first shared record",
    detail:
      "An old planet, weathered soils, and established ecosystems. A few small human groups begin a shared chapter under the same natural laws.",
  });
  return world;
}

export function findSettlementSite(
  world: World,
  preferred?: { x: number; y: number },
): { x: number; y: number } | null {
  const target = preferred ?? { x: world.width * 0.3, y: world.height * 0.65 };
  const sites = nearbyTiles(world, target, 23).filter((tile) => {
    if (tile.terrain !== "meadow" || distance(tile, target) > 23) return false;
    if (
      tile.temperature < FOUNDING.minimumTemperature ||
      tile.temperature > FOUNDING.maximumTemperature ||
      tile.water < FOUNDING.minimumSoilWater
    )
      return false;
    if (world.civilizations.some((civ) => distance(civ, tile) < 12))
      return false;
    let habitable = 0;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const near = getTile(world, tile.x + dx, tile.y + dy);
        if (near && near.terrain !== "water") habitable++;
      }
    if (habitable < 44) return false;
    let food = 0,
      wood = 0;
    for (const near of nearbyTiles(world, tile, 7)) {
      if (near.terrain === "water") continue;
      food += near.forage;
      for (const plant of [near.plant, near.groundcover])
        if (plant) wood += plant.carbon * plant.genome.woodiness;
    }
    return (
      food >= FOUNDING.minimumLocalFood && wood >= FOUNDING.minimumLocalWood
    );
  });
  sites.sort((a, b) => distance(a, target) - distance(b, target));
  return sites[0] ? { x: sites[0].x, y: sites[0].y } : null;
}
export function createCitizen(
  world: World,
  civ: Civilization,
  parents?: [
    Pick<Citizen, "id" | "name" | "generation" | "traits">,
    Pick<Citizen, "id" | "name" | "generation" | "traits">,
  ],
): Citizen {
  const surname = parents
    ? parents[0].name.split(" ").at(-1)!
    : pick(world, SURNAMES);
  const inherit = (trait: keyof Citizen["traits"]) =>
    parents
      ? clamp(
          (parents[0].traits[trait] + parents[1].traits[trait]) / 2 +
            between(world, -0.1, 0.1),
          0.1,
          1,
        )
      : between(world, 0.25, 0.95);
  const profile: Omit<Citizen, "mind"> = {
    id: uid(world, "person"),
    civId: civ.id,
    name: `${pick(world, NAMES)} ${surname}`,
    x: civ.x + between(world, -0.3, 0.3),
    y: civ.y + between(world, -0.3, 0.3),
    age: parents ? 0 : between(world, 18, 39),
    generation: parents
      ? Math.max(parents[0].generation, parents[1].generation) + 1
      : 0,
    parentIds: parents?.map((p) => p.id) ?? [],
    partnerId: null,
    health: 98,
    hunger: between(world, 75, 98),
    energy: between(world, 80, 100),
    happiness: between(world, 65, 85),
    sick: 0,
    body: parents ? 2 : 18,
    hydration: parents ? 1 : 8,
    traits: {
      diligence: inherit("diligence"),
      sociability: inherit("sociability"),
      curiosity: inherit("curiosity"),
      resilience: inherit("resilience"),
    },
    skill: parents ? 0 : between(world, 0.5, 1.5),
    specialty: "gather",
    cargo: null,
    task: null,
    memories: [],
    lastBirthTick: world.tick - Math.floor(DAYS_PER_YEAR * 96),
    clothing: Math.floor(random(world) * 5),
    experience: {},
    pregnancy: null,
    journeyId: null,
  };
  const person: Citizen = { ...profile, mind: createMind(profile, world.tick) };
  remember(
    world,
    person,
    parents
      ? `Born into the care of ${parents[0].name} and ${parents[1].name}.`
      : `Made a beginning with the people of ${civ.name}.`,
  );
  return person;
}
export function createCivilization(
  world: World,
  name: string,
  site: { x: number; y: number },
  claimed = true,
): Civilization {
  const palette = PALETTES[world.civilizations.length % PALETTES.length];
  const civ: Civilization = {
    id: uid(world, "civ"),
    name,
    ...site,
    color: palette[0],
    accent: palette[1],
    motto: "A small beginning. An unwritten story.",
    foundedTick: world.tick,
    focus: "balance",
    stock: emptyStock(),
    policies: { sharing: 0.7, effort: 0.5, extraction: 0.4 },
    culture: {
      care: between(world, 0.4, 0.8),
      curiosity: between(world, 0.4, 0.8),
      ambition: between(world, 0.3, 0.7),
    },
    traditions: [],
    observations: [],
    hypothesis: null,
    relations: {},
    births: 0,
    deaths: 0,
    harvests: 0,
    trades: 0,
    claimed,
    lastAgentTick: null,
    lastIntent: "",
    lastBirthTick: world.tick,
    lastBuildingTick: world.tick,
    lastTradeTick: world.tick,
    experiments: 0,
    civics: createCivics(world.tick),
  };
  world.civilizations.push(civ);
  for (const tile of world.tiles)
    if (tile.terrain !== "water" && distance(tile, civ) < 5.5 && !tile.owner) {
      tile.owner = civ.id;
      touchTile(world, tileIndex(world, tile.x, tile.y));
    }
  return civ;
}
export function initializeFounders(
  world: World,
  civ: Civilization,
  count: number = FOUNDING.people,
): void {
  for (const material of Object.keys(
    FOUNDING.stockPerPerson,
  ) as (keyof typeof FOUNDING.stockPerPerson)[])
    civ.stock[material] = FOUNDING.stockPerPerson[material] * count;
  const founders: Citizen[] = [];
  for (let i = 0; i < count; i++) {
    const person = createCitizen(world, civ);
    person.age = FOUNDING.ages[i % FOUNDING.ages.length];
    person.hunger = 90;
    person.energy = 90;
    person.happiness = 75;
    person.skill = 1;
    const traits = Object.keys(person.traits) as (keyof Citizen["traits"])[];
    traits.forEach((trait, column) => {
      person.traits[trait] =
        0.35 + (((i + column * 3) % count) / Math.max(1, count - 1)) * 0.5;
    });
    founders.push(person);
    world.citizens.push(person);
  }
  for (let i = 0; i < founders.length - 1; i += 2) {
    founders[i].partnerId = founders[i + 1].id;
    founders[i + 1].partnerId = founders[i].id;
  }
  sampleProgress(world, civ);
}
/** New player communities come from existing people and matter, never from a spawn grant. */
export function branchCivilization(world: World, name: string): Civilization {
  const source = [...world.civilizations]
    .sort((a, b) => peopleOf(world, b.id).length - peopleOf(world, a.id).length)
    .find((c) => peopleOf(world, c.id).filter((p) => p.age >= 16).length >= 14);
  const site = findSettlementSite(world);
  if (!source || !site)
    throw new Error(
      "A new community needs a reachable site and an existing group with at least 14 adults. Adopt an unclaimed community or let the population grow.",
    );
  const path = findPath(world, source, site, world.tiles.length);
  if (!path) throw new Error("The new site is not reachable on foot.");
  const members = peopleOf(world, source.id)
    .filter((p) => p.age >= 16)
    .slice(0, 6);
  const civ = createCivilization(world, name, site);
  for (const material of Object.keys(civ.stock) as (keyof typeof civ.stock)[]) {
    const share = source.stock[material] * 0.25;
    source.stock[material] -= share;
    civ.stock[material] = share;
  }
  for (const person of members) {
    person.civId = civ.id;
    person.task = {
      kind: "move",
      tile: tileIndex(world, site.x, site.y),
      path: findPath(world, person, site, world.tiles.length) ?? [...path],
      progress: 0,
    };
    remember(world, person, `Set out from ${source.name} to begin ${name}.`);
  }
  recordEvent(world, {
    category: "founding",
    title: `${name} branches into the world`,
    detail: `Six adults leave ${source.name}, carrying a share of its supplies.`,
    civId: civ.id,
    ...site,
  });
  return civ;
}

/** No fixed player limit: a fresh clearing is found along an expanding deterministic frontier. */
export function settleFrontier(world: World, name: string): Civilization {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const point = spiralSite(world.frontierCursor++);
    const preferred = {
      x: point.x * CHUNK_SIZE * 8 + 16,
      y: point.y * CHUNK_SIZE * 8 + 16,
    };
    if (
      world.civilizations.some((c) => distance(c, preferred) < CHUNK_SIZE * 5)
    )
      continue;
    materializeArea(world, preferred.x, preferred.y);
    const site = findSettlementSite(world, preferred);
    if (!site) continue;
    materializeArea(world, site.x, site.y);
    const before = ledger(world),
      beforeElements = elementLedger(world),
      civ = createCivilization(world, name, site);
    initializeFounders(world, civ);
    const after = ledger(world);
    for (const key of ["carbon", "mineral", "water", "chemical"] as const)
      world.boundary[key] += after[key] - before[key];
    const afterElements = elementLedger(world);
    for (const [symbol, mass] of Object.entries(afterElements))
      world.incomingElements[symbol] =
        (world.incomingElements[symbol] ?? 0) +
        mass -
        (beforeElements[symbol] ?? 0);
    recordEvent(world, {
      category: "founding",
      title: `${name}, far beyond the familiar`,
      detail:
        "Eight nomadic people begin in an unclaimed clearing. Their initial matter enters the frontier ledger; every subsequent action obeys the same laws.",
      civId: civ.id,
      ...site,
    });
    return civ;
  }
  throw new Error(
    "No habitable clearing was found in this search. Try the next frontier region.",
  );
}

export function summarizeWorld(
  world: World,
  location: { x: number; y: number } = world.civilizations[0] ?? { x: 0, y: 0 },
): WorldSummary {
  const totalHours = hours(world),
    total = ledger(world);
  const elements = elementLedger(world),
    error = elementalErrors(world, elements),
    sky = astronomy(world.tick, location.x, location.y);
  const local = getTile(world, location.x, location.y) ?? world.tiles[0];
  const flora = world.tiles
    .flatMap((t) => [t.plant, t.groundcover])
    .filter((p) => p !== null);
  const diversity = new Set(
    flora.map(
      (p) =>
        `${p!.lineage}:${Math.round(p!.genome.woodiness * 4)}:${Math.round(p!.genome.roots * 4)}`,
    ),
  ).size;
  const clock = worldClock(world.tick, location.x, location.y);

  return {
    tick: world.tick,
    clock,
    entropy: { ...world.entropy },
    day: clock.dayOfYear,
    year: clock.year,
    hour: Math.floor(sky.localHour),
    season: SEASONS[sky.season],
    weather: localWeather(local),
    population: world.citizens.length,
    births: world.births,
    deaths: world.deaths,
    happiness: world.citizens.length
      ? world.citizens.reduce((sum, p) => sum + p.happiness, 0) /
        world.citizens.length
      : 0,
    forest:
      (world.tiles.reduce((sum, tile) => sum + tile.trees, 0) /
        Math.max(world.initialTrees, 1)) *
      100,
    discoveries: world.civilizations.reduce(
      (sum, civ) => sum + civ.observations.length,
      0,
    ),
    biodiversity: diversity,
    sunlight: Math.max(0, Math.min(1, sky.irradiance / 1361)),
    life: {
      plantLineages: new Set(flora.map((p) => p!.lineage)).size,
      animalLineages: new Set(world.animals.map((a) => a.species)).size,
      animals: world.animals.reduce((n, a) => n + a.count, 0),
      cohorts: world.animals.length,
      pollinators: world.animals
        .filter((a) => FAUNA_BY_ID[a.species].diet === "nectar")
        .reduce((n, a) => n + a.count, 0),
      predators: world.animals
        .filter((a) => FAUNA_BY_ID[a.species].diet === "predator")
        .reduce((n, a) => n + a.count, 0),
      births: world.ecology.births,
      deaths: world.ecology.deaths,
      pollinations: world.ecology.pollinations,
      dispersedSeeds: world.ecology.dispersedSeeds,
    },
    carbonError:
      total.carbon - world.initialMatter.carbon - world.boundary.carbon,
    mineralError:
      total.mineral - world.initialMatter.mineral - world.boundary.mineral,
    waterError: total.water - world.initialMatter.water - world.boundary.water,
    energyError:
      world.energy.initialChemical +
      world.boundary.chemical +
      world.energy.captured -
      world.energy.released -
      total.chemical,
    regions: world.chunks.length,
    elements,
    elementError: error.absolute,
    elementRelativeError: error.relative,
    environment: {
      temperature: local.temperature,
      humidity: local.air.humidity,
      pressure: local.air.pressure,
      wind: Math.hypot(local.air.windX, local.air.windY),
      cloud: cloudCover(local.air.cloud),
      rain: local.air.rain,
      snow: local.air.snow,
      daylight: sky.daylight,
      latitude: sky.latitude,
      oxygen: oxygenFraction(world),
      dust: local.air.dust,
      tide: sky.tide,
      moonPhase: sky.moonIllumination,
    },
    geology: {
      plates: new Set(world.chunks.map((c) => c.geology.id)).size,
      earthquakes: world.chunks.reduce(
        (sum, c) => sum + c.geology.earthquakes,
        0,
      ),
      meanHeatFlux:
        world.chunks.reduce((sum, c) => sum + c.geology.heatFlux, 0) /
        world.chunks.length,
      maxUplift: Math.max(
        ...world.chunks.map((c) => Math.abs(c.geology.uplift)),
      ),
    },
  };
}
export function findPath(
  world: World,
  from: { x: number; y: number },
  to: { x: number; y: number },
  budget = 2200,
): number[] | null {
  const start = tileIndex(world, from.x, from.y),
    goal = tileIndex(world, to.x, to.y);
  if (start < 0 || goal < 0) return null;
  if (start === goal) return [];
  if (
    !getTile(world, from.x, from.y) ||
    !getTile(world, to.x, to.y) ||
    world.tiles[goal].terrain === "water"
  )
    return null;
  const previous = new Map<number, number>(),
    scores = new Map([[start, 0]]),
    closed = new Set<number>();
  const heuristic = (index: number) =>
    (Math.abs(world.tiles[index].x - Math.round(to.x)) +
      Math.abs(world.tiles[index].y - Math.round(to.y))) *
    0.8;
  // Stable heap ordering preserves the former array's insertion-order tie
  // breaks, including when a queued tile receives a cheaper route.
  const open = [{ index: start, score: heuristic(start), order: 0 }];
  const positions = new Map([[start, 0]]);
  let order = 1;
  const before = (a: number, b: number) =>
    open[a].score < open[b].score ||
    (open[a].score === open[b].score && open[a].order < open[b].order);
  const swap = (a: number, b: number) => {
    [open[a], open[b]] = [open[b], open[a]];
    positions.set(open[a].index, a);
    positions.set(open[b].index, b);
  };
  const improve = (index: number, score: number) => {
    let at: number = positions.get(index) ?? -1;
    if (at < 0) {
      at = open.length;
      open.push({ index, score, order: order++ });
      positions.set(index, at);
    } else open[at].score = score;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (!before(at, parent)) break;
      swap(at, parent);
      at = parent;
    }
  };
  while (open.length && budget-- > 0) {
    const current = open[0].index;
    positions.delete(current);
    const last = open.pop()!;
    if (open.length) {
      open[0] = last;
      positions.set(last.index, 0);
      let at = 0;
      while (at * 2 + 1 < open.length) {
        let child = at * 2 + 1;
        if (child + 1 < open.length && before(child + 1, child)) child++;
        if (!before(child, at)) break;
        swap(child, at);
        at = child;
      }
    }
    if (current === goal) {
      const result: number[] = [];
      let cursor = goal;
      while (cursor !== start) {
        result.push(cursor);
        cursor = previous.get(cursor)!;
      }
      return result.reverse();
    }
    closed.add(current);
    const tile = world.tiles[current];
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const index = tileIndex(world, tile.x + dx, tile.y + dy);
      const next = world.tiles[index];
      if (!next || next.terrain === "water") continue;
      if (closed.has(index)) continue;
      const cost =
        scores.get(current)! +
        (next.terrain === "hill" ? 1.5 : 1) -
        next.road * 0.2;
      if (cost < (scores.get(index) ?? Infinity)) {
        previous.set(index, current);
        scores.set(index, cost);
        improve(index, cost + heuristic(index));
      }
    }
  }
  return null;
}
