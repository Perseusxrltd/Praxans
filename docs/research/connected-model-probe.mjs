// Isolated geometry and settlement diagnostics. No world generation, clock or database.
// Run: node --import tsx docs/research/connected-model-probe.mjs [output.json]
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { enclosedStorageVolume } from "../../src/simulation/geometry.ts";
import { evaluateDesign, emptyStock } from "../../src/simulation/laws.ts";
import {
  campFootprint,
  campTiles,
  campRestPlace,
  canReachCampStocks,
  invalidateCampPopulation,
} from "../../src/simulation/settlement.ts";
import { decayStocks } from "../../src/simulation/weathering.ts";
import { findPath } from "../../src/simulation/world.ts";
import { nearbyTiles } from "../../src/simulation/terrain.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const part = (x, y, width, depth, height, z = 0) => ({
  material: "wood",
  x,
  y,
  z,
  width,
  depth,
  height,
});
const floor = part(0, 0, 1, 1, 0.05);
const connected = [
  floor,
  part(-0.1, -0.1, 0.1, 1.2, 1),
  part(1, -0.1, 0.1, 1.2, 1),
  part(0, -0.1, 1, 0.1, 1),
  part(0, 1, 1, 0.1, 1),
];
const detached = [
  floor,
  part(-2, 0, 0.1, 1, 1),
  part(2, 0, 0.1, 1, 1),
  part(0, -2, 1, 0.1, 1),
  part(0, 2, 1, 0.1, 1),
];
const spillway = structuredClone(connected);
spillway[1].height = 0.45;
const slit = structuredClone(connected);
slit[3].x += 0.0001;
slit[3].width -= 0.0001;
const rotated = connected.map((p) => ({
  ...p,
  x: -p.y - p.depth + 0.123,
  y: p.x - 0.234,
  width: p.depth,
  depth: p.width,
}));
const cases = [
  ["connected open-top bin", connected, 0.95],
  ["detached walls", detached, 0],
  ["missing floor", connected.slice(1), 0],
  ["lower spillway", spillway, 0.4],
  ["0.1 mm side slit", slit, 0],
  ["quarter turn and translation", rotated, 0.95],
  [
    "supported internal solid displaces storage",
    [...connected, part(0.2, 0.2, 0.5, 0.5, 0.5, 0.05)],
    0.825,
  ],
].map(([name, components, expectedVolumeM3]) => {
  const p = evaluateDesign({ name, components });
  return {
    name,
    expectedVolumeM3,
    observedVolumeM3: p.storageVolume,
    stable: p.stable,
    pass: Math.abs(p.storageVolume - expectedVolumeM3) < 1e-8,
  };
});

// Geometric void need not be fillable after assembly. This is a scope diagnostic.
const sealed = [...connected, part(-0.1, -0.1, 1.2, 1.2, 0.05, 1)];
const sealedProperties = evaluateDesign({
  name: "Closed empty cavity",
  components: sealed,
});

const cacheParts = structuredClone(connected);
const initialCachedVolume = enclosedStorageVolume(cacheParts);
cacheParts[1].height = 0.45;
const afterDimensionMutation = enclosedStorageVolume(cacheParts);
cacheParts[1] = { ...cacheParts[1], height: 1 };
const afterElementReplacement = enclosedStorageVolume(cacheParts);
cacheParts.pop();
const afterRemoval = enclosedStorageVolume(cacheParts);

// Every cuboid contributes two different faces per axis: maximum partition size.
// Small support gaps satisfy the current static evaluator's declared tolerance.
const worstParts = Array.from({ length: 32 }, (_, i) =>
  part(i * 0.001, i * 0.002, 0.4, 0.4, 0.025, i * 0.03),
);
const axisFaces = (position, size) =>
  new Set(worstParts.flatMap((p) => [p[position], p[position] + p[size]]))
    .size + 1;
const partitionCells =
  axisFaces("x", "width") * axisFaces("y", "depth") * axisFaces("z", "height");
enclosedStorageVolume(worstParts);
const geometryTimesMs = [];
for (let i = 0; i < 3; i++) {
  const start = performance.now();
  enclosedStorageVolume(worstParts);
  geometryTimesMs.push(performance.now() - start);
}

function worldFixture(terrainAt, population = 300, food = 144000) {
  const tiles = [];
  for (let y = -7; y <= 7; y++)
    for (let x = -7; x <= 7; x++)
      tiles.push({
        x,
        y,
        terrain: terrainAt(x, y),
        owner: null,
        road: 0,
        temperature: 20,
        air: { humidity: 0.5, rain: 0 },
        detritus: { carbon: 0, mineral: 0 },
        nutrients: {},
        mineral: 0,
      });
  const civ = {
    id: "camp",
    x: 0,
    y: 0,
    stock: { ...emptyStock(), biomass: food },
  };
  const world = {
    tick: 0,
    seed: 1847,
    tiles,
    citizens: Array.from({ length: population }, (_, i) => ({
      id: `person-${i + 1}`,
      civId: civ.id,
      x: 0,
      y: 0,
    })),
    civilizations: [civ],
    structures: [],
  };
  return { world, civ };
}

const openLand = worldFixture(() => "meadow");
const footprint = campFootprint(openLand.world, openLand.civ);
const allocated = campTiles(openLand.world, openLand.civ);
const resting = openLand.world.citizens.map((p) =>
  campRestPlace(openLand.world, openLand.civ, p, 300),
);
const isolated = worldFixture((x, y) =>
  x === 0 && y === 0 ? "meadow" : "water",
);
const island = worldFixture(
  (x, y) => ((x === 0 && y === 0) || (x === 1 && y === 1) ? "meadow" : "water"),
  1,
  0,
);
const stranded = { ...island.world.citizens[0], x: 1, y: 1 };
const islandPath = findPath(island.world, stranded, island.civ, 100);
const islandAccess = canReachCampStocks(island.world, island.civ, stranded);

const ledger = worldFixture(() => "meadow", 300, 144000);
const beforeFood = ledger.civ.stock.biomass;
decayStocks(ledger.world, ledger.civ);
const lostFood = beforeFood - ledger.civ.stock.biomass;
const litterCarbon = ledger.world.tiles.reduce(
  (n, t) => n + t.detritus.carbon,
  0,
);
const litterMineral = ledger.world.tiles.reduce(
  (n, t) => n + t.detritus.mineral,
  0,
);

// Count actual global visits even after priming the layout cache; no simulation ticks.
const counted = worldFixture(() => "meadow", 1200, 144000);
counted.world.citizens.forEach((p, i) => {
  p.civId = `camp-${Math.floor(i / 300)}`;
});
counted.civ.id = "camp-0";
const person = counted.world.citizens[0];
canReachCampStocks(counted.world, counted.civ, person);
const originalReduce = counted.world.citizens.reduce;
const originalIterator = counted.world.citizens[Symbol.iterator];
let populationVisits = 0;
counted.world.citizens.reduce = function (callback, initial) {
  return originalReduce.call(
    this,
    (...args) => {
      populationVisits++;
      return callback(...args);
    },
    initial,
  );
};
counted.world.citizens[Symbol.iterator] = function* () {
  for (const person of originalIterator.call(this)) {
    populationVisits++;
    yield person;
  }
};
for (let i = 0; i < 10; i++)
  canReachCampStocks(counted.world, counted.civ, person);

const membership = worldFixture(() => "meadow", 300, 0);
const beforeTransferArea = campFootprint(membership.world, membership.civ).area;
membership.world.citizens[0].civId = "other";
invalidateCampPopulation(membership.world);
const afterTransferArea = campFootprint(membership.world, membership.civ).area;
membership.world.citizens[0].civId = membership.civ.id;
membership.world.tick++;
const afterTickArea = campFootprint(membership.world, membership.civ).area;
membership.world.citizens.push({
  id: "person-extra",
  civId: membership.civ.id,
  x: 0,
  y: 0,
});
const afterLengthChangeArea = campFootprint(
  membership.world,
  membership.civ,
).area;
membership.world.citizens = membership.world.citizens.map((p) => ({
  ...p,
  civId: "other",
}));
const afterArrayReplacementArea = campFootprint(
  membership.world,
  membership.civ,
).area;

const fingerprints = [];
for (const path of [
  "src/simulation/geometry.ts",
  "src/simulation/laws.ts",
  "src/simulation/settlement.ts",
  "src/simulation/weathering.ts",
  "src/simulation/terrain.ts",
  "src/simulation/physiology.ts",
  "src/simulation/citizens.ts",
  "src/simulation/economy.ts",
]) {
  fingerprints.push({
    path,
    sha256: createHash("sha256")
      .update(await readFile(resolve(root, path)))
      .digest("hex"),
  });
}
const report = {
  observedAtUtc: new Date().toISOString(),
  scope:
    "Pure geometry evaluations, synthetic 225-cell settlement fixtures and one daily stock-decay call. No world generation, clock advance, database, server or survival ensemble.",
  fingerprints,
  geometry: {
    cases,
    cacheInvalidation: {
      initialCachedVolume,
      afterDimensionMutation,
      afterElementReplacement,
      afterRemoval,
      expected: [0.95, 0.4, 0.95, 0],
    },
    sealedCavity: {
      stable: sealedProperties.stable,
      storageVolumeM3: sealedProperties.storageVolume,
      limitation:
        "Void exists, but filling/retrieval and assembly sequence are not represented by this scalar.",
    },
    maximumPartition: {
      components: 32,
      cells: partitionCells,
      typedArrayBytes: partitionCells * 7,
      stableInCurrentStaticModel: evaluateDesign({
        name: "Partition cost fixture",
        components: worstParts,
      }).stable,
      warmups: 1,
      submissions: 3,
      timesMs: geometryTimesMs,
      limitation:
        "Node CPU timings under concurrent host load, not full-runtime throughput or representative-world performance.",
    },
  },
  settlement: {
    diskCheck: {
      radiusCells: 2,
      actualCount: nearbyTiles(openLand.world, openLand.civ, 2).length,
      squareWouldHave: 25,
    },
    openLand: {
      requestedAreaM2: footprint.area,
      radiusCells: footprint.radius,
      allocatedCells: allocated.length,
      allocatedAreaM2: allocated.length * 100,
      uniqueRestCells: new Set(resting).size,
    },
    oneCellIsland: {
      requestedAreaM2: campFootprint(isolated.world, isolated.civ).area,
      allocatedCells: campTiles(isolated.world, isolated.civ).length,
    },
    diagonalDisconnectedLand: {
      position: { x: 1, y: 1 },
      cardinalPath: islandPath,
      canReachStock: islandAccess,
    },
    warmCachePopulationScans: {
      totalWorldPeople: 1200,
      campPeople: 300,
      repeatedCalls: 10,
      globalPopulationVisits: populationVisits,
      instrumentation:
        "Array.reduce callbacks and Symbol.iterator yields counted after warming the cache.",
    },
    populationCacheInvalidation: {
      beforeTransferArea,
      afterTransferArea,
      afterTickArea,
      afterLengthChangeArea,
      afterArrayReplacementArea,
      expected: [4800, 4784, 4800, 4816, 100],
    },
    spoilageLedger: {
      inputFoodKg: beforeFood,
      lostFoodKg: lostFood,
      addedLitterCarbonKg: litterCarbon,
      addedLitterMineralKg: litterMineral,
      massResidualKg: litterCarbon + litterMineral - lostFood,
      carbonResidualKg: litterCarbon - lostFood * 0.94,
      mineralResidualKg: litterMineral - lostFood * 0.06,
    },
  },
};
const text = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv[2]) await writeFile(resolve(process.argv[2]), text);
process.stdout.write(text);
