import { DAYS_PER_YEAR, HOURS_PER_TICK } from "./types";

export const STAR = Object.freeze({
  name: "Aurea",
  mass: 1.98847e30,
  radius: 6.957e8,
  luminosity: 3.828e26,
  temperature: 5772,
  position: [0, 0, 0] as readonly number[],
});
export const MOON = Object.freeze({
  name: "Iona",
  mass: 7.342e22,
  radius: 1737400,
  semiMajorAxis: 384400000,
  eccentricity: 0.0549,
  inclination: 5.145,
  epochAnomaly: 2.1,
});
export const PLANET = Object.freeze({
  name: "Praxans",
  ageYears: 4.54e9,
  mass: 5.9722e24,
  radius: 6371000,
  semiMajorAxis: 149597870700,
  axialTilt: 23.43928,
  eccentricity: 0.0167,
  yearDays: DAYS_PER_YEAR,
  dayHours: 24,
  solarConstant: 1361,
  stefanBoltzmann: 5.670374419e-8,
  gravitationalConstant: 6.6743e-11,
  tileSide: 10,
  atmosphereHeight: 500,
  waterHeatCapacity: 4.186,
  vaporizationHeat: 2450,
  fusionHeat: 334,
  epoch: "Era 1, northern vernal equinox, prime-meridian midnight",
  coordinates:
    "Heliocentric Cartesian metres; surface uses an equal-area cylindrical projection with a 45° standard parallel, x east and y south. Surface cell area is 100 m².",
  description:
    "An old Earth-sized terrestrial planet around one Sun-like star, with one Moon-like satellite. Epoch terrain, soils, and ecosystems are initial conditions informed by climate and geology; 4.54 billion years are not individually replayed.",
});
const TAU = Math.PI * 2,
  RAD = Math.PI / 180,
  STANDARD = Math.SQRT1_2;
const mod = (value: number, period: number) =>
  ((value % period) + period) % period;
export const LONGITUDE_TILES =
  Math.round((TAU * PLANET.radius * STANDARD) / PLANET.tileSide / 32) * 32;
export const NORTH_TILE =
  Math.ceil(
    ((STANDARD - 1) * PLANET.radius) / (PLANET.tileSide * STANDARD) / 32,
  ) * 32;
export const SOUTH_TILE =
  Math.floor(
    ((STANDARD + 1) * PLANET.radius) / (PLANET.tileSide * STANDARD) / 32,
  ) *
    32 -
  1;
export const wrapX = (x: number) =>
  mod(x + LONGITUDE_TILES / 2, LONGITUDE_TILES) - LONGITUDE_TILES / 2;
export function surfaceCoordinates(
  x: number,
  y: number,
): { latitude: number; longitude: number } {
  return {
    latitude: Math.asin(
      Math.max(
        -1,
        Math.min(
          1,
          STANDARD - (y * PLANET.tileSide * STANDARD) / PLANET.radius,
        ),
      ),
    ),
    longitude: (wrapX(x) / LONGITUDE_TILES) * TAU,
  };
}
const length = (v: readonly number[]) => Math.hypot(...v);
const dot = (a: readonly number[], b: readonly number[]) =>
  a.reduce((s, v, i) => s + v * b[i], 0);
const unit = (v: readonly number[]) => v.map((n) => n / length(v));
const equatorial = (v: readonly number[]) => [
  v[0],
  v[1] * Math.cos(PLANET.axialTilt * RAD) -
    v[2] * Math.sin(PLANET.axialTilt * RAD),
  v[1] * Math.sin(PLANET.axialTilt * RAD) +
    v[2] * Math.cos(PLANET.axialTilt * RAD),
];
function orbit(
  mean: number,
  eccentricity: number,
): { anomaly: number; radius: number } {
  let eccentric = mean;
  for (let i = 0; i < 6; i++)
    eccentric -=
      (eccentric - eccentricity * Math.sin(eccentric) - mean) /
      (1 - eccentricity * Math.cos(eccentric));
  return {
    anomaly:
      2 *
      Math.atan2(
        Math.sqrt(1 + eccentricity) * Math.sin(eccentric / 2),
        Math.sqrt(1 - eccentricity) * Math.cos(eccentric / 2),
      ),
    radius: 1 - eccentricity * Math.cos(eccentric),
  };
}
const EPOCH_ANOMALY = orbit(1.35, PLANET.eccentricity).anomaly;
export const ORBITAL_PERIOD =
  (TAU *
    Math.sqrt(
      PLANET.semiMajorAxis ** 3 /
        (PLANET.gravitationalConstant * (STAR.mass + PLANET.mass)),
    )) /
  86400;
export const LUNAR_PERIOD =
  (TAU *
    Math.sqrt(
      MOON.semiMajorAxis ** 3 /
        (PLANET.gravitationalConstant * (PLANET.mass + MOON.mass)),
    )) /
  86400;
export interface CelestialState {
  starPosition: readonly number[];
  planetPosition: number[];
  moonPosition: number[];
  starDirection: number[];
  moonDirection: number[];
  starDistance: number;
  moonDistance: number;
  rotation: number;
  orbitalPhase: number;
  moonPhase: number;
  moonIllumination: number;
}
let cachedTick = NaN,
  cachedSky: CelestialState;
/** Two Keplerian orbits in a fixed frame. The moon's direction also drives tides and eclipses. */
export function celestialState(tick: number): CelestialState {
  if (tick === cachedTick) return cachedSky;
  const hours = tick * HOURS_PER_TICK,
    phase = hours / (24 * ORBITAL_PERIOD);
  const solar = orbit(phase * TAU + 1.35, PLANET.eccentricity),
    theta = solar.anomaly - EPOCH_ANOMALY + Math.PI;
  const distance = PLANET.semiMajorAxis * solar.radius;
  const position = [Math.cos(theta) * distance, Math.sin(theta) * distance, 0];
  const lunar = orbit(
    (hours / (24 * LUNAR_PERIOD)) * TAU + MOON.epochAnomaly,
    MOON.eccentricity,
  );
  const moonDistance = MOON.semiMajorAxis * lunar.radius;
  const moon = [
    Math.cos(lunar.anomaly) * moonDistance,
    Math.sin(lunar.anomaly) * Math.cos(MOON.inclination * RAD) * moonDistance,
    Math.sin(lunar.anomaly) * Math.sin(MOON.inclination * RAD) * moonDistance,
  ];
  const starDirection = unit(equatorial(position.map((v) => -v))),
    moonDirection = unit(equatorial(moon));
  const moonPhase = mod((lunar.anomaly - theta - Math.PI) / TAU, 1);
  cachedTick = tick;
  cachedSky = {
    starPosition: STAR.position,
    planetPosition: position,
    moonPosition: moon.map((v, i) => v + position[i]),
    starDirection,
    moonDirection,
    starDistance: distance,
    moonDistance,
    rotation: Math.PI + (hours / 24) * TAU + phase * TAU,
    orbitalPhase: mod(phase, 1),
    moonPhase,
    moonIllumination: (1 - dot(starDirection, moonDirection)) / 2,
  };
  return cachedSky;
}
export interface Astronomy {
  latitude: number;
  longitude: number;
  localHour: number;
  declination: number;
  solarAltitude: number;
  irradiance: number;
  daylight: number;
  orbitalPhase: number;
  season: number;
  tide: number;
  moonPhase: number;
  moonIllumination: number;
  eclipse: number;
}
export function astronomy(tick: number, x = 0, y = 0): Astronomy {
  const sky = celestialState(tick),
    { latitude, longitude } = surfaceCoordinates(x, y);
  const rotation = sky.rotation + longitude;
  const normal = [
    Math.cos(latitude) * Math.cos(rotation),
    Math.cos(latitude) * Math.sin(rotation),
    Math.sin(latitude),
  ];
  const sinAltitude = Math.max(-1, Math.min(1, dot(normal, sky.starDirection)));
  const declination = Math.asin(sky.starDirection[2]),
    starRA = Math.atan2(sky.starDirection[1], sky.starDirection[0]);
  const localHour = mod(((rotation - starRA) / TAU) * 24 + 12, 24);
  const daylightCos = -Math.tan(latitude) * Math.tan(declination);
  const daylight =
    daylightCos >= 1
      ? 0
      : daylightCos <= -1
        ? 24
        : (24 / Math.PI) * Math.acos(daylightCos);
  const lunarLocal = unit(
    sky.moonDirection.map(
      (v, i) => v * sky.moonDistance - normal[i] * PLANET.radius,
    ),
  );
  const separation = Math.acos(
    Math.max(-1, Math.min(1, dot(lunarLocal, sky.starDirection))),
  );
  const sunRadius = Math.asin(STAR.radius / sky.starDistance),
    moonRadius = Math.asin(MOON.radius / sky.moonDistance);
  const eclipse =
    sinAltitude > 0 && separation < sunRadius + moonRadius
      ? Math.min(
          1,
          Math.max(0, (sunRadius + moonRadius - separation) / (2 * sunRadius)),
        )
      : 0;
  const p2 = (cosine: number) => (3 * cosine ** 2 - 1) / 2;
  const tidal = (mass: number, distance: number, cosine: number) =>
    ((PLANET.gravitationalConstant * mass * PLANET.radius ** 2) /
      (9.81 * distance ** 3)) *
    p2(cosine);
  return {
    latitude: latitude / RAD,
    longitude: longitude / RAD,
    localHour,
    declination: declination / RAD,
    solarAltitude: Math.asin(sinAltitude) / RAD,
    irradiance:
      ((Math.max(0, sinAltitude) * STAR.luminosity) /
        (4 * Math.PI * sky.starDistance ** 2)) *
      (1 - eclipse),
    daylight,
    orbitalPhase: sky.orbitalPhase,
    season: mod(Math.floor(sky.orbitalPhase * 4) + (latitude < 0 ? 2 : 0), 4),
    tide:
      tidal(MOON.mass, sky.moonDistance, dot(normal, sky.moonDirection)) +
      tidal(STAR.mass, sky.starDistance, sinAltitude),
    moonPhase: sky.moonPhase,
    moonIllumination: sky.moonIllumination,
    eclipse,
  };
}
/** Large-scale circulation prior: equatorial convergence, subtropical subsidence, midlatitude westerlies. Local pressure modifies it. */
export function prevailingWind(latitude: number): { x: number; y: number } {
  const absolute = Math.abs(latitude),
    band = absolute < 30 ? -1 : absolute < 60 ? 1 : -1;
  return {
    x: band * (2 + 3 * Math.sin(absolute * RAD * 3) ** 2),
    y: absolute < 30 ? Math.sign(latitude) * 1.4 : -Math.sign(latitude) * 0.7,
  };
}
export function climatePrior(
  x: number,
  y: number,
  elevation: number,
): { temperature: number; wetness: number } {
  const latitude = surfaceCoordinates(x, y).latitude,
    absolute = Math.abs(latitude / RAD);
  const wetness = Math.max(
    0.08,
    Math.min(
      0.95,
      0.55 +
        0.3 * Math.cos(latitude * 6) -
        0.2 * Math.exp(-(((absolute - 25) / 10) ** 2)),
    ),
  );
  return {
    temperature:
      34 - 45 * Math.sin(latitude) ** 2 - Math.max(0, elevation - 0.19) * 4,
    wetness,
  };
}
/** Saturated water-vapor mass in a 500 m atmospheric column above one tile (Buck). */
export function saturationVapor(temperature: number): number {
  const t = Math.max(-70, Math.min(65, temperature));
  const pressure = 611.21 * Math.exp(((18.678 - t / 234.5) * t) / (257.14 + t));
  return (
    (pressure / (461.5 * (t + 273.15))) *
    PLANET.atmosphereHeight *
    PLANET.tileSide ** 2
  );
}
export const cloudCover = (water: number) =>
  1 - Math.exp(-Math.max(0, water) / 18);
