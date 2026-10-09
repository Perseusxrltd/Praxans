import { MATERIALS } from "./content";
import { seedPlant } from "./ecology";
import { runExperiment, designScore, matchingObservation } from "./economy";
import { emptyStock, refreshTile, returnMaterial } from "./laws";
import {
  beginExperience,
  disposition,
  knows,
  learnObservation,
  reinforce,
  teachNearby,
  updateMind,
} from "./cognition";
import {
  refreshStructure,
  repairNeeds,
  repairStructure,
  salvageMaterial,
  workspaceBenefit,
} from "./weathering";
import {
  accumulateAtmosphere,
  CLAY,
  addNutrients,
  availableMixture,
  takeNutrients,
  moveSoil,
  oxygenFraction,
} from "./chemistry";
import { astronomy, groundDistanceMetres } from "./planet";
import { clamp, conditionalChoice, random } from "./random";
import {
  DAYS_PER_YEAR,
  HOURS_PER_TICK,
  type Activity,
  type Citizen,
  type Civilization,
  type Material,
  type Task,
  type Observation,
  type Tile,
  type World,
} from "./types";
import {
  distance,
  findPath,
  getTile,
  hours,
  housing,
  recordEvent,
  remember,
  tileIndex,
  touchTile,
  uid,
} from "./world";
import { nearbyTiles } from "./terrain";
import { hasPassage } from "./diplomacy";
import {
  prepareMetabolism,
  feedMetabolicNeeds,
  finishMetabolism,
  refillMetabolicIntake,
  type MetabolicStep,
  hydrationTarget,
  nearbyDrinkingWater,
  bodyShelter,
} from "./physiology";
import {
  beginBodyWork,
  bodyWorkOpportunities,
  finishBodyWork,
  isBodyRepair,
  workOnBody,
  type BodyWork,
} from "./bodywork";
import {
  beginFoodWork,
  finishFoodWork,
  foodWorkOpportunity,
  isFoodHandoff,
  workOnFood,
  type FoodWork,
} from "./foodwork";
import { walkPath, WALKING_METRES_PER_HOUR } from "./movement";
import {
  foodReservePerPerson,
  finishRationPickup,
  prepareRationPickup,
  SUBSISTENCE,
} from "./subsistence";
import { campRestPlace, canReachCampStocks } from "./settlement";

function assignTask(
  world: World,
  person: Citizen,
  kind: Activity,
  x: number,
  y: number,
  extra: Partial<Task> = {},
): boolean {
  const target = getTile(world, x, y);
  if (!target || target.terrain === "water") return false;
  const path = findPath(world, person, target, 1100);
  if (!path) return false;
  person.task = {
    kind,
    tile: tileIndex(world, x, y),
    path,
    progress: 0,
    ...extra,
  };
  beginExperience(person, kind, world.tick);
  return true;
}
function gatherTask(
  world: World,
  person: Citizen,
  civ: Civilization,
  material: Material,
): boolean {
  const ruin = world.structures.find(
    (s) =>
      s.collapsed &&
      s.properties.cost[material] > 0.1 &&
      groundDistanceMetres(s, civ) <
        WALKING_METRES_PER_HOUR * SUBSISTENCE.workTravelHours &&
      (s.civId === civ.id || (civ.relations[s.civId]?.affinity ?? 0) >= 0),
  );
  if (
    ruin &&
    assignTask(world, person, "salvage", ruin.x, ruin.y, {
      material,
      structureId: ruin.id,
    })
  )
    return true;
  const candidates = person.mind.places
    .filter(
      (place) =>
        world.tick - place.tick < 96 * 7 &&
        place[material === "biomass" ? "food" : material] >
          (material === "biomass" ? 2 : 1) &&
        groundDistanceMetres(place, civ) <=
          WALKING_METRES_PER_HOUR * SUBSISTENCE.workTravelHours,
    )
    .map((place) => getTile(world, place.x, place.y))
    .filter((tile): tile is NonNullable<typeof tile> => {
      if (
        !tile ||
        tile.terrain === "water" ||
        (tile.owner &&
          tile.owner !== civ.id &&
          (civ.relations[tile.owner]?.affinity ?? -1) < 0 &&
          !hasPassage(world, civ.id, tile.owner))
      )
        return false;
      return true;
    });
  candidates.sort(
    (a, b) =>
      distance(person, a) +
      distance(civ, a) * 0.3 -
      distance(person, b) -
      distance(civ, b) * 0.3,
  );
  for (const tile of candidates.slice(0, 10))
    if (
      assignTask(
        world,
        person,
        material === "biomass" ? "gather" : "extract",
        tile.x,
        tile.y,
        { material },
      )
    )
      return true;
  // Unseen resource locations are learned by walking into sensory range.
  const unexplored = nearbyTiles(world, person, 10).filter(
    (tile) =>
      tile.terrain !== "water" &&
      distance(tile, person) > 2 &&
      groundDistanceMetres(tile, civ) <=
        WALKING_METRES_PER_HOUR * SUBSISTENCE.workTravelHours &&
      !person.mind.places.some((p) => p.x === tile.x && p.y === tile.y),
  );
  unexplored.sort((a, b) => distance(a, person) - distance(b, person));
  for (const tile of unexplored.slice(0, 6))
    if (assignTask(world, person, "explore", tile.x, tile.y, { material }))
      return true;
  return false;
}
function decide(
  world: World,
  person: Citizen,
  civ: Civilization,
  population: number,
  bodyWork: BodyWork,
  foodWork: FoodWork,
): void {
  const sky = astronomy(world.tick, person.x, person.y),
    night = sky.solarAltitude < -6;
  if (person.hydration < hydrationTarget(person) * 0.6) {
    const known = person.mind.places.filter(
      (place) =>
        world.tick - place.tick < 96 * 7 &&
        ((place.water ?? 0) > 1 ||
          ((place.frozenWater ?? 0) > 1 &&
            person.provisions +
              person.metabolism.intake +
              person.metabolism.reserves +
              (person.cargo?.material === "biomass" ? person.cargo.amount : 0) >
              0.01)),
    );
    known.sort((a, b) => distance(person, a) - distance(person, b));
    for (const place of known) {
      const bank = nearbyTiles(world, place, 1.5).filter(
        (t) => t.terrain !== "water",
      );
      bank.sort((a, b) => distance(person, a) - distance(person, b));
      for (const tile of bank)
        if (
          assignTask(world, person, "move", tile.x, tile.y, { need: "water" })
        )
          return;
    }
    const search = nearbyTiles(world, person, 10).filter(
      (t) =>
        t.terrain !== "water" &&
        distance(person, t) > 2 &&
        !person.mind.places.some((p) => p.x === t.x && p.y === t.y),
    );
    search.sort((a, b) => distance(person, a) - distance(person, b));
    for (const tile of search.slice(0, 8))
      if (
        assignTask(world, person, "explore", tile.x, tile.y, { need: "water" })
      )
        return;
  }
  let selection: ReturnType<typeof conditionalChoice> | undefined;
  const choose = (probability: number) =>
    (selection ??= conditionalChoice(random(world)))(probability);
  // Actual bodily urgency takes precedence. An awake person may choose this at
  // night; a communal reserve target or a carried bundle is not a physical ban.
  if (
    person.age >= 12 &&
    !person.mind.sleeping &&
    person.hunger >= 40 &&
    person.hydration >= hydrationTarget(person) * 0.6 &&
    person.energy >= 23 &&
    person.mind.sleepPressure <= 0.75 &&
    person.sick <= 45
  ) {
    for (const opportunity of bodyWorkOpportunities(
      world,
      person,
      civ,
      bodyWork,
    )) {
      if (
        choose(
          0.65 *
            disposition(person, "repair") *
            (opportunity.recipient === person ? 1 : person.traits.sociability),
        ) &&
        assignTask(world, person, "repair", person.x, person.y, {
          material: "fiber",
          recipientId: opportunity.recipient.id,
          targetWrapMass: opportunity.target,
        })
      )
        return;
    }
    const food = foodWorkOpportunity(world, person, foodWork);
    if (
      food &&
      choose(
        0.65 * disposition(person, "deliver") * person.traits.sociability,
      ) &&
      assignTask(world, person, "deliver", person.x, person.y, {
        material: "biomass",
        recipientId: food.recipient.id,
        targetProvisionMass: food.target,
      })
    )
      return;
  }
  if (person.cargo) {
    assignTask(world, person, "deliver", civ.x, civ.y);
    return;
  }
  if (
    (person.hunger < 40 ||
      (person.provisions < 0.25 &&
        getTile(world, person.x, person.y)!.temperature < 10)) &&
    !canReachCampStocks(world, civ, person) &&
    civ.stock.biomass > 1e-9
  ) {
    assignTask(world, person, "move", civ.x, civ.y);
    return;
  }
  if (
    person.energy < 23 ||
    person.mind.sleepPressure > 0.75 ||
    night ||
    person.sick > 45
  ) {
    const shelter = world.structures.find(
      (s) =>
        s.civId === civ.id &&
        s.progress >= 1 &&
        !s.collapsed &&
        s.properties.capacity >= 1 &&
        world.citizens.filter(
          (p) =>
            p.task?.kind === "rest" &&
            p.task.tile === tileIndex(world, s.x, s.y),
        ).length < Math.floor(s.properties.capacity),
    );
    const place = shelter ?? campRestPlace(world, civ, person, population);
    assignTask(world, person, "rest", place.x, place.y);
    return;
  }
  if (person.age < 12) {
    const place = campRestPlace(world, civ, person, population);
    assignTask(
      world,
      person,
      random(world) < 0.5 ? "social" : "rest",
      place.x,
      place.y,
    );
    return;
  }
  // Retain the existing one-draw work decision even when an urgent communal
  // gathering branch does not need a probability. Earlier care shares that draw.
  selection ??= conditionalChoice(random(world));
  const project = world.structures.find(
    (s) => s.civId === civ.id && s.progress < 1 && !s.collapsed,
  );
  if (
    civ.stock.biomass < population * (2 + civ.policies.sharing * 2) &&
    gatherTask(world, person, civ, "biomass")
  )
    return;
  const foodTarget = population * foodReservePerPerson(world, civ);
  if (
    civ.stock.biomass < foodTarget &&
    choose(civ.focus === "nourish" ? 0.85 : 0.65) &&
    gatherTask(world, person, civ, "biomass")
  )
    return;
  if (
    civ.focus === "connect" &&
    person.energy > 65 &&
    person.hunger > 65 &&
    choose(0.3 * disposition(person, "explore"))
  ) {
    const frontiers = nearbyTiles(world, civ, 22).filter(
      (tile) =>
        tile.terrain !== "water" &&
        distance(tile, civ) > 12 &&
        distance(tile, civ) < 22 &&
        !person.mind.places.some(
          (place) => place.x === tile.x && place.y === tile.y,
        ),
    );
    // A bearing is chosen from represented land, without looking up foreign camps or inventories.
    const start = Math.floor(random(world) * Math.max(1, frontiers.length));
    for (let offset = 0; offset < Math.min(8, frontiers.length); offset++) {
      const tile = frontiers[(start + offset) % frontiers.length];
      if (assignTask(world, person, "explore", tile.x, tile.y)) return;
    }
  }
  const damaged = world.structures.find(
    (s) =>
      s.civId === civ.id &&
      !s.collapsed &&
      s.progress >= 1 &&
      (s.maintenance || (s.condition < 88 && distance(s, person) < 3)),
  );
  if (damaged && choose(0.65 * disposition(person, "repair"))) {
    const needs = repairNeeds(damaged);
    if (
      Object.entries(needs).some(
        ([m, amount]) => amount > 0.01 && civ.stock[m as Material] > 0.01,
      )
    ) {
      if (
        assignTask(world, person, "repair", damaged.x, damaged.y, {
          structureId: damaged.id,
        })
      )
        return;
    } else
      for (const [material, amount] of Object.entries(needs))
        if (
          amount > 0.01 &&
          gatherTask(world, person, civ, material as Material)
        )
          return;
  }
  if (
    project &&
    choose(
      (civ.focus === "build" ? 0.72 : 0.4) * disposition(person, "assemble"),
    ) &&
    assignTask(world, person, "assemble", project.x, project.y, {
      structureId: project.id,
    })
  )
    return;
  const best = civ.observations
    .filter(
      (o) =>
        knows(person, o.id) && o.properties.stable && o.properties.mass <= 1600,
    )
    .sort((a, b) => designScore(b.properties) - designScore(a.properties))[0];
  const materialNeeds = best?.properties.cost;
  if (
    person.mind.socialNeed > 0.65 &&
    choose(0.5 * disposition(person, "social")) &&
    assignTask(world, person, "social", civ.x, civ.y)
  )
    return;
  if (
    civ.stock.wood < Math.min(1600, Math.max(30, materialNeeds?.wood ?? 0)) &&
    choose(0.6) &&
    gatherTask(world, person, civ, "wood")
  )
    return;
  if (
    civ.stock.fiber < Math.max(5, Math.min(1600, materialNeeds?.fiber ?? 0)) &&
    gatherTask(world, person, civ, "fiber")
  )
    return;
  if (materialNeeds && choose(0.55))
    for (const material of ["stone", "clay"] as const)
      if (
        civ.stock[material] < Math.min(1600, materialNeeds[material]) &&
        gatherTask(world, person, civ, material)
      )
        return;
  if ((civ.focus === "preserve" || civ.focus === "nourish") && choose(0.35)) {
    const patches = nearbyTiles(world, civ, 7).filter(
      (t) =>
        distance(t, civ) < 7 &&
        t.terrain === "meadow" &&
        !world.structures.some((s) => distance(s, t) < 1),
    );
    patches.sort((a, b) => (a.plant?.carbon ?? 0) - (b.plant?.carbon ?? 0));
    if (
      patches[0] &&
      assignTask(world, person, "tend", patches[0].x, patches[0].y)
    )
      return;
  }
  if (
    civ.hypothesis ||
    choose(
      (0.25 +
        person.traits.curiosity * 0.3 +
        (civ.focus === "discover" ? 0.25 : 0)) *
        disposition(person, "experiment"),
    )
  ) {
    const place = world.structures.find(
      (s) =>
        s.civId === civ.id &&
        s.progress >= 1 &&
        !s.collapsed &&
        s.properties.workSurface > 0.2,
    );
    const location = place ?? campRestPlace(world, civ, person, population);
    if (assignTask(world, person, "experiment", location.x, location.y)) return;
  }
  if (
    civ.stock.biomass < foodTarget &&
    gatherTask(world, person, civ, "biomass")
  )
    return;
  const idlePlace = campRestPlace(world, civ, person, population);
  assignTask(
    world,
    person,
    person.happiness < 65 ? "social" : "rest",
    idlePlace.x,
    idlePlace.y,
  );
}

function finishTask(world: World, person: Citizen, civ: Civilization): void {
  const task = person.task!,
    tile = world.tiles[task.tile],
    skill = 1 + person.skill * 0.06;
  let reward = 0.25;
  if (task.kind === "gather" || task.kind === "extract") {
    const material = task.material!,
      definition = MATERIALS[material];
    let amount = 0;
    if (material === "stone") {
      amount = Math.min(tile.rock, 8 * skill);
      tile.rock -= amount;
    } else if (material === "clay") {
      amount = takeNutrients(tile, CLAY, 5 * skill);
    } else {
      for (const plant of [tile.plant, tile.groundcover])
        if (plant) {
          const tissue =
            material === "wood"
              ? plant.genome.woodiness
              : material === "fiber"
                ? (1 - plant.genome.woodiness) * 0.5
                : (1 - plant.genome.woodiness) * (1 - plant.genome.defense);
          const maxCut =
            civ.focus === "preserve"
              ? 0.22
              : 0.25 + civ.policies.extraction * 0.6;
          const taken = Math.max(
            0,
            Math.min(
              (material === "biomass" ? 6 : 12) * skill - amount,
              (plant.carbon * tissue * maxCut) / definition.carbon,
              plant.mineral / definition.mineral,
            ),
          );
          plant.carbon -= taken * definition.carbon;
          plant.mineral -= taken * definition.mineral;
          amount += taken;
        }
      if (material === "biomass") civ.harvests += amount;
    }
    if (amount > 0) person.cargo = { material, amount };
    reward = amount > 0 ? Math.min(1, amount / 8) : -0.6;
    refreshTile(tile);
    touchTile(world, task.tile);
  } else if (task.kind === "deliver" && person.cargo) {
    civ.stock[person.cargo.material] += person.cargo.amount;
    person.cargo = null;
  } else if (task.kind === "experiment") {
    const hypothesis = civ.hypothesis;
    const completed = runExperiment(
      world,
      civ,
      hypothesis ?? undefined,
      person,
    );
    reward = completed ? 0.6 : -0.3;
    if (hypothesis && completed) civ.hypothesis = null;
  } else if (task.kind === "tend") {
    const home = getTile(world, civ.x, civ.y)!;
    if (home !== tile) moveSoil(home, tile, 0.4);
    if (!tile.plant) {
      const donor = nearbyTiles(world, tile, 5)
        .filter((t) => t.plant && distance(t, tile) < 5)
        .sort((a, b) => b.forage - a.forage)[0];
      if (donor) seedPlant(world, donor, tile, "plant", true);
    }
    refreshTile(tile);
    touchTile(world, task.tile);
  } else if (task.kind === "social") {
    person.happiness = clamp(person.happiness + 5 + civ.policies.sharing * 4);
    person.energy = clamp(person.energy + 4);
    teachNearby(world, person);
    if (random(world) < 0.08)
      remember(
        world,
        person,
        `Shared time and stories with the people of ${civ.name}.`,
      );
  } else if (task.kind === "repair") {
    const structure = world.structures.find((s) => s.id === task.structureId);
    const repaired = structure
      ? repairStructure(world, civ, structure, 2 * skill)
      : 0;
    reward = repaired > 0 ? 0.8 : -0.3;
    if (structure && repaired > 0)
      remember(
        world,
        person,
        `Replaced worn material in ${structure.design.name}; its strength improved through work.`,
      );
  } else if (task.kind === "salvage") {
    const structure = world.structures.find((s) => s.id === task.structureId);
    const recovered = structure
      ? salvageMaterial(world, structure, task.material!, 8 * skill)
      : 0;
    if (recovered > 0)
      person.cargo = { material: task.material!, amount: recovered };
    reward = recovered > 0 ? 0.7 : -0.4;
  } else if (task.kind === "explore") {
    reward = person.mind.places.some(
      (p) => distance(p, person) < 3 && p.food > 2,
    )
      ? 0.5
      : 0.1;
  }
  reinforce(person, reward, world.tick);
  person.experience[task.kind] = (person.experience[task.kind] ?? 0) + 1;
  person.specialty =
    (Object.entries(person.experience).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] as Activity) ?? "gather";
  person.skill = Math.min(10, person.skill + 0.014);
  person.task = null;
}

export function updateCitizen(
  world: World,
  person: Citizen,
  civ: Civilization,
  population: number,
  sharedBodyWork?: BodyWork,
): void {
  if (person.health <= 0) return;
  const bodyWork = sharedBodyWork ?? beginBodyWork(world);
  const step = prepareCitizenPhysiology(world, person, civ);
  feedMetabolicNeeds(world, [step.metabolism]);
  finishCitizenPhysiology(world, step);
  refillMetabolicIntake(world, [step.metabolism]);
  finishRationPickup(world, prepareRationPickup(world, [person]));
  const foodWork = beginFoodWork(world, bodyWork);
  updateCitizenActivity(world, step, population, bodyWork, foodWork);
  // Standalone diagnostic callers update one actor. The world engine passes one
  // population through updateCitizens; calling this repeatedly does not provide
  // a shared food boundary. A supplied body context only groups body transfers.
  if (!sharedBodyWork) finishBodyWork(world, bodyWork);
  finishFoodWork(world, foodWork);
}

/** Shared current food needs, actual oxidation, optional meals/rations, then work. */
export function updateCitizens(world: World): void {
  const populations = new Map<string, number>();
  for (const person of world.citizens)
    populations.set(person.civId, (populations.get(person.civId) ?? 0) + 1);
  const civs = new Map(world.civilizations.map((civ) => [civ.id, civ]));
  const bodyWork = beginBodyWork(world);
  const steps = world.citizens
    .filter((person) => person.health > 0)
    .map((person) =>
      prepareCitizenPhysiology(world, person, civs.get(person.civId)!),
    );
  const metabolism = steps.map((step) => step.metabolism);
  feedMetabolicNeeds(world, metabolism);
  for (const step of steps) finishCitizenPhysiology(world, step);
  refillMetabolicIntake(world, metabolism);
  finishRationPickup(world, prepareRationPickup(world));
  const foodWork = beginFoodWork(world, bodyWork);
  for (const step of steps)
    updateCitizenActivity(
      world,
      step,
      populations.get(step.person.civId)!,
      bodyWork,
      foodWork,
    );
  finishBodyWork(world, bodyWork);
  finishFoodWork(world, foodWork);
}

interface CitizenStep {
  person: Citizen;
  civ: Civilization;
  taskAtStart: Task | null;
  tile: Tile;
  waterTarget: number;
  sheltered: number;
  metabolism: MetabolicStep;
}

function prepareCitizenPhysiology(
  world: World,
  person: Citizen,
  civ: Civilization,
): CitizenStep {
  const taskAtStart = person.task;
  const dt = HOURS_PER_TICK,
    tile = getTile(world, person.x, person.y)!;
  updateMind(world, person, dt);
  person.age += dt / (24 * DAYS_PER_YEAR);
  const active = !!(
    person.task &&
    (person.task.path.length || !["rest", "social"].includes(person.task.kind))
  );
  person.energy = clamp(
    person.energy - dt * (active ? 0.7 + civ.policies.effort * 0.9 : 0.4),
  );
  const waterLoss = Math.min(person.hydration, dt * 0.065 * (active ? 1.2 : 1));
  person.hydration -= waterLoss;
  accumulateAtmosphere(world, "water", waterLoss);
  const waterTarget = hydrationTarget(person);
  if (person.hydration < waterTarget * 0.8) {
    const source = nearbyDrinkingWater(world, person);
    if (source && source.water > 0.1) {
      const drink = Math.min(source.water, waterTarget - person.hydration);
      source.water -= drink;
      person.hydration += drink;
      touchTile(world, tileIndex(world, source.x, source.y));
    }
  }
  const shelter = bodyShelter(world, person);
  const metabolism = prepareMetabolism(
    world,
    person,
    tile,
    dt,
    active,
    shelter.resistance,
  );
  return {
    person,
    civ,
    taskAtStart,
    tile,
    waterTarget,
    sheltered: shelter.coverage,
    metabolism,
  };
}

function finishCitizenPhysiology(world: World, step: CitizenStep): void {
  const { person } = step;
  const dt = HOURS_PER_TICK;
  const flux = finishMetabolism(world, step.metabolism);
  if (
    person.health > 0 &&
    flux.healthLoss === 0 &&
    flux.unmetMaintenanceKJ < 1e-9
  )
    person.health = clamp(
      person.health + dt * (0.08 + person.traits.resilience * 0.1),
    );
  const breathable = oxygenFraction(world);
  if (breathable < 0.15)
    person.health = clamp(person.health - dt * (1 - breathable / 0.15) * 16);
  if (person.hydration < 0.15) person.health = clamp(person.health - dt * 1.3);
  if (person.sick > 0) {
    person.sick = Math.max(
      0,
      person.sick - dt * (0.16 + person.traits.resilience * 0.15),
    );
    person.health = clamp(person.health - dt * 0.12);
  }
  if (world.tick % 4 === 0) {
    const exposed = world.citizens.some(
      (other) =>
        other.id !== person.id &&
        other.sick > 20 &&
        distance(other, person) < 1.2,
    );
    if (
      random(world) <
      (exposed ? 0.006 : 0.00008) * (1 - person.traits.resilience * 0.5)
    )
      person.sick = 30;
  }
}

function updateCitizenActivity(
  world: World,
  step: CitizenStep,
  population: number,
  bodyWork: BodyWork,
  foodWork: FoodWork,
): void {
  const { person, civ, taskAtStart, tile, waterTarget, sheltered } = step;
  if (person.health <= 0) return;
  // Assess satiety after actual meals, including for traveling people.
  const satisfaction =
    (person.hunger + person.energy + person.health) / 3 -
    5 +
    civ.policies.sharing * 3 +
    sheltered * 4 -
    person.sick * 0.2;
  person.happiness = clamp(
    person.happiness + (satisfaction - person.happiness) * 0.004,
  );
  if (person.journeyId) return;
  const dt = HOURS_PER_TICK,
    atHome = canReachCampStocks(world, civ, person);
  if (person.task) {
    const task = person.task;
    const personalWork = isBodyRepair(task) || isFoodHandoff(task);
    const headingHome =
      (task.kind === "rest" ||
        (task.kind === "deliver" && !isFoodHandoff(task)) ||
        task.kind === "move") &&
      task.path.at(-1) === tileIndex(world, civ.x, civ.y);
    const needsFood =
      (personalWork && person.hunger < 40) ||
      ((person.hunger < 40 ||
        (person.provisions < 0.25 && tile.temperature < 10)) &&
        civ.stock.biomass > 1e-9 &&
        !atHome &&
        !headingHome);
    const needsRest =
      (person.energy < 23 ||
        person.mind.sleepPressure > 0.75 ||
        (astronomy(world.tick, person.x, person.y).solarAltitude < -6 &&
          !personalWork) ||
        person.sick > 45) &&
      task.kind !== "rest" &&
      (task.kind !== "deliver" || personalWork);
    const thirsty = person.hydration < waterTarget * 0.6;
    const pursuingWater =
      task.need === "water" &&
      (!task.path.length || world.tiles[task.path[0]]?.terrain !== "water");
    // Water is decide()'s first urgency. Reassigning its valid route every tick
    // would cancel every paid interval before movement; lower-priority needs
    // must not cancel it only to choose the same route again.
    if (thirsty ? !pursuingWater : needsFood || needsRest) {
      // Bodily needs can interrupt ongoing work, including a multi-day assembly.
      // Existing fabric/progress and carried matter remain in the world.
      reinforce(person, -0.2, world.tick);
      person.task = null;
      person.mind.sleeping = false;
    }
  }
  if (!person.task) decide(world, person, civ, population, bodyWork, foodWork);
  const task = person.task;
  if (!task) return;
  // New decisions start their physical interval next tick. Existing work and
  // travel receive only the activity actually funded after resting maintenance.
  if (task !== taskAtStart) return;
  const flux = person.metabolism.last!;
  // Stationary conversation uses the paid resting allowance. Walking and all
  // physical work require the additional active budget measured this interval.
  const funded = step.metabolism.active
    ? flux.activityFraction
    : clamp(flux.releasedKJ / flux.maintenanceKJ, 0, 1);
  if (task.path.length) {
    walkPath(
      world,
      person,
      task.path,
      dt * funded,
      person.energy,
      person.age < 12,
    );
    return;
  }
  if (task.kind === "rest") {
    person.energy = clamp(person.energy + dt * (5 + sheltered * 2));
    if (
      person.energy > 94 &&
      person.mind.sleepPressure < 0.35 &&
      astronomy(world.tick, person.x, person.y).solarAltitude > -6
    ) {
      reinforce(person, 0.6, world.tick);
      person.task = null;
    }
    return;
  }
  if (task.kind === "move") {
    person.task = null;
    return;
  }
  const work =
    dt *
    funded *
    (0.65 + person.traits.diligence * 0.5) *
    (0.75 + civ.policies.effort * 0.5) *
    (0.65 + person.mind.attention * 0.4) *
    (1 +
      (task.kind === "experiment" || task.kind === "extract"
        ? workspaceBenefit(world, person)
        : 0));
  if (isBodyRepair(task)) {
    // Selection alone performs no work. The next tick accounts this task as
    // active before any protection is earned; rest/gather cannot run beside it.
    workOnBody(world, person, dt * funded, work, bodyWork);
    return;
  }
  if (isFoodHandoff(task)) {
    workOnFood(world, person, dt * funded, work, foodWork);
    return;
  }
  if (task.kind === "assemble") {
    const structure = world.structures.find((s) => s.id === task.structureId);
    if (!structure || structure.progress >= 1) {
      person.task = null;
      return;
    }
    structure.progress = Math.min(
      1,
      structure.progress + work / structure.properties.work,
    );
    if (structure.progress >= 1) {
      if (structure.properties.stable) {
        recordEvent(world, {
          category: "building",
          title: `${structure.design.name} stands`,
          detail: `${civ.name} has made ${structure.properties.coveredArea.toFixed(1)} m² of covered space. Its effect follows from the geometry and materials.`,
          civId: civ.id,
          x: structure.x,
          y: structure.y,
        });
        remember(
          world,
          person,
          `Helped turn ${structure.design.name} from an idea into something that stands.`,
        );
      } else {
        structure.collapsed = true;
        refreshStructure(structure);
        recordEvent(world, {
          category: "building",
          title: "An assembly gives way",
          detail: `${structure.design.name} could not support its loads. Its matter remains at the site for recovery and weathering.`,
          civId: civ.id,
          x: structure.x,
          y: structure.y,
        });
      }
      let observation = matchingObservation(
        civ,
        structure.design,
        structure.properties,
        "construction",
      );
      if (!observation) {
        observation = {
          id: uid(world, "observation"),
          tick: world.tick,
          statement: structure.properties.stable
            ? "The full-sized assembly carried its own loads"
            : "The full-sized assembly failed under its own loads",
          evidence: `${person.name} took part in construction and observed the outcome.`,
          design: structuredClone(structure.design),
          properties: structuredClone(structure.properties),
          trials: 0,
          research: {
            authorId: person.id,
            method: "construction",
            prediction: { stable: true, coveredArea: 0, storageVolume: 0 },
            surprise: structure.properties.stable ? 0 : 1,
            confidence: 0.95,
            samples: emptyStock(),
          },
        } satisfies Observation;
        civ.observations.push(observation);
      }
      observation.trials++;
      observation.research.confidence = 0.95;
      learnObservation(world, person, observation);
      reinforce(person, structure.collapsed ? -0.8 : 0.9, world.tick);
      person.experience.assemble = (person.experience.assemble ?? 0) + 1;
      person.task = null;
    }
  } else {
    task.progress += work;
    const duration =
      task.kind === "experiment"
        ? 4
        : task.kind === "deliver"
          ? 0.1
          : task.kind === "gather"
            ? 2.4
            : task.kind === "extract"
              ? 3
              : 2;
    if (task.progress >= duration) finishTask(world, person, civ);
  }
}
export function processDeaths(world: World): void {
  const dead = world.citizens.filter(
    (p) =>
      p.health <= 0 ||
      p.body <= 1e-12 ||
      (p.age > 74 &&
        world.tick % 96 === 0 &&
        random(world) < (p.age - 74) * 0.008),
  );
  for (const person of dead) {
    const tile = getTile(world, person.x, person.y)!,
      civ = world.civilizations.find((c) => c.id === person.civId)!;
    returnMaterial(world, tile, "biomass", person.body);
    returnMaterial(world, tile, "biomass", person.metabolism.intake);
    returnMaterial(world, tile, "fiber", person.wrapMass);
    returnMaterial(world, tile, "biomass", person.provisions);
    tile.water += person.hydration;
    if (person.cargo)
      returnMaterial(world, tile, person.cargo.material, person.cargo.amount);
    world.deaths++;
    civ.deaths++;
    for (const relative of world.citizens.filter(
      (p) => p.partnerId === person.id || p.parentIds.includes(person.id),
    )) {
      if (relative.partnerId === person.id) relative.partnerId = null;
      relative.happiness = clamp(relative.happiness - 15);
      relative.mind.stress = clamp(relative.mind.stress + 0.5, 0, 1);
      remember(world, relative, `Lost ${person.name}.`, "sad");
    }
    recordEvent(world, {
      category: "life",
      title: `${person.name} is remembered`,
      detail: `${Math.floor(person.age)} years of life in ${civ.name}. At the end: ${Math.round(person.hunger)}% nourishment, ${Math.round(person.energy)}% rest, ${person.hydration.toFixed(1)} kg hydration and ${tile.temperature.toFixed(1)} °C nearby. Their matter returns to the living world.`,
      civId: civ.id,
      citizenId: person.id,
      lifeState: {
        nourishment: person.hunger,
        rest: person.energy,
        hydration: person.hydration,
        temperature: tile.temperature,
        oxygenFraction: oxygenFraction(world),
        sickness: person.sick,
        metabolism: {
          bodyKg: person.body,
          intakeKg: person.metabolism.intake,
          reserveKg: person.metabolism.reserves,
          last: person.metabolism.last ? { ...person.metabolism.last } : null,
        },
      },
      x: person.x,
      y: person.y,
    });
  }
  if (dead.length) {
    const ids = new Set(dead.map((p) => p.id));
    world.citizens = world.citizens.filter((p) => !ids.has(p.id));
  }
}
