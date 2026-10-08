import { useEffect, useRef, useState } from "react";
import { ArrowRight, Globe2, Minus, Plus, Scan, Sprout } from "lucide-react";
import { Dialog } from "./Dialog";
import {
  groundDistanceMetres,
  LONGITUDE_TILES,
  NORTH_TILE,
  SOUTH_TILE,
  surfaceCoordinates,
  wrapX,
} from "../simulation/planet";
import type {
  Civilization,
  GenerationVersion,
  WorldSnapshot,
} from "../simulation/types";
import type { SurfaceFields } from "../simulation/surface";
import type { SurveyRequest } from "./planet-survey.worker";
import "./explorer.css";

type Camera = { x: number; y: number; tilesPerPixel: number };
type Texture = SurveyRequest & {
  image: HTMLCanvasElement;
  center: SurfaceFields;
};
const distanceLabel = (metres: number) =>
  metres >= 1000
    ? `${(metres / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`
    : `${metres.toLocaleString(undefined, { maximumFractionDigits: 1 })} m`;

export function PlanetExplorer({
  world,
  close,
  visit,
}: {
  world: WorldSnapshot;
  close: () => void;
  visit: (civilization: Civilization) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(world);
  latest.current = world;
  const controls = useRef<{
    zoom: (factor: number) => void;
    level: (level: string) => void;
    locate: (c: Civilization) => void;
  } | null>(null);
  const [view, setView] = useState({
    latitude: "0°",
    longitude: "0°",
    distance: "",
    scale: "Planet",
    biome: "",
    pending: true,
    detail: false,
  });
  const [selected, setSelected] = useState<Civilization | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext("2d")!;
    const abort = new AbortController();
    let width = 1,
      height = 1,
      ratio = 1,
      revision = 0,
      frame = 0,
      timer = 0,
      disposed = false;
    let generation: GenerationVersion | undefined;
    let worker: Worker | undefined;
    let texture: Texture | undefined;
    const cache: Texture[] = [];
    const camera: Camera = {
      x: 0,
      y: (NORTH_TILE + SOUTH_TILE) / 2,
      tilesPerPixel: LONGITUDE_TILES,
    };
    const pointers = new Map<number, { x: number; y: number }>();
    let dragged = false;
    const maxScale = () =>
      Math.max(
        LONGITUDE_TILES / width,
        (SOUTH_TILE - NORTH_TILE + 1) / height,
      ) * 1.08;
    const normalize = () => {
      camera.x = wrapX(camera.x);
      camera.y = Math.max(NORTH_TILE, Math.min(SOUTH_TILE, camera.y));
      camera.tilesPerPixel = Math.max(
        0.025,
        Math.min(maxScale(), camera.tilesPerPixel),
      );
    };
    const project = (x: number, y: number) => ({
      x: width / 2 + wrapX(x - camera.x) / camera.tilesPerPixel,
      y: height / 2 + (y - camera.y) / camera.tilesPerPixel,
    });
    const paint = () => {
      frame = 0;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = "#102c37";
      context.fillRect(0, 0, width, height);
      if (texture) {
        const p = project(texture.x, texture.y);
        context.imageSmoothingEnabled = camera.tilesPerPixel > 0.15;
        context.drawImage(
          texture.image,
          p.x - texture.spanX / camera.tilesPerPixel / 2,
          p.y - texture.spanY / camera.tilesPerPixel / 2,
          texture.spanX / camera.tilesPerPixel,
          texture.spanY / camera.tilesPerPixel,
        );
      }
      if (camera.tilesPerPixel < 0.18) {
        context.strokeStyle = "#e5edd822";
        context.lineWidth = 0.5;
        const minX = Math.floor(camera.x - (width * camera.tilesPerPixel) / 2),
          minY = Math.floor(camera.y - (height * camera.tilesPerPixel) / 2);
        context.beginPath();
        for (let x = minX; x < minX + width * camera.tilesPerPixel + 2; x++) {
          const sx = width / 2 + (x + 0.5 - camera.x) / camera.tilesPerPixel;
          context.moveTo(sx, 0);
          context.lineTo(sx, height);
        }
        for (let y = minY; y < minY + height * camera.tilesPerPixel + 2; y++) {
          const sy = height / 2 + (y + 0.5 - camera.y) / camera.tilesPerPixel;
          context.moveTo(0, sy);
          context.lineTo(width, sy);
        }
        context.stroke();
      }
      const clusters = new Map<
        string,
        { x: number; y: number; communities: Civilization[] }
      >();
      for (const civ of latest.current.civilizations) {
        const point = project(civ.x, civ.y);
        if (
          point.x < -20 ||
          point.y < -20 ||
          point.x > width + 20 ||
          point.y > height + 20
        )
          continue;
        const key = `${Math.round(point.x / 24)},${Math.round(point.y / 24)}`;
        const cluster = clusters.get(key) ?? { ...point, communities: [] };
        cluster.communities.push(civ);
        clusters.set(key, cluster);
      }
      for (const point of clusters.values()) {
        context.fillStyle = "#ebefce";
        context.strokeStyle = "#263f3e";
        context.lineWidth = 2;
        context.beginPath();
        context.arc(point.x, point.y, 5, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        const label =
          point.communities.length === 1
            ? point.communities[0].name
            : `${point.communities.length} communities`;
        context.font = '500 11px "Segoe UI", sans-serif';
        const size = context.measureText(label).width + 18;
        context.fillStyle = "#102c37df";
        context.beginPath();
        context.roundRect(point.x + 10, point.y - 13, size, 26, 13);
        context.fill();
        context.fillStyle = "#f0f1db";
        context.textAlign = "left";
        context.fillText(label, point.x + 19, point.y + 4);
      }
      context.strokeStyle = "#f0efd49c";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(width / 2 - 9, height / 2);
      context.lineTo(width / 2 + 9, height / 2);
      context.moveTo(width / 2, height / 2 - 9);
      context.lineTo(width / 2, height / 2 + 9);
      context.stroke();
      const coordinate = surfaceCoordinates(camera.x, camera.y);
      const metres = groundDistanceMetres(camera, {
        x: camera.x + 100 * camera.tilesPerPixel,
        y: camera.y,
      });
      const span = width * camera.tilesPerPixel;
      const scale =
        span > 500_000
          ? "Planet"
          : span > 20_000
            ? "Continent"
            : span > 1000
              ? "Region"
              : "Ground";
      const pending =
        !texture ||
        texture.id !== revision ||
        texture.x !== camera.x ||
        texture.y !== camera.y ||
        texture.spanX !== width * camera.tilesPerPixel ||
        texture.spanY !== height * camera.tilesPerPixel;
      setView({
        latitude: `${Math.abs((coordinate.latitude * 180) / Math.PI).toFixed(4)}° ${coordinate.latitude >= 0 ? "N" : "S"}`,
        longitude: `${Math.abs((coordinate.longitude * 180) / Math.PI).toFixed(4)}° ${coordinate.longitude >= 0 ? "E" : "W"}`,
        distance: distanceLabel(metres),
        scale,
        biome: pending ? "" : (texture?.center.biome ?? ""),
        pending,
        detail: camera.tilesPerPixel < 0.18,
      });
      element.dataset.exploration = JSON.stringify({
        ...camera,
        scale,
        pending,
        textures: cache.length,
        pixels: element.width * element.height,
        sampledPixels: texture ? texture.width * texture.height : 0,
      });
    };
    const redraw = () => {
      if (!frame && !document.hidden) frame = requestAnimationFrame(paint);
    };
    const request = () => {
      if (!generation || !worker || disposed) return;
      const aspect = width / height;
      const sampleWidth = Math.max(
        1,
        Math.floor(Math.min(512, Math.sqrt(98_304 * aspect))),
      );
      const sampleHeight = Math.max(
        1,
        Math.floor(Math.min(384, 98_304 / sampleWidth)),
      );
      const data: SurveyRequest = {
        id: ++revision,
        seed: latest.current.seed,
        generationVersion: generation,
        x: camera.x,
        y: camera.y,
        spanX: width * camera.tilesPerPixel,
        spanY: height * camera.tilesPerPixel,
        width: sampleWidth,
        height: sampleHeight,
      };
      const found = cache.find(
        (entry) =>
          entry.x === data.x &&
          entry.y === data.y &&
          entry.spanX === data.spanX &&
          entry.spanY === data.spanY,
      );
      if (found) {
        texture = { ...found, id: revision };
        redraw();
        return;
      }
      worker.postMessage(data);
      redraw();
    };
    const changed = () => {
      normalize();
      redraw();
      window.clearTimeout(timer);
      timer = window.setTimeout(request, 120);
    };
    const zoom = (factor: number, x = width / 2, y = height / 2) => {
      const before = camera.tilesPerPixel;
      camera.tilesPerPixel = Math.max(
        0.025,
        Math.min(maxScale(), before / factor),
      );
      camera.x += (x - width / 2) * (before - camera.tilesPerPixel);
      camera.y += (y - height / 2) * (before - camera.tilesPerPixel);
      changed();
    };
    const localPoint = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      element.focus();
      element.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, localPoint(event));
      dragged = false;
    };
    const move = (event: PointerEvent) => {
      const old = pointers.get(event.pointerId);
      if (!old) return;
      const before = [...pointers.values()];
      const next = localPoint(event);
      pointers.set(event.pointerId, next);
      if (Math.hypot(next.x - old.x, next.y - old.y) > 2) dragged = true;
      if (pointers.size === 2) {
        const after = [...pointers.values()];
        const previousLength = Math.hypot(
          before[0].x - before[1].x,
          before[0].y - before[1].y,
        );
        const nextLength = Math.hypot(
          after[0].x - after[1].x,
          after[0].y - after[1].y,
        );
        if (previousLength > 2 && nextLength > 2)
          zoom(
            nextLength / previousLength,
            (after[0].x + after[1].x) / 2,
            (after[0].y + after[1].y) / 2,
          );
      }
      camera.x -= ((next.x - old.x) * camera.tilesPerPixel) / pointers.size;
      camera.y -= ((next.y - old.y) * camera.tilesPerPixel) / pointers.size;
      changed();
    };
    const up = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (event.type === "pointerup" && !dragged) {
        const point = localPoint(event);
        const nearby = latest.current.civilizations
          .map((c) => ({ c, point: project(c.x, c.y) }))
          .find(
            (p) => Math.hypot(p.point.x - point.x, p.point.y - point.y) < 18,
          );
        if (nearby) {
          setSelected(nearby.c);
          camera.x = nearby.c.x;
          camera.y = nearby.c.y;
          camera.tilesPerPixel = 0.6;
          changed();
        }
      }
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoom(
        Math.exp(-Math.max(-300, Math.min(300, event.deltaY)) * 0.003),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    const key = (event: KeyboardEvent) => {
      const shifts: Record<string, [number, number]> = {
        ArrowLeft: [-60, 0],
        ArrowRight: [60, 0],
        ArrowUp: [0, -60],
        ArrowDown: [0, 60],
      };
      if (shifts[event.key]) {
        event.preventDefault();
        camera.x += shifts[event.key][0] * camera.tilesPerPixel;
        camera.y += shifts[event.key][1] * camera.tilesPerPixel;
        changed();
      } else if (event.key === "+" || event.key === "=") zoom(2);
      else if (event.key === "-") zoom(0.5);
    };
    controls.current = {
      zoom,
      level: (level) => {
        if (level === "Planet") {
          camera.x = 0;
          camera.y = (NORTH_TILE + SOUTH_TILE) / 2;
          camera.tilesPerPixel = maxScale();
        } else
          camera.tilesPerPixel =
            level === "Continent" ? 250 : level === "Region" ? 8 : 0.08;
        changed();
      },
      locate: (c) => {
        camera.x = c.x;
        camera.y = c.y;
        camera.tilesPerPixel = 0.7;
        setSelected(c);
        changed();
      },
    };
    let sized = false;
    const resize = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      ratio = Math.min(
        window.devicePixelRatio || 1,
        1.5,
        Math.sqrt(1_500_000 / (width * height)),
      );
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      if (!sized) {
        camera.tilesPerPixel = maxScale();
        sized = true;
      }
      changed();
    });
    resize.observe(element);
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", redraw);
    void fetch("/api/planet", { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "The planetary survey is unavailable. You can still watch the communities.",
          );
        const data = await response.json();
        if (
          data.generationVersion !== "planet-1" &&
          data.generationVersion !== "archipelago-1"
        )
          throw new Error(
            "This world's terrain survey is not supported by this observer yet.",
          );
        if (disposed) return;
        generation = data.generationVersion;
        worker = new Worker(
          new URL("./planet-survey.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onerror = () => {
          if (!disposed)
            setError(
              "Terrain detail could not load in this browser. Community observation is still available.",
            );
        };
        worker.onmessage = ({
          data,
        }: MessageEvent<
          SurveyRequest & { pixels: Uint8ClampedArray; center: SurfaceFields }
        >) => {
          if (disposed || data.id !== revision) return;
          const image = document.createElement("canvas");
          image.width = data.width;
          image.height = data.height;
          image
            .getContext("2d")!
            .putImageData(
              new ImageData(
                new Uint8ClampedArray(data.pixels),
                data.width,
                data.height,
              ),
              0,
              0,
            );
          texture = { ...data, image };
          cache.push(texture);
          if (cache.length > 3) cache.shift();
          redraw();
        };
        request();
      })
      .catch((err: Error) => {
        if (!disposed && err.name !== "AbortError") setError(err.message);
      });
    return () => {
      disposed = true;
      abort.abort();
      worker?.terminate();
      resize.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      controls.current = null;
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", redraw);
    };
  }, [world.id, world.seed]);
  return (
    <Dialog
      title="An entire world to explore."
      eyebrow="PRAXANS · PLANETARY SURVEY"
      close={close}
      wide
    >
      <div className="planet-explorer">
        <div className="survey-levels" aria-label="Exploration scale">
          {["Planet", "Continent", "Region", "Ground"].map((level) => (
            <button
              key={level}
              onClick={() => controls.current?.level(level)}
              aria-pressed={view.scale === level}
            >
              {level}
            </button>
          ))}
          <span>Drag · scroll · pinch</span>
        </div>
        <div className="survey-stage">
          <canvas
            ref={canvas}
            tabIndex={0}
            aria-label="Explore the entire planet. Drag or use arrow keys to pan, scroll or pinch to zoom from continents to surface cells."
          />
          <div className="survey-place">
            <Globe2 size={15} />
            <span>
              {view.latitude}
              <br />
              {view.longitude}
            </span>
          </div>
          <div className="survey-scale">
            <i />
            {view.distance || "Locating…"}
            <small>at the centre</small>
          </div>
          <div className="survey-zoom">
            <button
              aria-label="Zoom into planet"
              onClick={() => controls.current?.zoom(2)}
            >
              <Plus size={18} />
            </button>
            <button
              aria-label="Zoom out of planet"
              onClick={() => controls.current?.zoom(0.5)}
            >
              <Minus size={18} />
            </button>
          </div>
          <div className="survey-caption">
            <Scan size={14} />
            {error ||
              (view.pending
                ? "Resolving the landscape…"
                : view.detail
                  ? `${view.biome} · 100 m² surface cells`
                  : view.biome || "The whole planet")}
          </div>
        </div>
        <div className="survey-footer">
          <p>
            Geography across the planet. Visit a community to follow its living
            ecosystem and inspect people, materials, and structures.
          </p>
          {selected && (
            <button className="survey-visit" onClick={() => visit(selected)}>
              Watch {selected.name}
              <ArrowRight size={15} />
            </button>
          )}
        </div>
        <div
          className="survey-communities"
          aria-label="Find a community on the planet"
        >
          {world.civilizations.map((c) => (
            <button
              key={c.id}
              onClick={() => controls.current?.locate(c)}
              aria-pressed={selected?.id === c.id}
            >
              <Sprout size={14} />
              {c.name}
              <small>
                {world.citizens
                  .filter((p) => p.civId === c.id)
                  .length.toLocaleString()}{" "}
                people
              </small>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
