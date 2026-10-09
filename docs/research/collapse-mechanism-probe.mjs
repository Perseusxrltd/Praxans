// Disposable mechanism checks. No database, server, network, Git or source writes.
// Run: node --import tsx docs/research/collapse-mechanism-probe.mjs
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createWorld, getTile, tileIndex } from "../../src/simulation/world.ts";
import { stepWorld } from "../../src/simulation/engine.ts";
import {
  regulateTemperature,
  hydrationTarget,
} from "../../src/simulation/physiology.ts";
import { elementLedger } from "../../src/simulation/chemistry.ts";
import { ledger, emptyStock } from "../../src/simulation/laws.ts";

const root = path.resolve(import.meta.dirname, "../..");
const sources = [
  "citizens",
  "physiology",
  "engine",
  "settlement",
  "laws",
  "chemistry",
];
const fingerprints = sources.map((name) => {
  const relative = `src/simulation/${name}.ts`;
  return {
    path: relative,
    sha256: createHash("sha256")
      .update(fs.readFileSync(path.join(root, relative)))
      .digest("hex"),
  };
});
assert.deepEqual(
  fingerprints,
  JSON.parse(
    fs.readFileSync(new URL("collapse-mechanism-probe.json", import.meta.url)),
  ).sourceFingerprints,
  "Historical inputs changed; use the pinned checkout in collapse-reproduction.md.",
);
fs.mkdirSync(path.join(root, "output/research"), { recursive: true });
const template = createWorld(1847, 64, 64, "planet-1", 2);
const communityId = template.civilizations[0].id;
template.civilizations = [template.civilizations[0]];
template.citizens = template.citizens.filter(
  (person) => person.civId === communityId,
);
template.animals = [];
template.structures = [];
template.caravans = [];
template.events = [];
template.pendingEvents = [];
template.tick = 48;
template.civilizations[0].stock = emptyStock();
for (const person of template.citizens) {
  person.x = template.civilizations[0].x;
  person.y = template.civilizations[0].y;
  person.body = 18;
  person.health = 98;
  person.energy = 60;
  person.hunger = 90;
  person.hydration = 8;
  person.wrapMass = 0;
  person.provisions = 0;
  person.cargo = null;
  person.pregnancy = null;
  person.journeyId = null;
  person.traits.resilience = 0.5;
  person.mind.sleepPressure = 0.5;
  person.task = {
    kind: "rest",
    tile: tileIndex(template, person.x, person.y),
    path: [],
    progress: 0,
  };
}
function snapshot(world) {
  return {
    elements: elementLedger(world),
    matter: ledger(world),
    released: world.energy.released,
    captured: world.energy.captured,
  };
}
function conservation(before, world) {
  const after = snapshot(world),
    delta = {};
  for (const symbol of new Set([
    ...Object.keys(before.elements),
    ...Object.keys(after.elements),
  ]))
    delta[symbol] =
      (after.elements[symbol] ?? 0) - (before.elements[symbol] ?? 0);
  const largest = Math.max(...Object.values(delta).map(Math.abs));
  const chemicalBalanceKJ =
    after.matter.chemical -
    before.matter.chemical +
    after.released -
    before.released -
    (after.captured - before.captured);
  assert.ok(largest < 0.000005, `element residual ${largest}`);
  assert.ok(
    Math.abs(chemicalBalanceKJ) < 0.001,
    `chemical residual ${chemicalBalanceKJ}`,
  );
  return {
    maxAbsoluteElementResidualKg: largest,
    chemicalPlusReleasedResidualKJ: chemicalBalanceKJ,
    releasedKJ: after.released - before.released,
  };
}
function personRecord(person) {
  return {
    age: person.age,
    bodyKg: person.body,
    hunger: person.hunger,
    health: person.health,
    hydrationKg: person.hydration,
    provisionsKg: person.provisions,
    wrapKg: person.wrapMass,
  };
}
function rationCase(order, food, sharing = 0.7) {
  const world = structuredClone(template),
    civ = world.civilizations[0];
  const [adult, child] = world.citizens;
  adult.age = 30;
  child.age = 0.3;
  child.hunger = 10;
  child.hydration = hydrationTarget(child);
  world.citizens = order === "adult-first" ? [adult, child] : [child, adult];
  civ.stock.biomass = food;
  civ.policies.sharing = sharing;
  getTile(world, civ.x, civ.y).temperature = 33;
  const before = snapshot(world);
  stepWorld(world, 1); // Tick 49: no ecology, council, planner or daily update.
  return {
    order,
    initialCommunalFoodKg: food,
    sharing,
    ticksExecuted: 1,
    adult: personRecord(adult),
    child: personRecord(child),
    communalFoodKg: civ.stock.biomass,
    ...conservation(before, world),
  };
}
const rations = [
  rationCase("adult-first", 3),
  rationCase("child-first", 3),
  rationCase("adult-first", 6),
  rationCase("child-first", 6),
  rationCase("adult-first", 3, 1),
];
assert.equal(rations[0].adult.provisionsKg, 3);
assert.equal(rations[0].child.provisionsKg, 0);
assert.ok(rations[0].child.hunger < 10);
assert.ok(rations[1].child.hunger > 40);
assert.equal(rations[1].adult.provisionsKg, 0);
assert.ok(rations[2].child.hunger > 40 && rations[3].child.hunger > 40);
assert.equal(rations[4].child.provisionsKg, 0);

function thermalCase(label, age, body, wrap, temperature, food) {
  const world = structuredClone(template),
    civ = world.civilizations[0],
    person = world.citizens[0];
  world.citizens = [person];
  person.age = age;
  person.body = body;
  person.hydration = hydrationTarget(person);
  person.wrapMass = wrap;
  civ.stock.fiber = 2 - wrap; // Same 2 kg finite fiber across bare/prewrapped controls.
  civ.stock.biomass = food;
  const tile = getTile(world, person.x, person.y);
  tile.temperature = temperature;
  tile.water = temperature <= 0 ? 0 : 10000;
  tile.ice = temperature <= 0 ? 10000 : 0;
  tile.air.snow = 0;
  const before = snapshot(world),
    healthBefore = person.health;
  regulateTemperature(world, person, civ, tile, 0.25, false, 0);
  const consumed = food - civ.stock.biomass;
  return {
    label,
    age,
    bodyKg: body,
    initialWrapKg: wrap,
    temperatureC: temperature,
    initialFoodKg: food,
    thermalCalls: 1,
    simulatedHours: 0.25,
    consumedFoodKg: consumed,
    extrapolatedExtraFoodKgPerDay: consumed * 96,
    healthLost: healthBefore - person.health,
    extrapolatedUnmetThermalHealthLossPerHour:
      (healthBefore - person.health) * 4,
    remainingFiberKg: civ.stock.fiber,
    resultingWrapKg: person.wrapMass,
    ...conservation(before, world),
  };
}
const thermals = [];
for (const temperature of [10, 0, -10])
  for (const food of [10, 0])
    for (const [label, age, body, wrap] of [
      ["adult-wrapped", 30, 18, 2],
      ["grown-child-bare", 0.3, 18, 0],
      ["newborn-bare", 0, 2, 0],
      ["grown-child-prewrapped-control", 0.3, 18, 2],
    ])
      thermals.push(thermalCase(label, age, body, wrap, temperature, food));
const ageGate = [
  thermalCase("age11", 11, 18, 0, 0, 10),
  thermalCase("age12", 12, 18, 0, 0, 10),
];
assert.equal(ageGate[0].resultingWrapKg, 0);
assert.ok(ageGate[1].resultingWrapKg > 0.099);
for (const item of thermals.filter((row) => row.initialFoodKg === 10))
  assert.equal(item.healthLost, 0);
const cold = thermals.find(
  (r) =>
    r.label === "grown-child-bare" &&
    r.temperatureC === 0 &&
    r.initialFoodKg === 10,
);
assert.ok(
  Math.abs(cold.extrapolatedExtraFoodKgPerDay - 2.081602002503129) < 1e-9,
);

const result = {
  recordedAtUTC: new Date().toISOString(),
  scope:
    "Fresh disposable synthetic world, 5 single-tick ration cases and 26 isolated thermal calls. No database or saved/live world used. No ecology advanced. Fixtures are initial conditions, not an intervention in the preserved world.",
  limitations:
    "Thermal daily rates extrapolate one quarter-hour at fixed conditions; they exclude normal hunger meals, weather, motion, care and later resource depletion. Actual death causes require historical evidence. Current source includes later unrelated work-planning changes; ration and thermal paths are the inspected mechanisms.",
  sourceFingerprints: fingerprints,
  rations,
  thermals,
  ageGate,
};
fs.writeFileSync(
  path.join(root, "output/research/collapse-mechanism-probe-recheck.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      rationOrderingReproduced: true,
      adequateSupplyOrderControlsPassed: true,
      fullSharingStillShowsOrdering: true,
      childWrappingAgeGateReproduced: true,
      grownChildExtraFoodAt0C: cold.extrapolatedExtraFoodKgPerDay,
      conservationPassed: true,
      output: "output/research/collapse-mechanism-probe-recheck.json",
    },
    null,
    2,
  ),
);
