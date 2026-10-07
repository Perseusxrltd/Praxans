import { clamp } from "../simulation/random";
import { surfaceFields, surfaceToTile } from "../simulation/surface";
import { getTile } from "../simulation/terrain";
import type { World } from "../simulation/types";

export const ATLAS_WIDTH = 1024;
export const ATLAS_HEIGHT = 512;

/** Equirectangular overview of the same surface field. Rows run south to north for WebGL. */
export function planetAtlas(world: World): Uint8Array {
  const pixels = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  for (let row = 0; row < ATLAS_HEIGHT; row++)
    for (let col = 0; col < ATLAS_WIDTH; col++) {
      const latitude = ((row + 0.5) / ATLAS_HEIGHT - 0.5) * Math.PI;
      const longitude = ((col + 0.5) / ATLAS_WIDTH - 0.5) * Math.PI * 2;
      const { x, y } = surfaceToTile(latitude, longitude);
      const f =
        getTile(world, x, y) ??
        surfaceFields(world.seed, x, y, world.generationVersion);
      let color: number[];
      if (f.temperature < -7)
        color = f.terrain === "water" ? [166, 194, 193] : [209, 218, 207];
      else if (f.terrain === "water") {
        const shallow = clamp((f.elevation + 0.2) / 0.39, 0, 1);
        color = [12 + shallow * 12, 35 + shallow * 35, 54 + shallow * 34];
      } else if (f.terrain === "shore") color = [155, 148, 104];
      else if (f.terrain === "desert") color = [175, 144, 90];
      else if (f.terrain === "tundra") color = [120, 125, 108];
      else {
        const wet = clamp(f.moisture, 0, 1);
        color = [128 - wet * 87, 130 - wet * 36, 69 - wet * 9];
        const relief = clamp((f.elevation - 0.54) * 1.8, 0, 0.7);
        color = color.map(
          (n, i) => n * (1 - relief) + [168, 157, 133][i] * relief,
        );
      }
      const index = (row * ATLAS_WIDTH + col) * 4;
      for (let channel = 0; channel < 3; channel++)
        pixels[index + channel] = Math.round(color[channel]);
      pixels[index + 3] = 255;
    }
  // At this scale a pixel spans many ecosystems. Filter the field to avoid representing
  // subpixel rivers and clearings as continent-sized checkerboards.
  const filtered = new Uint8Array(pixels.length);
  for (let y = 0; y < ATLAS_HEIGHT; y++)
    for (let x = 0; x < ATLAS_WIDTH; x++) {
      const i = (y * ATLAS_WIDTH + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const sx = (x + dx + ATLAS_WIDTH) % ATLAS_WIDTH,
              sy = Math.max(0, Math.min(ATLAS_HEIGHT - 1, y + dy));
            sum +=
              pixels[(sy * ATLAS_WIDTH + sx) * 4 + channel] *
              (dx === 0 ? 2 : 1) *
              (dy === 0 ? 2 : 1);
          }
        filtered[i + channel] = Math.round(sum / 16);
      }
      filtered[i + 3] = 255;
    }
  return filtered;
}
