import { between, clamp, hash, pick } from "./random";
import type { Animal, FaunaSpecies, Genome, Plant, Tile } from "./types";

/** Functional lineages describe the old world's initial biology. Names grant no effects. */
export const FLORA = [
  {
    name: "Broadleaf oak",
    form: "tree",
    wood: 0.88,
    growth: 0.65,
    roots: 0.95,
    shade: 0.3,
    wet: 0.55,
    deciduous: 0.9,
    pollination: 0,
  },
  {
    name: "Highland pine",
    form: "tree",
    wood: 0.9,
    growth: 0.55,
    roots: 0.8,
    shade: 0.25,
    wet: 0.35,
    deciduous: 0,
    pollination: 0,
  },
  {
    name: "River willow",
    form: "tree",
    wood: 0.75,
    growth: 1.15,
    roots: 1.1,
    shade: 0.3,
    wet: 0.85,
    deciduous: 0.85,
    pollination: 0.7,
  },
  {
    name: "Silver birch",
    form: "tree",
    wood: 0.78,
    growth: 1,
    roots: 0.7,
    shade: 0.15,
    wet: 0.5,
    deciduous: 0.95,
    pollination: 0,
  },
  {
    name: "Woodland hazel",
    form: "shrub",
    wood: 0.58,
    growth: 0.8,
    roots: 0.65,
    shade: 0.75,
    wet: 0.6,
    deciduous: 0.8,
    pollination: 0,
  },
  {
    name: "Berry bramble",
    form: "shrub",
    wood: 0.34,
    growth: 1.2,
    roots: 0.6,
    shade: 0.55,
    wet: 0.6,
    deciduous: 0.7,
    pollination: 1,
  },
  {
    name: "Dryland heather",
    form: "shrub",
    wood: 0.4,
    growth: 0.65,
    roots: 1,
    shade: 0.15,
    wet: 0.2,
    deciduous: 0.1,
    pollination: 0.9,
  },
  {
    name: "Meadow grass",
    form: "grass",
    wood: 0.04,
    growth: 1.4,
    roots: 0.75,
    shade: 0.2,
    wet: 0.5,
    deciduous: 0.5,
    pollination: 0,
  },
  {
    name: "River reed",
    form: "grass",
    wood: 0.2,
    growth: 1.2,
    roots: 1.1,
    shade: 0.2,
    wet: 0.9,
    deciduous: 0.65,
    pollination: 0,
  },
  {
    name: "Meadow clover",
    form: "flower",
    wood: 0.02,
    growth: 1.25,
    roots: 0.5,
    shade: 0.3,
    wet: 0.55,
    deciduous: 0.7,
    pollination: 1,
  },
  {
    name: "Woodland bluebell",
    form: "flower",
    wood: 0.02,
    growth: 1,
    roots: 0.45,
    shade: 0.85,
    wet: 0.6,
    deciduous: 0.9,
    pollination: 1,
  },
  {
    name: "Wild thyme",
    form: "flower",
    wood: 0.12,
    growth: 0.75,
    roots: 0.75,
    shade: 0.1,
    wet: 0.2,
    deciduous: 0.1,
    pollination: 1,
  },
  {
    name: "Shade fern",
    form: "fern",
    wood: 0.08,
    growth: 0.8,
    roots: 0.35,
    shade: 0.95,
    wet: 0.8,
    deciduous: 0.6,
    pollination: -1,
  },
  {
    name: "Cushion moss",
    form: "moss",
    wood: 0.02,
    growth: 0.6,
    roots: 0.2,
    shade: 0.95,
    wet: 0.85,
    deciduous: 0,
    pollination: -1,
  },
  {
    name: "Green algae",
    form: "algae",
    wood: 0.02,
    growth: 1.5,
    roots: 0.3,
    shade: 0.7,
    wet: 1,
    deciduous: 0,
    pollination: -1,
  },
  {
    name: "Diatom mat",
    form: "algae",
    wood: 0.02,
    growth: 1.15,
    roots: 0.25,
    shade: 0.55,
    wet: 1,
    deciduous: 0,
    pollination: -1,
  },
  {
    name: "Arctic sedge",
    form: "grass",
    wood: 0.05,
    growth: 0.65,
    roots: 0.9,
    shade: 0.25,
    wet: 0.55,
    deciduous: 0.9,
    pollination: 0,
  },
  {
    name: "Sunland acacia",
    form: "tree",
    wood: 0.7,
    growth: 0.7,
    roots: 1.15,
    shade: 0.15,
    wet: 0.25,
    deciduous: 0.3,
    pollination: 0.8,
  },
] as const;
export const floraOf = (plant: Plant) => FLORA[plant.lineage % FLORA.length];
export const isAquatic = (plant: Plant) => floraOf(plant).form === "algae";

export function initialPlant(
  seed: number,
  tile: Pick<Tile, "x" | "y" | "terrain" | "moisture" | "temperature">,
  understory = false,
): Plant | null {
  const rng = {
    rng:
      Math.floor(
        hash(tile.x, tile.y, seed + (understory ? 419 : 839)) * 0xffffffff,
      ) >>> 0,
  };
  let choices = FLORA.map((_, i) => i);
  if (tile.terrain === "water") {
    if (!understory) return null;
    choices = [14, 15];
  } else if (tile.terrain === "shore") return null;
  else if (tile.terrain === "tundra") choices = [13, 16];
  else if (tile.terrain === "desert") {
    if (hash(tile.x, tile.y, seed + 35) > 0.28) return null;
    choices = [6, 11, 17];
  } else if (understory) choices = [9, 10, 12, 13];
  else if (tile.terrain === "forest") choices = [0, 1, 2, 3, 4, 5];
  else if (tile.terrain === "marsh") choices = [2, 8];
  else if (tile.terrain === "hill") {
    if (hash(tile.x, tile.y, seed + 8) > 0.45) return null;
    choices = [1, 6, 11];
  } else choices = [5, 7, 7, 9, 11];
  // Selection is conditioned on water regime; individual traits still vary and undergo selection.
  choices.sort(
    (a, b) =>
      Math.abs(FLORA[a].wet - tile.moisture) -
      Math.abs(FLORA[b].wet - tile.moisture),
  );
  const lineage = pick(
      rng,
      choices.slice(0, Math.max(2, Math.ceil(choices.length * 0.7))),
    ),
    form = FLORA[lineage];
  const genome: Genome = {
    woodiness: clamp(form.wood + between(rng, -0.04, 0.04), 0.02, 0.96),
    growth: form.growth * between(rng, 0.85, 1.15),
    roots: form.roots * between(rng, 0.88, 1.05),
    seedSize: between(rng, 0.1, 0.6),
    temperature: tile.temperature + between(rng, -4, 5),
    defense: between(rng, 0.025, form.form === "shrub" ? 0.3 : 0.15),
    shadeTolerance: form.shade,
    waterNeed: form.wet,
    deciduous: form.deciduous,
    pollination: form.pollination,
  };
  const carbon = understory
    ? between(rng, 2, tile.terrain === "water" ? 18 : 10)
    : between(rng, 24, 110);
  return { carbon, mineral: carbon * 0.04, genome, generation: 0, lineage };
}

const fauna = (
  id: string,
  name: string,
  diet: FaunaSpecies["diet"],
  habitat: FaunaSpecies["habitat"],
  dryMass: number,
  overrides: Partial<FaunaSpecies> = {},
): FaunaSpecies => ({
  id,
  name,
  diet,
  habitat,
  dryMass,
  groupSize: 1,
  prevalence: 0.7,
  metabolism: 1,
  temperature: 18,
  tolerance: 25,
  lifespanDays: 4 * 365,
  reproductionDays: 60,
  litter: 2,
  canopy: 0.35,
  moisture: 0.5,
  mobility: 2,
  seedDispersal: 0,
  color: "#917b5e",
  ...overrides,
});
export const FAUNA: readonly FaunaSpecies[] = Object.freeze([
  fauna("vole", "Field voles", "grazer", "land", 0.008, {
    groupSize: 18,
    reproductionDays: 24,
    litter: 5,
    lifespanDays: 500,
    canopy: 0.15,
    seedDispersal: 0.1,
  }),
  fauna("mouse", "Wood mice", "omnivore", "land", 0.006, {
    groupSize: 12,
    reproductionDays: 28,
    litter: 5,
    canopy: 0.6,
    seedDispersal: 0.25,
  }),
  fauna("hare", "Meadow hares", "grazer", "land", 0.7, {
    groupSize: 2,
    reproductionDays: 50,
    litter: 3,
    mobility: 4,
    seedDispersal: 0.12,
  }),
  fauna("deer", "Woodland deer", "grazer", "land", 16, {
    prevalence: 0.3,
    reproductionDays: 300,
    litter: 1,
    lifespanDays: 12 * 365,
    canopy: 0.65,
    mobility: 4,
    seedDispersal: 0.35,
    color: "#ab8866",
  }),
  fauna("goat", "Rock ibex", "grazer", "land", 11, {
    prevalence: 0.18,
    reproductionDays: 270,
    litter: 1,
    moisture: 0.25,
    mobility: 4,
    seedDispersal: 0.15,
  }),
  fauna("fox", "Red foxes", "predator", "land", 1.5, {
    prevalence: 0.22,
    reproductionDays: 300,
    litter: 3,
    mobility: 4,
    color: "#bc7851",
  }),
  fauna("owl", "Woodland owls", "predator", "air", 0.3, {
    prevalence: 0.2,
    reproductionDays: 300,
    litter: 2,
    canopy: 0.8,
    mobility: 5,
    color: "#8e8270",
  }),
  fauna("hawk", "Grassland hawks", "predator", "air", 0.25, {
    prevalence: 0.15,
    reproductionDays: 300,
    litter: 2,
    canopy: 0.1,
    mobility: 6,
    color: "#807766",
  }),
  fauna("songbird", "Berry thrushes", "omnivore", "air", 0.025, {
    groupSize: 6,
    reproductionDays: 90,
    litter: 3,
    canopy: 0.65,
    mobility: 4,
    seedDispersal: 0.8,
    color: "#809486",
  }),
  fauna("bee", "Wild bees", "nectar", "air", 0.000025, {
    groupSize: 900,
    metabolism: 0.4,
    reproductionDays: 28,
    litter: 80,
    lifespanDays: 180,
    tolerance: 14,
    mobility: 4,
    color: "#c1a051",
  }),
  fauna("butterfly", "Meadow butterflies", "nectar", "air", 0.000075, {
    groupSize: 60,
    metabolism: 0.18,
    reproductionDays: 35,
    litter: 20,
    lifespanDays: 120,
    tolerance: 16,
    mobility: 3,
    color: "#b5a1a1",
  }),
  fauna("beetle", "Leaf beetles", "grazer", "land", 0.00005, {
    groupSize: 250,
    metabolism: 0.08,
    reproductionDays: 50,
    litter: 50,
    lifespanDays: 400,
    mobility: 1,
    color: "#6f8063",
  }),
  fauna("worm", "Earthworms", "detritivore", "land", 0.00015, {
    groupSize: 1600,
    metabolism: 0.05,
    reproductionDays: 60,
    litter: 100,
    moisture: 0.85,
    mobility: 1,
    color: "#9d7c72",
  }),
  fauna("woodlouse", "Woodlice", "detritivore", "land", 0.000008, {
    groupSize: 1800,
    metabolism: 0.07,
    reproductionDays: 45,
    litter: 120,
    canopy: 0.7,
    moisture: 0.8,
    mobility: 1,
  }),
  fauna("frog", "Reed frogs", "predator", "wetland", 0.008, {
    groupSize: 16,
    metabolism: 0.07,
    reproductionDays: 180,
    litter: 10,
    moisture: 0.9,
    tolerance: 17,
    color: "#829b6b",
  }),
  fauna("lizard", "Sunlit lizards", "predator", "land", 0.012, {
    groupSize: 5,
    metabolism: 0.08,
    reproductionDays: 180,
    litter: 5,
    temperature: 27,
    moisture: 0.25,
    tolerance: 17,
    color: "#9ba279",
  }),
  fauna("minnow", "River minnows", "grazer", "water", 0.003, {
    groupSize: 65,
    metabolism: 0.07,
    reproductionDays: 120,
    litter: 20,
    moisture: 1,
    tolerance: 15,
    color: "#779a9c",
  }),
  fauna("trout", "Silver trout", "predator", "water", 0.08, {
    groupSize: 5,
    prevalence: 0.45,
    metabolism: 0.1,
    reproductionDays: 300,
    litter: 8,
    temperature: 13,
    tolerance: 13,
    moisture: 1,
    mobility: 3,
    color: "#78918e",
  }),
  fauna("snail", "Pond snails", "detritivore", "water", 0.0009, {
    groupSize: 80,
    metabolism: 0.06,
    reproductionDays: 90,
    litter: 15,
    moisture: 1,
    mobility: 1,
  }),
  fauna("heron", "Grey herons", "predator", "wetland", 0.4, {
    prevalence: 0.15,
    reproductionDays: 320,
    litter: 2,
    moisture: 0.9,
    mobility: 5,
    color: "#8b9e9e",
  }),
]);
export const FAUNA_BY_ID = Object.freeze(
  Object.fromEntries(FAUNA.map((species) => [species.id, species])),
);
export function habitatSuitability(species: FaunaSpecies, tile: Tile): number {
  if (
    tile.terrain === "unknown" ||
    (species.habitat === "water" && tile.terrain !== "water") ||
    (species.habitat === "land" && tile.terrain === "water")
  )
    return 0;
  if (
    species.habitat === "wetland" &&
    tile.moisture < 0.65 &&
    tile.terrain !== "water"
  )
    return 0;
  const canopy = tile.plant?.genome.woodiness ?? 0;
  const temperature = Math.exp(
    -(((tile.temperature - species.temperature) / species.tolerance) ** 2),
  );
  const moisture = Math.exp(-((tile.moisture - species.moisture) ** 2) * 5);
  return (
    temperature *
    moisture *
    (0.4 + 0.6 * (1 - Math.abs(canopy - species.canopy)))
  );
}
export function initialAnimals(
  seed: number,
  cx: number,
  cy: number,
  tiles: Tile[],
  tick: number,
): Animal[] {
  const result: Animal[] = [];
  for (let i = 0; i < FAUNA.length; i++) {
    const species = FAUNA[i],
      rng = {
        rng: Math.floor(hash(cx, cy, seed + i * 319 + 19) * 0xffffffff) >>> 0,
      };
    if (between(rng, 0, 1) > species.prevalence) continue;
    let tile: Tile | undefined,
      best = 0;
    for (let trial = 0; trial < 40; trial++) {
      const candidate = tiles[Math.floor(between(rng, 0, tiles.length))],
        suitability = habitatSuitability(species, candidate);
      if (suitability > best) {
        best = suitability;
        tile = candidate;
      }
    }
    if (!tile || best < 0.25) continue;
    const count = Math.max(
      1,
      Math.floor(species.groupSize * between(rng, 0.7, 1.3)),
    );
    const size = between(rng, 0.85, 1.15),
      body = count * species.dryMass * size;
    result.push({
      id: `wild-${cx},${cy}-${species.id}`,
      species: species.id,
      x: tile.x,
      y: tile.y,
      count,
      body,
      hydration: body * 3,
      health: 100,
      ageDays: between(
        rng,
        species.reproductionDays,
        species.lifespanDays * 0.65,
      ),
      generation: 0,
      lastBirthTick:
        tick - Math.floor(between(rng, 0, species.reproductionDays * 96)),
      traits: {
        size,
        temperature: between(rng, -2, 2),
        efficiency: between(rng, 0.85, 1.15),
      },
      activity: "Foraging",
    });
  }
  return result;
}
export const BIOTA_MODEL = Object.freeze({
  plantLineages: FLORA.length,
  animalLineages: FAUNA.length,
  description:
    "Initial functional lineages with regionally varied traits; plants occupy canopy and ground layers. Animals are cohorts whose biomass, water, feeding, oxygen demand, reproduction, and deaths are explicit. Traits vary through inheritance; names provide no abilities.",
  coupling: [
    "photosynthesis",
    "herbivory",
    "predation",
    "detritivory",
    "pollination",
    "seed dispersal",
    "shade competition",
    "temperature and water selection",
    "dissolved oxygen limitation",
  ],
  limits:
    "Cohorts approximate age structure and behavior. The catalog is an initial ecological parameterization, not speciation from first principles. Fungal chemistry, pathogens, marine salinity, and full animal physiology are not yet resolved.",
});
