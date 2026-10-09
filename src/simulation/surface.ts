import { clamp, hash, noise } from "./random";
import { plateAt } from "./geology";
import {
  climatePrior,
  surfaceCoordinates,
  wrapX,
  LONGITUDE_TILES,
  PLANET,
} from "./planet";
import type { GenerationVersion, Terrain } from "./types";

// Smooth seeded noise on the sphere makes continents continuous at the date line and poles.
function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const smooth = (n: number) => n * n * (3 - 2 * n);
  const fx = smooth(x - ix),
    fy = smooth(y - iy),
    fz = smooth(z - iz);
  let sum = 0;
  for (let dz = 0; dz <= 1; dz++)
    for (let dy = 0; dy <= 1; dy++)
      for (let dx = 0; dx <= 1; dx++)
        sum +=
          hash(ix + dx, iy + dy, seed ^ Math.imul(iz + dz, 1597334677)) *
          (dx ? fx : 1 - fx) *
          (dy ? fy : 1 - fy) *
          (dz ? fz : 1 - fz);
  return sum;
}
export function continentalElevation(
  seed: number,
  x: number,
  y: number,
): number {
  const { latitude, longitude } = surfaceCoordinates(x, y);
  const v = [
    Math.cos(latitude) * Math.cos(longitude),
    Math.sin(latitude),
    Math.cos(latitude) * Math.sin(longitude),
  ];
  const field =
    noise3(v[0] * 2.4 + 13, v[1] * 2.4 + 7, v[2] * 2.4 + 19, seed + 1801) *
      0.57 +
    noise3(v[0] * 5.1, v[1] * 5.1, v[2] * 5.1, seed + 812) * 0.27 +
    noise3(v[0] * 11.3, v[1] * 11.3, v[2] * 11.3, seed + 480) * 0.11 +
    noise3(v[0] * 27, v[1] * 27, v[2] * 27, seed + 195) * 0.05;
  // The first recorded groups start in an old coastal continent at 45 N, 0 E.
  const angle = Math.acos(
    Math.min(1, Math.max(-1, (v[0] + v[1]) * Math.SQRT1_2)),
  );
  const commons = Math.exp(-((angle / 0.18) ** 4));
  const land = field * (1 - commons) + 0.7 * commons;
  return (
    0.19 +
    (land - 0.55) * 2.5 +
    (noise(x / 210, y / 210, seed + 204) - 0.5) * 0.1
  );
}
export interface SurfaceFields {
  elevation: number;
  moisture: number;
  terrain: Terrain;
  biome: string;
  temperature: number;
}
/** This exact field supplies both the globe atlas and each materialized ecosystem cell. */
export function surfaceFields(
  seed: number,
  x: number,
  y: number,
  generationVersion: GenerationVersion = "planet-1",
): SurfaceFields {
  x = wrapX(x);
  const continental =
    generationVersion === "planet-1"
      ? continentalElevation(seed, x, y)
      : 0.45 +
        (noise(x / 44, y / 44, seed + 801) - 0.5) * 0.55 +
        (noise(x / 12, y / 12, seed) - 0.5) * 0.28;
  // Preserve the original seed field for already established worlds.
  const radial = Math.hypot((x - 40) / 39.2, (y - 32) / 30.1);
  const island =
    0.8 -
    radial * 0.64 +
    (noise(x / 12, y / 12, seed) - 0.5) * 0.42 +
    (noise(x / 5, y / 5, seed + 7) - 0.5) * 0.12;
  const blend = clamp((radial - 1.25) / 0.75, 0, 1);
  const plate = plateAt(seed, x, y);
  const ancientUplift =
    Math.max(0, plate.convergence) *
    Math.exp(-plate.boundaryDistance / 120) *
    0.012;
  let elevation = island * (1 - blend) + (continental + ancientUplift) * blend;
  const nearOrigin = radial < 1.2;
  const riverDistance = nearOrigin
    ? Math.abs(x - (40.8 + Math.sin(y * 0.18) * 3))
    : Math.abs(noise(x / 35, y / 35, seed + 77) - 0.5) * 85;
  if (riverDistance < 0.9 && (nearOrigin ? y > 8 && y < 56 : elevation < 0.65))
    elevation = ((y % 13) + 13) % 13 < 11 ? 0.14 : 0.28;
  const climate = climatePrior(x, y, elevation);
  const moisture = clamp(
    noise(x / 9, y / 9, seed + 40) * 0.4 +
      climate.wetness * 0.8 -
      0.06 +
      (riverDistance < 5 ? 0.18 : 0),
    0.01,
    1,
  );
  let terrain: Terrain =
    elevation < 0.19
      ? "water"
      : elevation < 0.27
        ? "shore"
        : elevation > 0.61
          ? "hill"
          : moisture > 0.71
            ? "forest"
            : "meadow";
  if (riverDistance < 1 && elevation >= 0.19) terrain = "marsh";
  if (terrain !== "water" && terrain !== "shore" && climate.temperature < -2)
    terrain = "tundra";
  else if (terrain !== "water" && terrain !== "shore" && moisture < 0.26)
    terrain = "desert";
  const biome =
    terrain === "water"
      ? "Aquatic"
      : terrain === "desert"
        ? "Dryland"
        : terrain === "tundra"
          ? "Tundra"
          : climate.temperature > 23 && moisture > 0.65
            ? "Tropical woodland"
            : moisture > 0.65
              ? "Temperate woodland"
              : "Temperate grassland";
  const temperature = climate.temperature + 3 - elevation * 2;
  return { elevation, moisture, terrain, biome, temperature };
}

export function surfaceToTile(latitude: number, longitude: number) {
  return {
    x: wrapX((longitude / (Math.PI * 2)) * LONGITUDE_TILES),
    y:
      ((Math.SQRT1_2 - Math.sin(latitude)) * PLANET.radius) /
      (PLANET.tileSide * Math.SQRT1_2),
  };
}
