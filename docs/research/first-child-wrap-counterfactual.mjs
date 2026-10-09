// One recorded local exposure, two finite-fiber allocations. No database or replay.
// Run: node --import tsx docs/research/first-child-wrap-counterfactual.mjs
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createWorld, getTile } from "../../src/simulation/world.ts";
import {
  PHYSIOLOGY,
  hydrationTarget,
  regulateTemperature,
} from "../../src/simulation/physiology.ts";
import { MATERIALS } from "../../src/simulation/content.ts";
import { elementLedger } from "../../src/simulation/chemistry.ts";
import { emptyStock, ledger } from "../../src/simulation/laws.ts";
import { canReachCampStocks } from "../../src/simulation/settlement.ts";

const root = path.resolve(import.meta.dirname, "../..");
const sourceFingerprints = [
  "physiology",
  "content",
  "laws",
  "chemistry",
  "settlement",
].map((name) => {
  const relative = `src/simulation/${name}.ts`;
  return {
    path: relative,
    sha256: createHash("sha256")
      .update(fs.readFileSync(path.join(root, relative)))
      .digest("hex"),
  };
});
assert.deepEqual(
  sourceFingerprints,
  JSON.parse(
    fs.readFileSync(
      new URL("first-child-wrap-counterfactual.json", import.meta.url),
    ),
  ).sourceFingerprints,
  "Historical inputs changed; use the pinned checkout in collapse-reproduction.md.",
);
const replayPath = path.join(
  import.meta.dirname,
  "collapse-first-death-replay.json",
);
const replayBytes = fs.readFileSync(replayPath);
const replay = JSON.parse(replayBytes);
assert.equal(replay.deathEventExactlyReproduced, true);
const recordedBefore = replay.trace.findLast(
  (item) => item.tick === replay.finalTick && item.phase === "before",
);
const recordedAfter = replay.trace.findLast(
  (item) => item.tick === replay.finalTick && item.phase === "after",
);
assert.ok(recordedBefore && recordedAfter);
assert.equal(recordedBefore.stockFoodKg, 0);
assert.equal(recordedBefore.provisionsKg, 0);
assert.equal(recordedBefore.wrapKg, 0);
assert.equal(recordedBefore.active, false);
assert.equal(recordedBefore.shelterResistance, 0);

const template = createWorld(1847, 64, 64, "planet-1", 2);
const civ = template.civilizations[0];
const person = template.citizens.find((p) => p.civId === civ.id);
template.civilizations = [civ];
template.citizens = [person];
template.structures = [];
template.caravans = [];
template.animals = [];
template.events = [];
template.pendingEvents = [];
template.tick = recordedBefore.tick;
civ.stock = emptyStock();
civ.stock.fiber = recordedBefore.stockFiberKg;
civ.x = person.x = recordedBefore.position.x;
civ.y = person.y = recordedBefore.position.y;
person.id = replay.actual.citizenId;
person.age = recordedBefore.ageYears;
person.body = recordedBefore.bodyKg;
person.health = recordedBefore.health;
person.hunger = recordedBefore.hunger;
person.hydration = recordedBefore.hydrationKg;
person.provisions = 0;
person.wrapMass = 0;
person.cargo = null;
person.pregnancy = null;
person.journeyId = null;
person.sick = recordedBefore.sickness;
const tile = getTile(template, person.x, person.y);
assert.ok(tile);
tile.temperature = recordedBefore.temperatureC;
// The actual recorded hydration makes melting ineligible. Other terrain fields
// are synthetic and unused by these two cold, food-free calls.
assert.ok(person.hydration >= hydrationTarget(person) * 0.8);
assert.equal(canReachCampStocks(template, civ, person), recordedBefore.atHome);

function snapshot(world) {
  return {
    elements: elementLedger(world),
    chemical: ledger(world).chemical,
    released: world.energy.released,
    captured: world.energy.captured,
  };
}

function runCase(wrapKg) {
  const world = structuredClone(template);
  const actor = world.citizens[0],
    community = world.civilizations[0];
  const site = getTile(world, actor.x, actor.y);
  const beforeAllocation = snapshot(world);
  community.stock.fiber -= wrapKg;
  actor.wrapMass += wrapKg;
  assert.ok(community.stock.fiber >= 0);
  assert.equal(
    community.stock.fiber + actor.wrapMass,
    recordedBefore.stockFiberKg,
  );
  const priorDetritus = { ...site.detritus };
  const scale = Math.max(0.2, actor.body / 18);
  const area = PHYSIOLOGY.adultArea * scale ** (2 / 3);
  const wrapAfterWear =
    actor.wrapMass * Math.exp(-recordedBefore.dt * 0.000015);
  const resistance =
    PHYSIOLOGY.airResistance +
    wrapAfterWear /
      (MATERIALS.fiber.density * area * MATERIALS.fiber.conductivity);
  const lossW =
    (area * (PHYSIOLOGY.skinTemperature - site.temperature)) / resistance;
  const creditedMetabolismW =
    (PHYSIOLOGY.basalWatts + PHYSIOLOGY.restingWatts) * scale;
  const deficitKJ =
    Math.max(0, lossW - creditedMetabolismW) * recordedBefore.dt * 3.6;
  assert.ok(lossW > creditedMetabolismW); // No sweating or heat-rejection branch.
  regulateTemperature(
    world,
    actor,
    community,
    site,
    recordedBefore.dt,
    recordedBefore.active,
    recordedBefore.shelterResistance,
  );
  const after = snapshot(world);
  const symbols = new Set([
    ...Object.keys(beforeAllocation.elements),
    ...Object.keys(after.elements),
  ]);
  const elementDeltas = Object.fromEntries(
    [...symbols].map((symbol) => [
      symbol,
      (after.elements[symbol] ?? 0) - (beforeAllocation.elements[symbol] ?? 0),
    ]),
  );
  const maxElementResidualKg = Math.max(
    ...Object.values(elementDeltas).map(Math.abs),
  );
  const chemicalResidualKJ =
    after.chemical -
    beforeAllocation.chemical +
    after.released -
    beforeAllocation.released -
    (after.captured - beforeAllocation.captured);
  assert.ok(maxElementResidualKg < 5e-6);
  assert.ok(Math.abs(chemicalResidualKJ) < 1e-3);
  assert.equal(community.stock.biomass, 0);
  assert.equal(actor.provisions, 0);
  assert.equal(actor.body, recordedBefore.bodyKg);
  assert.equal(actor.hunger, recordedBefore.hunger);
  assert.equal(actor.hydration, recordedBefore.hydrationKg);
  assert.equal(site.temperature, recordedBefore.temperatureC);
  assert.equal(world.energy.released, beforeAllocation.released);
  assert.equal(world.tick, recordedBefore.tick);
  assert.ok(
    Math.abs(
      actor.health - Math.max(0, recordedBefore.health - deficitKJ / 240),
    ) < 1e-12,
  );
  return {
    case: wrapKg ? "2 kg already allocated wrap" : "recorded bare state",
    initialStockFiberKg: recordedBefore.stockFiberKg - wrapKg,
    initialWrapKg: wrapKg,
    finalStockFiberKg: community.stock.fiber,
    finalWrapKg: actor.wrapMass,
    fiberWearKg: wrapKg - actor.wrapMass,
    detritusOrganicIncreaseKg: site.detritus.carbon - priorDetritus.carbon,
    detritusMineralIncreaseKg: site.detritus.mineral - priorDetritus.mineral,
    healthBefore: recordedBefore.health,
    healthAfter: actor.health,
    healthLostAfterClamp: recordedBefore.health - actor.health,
    potentialThermalHealthLossBeforeClamp: deficitKJ / 240,
    requiredAdditionalHeatKJ: deficitKJ,
    fundedAdditionalHeatKJ: 0,
    finalFoodKg: community.stock.biomass + actor.provisions,
    finalBodyKg: actor.body,
    finalHydrationKg: actor.hydration,
    finalNourishment: actor.hunger,
    finalTemperatureC: site.temperature,
    survivedThisSingleThermalCall: actor.health > 0,
    maxAbsoluteElementResidualKg: maxElementResidualKg,
    chemicalPlusReleasedResidualKJ: chemicalResidualKJ,
    chemicalEnergyReleasedKJ: after.released - beforeAllocation.released,
  };
}

const cases = [runCase(0), runCase(2)];
assert.equal(cases[0].healthAfter, recordedAfter.health);
assert.equal(cases[0].healthAfter, 0);
assert.ok(cases[1].healthAfter > 0);
const result = {
  recordedAtUTC: new Date().toISOString(),
  evidenceKind:
    "Two isolated calls to actual regulateTemperature at recorded final local conditions; no stepWorld or historical replay",
  historicalEvidence: {
    path: "output/research/collapse-first-death-replay.json",
    sha256: createHash("sha256").update(replayBytes).digest("hex"),
    baselineCommit: replay.baselineCommit,
    exactHistoricalDeathEventMatchedByParent: true,
    citizenId: replay.actual.citizenId,
    tick: replay.finalTick,
  },
  recordedBefore,
  totalInitialFiberKgInBothCases: recordedBefore.stockFiberKg,
  sourceFingerprints,
  cases,
  conclusion:
    "At the exact final local exposure, the bare actor reaches zero health; the actor with 2 kg of the same finite stock already allocated as a wrap retains positive health for this one quarter-hour. No food is added or consumed.",
  limitations: [
    "Preallocation represents protection obtained earlier. It is not an implemented instant caregiver action, and this comparison assigns no free labor to the preserved world.",
    "The synthetic world reproduces the relevant person, temperature, activity, shelter and accessible-food/fiber conditions; it does not reconstruct the historical camp geometry or other inhabitants.",
    "Recorded hydration prevents melting; both cases remain below heat-balance neutrality, preventing sweating. With no food, there is no respiration; unrelated synthetic water/air reservoirs cannot affect these calls.",
    "The wrapped case still loses health. One-call survival does not establish survival of the day, winter, or other inhabitants.",
    "Conservation covers finite fiber allocation/wear and the existing element/chemical-energy ledgers. The model still lacks a unified mobilizable-body energy budget and core body-temperature state.",
  ],
};
const output = path.join(
  root,
  "output/research/first-child-wrap-counterfactual-recheck.json",
);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      recordedBareHealthAfter: cases[0].healthAfter,
      wrappedHealthAfter: cases[1].healthAfter,
      wrappedHealthLost: cases[1].healthLostAfterClamp,
      maximumElementResidualKg: Math.max(
        ...cases.map((c) => c.maxAbsoluteElementResidualKg),
      ),
      maximumChemicalResidualKJ: Math.max(
        ...cases.map((c) => Math.abs(c.chemicalPlusReleasedResidualKJ)),
      ),
      output: "output/research/first-child-wrap-counterfactual-recheck.json",
    },
    null,
    2,
  ),
);
