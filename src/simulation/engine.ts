import { MATERIALS } from "./content";
import { processDeaths, updateCitizens } from "./citizens";
import { knows, learnObservation } from "./cognition";
import { detectContacts, updateJourneys, updateAccords } from "./diplomacy";
import { updateCouncils, autonomousDiplomacy } from "./society";
import { executeProposal } from "./actions";
import { sampleProgress } from "./progress";
import { validateDepth } from "./validation";
import { withdrawBodyMatter } from "./physiology";
import { decayInventories } from "./weathering";
import { invalidateCampPopulation } from "./settlement";
import { updateEcology } from "./ecology";
import { updateFauna } from "./fauna";
import { CLIMATE_MODEL, regionalTemperature } from "./climate";
import { FAUNA_BY_ID, FLORA } from "./life";
import {
  canAfford,
  designScore,
  dispatchTrade,
  requestAssembly,
  RuleError,
  updateRelations,
} from "./economy";
import { LAWS, ledger, returnMaterial } from "./laws";
import { clamp, random } from "./random";
import {
  CHUNK_SIZE,
  HOURS_PER_TICK,
  WORLD_VERSION,
  type Civilization,
  type Material,
  type World,
} from "./types";
import { elementLedger, elementalErrors } from "./chemistry";
import { ELEMENT_BY_SYMBOL, totalElements } from "./elements";
import {
  createCitizen,
  distance,
  findPath,
  getTile,
  housing,
  peopleOf,
  recordEvent,
  remember,
  summarizeWorld,
  tileIndex,
} from "./world";

function updateFamilies(world: World, civ: Civilization): void {
  const people = peopleOf(world, civ.id),
    home = getTile(world, civ.x, civ.y)!;
  // Pair formation is local and unrelated adults only; no fixed social institution is required.
  for (const person of people.filter((p) => p.age >= 18 && !p.partnerId)) {
    const partner = people.find(
      (p) =>
        p !== person &&
        p.age >= 18 &&
        !p.partnerId &&
        !p.parentIds.includes(person.id) &&
        !person.parentIds.includes(p.id) &&
        !p.parentIds.some((id) => person.parentIds.includes(id)) &&
        distance(person, p) < 3,
    );
    if (partner && random(world) < person.traits.sociability * 0.15) {
      person.partnerId = partner.id;
      partner.partnerId = person.id;
      remember(world, person, `Grew close to ${partner.name}.`);
      remember(world, partner, `Grew close to ${person.name}.`);
    }
  }
  for (const parent of people) {
    const pregnancy = parent.pregnancy;
    if (
      pregnancy &&
      world.tick >= pregnancy.dueTick &&
      parent.body >= 4 &&
      parent.hydration + home.water >= 1
    ) {
      const child = createCitizen(world, civ, [parent, pregnancy.partner]);
      const food = Math.min(civ.stock.biomass, child.body);
      civ.stock.biomass -= food;
      withdrawBodyMatter(parent, child.body - food);
      const water = Math.min(home.water, child.hydration);
      home.water -= water;
      parent.hydration -= child.hydration - water;
      world.citizens.push(child);
      parent.pregnancy = null;
      parent.lastBirthTick = world.tick;
      const partner = people.find((p) => p.id === pregnancy.partner.id);
      if (partner) {
        partner.lastBirthTick = world.tick;
        remember(world, partner, `${child.name} was born.`);
      }
      civ.lastBirthTick = world.tick;
      civ.births++;
      world.births++;
      remember(world, parent, `${child.name} was born.`);
      recordEvent(world, {
        category: "life",
        title: `Welcome, ${child.name.split(" ")[0]}`,
        detail: `A new life in ${civ.name}, after a 270-day gestation. Its matter comes from food, water, and its parent.`,
        civId: civ.id,
        citizenId: child.id,
        x: child.x,
        y: child.y,
      });
    }
  }
  if (civ.stock.biomass > people.length * 2 + 2) {
    for (const parent of people) {
      const partner = people.find((p) => p.id === parent.partnerId);
      if (
        !partner ||
        parent.id > partner.id ||
        parent.pregnancy ||
        partner.pregnancy ||
        parent.age < 18 ||
        parent.age > 45 ||
        parent.health < 80 ||
        parent.happiness < 58 ||
        parent.body < 12 ||
        world.tick - parent.lastBirthTick < 365 * 96 ||
        random(world) > 0.007
      )
        continue;
      parent.pregnancy = {
        partner: {
          id: partner.id,
          name: partner.name,
          generation: partner.generation,
          traits: { ...partner.traits },
        },
        dueTick: world.tick + 270 * 96,
      };
      remember(
        world,
        parent,
        `A new life begins to develop. Its needs will be part of our shared life.`,
      );
    }
  }
  if (people.length) {
    civ.culture.care += (civ.policies.sharing - civ.culture.care) * 0.015;
    civ.culture.curiosity +=
      (people.reduce((s, p) => s + p.traits.curiosity, 0) / people.length -
        civ.culture.curiosity) *
      0.01;
    const dominant = Object.entries(
      people.reduce<Record<string, number>>((result, p) => {
        result[p.specialty] = (result[p.specialty] ?? 0) + 1;
        return result;
      }, {}),
    ).sort((a, b) => b[1] - a[1])[0];
    const tradition =
      dominant && dominant[1] > people.length * 0.55
        ? `A tradition of ${dominant[0] === "gather" ? "gathering" : dominant[0] === "experiment" ? "experimentation" : dominant[0] === "assemble" ? "making" : dominant[0] === "extract" ? "material work" : dominant[0] === "tend" ? "tending" : "shared time"}`
        : null;
    if (tradition && world.tick > 768 && !civ.traditions.includes(tradition)) {
      civ.traditions.push(tradition);
      recordEvent(world, {
        category: "culture",
        title: `${civ.name} finds a rhythm`,
        detail: `${tradition}, born from the work its people have actually practiced.`,
        civId: civ.id,
      });
    }
  }
}
function planCommunity(world: World, civ: Civilization): void {
  const people = peopleOf(world, civ.id),
    population = people.length;
  const built = world.structures.filter(
    (s) => s.civId === civ.id && s.progress >= 1 && !s.collapsed,
  );
  const needsShelter = housing(world, civ.id) < population + 2;
  const needsWork =
    built.reduce((sum, s) => sum + s.properties.workSurface, 0) <
    population * 0.25;
  const bulk = Object.entries(civ.stock).reduce(
    (sum, [m, n]) => sum + n / MATERIALS[m as Material].density,
    0,
  );
  const needsStorage =
    built.reduce((sum, s) => sum + s.properties.storageVolume, 0) < bulk;
  if (
    world.tick - civ.lastBuildingTick < 48 ||
    world.structures.some((s) => s.civId === civ.id && s.progress < 1) ||
    !population ||
    (!needsShelter && !needsWork && !needsStorage)
  )
    return;
  const candidates = [...civ.observations]
    .filter(
      (o) =>
        people.some((p) => knows(p, o.id)) &&
        o.properties.stable &&
        ((needsShelter && o.properties.coveredArea > 0.5) ||
          (needsStorage && o.properties.storageVolume > 0.05) ||
          (needsWork && o.properties.workSurface > 0.5)) &&
        canAfford(civ.stock, o.properties.cost),
    )
    .sort((a, b) => designScore(b.properties) - designScore(a.properties));
  for (const candidate of candidates) {
    try {
      requestAssembly(world, civ, candidate.design);
      return;
    } catch (error) {
      if (!(error instanceof RuleError)) throw error;
      // Current geometry, limits or access can invalidate an earlier estimate.
      // Rejection spends no material; another remembered idea may still work.
    }
  }
  if (candidates.length) civ.lastBuildingTick = world.tick;
}
function autonomousTrade(world: World, civ: Civilization): void {
  if (world.tick - civ.lastTradeTick < (civ.focus === "connect" ? 192 : 384))
    return;
  const population = peopleOf(world, civ.id).length;
  if (!population) return;
  const reserve = {
    biomass: population * 3,
    wood: 50,
    fiber: 12,
    stone: 18,
    clay: 6,
  };
  const exports = (Object.keys(reserve) as Material[]).filter(
    (m) => civ.stock[m] > reserve[m] + 8,
  );
  const imports = (Object.keys(reserve) as Material[]).filter(
    (m) => civ.stock[m] < reserve[m] * 0.7,
  );
  for (const other of [...world.civilizations]
    .filter((c) => c !== civ && (civ.relations[c.id]?.affinity ?? -100) > 0)
    .sort((a, b) => distance(a, civ) - distance(b, civ))) {
    for (const offer of exports)
      for (const receive of imports) {
        try {
          dispatchTrade(
            world,
            civ,
            other.id,
            {
              material: offer,
              amount: Math.min(12, civ.stock[offer] - reserve[offer]),
            },
            {
              material: receive,
              amount: Math.max(
                1,
                Math.min(
                  5,
                  (civ.relations[other.id].contact.report.stock[receive] ??
                    20) * 0.18,
                ),
              ),
            },
          );
          return;
        } catch (error) {
          if (!(error instanceof RuleError)) throw error;
        }
      }
  }
}
function migration(world: World, civ: Civilization): void {
  const people = peopleOf(world, civ.id);
  if (people.length < 5 || civ.stock.biomass > people.length) return;
  const target = world.civilizations.find(
    (c) =>
      c !== civ &&
      (civ.relations[c.id]?.affinity ?? -100) > 12 &&
      (civ.relations[c.id].contact.report.stock.biomass ?? 0) >
        civ.relations[c.id].contact.report.population * 4,
  );
  const person = people.find(
    (p) =>
      p.age >= 18 &&
      !p.journeyId &&
      !p.partnerId &&
      !world.citizens.some(
        (child) => child.age < 14 && child.parentIds.includes(p.id),
      ),
  );
  if (!target || !person || random(world) > 0.2) return;
  const path = findPath(world, person, target, world.tiles.length);
  if (!path) return;
  person.civId = target.id;
  invalidateCampPopulation(world);
  person.task = {
    kind: "move",
    tile: tileIndex(world, target.x, target.y),
    path,
    progress: 0,
  };
  remember(world, person, `Left ${civ.name} to seek a life in ${target.name}.`);
  recordEvent(world, {
    category: "life",
    title: `${person.name.split(" ")[0]} follows a new path`,
    detail: `Scarcity in ${civ.name} leads one person toward ${target.name}.`,
    civId: target.id,
    citizenId: person.id,
  });
}

export function stepWorld(world: World, ticks = 1): void {
  if (!Number.isInteger(ticks) || ticks < 0 || ticks > 100000)
    throw new Error("Tick count must be an integer from 0 to 100000.");
  for (let step = 0; step < ticks; step++) {
    world.tick++;
    if (world.tick % 4 === 0) {
      updateEcology(world);
      updateFauna(world);
      decayInventories(world, HOURS_PER_TICK * 4);
    }
    updateCitizens(world);
    processDeaths(world);
    updateJourneys(world);
    if (world.tick % 4 === 0) {
      detectContacts(world);
      updateCouncils(world, executeProposal);
      updateAccords(world);
    }
    if (world.tick % 16 === 0)
      for (const civ of world.civilizations) planCommunity(world, civ);
    if (world.tick % 96 === 0) {
      for (const civ of world.civilizations) {
        updateFamilies(world, civ);
        autonomousTrade(world, civ);
        migration(world, civ);
      }
      autonomousDiplomacy(world);
      for (const civ of world.civilizations) sampleProgress(world, civ);
      const summary = summarizeWorld(world);
      world.history.push({
        tick: world.tick,
        population: world.citizens.length,
        food: world.civilizations.reduce((s, c) => s + c.stock.biomass, 0),
        forest: summary.forest,
        happiness: summary.happiness,
        civilizations: world.civilizations.length,
        carbon: world.atmosphere.carbon,
        biodiversity: summary.biodiversity,
      });
      if (world.history.length > 180) world.history.shift();
    }
    if (world.changedTiles.length > world.tiles.length)
      world.changedTiles = [...new Set(world.changedTiles)];
  }
}

export function validateWorld(world: World): void {
  const fail = (message: string): never => {
    throw new Error(`Invalid saved world: ${message}`);
  };
  if (
    !world ||
    world.version !== WORLD_VERSION ||
    world.lawsVersion !== LAWS.version ||
    !["archipelago-1", "planet-1"].includes(world.generationVersion) ||
    !Array.isArray(world.pendingEvents)
  )
    fail("unsupported state or natural-law version");
  if (
    !Array.isArray(world.chunks) ||
    !world.chunks.length ||
    world.tiles?.length !== world.chunks.length * CHUNK_SIZE ** 2
  )
    fail("region dimensions");
  const chunkIds = new Set<string>();
  if (
    !Number.isSafeInteger(world.tick) ||
    world.tick < 0 ||
    !world.entropy ||
    !Number.isSafeInteger(world.entropy.sinceTick) ||
    world.entropy.sinceTick > world.tick
  )
    fail("world clock or entropy epoch");
  for (const amount of Object.values(world.entropy))
    if (!Number.isFinite(amount) || amount < 0) fail("entropy accounting");
  const planetary = world.planetaryClimate;
  if (
    !planetary ||
    !Array.isArray(planetary.bands) ||
    planetary.bands.length !== CLIMATE_MODEL.bands ||
    !Number.isSafeInteger(planetary.sinceTick) ||
    planetary.sinceTick < 0 ||
    planetary.sinceTick > world.tick ||
    !Number.isSafeInteger(planetary.tick) ||
    planetary.tick < planetary.sinceTick ||
    planetary.tick > world.tick
  )
    fail("planetary climate epoch or grid");
  for (const [key, value] of Object.entries(planetary))
    if (key !== "bands" && !Number.isFinite(value))
      fail("planetary climate accounting");
  for (let i = 0; i < planetary.bands.length; i++) {
    const band = planetary.bands[i];
    if (
      !Object.values(band).every(Number.isFinite) ||
      regionalTemperature(planetary, i) <= -273.15 ||
      Math.abs(band.correction) >
        Math.max(1e-9, Math.abs(band.heat) * Number.EPSILON * 2)
    )
      fail("planetary thermal reservoir");
  }
  const storedPlanetaryHeat = planetary.bands.reduce(
    (sum, band) => sum + band.heat,
    0,
  );
  const expectedPlanetaryHeat =
    planetary.solarAbsorbed - planetary.radiated + planetary.surfaceExchange;
  if (
    planetary.solarAbsorbed < 0 ||
    planetary.radiated < 0 ||
    Math.abs(storedPlanetaryHeat - expectedPlanetaryHeat) >
      Math.max(
        0.05,
        Math.max(
          planetary.solarAbsorbed,
          planetary.radiated,
          Math.abs(planetary.surfaceExchange),
        ) * 1e-11,
      )
  )
    fail("planetary heat conservation");
  for (const tile of world.tiles)
    if (tile.temperature <= -273.15) fail("temperature below absolute zero");
  for (let n = 0; n < world.chunks.length; n++) {
    const chunk = world.chunks[n];
    if (
      !Number.isInteger(chunk.x) ||
      !Number.isInteger(chunk.y) ||
      chunk.id !== `${chunk.x},${chunk.y}` ||
      chunkIds.has(chunk.id) ||
      chunk.start !== n * CHUNK_SIZE ** 2
    )
      fail("region identity");
    chunkIds.add(chunk.id);
  }
  if (
    !Number.isInteger(world.tick) ||
    world.tick < 0 ||
    !Number.isInteger(world.rng) ||
    world.rng < 0 ||
    world.rng > 0xffffffff ||
    !Number.isInteger(world.nextId) ||
    world.nextId < 1
  )
    fail("clock or random state");
  const positive = (value: number, label: string) => {
    if (!Number.isFinite(value) || value < -1e-7) fail(label);
  };
  const ids = new Set<string>();
  for (const entity of [
    ...world.civilizations,
    ...world.citizens,
    ...world.animals,
    ...world.structures,
    ...world.caravans,
  ]) {
    if (!entity.id || ids.has(entity.id)) fail("duplicate entity identity");
    ids.add(entity.id);
  }
  for (let i = 0; i < world.tiles.length; i++) {
    const t = world.tiles[i],
      chunk = world.chunks[Math.floor(i / CHUNK_SIZE ** 2)],
      local = i % CHUNK_SIZE ** 2;
    if (
      t.x !== chunk.x * CHUNK_SIZE + (local % CHUNK_SIZE) ||
      t.y !== chunk.y * CHUNK_SIZE + Math.floor(local / CHUNK_SIZE) ||
      !Number.isFinite(t.temperature)
    )
      fail("tile position or temperature");
    for (const value of [
      t.water,
      t.ice,
      t.mineral,
      t.rock,
      t.detritus.carbon,
      t.detritus.mineral,
    ])
      positive(value, "tile reservoir");
    for (const [symbol, mass] of Object.entries(t.nutrients)) {
      if (!ELEMENT_BY_SYMBOL[symbol]) fail("unknown soil element");
      positive(mass, "soil element mass");
    }
    if (Math.abs(t.mineral - totalElements(t.nutrients)) > 1e-7)
      fail("soil composition");
    for (const key of [
      "vapor",
      "cloud",
      "snow",
      "pressure",
      "rain",
      "humidity",
      "sunlight",
      "dust",
    ] as const)
      positive(t.air[key], "atmospheric cell");
    if (
      ![t.air.windX, t.air.windY, t.air.tide, t.elevation].every(
        Number.isFinite,
      )
    )
      fail("wind, tide, or elevation");
    positive(t.dissolvedOxygen, "dissolved oxygen");
    positive(t.pollination, "pollination state");
    if (!Array.isArray(t.seedBank) || t.seedBank.length > 4)
      fail("dormant seed bank");
    for (const seed of t.seedBank) {
      if (
        !["plant", "groundcover"].includes(seed.layer) ||
        !Number.isSafeInteger(seed.depositedTick) ||
        seed.depositedTick < 0 ||
        seed.depositedTick > world.tick ||
        !Number.isSafeInteger(seed.germinationTick) ||
        seed.germinationTick < seed.depositedTick
      )
        fail("dormant seed history");
    }
    for (const plant of [t.plant, t.groundcover, ...t.seedBank])
      if (plant) {
        positive(plant.carbon, "plant tissue");
        positive(plant.mineral, "plant mineral");
        if (!Number.isInteger(plant.lineage) || !FLORA[plant.lineage])
          fail("plant lineage");
        for (const [key, value] of Object.entries(plant.genome))
          if (
            !Number.isFinite(value) ||
            (key !== "temperature" && key !== "pollination" && value < 0)
          )
            fail("plant genome");
      }
  }
  for (const animal of world.animals) {
    if (
      !FAUNA_BY_ID[animal.species] ||
      !getTile(world, animal.x, animal.y) ||
      !Number.isInteger(animal.count) ||
      animal.count < 1
    )
      fail("wildlife identity or position");
    for (const value of [
      animal.body,
      animal.hydration,
      animal.ageDays,
      animal.health,
    ])
      positive(value, "wildlife reservoir");
    if (!Object.values(animal.traits).every(Number.isFinite))
      fail("wildlife traits");
  }
  const civilizationIds = new Set(world.civilizations.map((c) => c.id));
  for (const civ of world.civilizations) {
    for (const material of Object.keys(MATERIALS) as Material[])
      positive(civ.stock[material], "community stock");
    for (const value of Object.values(civ.policies))
      if (!Number.isFinite(value) || value < 0 || value > 1)
        fail("community preference");
  }
  for (const person of world.citizens) {
    if (
      !civilizationIds.has(person.civId) ||
      !getTile(world, person.x, person.y)
    )
      fail("citizen position or community");
    for (const value of [
      person.body,
      person.metabolism?.intake,
      person.metabolism?.reserves,
      person.hydration,
      person.age,
      person.wrapMass,
      person.provisions,
    ])
      positive(value, "body state");
    if (!person.metabolism || person.metabolism.reserves > person.body + 1e-9)
      fail("body reserve subset");
    const metabolism = person.metabolism.last;
    if (metabolism !== null) {
      if (
        !metabolism ||
        !Number.isSafeInteger(metabolism.tick) ||
        metabolism.tick < 0 ||
        metabolism.tick > world.tick ||
        !Number.isFinite(metabolism.hours) ||
        metabolism.hours <= 0 ||
        !Number.isFinite(metabolism.heatLossKJ) ||
        !Number.isFinite(metabolism.activityFraction) ||
        metabolism.activityFraction < 0 ||
        metabolism.activityFraction > 1 ||
        !(
          metabolism.journeyId === null ||
          typeof metabolism.journeyId === "string"
        )
      )
        fail("metabolic interval");
      for (const value of [
        metabolism.ingestedKg,
        metabolism.foodOxidizedKg,
        metabolism.reserveOxidizedKg,
        metabolism.reserveStoredKg,
        metabolism.structureStoredKg,
        metabolism.maintenanceKJ,
        metabolism.releasedKJ,
        metabolism.meltKJ,
        metabolism.unmetMaintenanceKJ,
        metabolism.unmetColdKJ,
        metabolism.unremovedHeatKJ,
        metabolism.healthLoss,
      ])
        positive(value, "metabolic flux");
    }
    for (const value of [
      person.health,
      person.hunger,
      person.energy,
      person.happiness,
      person.sick,
    ])
      if (!Number.isFinite(value) || value < 0 || value > 100)
        fail("citizen needs");
    if (person.cargo) {
      if (!MATERIALS[person.cargo.material]) fail("cargo material");
      positive(person.cargo.amount, "cargo amount");
    }
    if (
      person.task &&
      person.task.path.some(
        (i) =>
          !Number.isInteger(i) ||
          !world.tiles[i] ||
          world.tiles[i].terrain === "water",
      )
    )
      fail("citizen path");
    const task = person.task;
    if (
      task?.need !== undefined &&
      (task.need !== "water" || !["move", "explore"].includes(task.kind))
    )
      fail("bodily route purpose");
    if (
      task &&
      (task.recipientId !== undefined ||
        task.targetWrapMass !== undefined ||
        task.targetProvisionMass !== undefined)
    ) {
      const wrap =
        task.kind === "repair" &&
        task.material === "fiber" &&
        Number.isFinite(task.targetWrapMass) &&
        task.targetWrapMass! >= 0 &&
        task.targetProvisionMass === undefined;
      const food =
        task.kind === "deliver" &&
        task.material === "biomass" &&
        Number.isFinite(task.targetProvisionMass) &&
        task.targetProvisionMass! >= 0 &&
        task.targetWrapMass === undefined &&
        task.recipientId !== person.id;
      if (
        (!wrap && !food) ||
        task.structureId !== undefined ||
        typeof task.recipientId !== "string" ||
        !task.recipientId ||
        !Number.isFinite(task.progress) ||
        task.progress < 0 ||
        !Number.isInteger(task.tile) ||
        !world.tiles[task.tile]
      )
        fail("personal body maintenance or food handoff task");
      // A target may have died or moved since the last save. Execution cancels
      // that stale task instead of inventing a recipient or discarding a world.
    }
  }
  for (const s of world.structures) {
    if (
      !civilizationIds.has(s.civId) ||
      !getTile(world, s.x, s.y) ||
      !Number.isFinite(s.progress) ||
      s.progress < 0 ||
      s.progress > 1
    )
      fail("structure");
    for (const amount of Object.values(s.properties.cost))
      positive(amount, "reserved construction matter");
  }
  for (const value of [
    ...Object.values(world.atmosphere),
    world.energy.captured,
    world.energy.released,
    world.energy.initialChemical,
  ])
    positive(value, "global reservoir");
  if (world.energy.compensation)
    for (const kind of ["captured", "released"] as const) {
      const value = world.energy.compensation[kind];
      if (
        !Number.isFinite(value) ||
        Math.abs(value) >
          Math.max(1e-12, world.energy[kind] * Number.EPSILON * 2)
      )
        fail("energy counter compensation");
    }
  if (
    !world.atmosphereCompensation ||
    typeof world.atmosphereCompensation !== "object"
  )
    fail("atmospheric compensation");
  for (const [key, value] of Object.entries(world.atmosphereCompensation))
    if (
      !(key in world.atmosphere) ||
      !Number.isFinite(value) ||
      Math.abs(value) >
        Math.max(
          1e-12,
          world.atmosphere[key as keyof World["atmosphere"]] *
            Number.EPSILON *
            2,
        )
    )
      fail("atmospheric compensation");
  for (const chunk of world.chunks) {
    for (const values of [chunk.geology.buried, chunk.geology.exposed])
      for (const [symbol, mass] of Object.entries(values)) {
        if (!ELEMENT_BY_SYMBOL[symbol]) fail("unknown geological element");
        positive(mass, "geological element mass");
      }
    if (
      ![
        chunk.geology.velocityX,
        chunk.geology.velocityY,
        chunk.geology.stress,
        chunk.geology.convergence,
        chunk.geology.uplift,
        chunk.geology.heatFlux,
      ].every(Number.isFinite)
    )
      fail("tectonic state");
  }
  validateDepth(world, fail);
  const elements = elementLedger(world),
    errors = elementalErrors(world, elements);
  if (!Number.isFinite(errors.relative) || errors.relative > 1e-9)
    fail("elemental conservation");
  const total = ledger(world);
  for (const key of ["carbon", "water", "mineral"] as const)
    if (
      !Number.isFinite(world.initialMatter[key]) ||
      !Number.isFinite(world.boundary[key]) ||
      Math.abs(total[key] - world.initialMatter[key] - world.boundary[key]) >
        Math.max(1e-4, (world.initialMatter[key] + world.boundary[key]) * 1e-9)
    )
      fail(`${key} conservation`);
  // Numerical error is relative to the accumulated inputs/outputs, not just
  // the fuel left today. The latter approaches zero after a die-off and made
  // a < 2e-11 relative historical discrepancy halt the original live world.
  const energyScale = Math.max(
    world.energy.initialChemical +
      Math.abs(world.boundary.chemical) +
      world.energy.captured,
    world.energy.released,
    total.chemical,
  );
  if (
    !Number.isFinite(world.boundary.chemical) ||
    Math.abs(
      world.energy.initialChemical +
        world.boundary.chemical +
        world.energy.captured -
        world.energy.released -
        total.chemical,
    ) > Math.max(0.05, energyScale * 1e-10)
  )
    fail("biochemical energy conservation");
}
