import { PLANET, STAR } from "./planet";
import type { Tile, World } from "./types";

export interface EntropyRecord {
  sinceTick: number;
  solarIn: number;
  longwaveOut: number;
  atmosphericReturn: number;
  heatMixing: number;
  metabolicHeat: number;
}
export const THERMODYNAMICS = Object.freeze({
  units: "kilojoules per kelvin (kJ/K)",
  absoluteZeroCelsius: -273.15,
  radiation:
    "Approximate blackbody entropy flow: 4 E / (3 T). Solar, outgoing surface longwave, and implicit atmospheric return are recorded separately.",
  heat: "Passive heat moves from higher to lower temperature. Each pair's finite-capacity exchange produces C1 ln(T1'/T1) + C2 ln(T2'/T2) >= 0; simultaneous local exchanges remain a reduced approximation.",
  metabolism:
    "Respiratory energy becomes heat. Q/T estimates entropy delivered to the thermal surroundings; it is not a complete biochemical reaction entropy.",
  limits:
    "These counters resolve selected flows, not the total entropy of the universe. Chemical mixing, reaction free energies, spectral radiation, and a full thermodynamic atmosphere are not resolved. An open ecosystem can become locally more ordered while exporting entropy.",
});
export const emptyEntropy = (sinceTick = 0): EntropyRecord => ({
  sinceTick,
  solarIn: 0,
  longwaveOut: 0,
  atmosphericReturn: 0,
  heatMixing: 0,
  metabolicHeat: 0,
});
export function kelvin(celsius: number): number {
  const t = celsius + 273.15;
  if (!Number.isFinite(t) || t <= 0)
    throw new Error("Thermal state is at or below absolute zero.");
  return t;
}
export function radiationEntropy(
  energyKJ: number,
  temperatureK: number,
): number {
  if (
    !Number.isFinite(energyKJ) ||
    energyKJ < 0 ||
    !Number.isFinite(temperatureK) ||
    temperatureK <= 0
  )
    throw new Error("Invalid radiative energy or temperature.");
  return (4 * energyKJ) / (3 * temperatureK);
}
export function recordRadiation(
  world: World,
  absorbed: number,
  emitted: number,
  returned: number,
  temperatureC: number,
  airTemperatureK: number,
) {
  world.entropy.solarIn += radiationEntropy(absorbed, STAR.temperature);
  world.entropy.longwaveOut += radiationEntropy(emitted, kelvin(temperatureC));
  world.entropy.atmosphericReturn += radiationEntropy(
    returned,
    airTemperatureK,
  );
}
/** Return signed heat from source to target; no transfer can overshoot pair equilibrium. */
export function passiveHeat(
  world: World,
  source: Tile,
  target: Tile,
  conductance: number,
): number {
  const a = kelvin(source.temperature),
    b = kelvin(target.temperature);
  const ca = 105000 + source.water * PLANET.waterHeatCapacity,
    cb = 105000 + target.water * PLANET.waterHeatCapacity;
  const equilibrium = Math.abs(a - b) / (1 / ca + 1 / cb);
  const heat =
    Math.sign(a - b) *
    Math.min(equilibrium, Math.abs(a - b) * Math.max(0, conductance));
  const produced =
    ca * Math.log1p(-heat / (ca * a)) + cb * Math.log1p(heat / (cb * b));
  world.entropy.heatMixing += Math.max(0, produced);
  return heat;
}
export function dissipatedHeat(
  world: World,
  energyKJ: number,
  temperatureC: number,
): void {
  world.entropy.metabolicHeat += Math.max(0, energyKJ) / kelvin(temperatureC);
}
