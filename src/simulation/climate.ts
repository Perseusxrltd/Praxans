import { celestialState, PLANET } from "./planet";
import { clamp } from "./random";
import {
  HOURS_PER_TICK,
  type PlanetaryClimate,
  type Tile,
  type World,
} from "./types";
import { heatCapacity } from "./thermodynamics";

/** A diffusive planetary energy-balance model, not resolved atmospheric circulation. */
export const CLIMATE_MODEL = Object.freeze({
  bands: 36,
  heatCapacityPerArea: 80000, // kJ / m² / K, atmosphere and unresolved mixed ocean/ground
  infraredEmissivity: 0.61,
  meridionalDiffusivity: 0.6, // W / m² / K in sin(latitude) coordinates
  clearAlbedo: 0.3,
});
const area = (4 * Math.PI * PLANET.radius ** 2) / CLIMATE_MODEL.bands;
const capacity = area * CLIMATE_MODEL.heatCapacityPerArea;
const spacing = 2 / CLIMATE_MODEL.bands;
const coverCache = new WeakMap<World, { length: number; areas: number[] }>();

export function initialPlanetaryClimate(tick: number): PlanetaryClimate {
  const phase = celestialState(tick).orbitalPhase * 2 * Math.PI;
  return {
    sinceTick: tick,
    tick,
    surfaceExchange: 0,
    exchangeCorrection: 0,
    solarAbsorbed: 0,
    radiated: 0,
    solarCorrection: 0,
    radiationCorrection: 0,
    bands: Array.from({ length: CLIMATE_MODEL.bands }, (_, i) => {
      const latitudeSine = -1 + (i + 0.5) * spacing;
      return {
        referenceTemperature:
          30 -
          40 * latitudeSine ** 2 +
          8 * latitudeSine * Math.sin(phase - 0.7),
        heat: 0,
        correction: 0,
      };
    }),
  };
}

export const climateBand = (_x: number, y: number) =>
  Math.min(
    CLIMATE_MODEL.bands - 1,
    Math.floor(
      (clamp(
        Math.SQRT1_2 - (y * PLANET.tileSide * Math.SQRT1_2) / PLANET.radius,
        -1,
        1,
      ) +
        1) /
        spacing,
    ),
  );
export const regionalTemperature = (climate: PlanetaryClimate, band: number) =>
  climate.bands[band].referenceTemperature +
  climate.bands[band].heat / capacity;

function addHeat(climate: PlanetaryClimate, index: number, heat: number) {
  const band = climate.bands[index],
    increment = heat - band.correction;
  const next = band.heat + increment;
  band.correction = next - band.heat - increment;
  band.heat = next;
}
function counter(
  climate: PlanetaryClimate,
  kind: "solarAbsorbed" | "radiated" | "surfaceExchange",
  amount: number,
) {
  const correction =
    kind === "solarAbsorbed"
      ? "solarCorrection"
      : kind === "radiated"
        ? "radiationCorrection"
        : "exchangeCorrection";
  const increment = amount - climate[correction],
    next = climate[kind] + increment;
  climate[correction] = next - climate[kind] - increment;
  climate[kind] = next;
}

/** Heat crossing band boundaries is transferred in equal and opposite amounts. */
export function diffusePlanetaryHeat(
  climate: PlanetaryClimate,
  hours: number,
): void {
  if (!Number.isFinite(hours) || hours < 0 || hours > 1)
    throw new Error("Planetary diffusion needs an hourly or smaller step.");
  const changes = new Float64Array(CLIMATE_MODEL.bands);
  for (let i = 0; i < changes.length - 1; i++) {
    const a = regionalTemperature(climate, i),
      b = regionalTemperature(climate, i + 1);
    const boundary = -1 + (i + 1) * spacing;
    const flux =
      (CLIMATE_MODEL.meridionalDiffusivity * (1 - boundary ** 2) * (a - b)) /
      spacing ** 2;
    const heat = flux * area * hours * 3.6;
    changes[i] -= heat;
    changes[i + 1] += heat;
  }
  for (let i = 0; i < changes.length; i++) addHeat(climate, i, changes[i]);
}

export function advancePlanetaryClimate(world: World): void {
  const climate = world.planetaryClimate;
  let cached = coverCache.get(world);
  if (!cached || cached.length !== world.tiles.length) {
    const areas = Array<number>(CLIMATE_MODEL.bands).fill(0);
    for (const tile of world.tiles)
      areas[climateBand(tile.x, tile.y)] += PLANET.tileSide ** 2;
    cached = { length: world.tiles.length, areas };
    coverCache.set(world, cached);
  }
  while (climate.tick < world.tick) {
    const ticks = Math.min(4, world.tick - climate.tick),
      hours = ticks * HOURS_PER_TICK;
    climate.tick += ticks;
    const sky = celestialState(climate.tick),
      declinationSine = sky.starDirection[2];
    const declinationCosine = Math.sqrt(1 - declinationSine ** 2);
    const solar =
      PLANET.solarConstant * (PLANET.semiMajorAxis / sky.starDistance) ** 2;
    for (let i = 0; i < climate.bands.length; i++) {
      const latitudeSine = -1 + (i + 0.5) * spacing,
        latitudeCosine = Math.sqrt(1 - latitudeSine ** 2);
      const sunset = Math.acos(
        clamp(
          (-latitudeSine * declinationSine) /
            (latitudeCosine * declinationCosine),
          -1,
          1,
        ),
      );
      const meanSun =
        (solar / Math.PI) *
        (sunset * latitudeSine * declinationSine +
          latitudeCosine * declinationCosine * Math.sin(sunset));
      const temperature = regionalTemperature(climate, i);
      const albedo =
        CLIMATE_MODEL.clearAlbedo +
        0.15 * clamp((-10 - temperature) / 30, 0, 1);
      // Detailed surfaces receive their own sunlight and emit to space. Their
      // area is excluded here so that forcing is not counted twice.
      const unresolvedArea = Math.max(0, area - cached.areas[i]);
      const absorbed = meanSun * (1 - albedo) * unresolvedArea * hours * 3.6;
      const emitted =
        CLIMATE_MODEL.infraredEmissivity *
        PLANET.stefanBoltzmann *
        (temperature + 273.15) ** 4 *
        unresolvedArea *
        hours *
        3.6;
      addHeat(climate, i, absorbed - emitted);
      counter(climate, "solarAbsorbed", absorbed);
      counter(climate, "radiated", emitted);
    }
    diffusePlanetaryHeat(climate, hours);
  }
}

/** Wind-driven sensible heat exchange with the wider atmosphere and ocean/ground reservoir. */
export function exchangeRegionalHeat(world: World, tile: Tile): number {
  const climate = world.planetaryClimate,
    index = climateBand(tile.x, tile.y);
  const regional = regionalTemperature(climate, index),
    localCapacity = heatCapacity(tile);
  const difference = tile.temperature - regional;
  const conductance =
    (4 + 2 * Math.sqrt(Math.hypot(tile.air.windX, tile.air.windY))) *
    PLANET.tileSide ** 2 *
    3.6;
  const heat =
    Math.sign(difference) *
    Math.min(
      Math.abs(difference) / (1 / localCapacity + 1 / capacity),
      Math.abs(difference) * conductance,
    );
  const produced =
    localCapacity *
      Math.log1p(-heat / (localCapacity * (tile.temperature + 273.15))) +
    capacity * Math.log1p(heat / (capacity * (regional + 273.15)));
  world.entropy.heatMixing += Math.max(0, produced);
  tile.temperature -= heat / localCapacity;
  addHeat(climate, index, heat);
  counter(climate, "surfaceExchange", heat);
  return heat;
}
