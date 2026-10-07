import type { World } from "./types";

export function random(world: Pick<World, "rng">): number {
  let t = (world.rng = (world.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function between(world: Pick<World, "rng">, min: number, max: number) {
  return min + random(world) * (max - min);
}
export function pick<T>(world: Pick<World, "rng">, list: readonly T[]): T {
  return list[Math.floor(random(world) * list.length)];
}
export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}
export function hash(x: number, y: number, seed: number): number {
  let value = Math.imul(x + seed, 374761393) + Math.imul(y, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}
export function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  let fx = x - ix,
    fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed),
    b = hash(ix + 1, iy, seed),
    c = hash(ix, iy + 1, seed),
    d = hash(ix + 1, iy + 1, seed);
  return (
    a * (1 - fx) * (1 - fy) +
    b * fx * (1 - fy) +
    c * (1 - fx) * fy +
    d * fx * fy
  );
}
