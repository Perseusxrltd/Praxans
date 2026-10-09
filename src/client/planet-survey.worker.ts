import { surfaceFields } from "../simulation/surface";
import { NORTH_TILE, SOUTH_TILE } from "../simulation/planet";
import type { GenerationVersion } from "../simulation/types";

export interface SurveyRequest {
  id: number;
  seed: number;
  generationVersion: GenerationVersion;
  x: number;
  y: number;
  spanX: number;
  spanY: number;
  width: number;
  height: number;
}

let current = 0;
self.onmessage = ({ data: request }: MessageEvent<SurveyRequest>) => {
  current = request.id;
  const { id, seed, generationVersion, width, height, x, y, spanX, spanY } =
    request;
  if (width * height > 100_000 || width < 1 || height < 1) return;
  const pixels = new Uint8ClampedArray(width * height * 4);
  let row = 0;
  const work = () => {
    if (current !== id) return;
    const end = Math.min(height, row + 8);
    for (; row < end; row++) {
      const ty = y + ((row + 0.5) / height - 0.5) * spanY;
      for (let col = 0; col < width; col++) {
        const offset = (row * width + col) * 4;
        if (ty < NORTH_TILE || ty > SOUTH_TILE) continue;
        const tx = x + ((col + 0.5) / width - 0.5) * spanX;
        // Fine survey pixels describe the same discrete surface cells as the
        // local world. Sampling never generates organisms or material stocks.
        const f = surfaceFields(
          seed,
          Math.round(tx),
          Math.round(ty),
          generationVersion,
        );
        const wet = Math.max(0, Math.min(1, f.moisture));
        let r: number, g: number, b: number;
        if (f.terrain === "water") {
          const shallow = Math.max(0, Math.min(1, (f.elevation + 0.2) / 0.39));
          r = 13 + shallow * 22;
          g = 39 + shallow * 45;
          b = 56 + shallow * 43;
        } else if (f.terrain === "shore") {
          r = 181;
          g = 171;
          b = 124;
        } else if (f.terrain === "desert") {
          r = 188;
          g = 157;
          b = 103;
        } else if (f.terrain === "tundra") {
          r = 151;
          g = 162;
          b = 144;
        } else {
          const relief = Math.max(
            0,
            Math.min(0.75, (f.elevation - 0.52) * 2.3),
          );
          r = (137 - wet * 86) * (1 - relief) + 178 * relief;
          g = (151 - wet * 40) * (1 - relief) + 169 * relief;
          b = (88 - wet * 26) * (1 - relief) + 145 * relief;
        }
        if (f.temperature < -10 && f.terrain !== "water") {
          r = r * 0.25 + 175;
          g = g * 0.25 + 181;
          b = b * 0.25 + 179;
        }
        pixels[offset] = r;
        pixels[offset + 1] = g;
        pixels[offset + 2] = b;
        pixels[offset + 3] = 255;
      }
    }
    if (row < height) setTimeout(work, 0);
    else {
      const center = surfaceFields(
        seed,
        Math.round(x),
        Math.round(y),
        generationVersion,
      );
      self.postMessage(
        { ...request, pixels, center },
        { transfer: [pixels.buffer] },
      );
    }
  };
  work();
};
