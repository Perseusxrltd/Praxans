// Bounded observer-only browser probe. No world creation, database or server.
// Run: node docs/research/renderer-probe.mjs [output.json] [frozen-bundle.js]
import { build } from "esbuild";
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = resolve(root, "src/client/renderer.ts");
const source = await readFile(sourcePath, "utf8");
let executable;
let measuredSource = source;
let sourceLabel = "src/client/renderer.ts";
if (process.argv[3]) {
  const frozenPath = resolve(process.argv[3]);
  measuredSource = await readFile(frozenPath, "utf8");
  const expose = "window.PraxansRenderer = WorldRenderer;";
  if (!measuredSource.includes(expose))
    throw new Error("The frozen bundle does not expose the expected renderer.");
  executable = measuredSource.replace(
    expose,
    "window.PraxansProbe = { WorldRenderer, mix };",
  );
  sourceLabel = `frozen bundle: ${frozenPath}`;
} else {
  const bundled = await build({
    stdin: {
      contents: `${source}\nexport { mix };\n`,
      resolveDir: dirname(sourcePath),
      sourcefile: sourcePath,
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    globalName: "PraxansProbe",
  });
  executable = bundled.outputFiles[0].text;
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 800 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent(
    '<!doctype html><meta charset="utf-8"><title>Isolated renderer probe</title><canvas id="world" style="width:800px;height:600px"></canvas>',
  );
  await page.addScriptTag({ content: executable });
  const result = await page.evaluate(() => {
    const { WorldRenderer, mix } = window.PraxansProbe;
    const colorContext = document.createElement("canvas").getContext("2d");
    const base = mix("#d0b080", "#7a8070", 0.2);
    const nested = mix(base, "#4a5145", 0.17);
    colorContext.fillStyle = "#112233";
    colorContext.fillStyle = nested;
    const tiles = Array.from({ length: 96 * 96 }, (_, i) => ({
      x: i % 96,
      y: Math.floor(i / 96),
      terrain: "meadow",
      elevation: 0.25,
      variation: 0.5,
      road: 0,
      owner: null,
      moisture: 0.5,
      ice: 0,
      air: { snow: 0 },
      trees: 0,
      forage: 0,
      rock: 30,
      plant: null,
      groundcover: null,
    }));
    const world = {
      id: "isolated-renderer-research",
      tick: 0,
      originX: 0,
      originY: 0,
      width: 96,
      height: 96,
      tiles,
      structures: [],
      civilizations: [],
      citizens: [],
      animals: [],
      caravans: [],
      summary: { sunlight: 1, weather: "clear" },
    };
    const renderer = new WorldRenderer(
      document.getElementById("world"),
      () => {},
    );
    // Access compiled private members only for this diagnostic fixture.
    cancelAnimationFrame(renderer.animation);
    renderer.resize();
    renderer.update(world);
    const originalProject = renderer.projectRaw;
    let projectCalls = 0;
    renderer.projectRaw = function (...args) {
      projectCalls++;
      return originalProject.apply(this, args);
    };
    renderer.drawTerrain();
    const terrainSubmitTimesMs = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      renderer.drawTerrain();
      terrainSubmitTimesMs.push(performance.now() - start);
    }
    projectCalls = 0;
    renderer.camera.x = 1000000;
    renderer.camera.y = 1000000;
    renderer.drawTerrain();
    const offscreenProjectCalls = projectCalls;
    renderer.update(world);
    renderer.terrainDirty = false;
    renderer.update({ ...world, tick: 1 });
    const dirtySameArrays = renderer.terrainDirty;
    renderer.terrainDirty = false;
    renderer.update({ ...world, tick: 2, structures: [] });
    const dirtyNewEqualStructures = renderer.terrainDirty;
    const output = {
      browser: navigator.userAgent,
      viewportCss: { width: renderer.width, height: renderer.height },
      devicePixelRatio,
      color: { base, nested, retainedCanvasFill: colorContext.fillStyle },
      cache: { dirtySameArrays, dirtyNewEqualStructures },
      offscreen: {
        tileCount: tiles.length,
        projectCalls: offscreenProjectCalls,
      },
      terrainSubmitTimesMs,
    };
    renderer.destroy();
    return output;
  });
  const report = {
    observedAtUtc: new Date().toISOString(),
    source: sourceLabel,
    sourceSha256: createHash("sha256").update(measuredSource).digest("hex"),
    fixture:
      "96×96 uniform meadow, no inhabitants or structures, 800×600 CSS pixels, DPR 1; one warm-up and five synchronous terrain submissions.",
    limitations:
      "JavaScript submission timing only; no GPU completion, full-frame FPS, representative-PC, networking, population, or simulation benchmark. Private renderer members are diagnostic hooks, not a supported API.",
    ...result,
    pageErrors: errors,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (process.argv[2]) await writeFile(resolve(process.argv[2]), json);
  process.stdout.write(json);
} finally {
  await browser.close();
}
