import type { Component } from "./types";

const capacities = new WeakMap<
  Component[],
  { faces: string; volume: number }
>();

/**
 * Bulk capacity of arbitrary axis-aligned arrangements, including open tops.
 * Sweep upward through exact component faces. Empty volume connected to the
 * exterior at or below the current height cannot retain contents. This catches
 * side gaps, missing floors and stepped spillways without recognizing a recipe.
 * The 32-component assembly bound keeps the transient partition below 65³ cells.
 */
export function enclosedStorageVolume(parts: Component[]): number {
  const faces = parts
    .map((p) => [p.x, p.y, p.z, p.width, p.depth, p.height].join(","))
    .join(";");
  const cached = capacities.get(parts);
  if (cached?.faces === faces) return cached.volume;
  const volume = measureEnclosure(parts);
  capacities.set(parts, { faces, volume });
  return volume;
}

function measureEnclosure(parts: Component[]): number {
  if (parts.length < 4) return 0;
  const face = (value: number) => Math.round(value * 1e9) / 1e9;
  const axis = (
    position: "x" | "y" | "z",
    size: "width" | "depth" | "height",
  ) => {
    const faces = [
      ...new Set(
        parts.flatMap((p) => [face(p[position]), face(p[position] + p[size])]),
      ),
    ].sort((a, b) => a - b);
    return [faces[0] - 1, ...faces, faces.at(-1)! + 1];
  };
  const xs = axis("x", "width"),
    ys = axis("y", "depth"),
    zs = axis("z", "height");
  const nx = xs.length - 1,
    ny = ys.length - 1,
    nz = zs.length - 1,
    plane = nx * ny,
    count = plane * nz;
  const occupied = new Uint8Array(count),
    parents = new Int32Array(count).fill(-1),
    rank = new Uint8Array(count),
    exterior = new Uint8Array(count);
  const index = (x: number, y: number, z: number) => z * plane + y * nx + x;
  for (const part of parts) {
    const x0 = xs.indexOf(face(part.x)),
      x1 = xs.indexOf(face(part.x + part.width));
    const y0 = ys.indexOf(face(part.y)),
      y1 = ys.indexOf(face(part.y + part.depth));
    const z0 = zs.indexOf(face(part.z)),
      z1 = zs.indexOf(face(part.z + part.height));
    for (let z = z0; z < z1; z++)
      for (let y = y0; y < y1; y++)
        occupied.fill(1, index(x0, y, z), index(x1, y, z));
  }
  const root = (node: number) => {
    while (parents[node] !== node) {
      parents[node] = parents[parents[node]];
      node = parents[node];
    }
    return node;
  };
  const join = (a: number, b: number) => {
    if (parents[b] < 0) return;
    a = root(a);
    b = root(b);
    if (a === b) return;
    if (rank[a] < rank[b]) [a, b] = [b, a];
    parents[b] = a;
    exterior[a] |= exterior[b];
    if (rank[a] === rank[b]) rank[a]++;
  };
  let volume = 0;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const node = index(x, y, z);
        if (occupied[node]) continue;
        parents[node] = node;
        exterior[node] = Number(
          z === 0 || x === 0 || y === 0 || x === nx - 1 || y === ny - 1,
        );
        if (x > 0) join(node, node - 1);
        if (y > 0) join(node, node - nx);
        if (z > 0) join(node, node - plane);
      }
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const node = index(x, y, z);
        if (!occupied[node] && !exterior[root(node)])
          volume +=
            (xs[x + 1] - xs[x]) * (ys[y + 1] - ys[y]) * (zs[z + 1] - zs[z]);
      }
  }
  return volume;
}
