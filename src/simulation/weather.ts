import { LAWS } from "./laws";
import { recordEvent } from "./events";
import { recordRadiation, passiveHeat } from "./thermodynamics";
import {
  astronomy,
  cloudCover,
  PLANET,
  saturationVapor,
  prevailingWind,
} from "./planet";
import { ROCK, addNutrients } from "./chemistry";
import { clamp } from "./random";
import { getTile, tileIndex } from "./terrain";
import { CHUNK_SIZE, type Tile, type Weather, type World } from "./types";

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
  const length = world.tiles.length,
    vaporDelta = new Float64Array(length),
    cloudDelta = new Float64Array(length),
    waterDelta = new Float64Array(length),
    oxygenDelta = new Float64Array(length),
    dustDelta = new Float64Array(length),
    heatDelta = new Float64Array(length);
  // One astronomical sample per 320 m region; sub-kilometre sky differences are negligible here.
  const skies = world.chunks.map((c) =>
    astronomy(world.tick, c.x * CHUNK_SIZE + 16, c.y * CHUNK_SIZE + 16),
  );
  for (let i = 0; i < length; i++) {
    const tile = world.tiles[i],
      air = tile.air;
    const sky = skies[Math.floor(i / CHUNK_SIZE ** 2)];
    air.tide = sky.tide;
    const cover = cloudCover(air.cloud),
      snowCover = Math.min(1, air.snow / 300);
    const albedo =
      snowCover * 0.7 +
      (1 - snowCover) *
        (tile.terrain === "water" ? 0.08 : 0.22 - (tile.plant ? 0.04 : 0));
    air.sunlight = sky.irradiance * 0.72 * (1 - cover * 0.65);
    const absorbed = air.sunlight * (1 - albedo) * LAWS.tileArea * 3.6;
    const kelvin = tile.temperature + 273.15;
    const emissionFactor = 0.96 * PLANET.stefanBoltzmann * LAWS.tileArea * 3.6;
    const airKelvin = Math.max(140, kelvin - 14);
    const emitted = emissionFactor * kelvin ** 4;
    const returned = emissionFactor * (0.76 + cover * 0.2) * airKelvin ** 4;
    const radiated = emitted - returned;
    recordRadiation(
      world,
      absorbed,
      emitted,
      returned,
      tile.temperature,
      airKelvin,
    );
    const geothermal =
      world.chunks[Math.floor(i / CHUNK_SIZE ** 2)].geology.heatFlux *
      LAWS.tileArea *
      3.6;
    const heatCapacity = 105000 + tile.water * PLANET.waterHeatCapacity;
    tile.temperature += (absorbed - radiated + geothermal) / heatCapacity;
    world.climate.solarInput += absorbed;
    world.climate.thermalOutput += radiated;
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
    if (tile.temperature < -0.5 && tile.water > 0) {
      const frozen = Math.min(
        tile.water,
        ((-tile.temperature * heatCapacity) / PLANET.fusionHeat) * 0.02,
      );
      tile.water -= frozen;
      air.snow += frozen;
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
    const circulation = prevailingWind(
      skies[Math.floor(i / CHUNK_SIZE ** 2)].latitude,
    );
    const north = getTile(world, tile.x, tile.y - 1) ?? tile,
      east = getTile(world, tile.x + 1, tile.y) ?? tile,
      south = getTile(world, tile.x, tile.y + 1) ?? tile,
      west = getTile(world, tile.x - 1, tile.y) ?? tile;
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
    air.dust += erosion;
    world.climate.dustLifted += erosion;
    const flow = (target: Tile, velocity: number) => {
      if (target === tile) return;
      const index = tileIndex(world, target.x, target.y),
        fraction = Math.min(0.22, Math.abs(velocity) * 0.05);
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
    flow(air.windX >= 0 ? east : west, air.windX);
    flow(air.windY >= 0 ? south : north, air.windY);
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
    }
  }
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
    tile.temperature +=
      heatDelta[i] / (105000 + tile.water * PLANET.waterHeatCapacity);
    const exchange = (backgroundShare - tile.air.vapor) * 0.005;
    tile.air.vapor += exchange;
    world.atmosphere.water -= exchange;
    // The upper atmosphere is a well-mixed global reservoir in this first reduced model.
    // Mixing is wind-dependent; local eddy exchange above follows the wind axes.
    const mixing = Math.min(
      0.08,
      Math.hypot(tile.air.windX, tile.air.windY) * 0.004,
    );
    const dustExchange = (dustShare - tile.air.dust) * mixing;
    tile.air.dust += dustExchange;
    world.atmosphere.dust -= dustExchange;
    const deposited =
      tile.air.dust *
      Math.min(
        0.95,
        0.002 + tile.air.rain * 1.8 + (tile.plant?.carbon ?? 0) * 0.00002,
      );
    tile.air.dust -= deposited;
    addNutrients(tile, ROCK, deposited);
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
