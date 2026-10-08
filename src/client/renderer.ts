import { FAUNA_BY_ID, floraOf } from "../simulation/life";
import { MATERIALS } from "../simulation/content";
import type { Tile, WorldSnapshot } from "../simulation/types";

export type Selection = {
  type: "civilization" | "citizen" | "structure" | "tile" | "animal";
  id: string;
} | null;
export type Layer = "landscape" | "communities" | "water" | "life";
type Point = { x: number; y: number };
const mix = (a: string, b: string, t: number) => {
  const ca = a.replace("#", ""),
    cb = b.replace("#", "");
  return `rgb(${[0, 2, 4].map((i) => Math.round(parseInt(ca.slice(i, i + 2), 16) * (1 - t) + parseInt(cb.slice(i, i + 2), 16) * t)).join(",")})`;
};
export class WorldRenderer {
  private ctx: CanvasRenderingContext2D;
  private world: WorldSnapshot | null = null;
  private terrainCanvas = document.createElement("canvas");
  private terrainDirty = true;
  private width = 1;
  private height = 1;
  private ratio = 1;
  private camera = { x: 0, y: 0, zoom: 1 };
  private initialized = false;
  private animation = 0;
  private time = 0;
  private drag: Point | null = null;
  private moved = false;
  private layer: Layer = "landscape";
  private selection: Selection = null;
  private hitTargets: {
    selection: NonNullable<Selection>;
    point: Point;
    radius: number;
  }[] = [];
  private resizeObserver: ResizeObserver;
  constructor(
    private canvas: HTMLCanvasElement,
    private select: (selection: Selection) => void,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerCancel);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    window.addEventListener("keydown", this.key);
    const loop = (time: number) => {
      this.time = time;
      this.draw();
      this.animation = requestAnimationFrame(loop);
    };
    this.animation = requestAnimationFrame(loop);
  }
  destroy() {
    cancelAnimationFrame(this.animation);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerup", this.pointerUp);
    this.canvas.removeEventListener("pointercancel", this.pointerCancel);
    this.canvas.removeEventListener("wheel", this.wheel);
    window.removeEventListener("keydown", this.key);
  }
  update(world: WorldSnapshot) {
    if (
      this.world &&
      (this.world.originX !== world.originX ||
        this.world.originY !== world.originY)
    )
      this.initialized = false;
    if (
      this.world?.tiles !== world.tiles ||
      this.world?.structures !== world.structures
    )
      this.terrainDirty = true;
    this.world = world;
    if (!this.initialized) {
      this.initialized = true;
      this.fit();
    }
  }
  setLayer(layer: Layer) {
    this.layer = layer;
    this.terrainDirty = true;
  }
  setSelection(selection: Selection) {
    this.selection = selection;
  }
  cameraState() {
    return { ...this.camera, width: this.width, height: this.height };
  }
  focus(x: number, y: number) {
    const point = this.projectRaw(x, y);
    this.camera.zoom = Math.max(
      this.camera.zoom,
      this.width < 500 ? 0.95 : 1.35,
    );
    this.camera.x = this.width * 0.5 - point.x * this.camera.zoom;
    this.camera.y = this.height * 0.56 - point.y * this.camera.zoom;
    this.terrainDirty = true;
  }
  zoom(amount: number) {
    const previous = this.camera.zoom;
    this.camera.zoom = Math.max(0.42, Math.min(3.2, this.camera.zoom * amount));
    const scale = this.camera.zoom / previous;
    this.camera.x = this.width / 2 + (this.camera.x - this.width / 2) * scale;
    this.camera.y = this.height / 2 + (this.camera.y - this.height / 2) * scale;
    this.terrainDirty = true;
  }
  fit() {
    if (!this.world) return;
    const visible = this.world.civilizations.filter(
      (c) =>
        c.x >= this.world!.originX &&
        c.y >= this.world!.originY &&
        c.x < this.world!.originX + this.world!.width &&
        c.y < this.world!.originY + this.world!.height,
    );
    const center = visible.length
      ? {
          x: visible.reduce((s, c) => s + c.x, 0) / visible.length,
          y: visible.reduce((s, c) => s + c.y, 0) / visible.length,
        }
      : { x: this.world.originX + 48, y: this.world.originY + 48 };
    const points = this.world.tiles
      .filter(
        (t) =>
          t.terrain !== "water" &&
          t.terrain !== "unknown" &&
          Math.hypot(t.x - center.x, t.y - center.y) < 40,
      )
      .map((t) => this.projectRaw(t.x, t.y));
    if (!points.length) return;
    const minX = Math.min(...points.map((p) => p.x)),
      maxX = Math.max(...points.map((p) => p.x)),
      minY = Math.min(...points.map((p) => p.y)),
      maxY = Math.max(...points.map((p) => p.y));
    this.camera.zoom = Math.min(
      (this.width * 0.93) / (maxX - minX),
      (this.height * 0.78) / (maxY - minY),
    );
    this.camera.x = this.width * 0.5 - ((minX + maxX) / 2) * this.camera.zoom;
    this.camera.y = this.height * 0.54 - ((minY + maxY) / 2) * this.camera.zoom;
    this.terrainDirty = true;
  }
  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.terrainCanvas.width = this.canvas.width;
    this.terrainCanvas.height = this.canvas.height;
    if (this.initialized) this.fit();
    this.terrainDirty = true;
  }
  private projectRaw(x: number, y: number, z = 0): Point {
    const world = this.world;
    const floorX = Math.floor(x),
      floorY = Math.floor(y),
      fx = x - floorX,
      fy = y - floorY;
    const elevation = (dx: number, dy: number) => {
      if (
        !world ||
        floorX + dx < world.originX ||
        floorX + dx >= world.originX + world.width ||
        floorY + dy < world.originY ||
        floorY + dy >= world.originY + world.height
      )
        return 0;
      const tile =
        world.tiles[
          (floorY + dy - world.originY) * world.width +
            floorX +
            dx -
            world.originX
        ];
      return tile.terrain !== "water" && tile.terrain !== "unknown"
        ? Math.max(0, tile.elevation - 0.19) * 34
        : 0;
    };
    const height =
      elevation(0, 0) * (1 - fx) * (1 - fy) +
      elevation(1, 0) * fx * (1 - fy) +
      elevation(0, 1) * (1 - fx) * fy +
      elevation(1, 1) * fx * fy;
    return { x: (x - y) * 10, y: (x + y) * 5 - height - z };
  }
  screenPoint(x: number, y: number, z = 0): Point {
    const p = this.projectRaw(x, y, z);
    return {
      x: p.x * this.camera.zoom + this.camera.x,
      y: p.y * this.camera.zoom + this.camera.y,
    };
  }
  private polygon(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    fill: string,
    stroke?: string,
  ) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.45;
      ctx.stroke();
    }
  }
  private diamond(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    fill: string,
    h = 5,
  ) {
    this.polygon(
      ctx,
      [
        { x, y: y - h },
        { x: x + 10.2, y },
        { x, y: y + h },
        { x: x - 10.2, y },
      ],
      fill,
    );
  }
  private drawTree(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    variation: number,
  ) {
    ctx.fillStyle = "#60735425";
    ctx.beginPath();
    ctx.ellipse(
      x + size * 0.3,
      y + 1,
      size * 0.6,
      size * 0.22,
      -0.15,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.strokeStyle = "#7f7554";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - size * 0.85);
    ctx.stroke();
    if (variation < 0.36) {
      for (let i = 0; i < 3; i++) {
        const base = y - size * (0.15 + i * 0.27),
          span = size * (0.48 - i * 0.08);
        this.polygon(
          ctx,
          [
            { x, y: base - size * 0.65 },
            { x: x + span, y: base },
            { x: x - span, y: base },
          ],
          ["#739269", "#81a16f", "#91ad7d"][i],
        );
        this.polygon(
          ctx,
          [
            { x, y: base - size * 0.65 },
            { x: x + span, y: base },
            { x, y: base - size * 0.06 },
          ],
          "#57795b44",
        );
      }
    } else {
      const center = y - size * 0.65;
      ctx.fillStyle = variation > 0.83 ? "#a8b676" : "#91aa76";
      ctx.beginPath();
      ctx.ellipse(x, center, size * 0.54, size * 0.63, -0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#577e543e";
      ctx.beginPath();
      ctx.ellipse(
        x + size * 0.19,
        center + size * 0.16,
        size * 0.34,
        size * 0.43,
        0.35,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = "#c8d49469";
      ctx.beginPath();
      ctx.ellipse(
        x - size * 0.18,
        center - size * 0.25,
        size * 0.28,
        size * 0.32,
        0.2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  private drawTerrain() {
    const world = this.world;
    if (!world) return;
    const ctx = this.terrainCanvas.getContext("2d")!;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    const tiles = [...world.tiles].sort((a, b) => a.x + a.y - b.x - b.y);
    for (const tile of tiles) {
      if (tile.terrain === "water" || tile.terrain === "unknown") continue;
      const p = this.projectRaw(tile.x, tile.y),
        variation = tile.variation;
      let fill =
        tile.terrain === "shore"
          ? mix("#d5ceab", "#e3ddbe", variation)
          : tile.terrain === "hill"
            ? mix("#b8bc99", "#cbd0b1", variation)
            : tile.terrain === "marsh"
              ? "#a6b999"
              : mix("#b6c995", "#d0d6a6", variation);
      if (tile.terrain === "desert")
        fill = mix("#d5c397", "#e1d1ac", variation);
      if (tile.terrain === "tundra")
        fill = mix("#b4bdac", "#d2d7c6", variation);
      if (tile.terrain === "forest")
        fill = mix("#a0b98b", "#b3c59b", variation);
      if (this.layer === "water")
        fill = mix("#e5d7b4", "#69a7aa", Math.min(tile.moisture, 1));
      if (this.layer === "life")
        fill = mix(
          "#d8d8c4",
          "#60946d",
          Math.min(
            ((tile.plant?.carbon ?? 0) + (tile.groundcover?.carbon ?? 0)) / 100,
            1,
          ),
        );
      if (this.layer === "communities" && tile.owner) {
        const civ = world.civilizations.find((c) => c.id === tile.owner);
        if (civ)
          fill = mix(fill.startsWith("#") ? fill : "#c5cda4", civ.accent, 0.72);
      }
      const neighbor =
        world.tiles[
          (tile.y + 1 - world.originY) * world.width + tile.x - world.originX
        ];
      if (!neighbor || neighbor.terrain === "water")
        this.polygon(
          ctx,
          [
            { x: p.x - 10, y: p.y },
            { x: p.x, y: p.y + 5 },
            { x: p.x, y: p.y + 9 },
            { x: p.x - 10, y: p.y + 4 },
          ],
          "#b6b694",
        );
      const right =
        world.tiles[
          (tile.y - world.originY) * world.width + tile.x + 1 - world.originX
        ];
      if (!right || right.terrain === "water")
        this.polygon(
          ctx,
          [
            { x: p.x, y: p.y + 5 },
            { x: p.x + 10, y: p.y },
            { x: p.x + 10, y: p.y + 4 },
            { x: p.x, y: p.y + 9 },
          ],
          "#a3af93",
        );
      this.polygon(
        ctx,
        [
          this.projectRaw(tile.x - 0.5, tile.y - 0.5),
          this.projectRaw(tile.x + 0.5, tile.y - 0.5),
          this.projectRaw(tile.x + 0.5, tile.y + 0.5),
          this.projectRaw(tile.x - 0.5, tile.y + 0.5),
        ],
        fill,
        fill,
      );
      if (tile.road > 0.035) {
        ctx.globalAlpha = Math.min(0.6, tile.road + 0.15);
        this.diamond(ctx, p.x, p.y + 0.5, "#d6c4a0", 1.5);
        ctx.globalAlpha = 1;
      }
      if (tile.owner && this.layer === "communities") {
        const civ = world.civilizations.find((c) => c.id === tile.owner);
        ctx.strokeStyle = civ?.color ?? "#6f8b70";
        ctx.lineWidth = 1;
        const offsets = [
          [1, 0, 0, 5, 10, 0],
          [0, 1, -10, 0, 0, 5],
          [-1, 0, -10, 0, 0, -5],
          [0, -1, 0, -5, 10, 0],
        ];
        for (const [dx, dy, x1, y1, x2, y2] of offsets)
          if (
            world.tiles[
              (tile.y + dy - world.originY) * world.width +
                tile.x +
                dx -
                world.originX
            ]?.owner !== tile.owner
          ) {
            ctx.beginPath();
            ctx.moveTo(p.x + x1, p.y + y1);
            ctx.lineTo(p.x + x2, p.y + y2);
            ctx.stroke();
          }
      }
      if (tile.terrain === "hill" && variation > 0.62 && tile.rock > 25) {
        this.polygon(
          ctx,
          [
            { x: p.x - 4, y: p.y + 1 },
            { x: p.x - 1, y: p.y - 6 },
            { x: p.x + 4, y: p.y - 3 },
            { x: p.x + 5, y: p.y + 2 },
          ],
          "#a2ab97",
        );
        this.polygon(
          ctx,
          [
            { x: p.x - 1, y: p.y - 6 },
            { x: p.x + 4, y: p.y - 3 },
            { x: p.x, y: p.y + 1 },
            { x: p.x - 4, y: p.y + 1 },
          ],
          "#d0d3bb",
        );
      }
      if (
        this.layer !== "water" &&
        this.layer !== "life" &&
        tile.trees > 0.35 &&
        variation < Math.min(0.82, tile.trees * 0.4)
      )
        this.drawTree(
          ctx,
          p.x + (variation - 0.5) * 5,
          p.y,
          9 + Math.min(tile.trees, 3) * 3,
          variation,
        );
      else if (
        tile.plant &&
        tile.forage > 4 &&
        variation > 0.52 &&
        this.layer === "landscape"
      ) {
        ctx.strokeStyle = variation > 0.9 ? "#baac70" : "#8fac73";
        ctx.lineWidth = 0.75;
        for (let i = 0; i < 3; i++) {
          const x = p.x - 3 + i * 2;
          ctx.beginPath();
          ctx.moveTo(x, p.y + 1);
          ctx.lineTo(x - 1, p.y - 2);
          ctx.moveTo(x, p.y);
          ctx.lineTo(x + 1, p.y - 3);
          ctx.stroke();
        }
      }
    }
    for (const civ of world.civilizations) {
      const p = this.projectRaw(civ.x, civ.y);
      ctx.fillStyle = "#d9cbab";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 17, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#82917477";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 18, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#746b50";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x + 9, p.y);
      ctx.lineTo(p.x + 9, p.y - 19);
      ctx.stroke();
      this.polygon(
        ctx,
        [
          { x: p.x + 9, y: p.y - 19 },
          { x: p.x + 19, y: p.y - 16 },
          { x: p.x + 9, y: p.y - 12 },
        ],
        civ.color,
      );
    }
    for (const structure of [...world.structures].sort(
      (a, b) => a.x + a.y - b.x - b.y,
    )) {
      const center = this.projectRaw(structure.x, structure.y);
      const progress = Math.max(0.08, structure.progress);
      for (const [partIndex, part] of [...structure.design.components]
        .sort((a, b) => a.z - b.z)
        .entries()) {
        const s = 5,
          x =
            center.x +
            (part.x - part.y) * s +
            (structure.collapsed ? Math.sin(partIndex * 3) * 4 : 0),
          y =
            center.y +
            (part.x + part.y) * s * 0.5 -
            (structure.collapsed ? 0 : part.z * s);
        const w = part.width * s,
          d = part.depth * s,
          h =
            (structure.collapsed ? Math.min(0.12, part.height) : part.height) *
            s *
            progress,
          c = mix(
            MATERIALS[part.material].color,
            "#7a8070",
            (1 - structure.condition / 100) * 0.6,
          );
        ctx.globalAlpha = structure.progress < 1 ? 0.65 : 1;
        this.polygon(
          ctx,
          [
            { x, y },
            { x: x + w, y: y + w * 0.5 },
            { x: x + w, y: y + w * 0.5 - h },
            { x, y: y - h },
          ],
          mix(c, "#4a5145", 0.17),
        );
        this.polygon(
          ctx,
          [
            { x, y },
            { x: x - d, y: y + d * 0.5 },
            { x: x - d, y: y + d * 0.5 - h },
            { x, y: y - h },
          ],
          mix(c, "#fff4d0", 0.1),
        );
        this.polygon(
          ctx,
          [
            { x, y: y - h },
            { x: x + w, y: y + w * 0.5 - h },
            { x: x + w - d, y: y + (w + d) * 0.5 - h },
            { x: x - d, y: y + d * 0.5 - h },
          ],
          mix(c, "#fff5d4", 0.23),
        );
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    this.terrainDirty = false;
  }
  private draw() {
    const ctx = this.ctx,
      world = this.world;
    if (!world || !this.width) return;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const water = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.6,
      10,
      this.width * 0.5,
      this.height * 0.5,
      this.width * 0.7,
    );
    water.addColorStop(0, "#c9dcd3");
    water.addColorStop(0.7, "#dce5d8");
    water.addColorStop(1, "#edf0e4");
    ctx.fillStyle = water;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeStyle = "#f6f8e870";
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      const x = ((i * 173.7 + this.time * 0.003) % (this.width + 100)) - 50,
        y = (i * 83.3) % this.height;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 12, y - 3, x + 27, y);
      ctx.stroke();
    }
    if (this.terrainDirty) this.drawTerrain();
    ctx.drawImage(this.terrainCanvas, 0, 0, this.width, this.height);
    this.hitTargets = [];
    for (const structure of world.structures) {
      this.hitTargets.push({
        selection: { type: "structure", id: structure.id },
        point: this.screenPoint(structure.x, structure.y, 7),
        radius: 12,
      });
    }
    for (const animal of world.animals) {
      if (
        animal.x < world.originX ||
        animal.y < world.originY ||
        animal.x >= world.originX + world.width ||
        animal.y >= world.originY + world.height
      )
        continue;
      const species = FAUNA_BY_ID[animal.species],
        p = this.screenPoint(
          animal.x,
          animal.y,
          species.habitat === "air" ? 9 : 0,
        );
      const scale = Math.max(0.7, this.camera.zoom),
        size = species.dryMass > 1 ? 3 : species.dryMass > 0.001 ? 2 : 1.5;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(scale, scale);
      ctx.strokeStyle = species.color;
      ctx.fillStyle = species.color;
      ctx.lineWidth = 1;
      if (species.habitat === "air") {
        ctx.beginPath();
        ctx.moveTo(-3, -2);
        ctx.lineTo(0, 0);
        ctx.lineTo(3, -2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, size + 1, size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        if (species.dryMass > 0.1) {
          ctx.beginPath();
          ctx.moveTo(-1, 0);
          ctx.lineTo(-1, 3);
          ctx.moveTo(2, 0);
          ctx.lineTo(2, 3);
          ctx.stroke();
        }
      }
      if (
        this.selection?.type === "animal" &&
        this.selection.id === animal.id
      ) {
        ctx.strokeStyle = "#f4f7de";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      this.hitTargets.push({
        selection: { type: "animal", id: animal.id },
        point: p,
        radius: 6,
      });
    }
    for (const person of [...world.citizens].sort(
      (a, b) => a.x + a.y - b.x - b.y,
    )) {
      const civ = world.civilizations.find((c) => c.id === person.civId)!,
        p = this.screenPoint(person.x, person.y),
        scale = Math.max(0.85, this.camera.zoom),
        small = person.age < 12 ? 0.7 : 1;
      const walk = person.task?.path.length
        ? Math.sin(this.time * 0.012 + person.clothing) * 1.4
        : 0;
      ctx.fillStyle = "#354e3d25";
      ctx.beginPath();
      ctx.ellipse(
        p.x + 1,
        p.y + 1,
        3.5 * scale,
        1.5 * scale,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.strokeStyle = "#555548";
      ctx.lineWidth = scale;
      ctx.beginPath();
      ctx.moveTo(p.x - 1 * scale, p.y - 2 * scale);
      ctx.lineTo(p.x - (1 + walk) * scale, p.y);
      ctx.moveTo(p.x + scale, p.y - 2 * scale);
      ctx.lineTo(p.x + (1 + walk) * scale, p.y);
      ctx.stroke();
      ctx.fillStyle = civ.color;
      ctx.fillRect(
        p.x - 1.9 * scale * small,
        p.y - 6 * scale * small,
        3.8 * scale * small,
        4.8 * scale * small,
      );
      ctx.fillStyle = ["#deb88e", "#b88b66", "#edc9a3", "#cba17c", "#997655"][
        person.clothing
      ];
      ctx.beginPath();
      ctx.arc(
        p.x,
        p.y - 7 * scale * small,
        1.9 * scale * small,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      if (person.cargo) {
        ctx.fillStyle = MATERIALS[person.cargo.material].color;
        ctx.fillRect(
          p.x + 2.4 * scale,
          p.y - 4.8 * scale,
          2.8 * scale,
          2.5 * scale,
        );
      }
      if (
        this.selection?.type === "citizen" &&
        this.selection.id === person.id
      ) {
        ctx.strokeStyle = "#466d52";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 1, 7 * scale, 3 * scale, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      this.hitTargets.push({
        selection: { type: "citizen", id: person.id },
        point: { x: p.x, y: p.y - 4 * scale },
        radius: Math.max(7, 6 * scale),
      });
    }
    for (const caravan of world.caravans) {
      const p = this.screenPoint(caravan.x, caravan.y);
      ctx.fillStyle = "#c6a36f";
      ctx.fillRect(p.x - 4, p.y - 4, 8, 5);
      ctx.fillStyle = "#726b50";
      ctx.beginPath();
      ctx.arc(p.x - 3, p.y + 1, 1.5, 0, Math.PI * 2);
      ctx.arc(p.x + 3, p.y + 1, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const labelBounds: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    }[] = [];
    for (const civ of world.civilizations) {
      const p = this.screenPoint(civ.x, civ.y, 37),
        population = world.citizens.filter(
          (person) => person.civId === civ.id,
        ).length;
      if (
        p.x < -80 ||
        p.x > this.width + 80 ||
        p.y < -30 ||
        p.y > this.height + 30
      )
        continue;
      const selected =
        this.selection?.type === "civilization" && this.selection.id === civ.id;
      ctx.font = '500 11px "Segoe UI", sans-serif';
      const label = `${civ.name}  ·  ${population}`,
        w = ctx.measureText(label).width + 25;
      const anchorY = p.y;
      for (
        let attempt = 0;
        attempt < 8 &&
        labelBounds.some(
          (r) =>
            p.x + w / 2 > r.left - 3 &&
            p.x - w / 2 < r.right + 3 &&
            p.y + 11 > r.top - 3 &&
            p.y - 14 < r.bottom + 3,
        );
        attempt++
      )
        p.y += 28;
      if (p.y !== anchorY) {
        ctx.strokeStyle = "#7e92766e";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, anchorY);
        ctx.lineTo(p.x, p.y - 14);
        ctx.stroke();
      }
      labelBounds.push({
        left: p.x - w / 2,
        right: p.x + w / 2,
        top: p.y - 14,
        bottom: p.y + 11,
      });
      ctx.fillStyle = selected ? "#304f3e" : "#fafbf2ee";
      ctx.shadowColor = "#44543e15";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(p.x - w / 2, p.y - 14, w, 25, 12);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = selected ? "#a9cba6" : civ.color;
      ctx.beginPath();
      ctx.arc(p.x - w / 2 + 11, p.y - 1, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = selected ? "#fbfcf3" : "#3a5142";
      ctx.textAlign = "left";
      ctx.fillText(label, p.x - w / 2 + 19, p.y + 3);
      this.hitTargets.push({
        selection: { type: "civilization", id: civ.id },
        point: { x: p.x, y: p.y - 2 },
        radius: w / 2,
      });
    }
    if (this.selection?.type === "tile") {
      const tile = world.tiles[Number(this.selection.id)];
      if (tile) {
        const p = this.screenPoint(tile.x, tile.y);
        ctx.strokeStyle = "#365c46";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(
          p.x,
          p.y,
          11 * this.camera.zoom,
          5.5 * this.camera.zoom,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }
    // Daylight changes the atmosphere gently; night remains legible to observers.
    if (world.summary.sunlight < 0.03) {
      ctx.fillStyle = "#5c7e9c0b";
      ctx.fillRect(0, 0, this.width, this.height);
    }
    if (world.summary.weather === "rain" || world.summary.weather === "storm") {
      ctx.strokeStyle = "#668f9730";
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 65; i++) {
        const x = (i * 71.1 + this.time * 0.04) % this.width,
          y = (i * 109.1 + this.time * 0.13) % this.height;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + 7);
        ctx.stroke();
      }
    }
  }
  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.canvas.setPointerCapture(event.pointerId);
    this.drag = { x: event.clientX, y: event.clientY };
    this.moved = false;
  };
  private pointerMove = (event: PointerEvent) => {
    if (!this.drag) return;
    const dx = event.clientX - this.drag.x,
      dy = event.clientY - this.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) this.moved = true;
    this.camera.x += dx;
    this.camera.y += dy;
    this.drag = { x: event.clientX, y: event.clientY };
    this.terrainDirty = true;
  };
  private pointerCancel = () => {
    this.drag = null;
  };
  private pointerUp = (event: PointerEvent) => {
    if (!this.drag) return;
    this.drag = null;
    if (this.moved || !this.world) return;
    const rect = this.canvas.getBoundingClientRect(),
      point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const hits = this.hitTargets
      .filter(
        (t) => Math.hypot(t.point.x - point.x, t.point.y - point.y) < t.radius,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.point.x - point.x, a.point.y - point.y) / a.radius -
          Math.hypot(b.point.x - point.x, b.point.y - point.y) / b.radius,
      );
    if (hits[0]) {
      this.select(hits[0].selection);
      return;
    }
    const x = (point.x - this.camera.x) / this.camera.zoom,
      y = (point.y - this.camera.y) / this.camera.zoom;
    const tx = Math.round(x / 20 + y / 10),
      ty = Math.round(y / 10 - x / 20);
    const candidates = this.world.tiles.filter(
      (t) => Math.abs(t.x - tx) < 4 && Math.abs(t.y - ty) < 4,
    );
    candidates.sort((a, b) => {
      const pa = this.screenPoint(a.x, a.y),
        pb = this.screenPoint(b.x, b.y);
      return (
        Math.hypot(pa.x - point.x, pa.y - point.y) -
        Math.hypot(pb.x - point.x, pb.y - point.y)
      );
    });
    if (candidates[0])
      this.select({
        type: "tile",
        id: String(
          (candidates[0].y - this.world.originY) * this.world.width +
            candidates[0].x -
            this.world.originX,
        ),
      });
  };
  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    this.zoom(event.deltaY < 0 ? 1.09 : 1 / 1.09);
  };
  private key = (event: KeyboardEvent) => {
    if (
      (event.target as HTMLElement)?.closest(
        'input,textarea,select,[role="dialog"]',
      )
    )
      return;
    const direction: Record<string, Point> = {
      ArrowLeft: { x: 35, y: 0 },
      ArrowRight: { x: -35, y: 0 },
      ArrowUp: { x: 0, y: 35 },
      ArrowDown: { x: 0, y: -35 },
    };
    if (direction[event.key]) {
      event.preventDefault();
      this.camera.x += direction[event.key].x;
      this.camera.y += direction[event.key].y;
      this.terrainDirty = true;
    }
  };
}
