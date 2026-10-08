import { LAWS } from "./laws";
import { recordEvent } from "./events";
import {
  recordRadiation,
  passiveHeat,
  infraredColumn,
  radiationEntropy,
  heatCapacity as thermalCapacity,
} from "./thermodynamics";
import { advancePlanetaryClimate, exchangeRegionalHeat } from "./climate";
import {
  astronomy,
  cloudCover,
  PLANET,
  STAR,
  saturationVapor,
  prevailingWind,
} from "./planet";
import { ROCK, addNutrients, accumulateAtmosphere } from "./chemistry";
import { clamp } from "./random";
import { getTile, tileIndex } from "./terrain";
import { CHUNK_SIZE, type Tile, type Weather, type World } from "./types";
import {
  depositSediment,
  displaceSurface,
  entrainSediment,
  type SedimentTransfer,
} from "./landscape";

const fluxBuffers = new WeakMap<World, Float64Array[]>();
const neighborCache = new WeakMap<
  World,
  { tiles: Tile[]; length: number; indices: Int32Array }
>();
function weatherNeighbors(world: World): Int32Array {
  const cached = neighborCache.get(world);
  if (cached?.tiles === world.tiles && cached.length === world.tiles.length)
    return cached.indices;
  const indices = new Int32Array(world.tiles.length * 4);
  for (let i = 0; i < world.tiles.length; i++) {
    const t = world.tiles[i];
    const around = [
      tileIndex(world, t.x, t.y - 1),
      tileIndex(world, t.x + 1, t.y),
      tileIndex(world, t.x, t.y + 1),
      tileIndex(world, t.x - 1, t.y),
    ];
    for (let direction = 0; direction < 4; direction++)
      indices[i * 4 + direction] =
        around[direction] < 0 ? i : around[direction];
  }
  neighborCache.set(world, {
    tiles: world.tiles,
    length: world.tiles.length,
    indices,
  });
  return indices;
}
function reusableFluxes(world: World) {
  let buffers = fluxBuffers.get(world);
  if (!buffers || buffers[0].length !== world.tiles.length) {
    buffers = Array.from(
      { length: 6 },
      () => new Float64Array(world.tiles.length),
    );
    fluxBuffers.set(world, buffers);
  } else for (const buffer of buffers) buffer.fill(0);
  return buffers;
}

export function localWeather(tile: Tile): Weather {
  if (tile.air.rain > 0.05)
    return tile.temperature < 0
      ? "snow"
      : Math.hypot(tile.air.windX, tile.air.windY) > 8 || tile.air.rain > 8
        ? "storm"
        : "rain";
  if (tile.air.humidity > 0.97 && tile.air.cloud > 2) return "mist";
  return tile.water < LAWS.waterCapacity * 0.07 && tile.temperature > 26
    ? "drought"
    : "clear";
}
/** Buried frozen water is not a bright blanket of snow; foliage masks ground snow. */
export function surfaceAlbedo(tile: Tile): number {
  const canopy = tile.plant
    ? 1 -
      Math.exp(
        -tile.plant.carbon *
          (1 - tile.plant.genome.woodiness) *
          0.08 *
          (1 -
            tile.plant.genome.deciduous *
              clamp((8 - tile.temperature) / 14, 0, 1)),
      )
    : 0;
  const ground =
    tile.terrain === "water" ? 0.08 + Math.min(1, tile.ice / 1000) * 0.4 : 0.22;
  const snow = Math.min(1, tile.air.snow / 300);
  return canopy * 0.18 + (1 - canopy) * (snow * 0.7 + (1 - snow) * ground);
}
/** Condensation and evaporation change saturation through latent heat; solve them together. */
export function equilibrateCloud(tile: Tile, heatCapacity: number): void {
  const air = tile.air,
    saturation = saturationVapor(tile.temperature);
  const condensing = air.vapor > saturation;
  if (!condensing && air.cloud <= 0) return;
  let low = 0,
    high = condensing ? air.vapor : air.cloud;
  const sign = condensing ? 1 : -1;
  for (let iteration = 0; iteration < 18; iteration++) {
    const amount = (low + high) / 2;
    const difference =
      air.vapor -
      sign * amount -
      saturationVapor(
        tile.temperature +
          (sign * amount * PLANET.vaporizationHeat) / heatCapacity,
      );
    if (difference * sign > 0) low = amount;
    else high = amount;
  }
  const transferred = ((low + high) / 2) * sign;
  air.vapor -= transferred;
  air.cloud += transferred;
  tile.temperature += (transferred * PLANET.vaporizationHeat) / heatCapacity;
}

/** Hourly finite-volume water transfers and a reduced surface/atmosphere energy balance.
 * Flux limiting keeps coarse transport stable; this is not a Navier–Stokes atmosphere.
 */
export function updateWeather(world: World): void {
  advancePlanetaryClimate(world);
  const sediments: SedimentTransfer[] = [];
  const length = world.tiles.length;
  const neighbors = weatherNeighbors(world);
  const [
    vaporDelta,
    cloudDelta,
    waterDelta,
    oxygenDelta,
    dustDelta,
    heatDelta,
  ] = reusableFluxes(world);
  // One astronomical sample per 320 m region; sub-kilometre sky differences are negligible here.
  const skies = world.chunks.map((c) =>
    astronomy(world.tick, c.x * CHUNK_SIZE + 16, c.y * CHUNK_SIZE + 16),
  );
  const circulations = skies.map((sky) => prevailingWind(sky.latitude));
  for (let i = 0; i < length; i++) {
    const tile = world.tiles[i],
      air = tile.air;
    const sky = skies[Math.floor(i / CHUNK_SIZE ** 2)];
    air.tide = sky.tide;
    const cover = cloudCover(air.cloud),
      albedo = surfaceAlbedo(tile);
    air.sunlight = sky.irradiance * 0.72 * (1 - cover * 0.65);
    const absorbed = air.sunlight * (1 - albedo) * LAWS.tileArea * 3.6;
    const atmosphericAbsorption =
      sky.irradiance * 0.18 * (1 - cover * 0.3) * LAWS.tileArea * 3.6;
    const kelvin = tile.temperature + 273.15;
    const emissionFactor = 0.96 * PLANET.stefanBoltzmann * LAWS.tileArea * 3.6;
    const emitted = emissionFactor * kelvin ** 4;
    // Infrared return must be funded by absorbed emission. A fixed
    // surface-minus-14 K emitter overheated the original living world.
    // Opacity describes the whole reduced column, not repeated opaque layers.
    const column = infraredColumn(
        emitted,
        kelvin,
        0.76 + cover * 0.2,
        atmosphericAbsorption,
      ),
      returned = column.returned;
    const radiated = emitted - returned;
    recordRadiation(
      world,
      absorbed,
      emitted,
      returned,
      tile.temperature,
      column.temperatureK,
    );
    world.entropy.solarIn += radiationEntropy(
      atmosphericAbsorption,
      STAR.temperature,
    );
    const geothermal =
      world.chunks[Math.floor(i / CHUNK_SIZE ** 2)].geology.heatFlux *
      LAWS.tileArea *
      3.6;
    const heatCapacity = thermalCapacity(tile);
    tile.temperature += (absorbed - radiated + geothermal) / heatCapacity;
    exchangeRegionalHeat(world, tile);
    world.climate.solarInput += absorbed + atmosphericAbsorption;
    world.climate.thermalOutput += column.escaped;
    world.climate.geothermalInput += geothermal;
    const saturation = saturationVapor(tile.temperature);
    // Evaporation is limited by water, atmospheric deficit, and surface heat.
    const evaporated = Math.min(
      tile.water,
      Math.max(0, saturation - air.vapor) * 0.035,
      Math.max(0, tile.temperature + 12) * 0.7,
    );
    tile.water -= evaporated;
    air.vapor += evaporated;
    tile.temperature -= (evaporated * PLANET.vaporizationHeat) / heatCapacity;
    world.climate.evaporated += evaporated;
    equilibrateCloud(tile, heatCapacity);
    // Droplets fall after the column carries more than its modeled suspension capacity.
    const precipitation = Math.max(0, air.cloud - 8) * 0.28;
    air.cloud -= precipitation;
    air.rain = precipitation / LAWS.tileArea;
    world.climate.precipitated += precipitation;
    if (tile.temperature < 0) {
      air.snow += precipitation;
      tile.temperature += (precipitation * PLANET.fusionHeat) / heatCapacity;
    } else tile.water += precipitation;
    if (tile.temperature > 0 && air.snow > 0) {
      const melt = Math.min(
        air.snow,
        ((tile.temperature * heatCapacity) / PLANET.fusionHeat) * 0.03,
      );
      air.snow -= melt;
      tile.water += melt;
      tile.temperature -= (melt * PLANET.fusionHeat) / heatCapacity;
    }
    if (tile.temperature > 0 && tile.ice > 0) {
      const melt = Math.min(
        tile.ice,
        ((tile.temperature * heatCapacity) / PLANET.fusionHeat) * 0.03,
      );
      tile.ice -= melt;
      tile.water += melt;
      tile.temperature -= (melt * PLANET.fusionHeat) / heatCapacity;
    }
    if (tile.temperature < -0.5 && tile.water > 0) {
      const frozen = Math.min(
        tile.water,
        ((-tile.temperature * heatCapacity) / PLANET.fusionHeat) * 0.02,
      );
      tile.water -= frozen;
      tile.ice += frozen;
      tile.temperature += (frozen * PLANET.fusionHeat) / heatCapacity;
    }
    air.humidity = clamp(air.vapor / saturationVapor(tile.temperature), 0, 2);
    air.pressure =
      (101325 - (tile.temperature - 15) * 12 + air.vapor * 0.015) *
      Math.exp((-Math.max(0, tile.elevation - 0.19) * 600) / 8434);
  }
  const seaPressure = (tile: Tile) =>
    tile.air.pressure *
    Math.exp((Math.max(0, tile.elevation - 0.19) * 600) / 8434);
  for (let i = 0; i < length; i++) {
    const tile = world.tiles[i],
      air = tile.air;
    const circulation = circulations[Math.floor(i / CHUNK_SIZE ** 2)];
    const northIndex = neighbors[i * 4],
      eastIndex = neighbors[i * 4 + 1],
      southIndex = neighbors[i * 4 + 2],
      westIndex = neighbors[i * 4 + 3];
    const north = world.tiles[northIndex],
      east = world.tiles[eastIndex],
      south = world.tiles[southIndex],
      west = world.tiles[westIndex];
    air.windX = clamp(
      air.windX * 0.65 +
        circulation.x * 0.35 +
        (seaPressure(west) - seaPressure(east)) * 0.015,
      -25,
      25,
    );
    air.windY = clamp(
      air.windY * 0.65 +
        circulation.y * 0.35 +
        (seaPressure(north) - seaPressure(south)) * 0.015,
      -25,
      25,
    );
    const bare = 1 - Math.min(1, (tile.plant?.carbon ?? 0) / 45),
      dry = Math.max(0, 1 - tile.water / (LAWS.waterCapacity * 0.65));
    const erosion =
      tile.terrain === "water"
        ? 0
        : Math.min(
            tile.rock,
            0.00015 * (air.windX ** 2 + air.windY ** 2) * bare * dry,
          );
    tile.rock -= erosion;
    displaceSurface(world, tile, -erosion);
    air.dust += erosion;
    world.climate.dustLifted += erosion;
    const flow = (index: number, velocity: number) => {
      const target = world.tiles[index];
      if (target === tile) return;
      const fraction = Math.min(0.22, Math.abs(velocity) * 0.05);
      // Exchange equal air volumes (unresolved turbulent eddies), not just vapor mass.
      // Advecting water into a cell without exporting displaced air creates spurious
      // convergence and runaway latent heating. Heat and aerosols follow the same exchange.
      const vapor = (air.vapor - target.air.vapor) * fraction,
        cloud = (air.cloud - target.air.cloud) * fraction,
        dust = (air.dust - target.air.dust) * fraction;
      const heat = passiveHeat(world, tile, target, 60000 * fraction);
      vaporDelta[i] -= vapor;
      vaporDelta[index] += vapor;
      cloudDelta[i] -= cloud;
      cloudDelta[index] += cloud;
      dustDelta[i] -= dust;
      dustDelta[index] += dust;
      heatDelta[i] -= heat;
      heatDelta[index] += heat;
    };
    flow(air.windX >= 0 ? eastIndex : westIndex, air.windX);
    flow(air.windY >= 0 ? southIndex : northIndex, air.windY);
    const head =
      Math.max(0, tile.elevation - 0.19) * 600 +
      Math.max(
        0,
        tile.water - (tile.terrain === "water" ? 0 : LAWS.waterCapacity),
      ) /
        (LAWS.tileArea * 1000) -
      (tile.terrain === "water" ? air.tide : 0);
    let lower = tile,
      lowerHead = head;
    for (const neighbor of [north, east, south, west]) {
      const nextHead =
        Math.max(0, neighbor.elevation - 0.19) * 600 +
        Math.max(
          0,
          neighbor.water -
            (neighbor.terrain === "water" ? 0 : LAWS.waterCapacity),
        ) /
          (LAWS.tileArea * 1000) -
        (neighbor.terrain === "water" ? neighbor.air.tide : 0);
      if (nextHead < lowerHead) {
        lower = neighbor;
        lowerHead = nextHead;
      }
    }
    if (lower !== tile) {
      const mobile = Math.max(
        0,
        tile.water - (tile.terrain === "water" ? 0 : LAWS.waterCapacity * 0.9),
      );
      const amount = Math.min(
        mobile * 0.08,
        Math.max(0, head - lowerHead) * 300,
      );
      waterDelta[i] -= amount;
      const lowerIndex = tileIndex(world, lower.x, lower.y);
      waterDelta[lowerIndex] += amount;
      const dissolved =
        tile.water > 0 ? (tile.dissolvedOxygen * amount) / tile.water : 0;
      oxygenDelta[i] -= dissolved;
      oxygenDelta[lowerIndex] += dissolved;
      if (amount > 0)
        sediments.push(
          entrainSediment(world, tile, lower, amount, head - lowerHead),
        );
    }
  }
  for (const transfer of sediments) depositSediment(world, transfer);
  // Mixed background vapor exchanges with local columns. Sealed outer edges do not invent water.
  const backgroundShare = world.atmosphere.water / Math.max(1, length),
    dustShare = world.atmosphere.dust / Math.max(1, length);
  for (let i = 0; i < length; i++) {
    const tile = world.tiles[i];
    tile.air.vapor += vaporDelta[i];
    tile.air.cloud += cloudDelta[i];
    tile.water += waterDelta[i];
    tile.dissolvedOxygen += oxygenDelta[i];
    tile.air.dust += dustDelta[i];
    tile.temperature += heatDelta[i] / thermalCapacity(tile);
    const exchange = (backgroundShare - tile.air.vapor) * 0.005;
    tile.air.vapor += exchange;
    accumulateAtmosphere(world, "water", -exchange);
    // The upper atmosphere is a well-mixed global reservoir in this first reduced model.
    // Mixing is wind-dependent; local eddy exchange above follows the wind axes.
    const mixing = Math.min(
      0.08,
      Math.hypot(tile.air.windX, tile.air.windY) * 0.004,
    );
    const dustExchange = (dustShare - tile.air.dust) * mixing;
    tile.air.dust += dustExchange;
    accumulateAtmosphere(world, "dust", -dustExchange);
    const deposited =
      tile.air.dust *
      Math.min(
        0.95,
        0.002 + tile.air.rain * 1.8 + (tile.plant?.carbon ?? 0) * 0.00002,
      );
    tile.air.dust -= deposited;
    addNutrients(tile, ROCK, deposited);
    displaceSurface(world, tile, deposited);
    world.climate.dustDeposited += deposited;
    tile.air.humidity = clamp(
      tile.air.vapor / saturationVapor(tile.temperature),
      0,
      2,
    );
  }
  const home = world.civilizations[0],
    tile = home ? getTile(world, home.x, home.y) : world.tiles[0];
  const weather = tile ? localWeather(tile) : "clear";
  if (weather !== world.weather && world.tick % 24 === 0) {
    recordEvent(world, {
      category: "nature",
      title: `${weather[0].toUpperCase()}${weather.slice(1)} in the commons`,
      detail:
        "Local temperature, water vapor, cloud droplets, and air pressure produced these conditions.",
      x: home?.x,
      y: home?.y,
    });
  }
  world.weather = weather;
}
