import { MATERIALS } from "./content";
import { seedPlant } from "./ecology";
import { runExperiment } from "./economy";
import { refreshTile, respire, respirable, returnMaterial } from "./laws";
import {
  BIO_NUTRIENTS,
  CLAY,
  addNutrients,
  availableMixture,
  takeNutrients,
  moveSoil,
  oxygenFraction,
} from "./chemistry";
import { astronomy } from "./planet";
import { clamp, random } from "./random";
import {
  DAYS_PER_YEAR,
  HOURS_PER_TICK,
  type Activity,
  type Citizen,
  type Civilization,
  type Material,
  type Task,
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
} from "./world";
import { nearbyTiles } from "./terrain";

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
  return true;
}
function gatherTask(
  world: World,
  person: Citizen,
  civ: Civilization,
  material: Material,
): boolean {
  const candidates = nearbyTiles(world, civ, 12).filter((tile) => {
    if (
      distance(tile, civ) > 12 ||
      tile.terrain === "water" ||
      (tile.owner &&
        tile.owner !== civ.id &&
        (civ.relations[tile.owner]?.affinity ?? 0) < 0)
    )
      return false;
    if (material === "stone") return tile.rock > 6;
    if (material === "clay") return availableMixture(tile, CLAY) > 3;
    const plants = [tile.plant, tile.groundcover].filter((p) => p !== null);
    if (
      plants.reduce((sum, p) => sum + p!.carbon, 0) <
      (civ.focus === "preserve" ? 15 : 3)
    )
      return false;
    if (material === "biomass") return tile.forage > 4;
    return (
      plants.reduce(
        (sum, p) =>
          sum +
          p!.carbon *
            (material === "wood"
              ? p!.genome.woodiness
              : 1 - p!.genome.woodiness),
        0,
      ) > 6
    );
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
  return false;
}
function decide(
  world: World,
  person: Citizen,
  civ: Civilization,
  population: number,
): void {
  const sky = astronomy(world.tick, person.x, person.y),
    night = sky.solarAltitude < -6;
  if (person.cargo) {
    assignTask(world, person, "deliver", civ.x, civ.y);
    return;
  }
  if (person.hunger < 40 && civ.stock.biomass > 0.8) {
    assignTask(world, person, "rest", civ.x, civ.y);
    return;
  }
  if (person.energy < 23 || night || person.sick > 45) {
    const shelter = world.structures.find(
      (s) =>
        s.civId === civ.id &&
        s.progress >= 1 &&
        s.properties.capacity >= 1 &&
        world.citizens.filter(
          (p) =>
            p.task?.kind === "rest" &&
            p.task.tile === tileIndex(world, s.x, s.y),
        ).length < Math.floor(s.properties.capacity),
    );
    assignTask(world, person, "rest", shelter?.x ?? civ.x, shelter?.y ?? civ.y);
    return;
  }
  if (person.age < 12) {
    assignTask(
      world,
      person,
      random(world) < 0.5 ? "social" : "rest",
      civ.x,
      civ.y,
    );
    return;
  }
  const chance = random(world);
  const project = world.structures.find(
    (s) => s.civId === civ.id && s.progress < 1,
  );
  if (
    civ.stock.biomass < population * (2 + civ.policies.sharing * 2) &&
    gatherTask(world, person, civ, "biomass")
  )
    return;
  if (
    project &&
    chance < (civ.focus === "build" ? 0.72 : 0.4) &&
    assignTask(world, person, "assemble", project.x, project.y, {
      structureId: project.id,
    })
  )
    return;
  const best = [...civ.observations].sort(
    (a, b) => b.properties.coveredArea - a.properties.coveredArea,
  )[0];
  const materialNeeds = best?.properties.cost;
  if (
    civ.stock.wood < Math.min(160, Math.max(30, materialNeeds?.wood ?? 0)) &&
    chance < 0.6 &&
    gatherTask(world, person, civ, "wood")
  )
    return;
  if (
    civ.stock.fiber < Math.max(5, Math.min(40, materialNeeds?.fiber ?? 0)) &&
    gatherTask(world, person, civ, "fiber")
  )
    return;
  if (materialNeeds && chance < 0.55)
    for (const material of ["stone", "clay"] as const)
      if (
        civ.stock[material] < Math.min(120, materialNeeds[material]) &&
        gatherTask(world, person, civ, material)
      )
        return;
  if ((civ.focus === "preserve" || civ.focus === "nourish") && chance < 0.35) {
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
    chance <
      0.25 +
        person.traits.curiosity * 0.3 +
        (civ.focus === "discover" ? 0.25 : 0)
  ) {
    assignTask(world, person, "experiment", civ.x, civ.y);
    return;
  }
  if (
    civ.stock.biomass < population * 7 &&
    gatherTask(world, person, civ, "biomass")
  )
    return;
  assignTask(
    world,
    person,
    person.happiness < 65 ? "social" : "rest",
    civ.x,
    civ.y,
  );
}

function finishTask(world: World, person: Citizen, civ: Civilization): void {
  const task = person.task!,
    tile = world.tiles[task.tile],
    skill = 1 + person.skill * 0.06;
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
    refreshTile(tile);
    touchTile(world, task.tile);
  } else if (task.kind === "deliver" && person.cargo) {
    civ.stock[person.cargo.material] += person.cargo.amount;
    person.cargo = null;
  } else if (task.kind === "experiment") {
    const hypothesis = civ.hypothesis;
    const completed = runExperiment(world, civ, hypothesis ?? undefined);
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
    if (random(world) < 0.08)
      remember(
        world,
        person,
        `Shared time and stories with the people of ${civ.name}.`,
      );
  }
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
): void {
  const dt = HOURS_PER_TICK,
    home = getTile(world, civ.x, civ.y)!,
    tile = getTile(world, person.x, person.y)!;
  person.age += dt / (24 * DAYS_PER_YEAR);
  const active = person.task && !["rest", "social"].includes(person.task.kind);
  person.hunger = clamp(
    person.hunger -
      dt *
        (person.age < 12
          ? 1.15
          : (active ? 1.75 : 1.3) + (person.pregnancy ? 0.18 : 0)),
  );
  person.energy = clamp(
    person.energy - dt * (active ? 0.7 + civ.policies.effort * 0.9 : 0.4),
  );
  const waterLoss = Math.min(person.hydration, dt * 0.065 * (active ? 1.2 : 1));
  person.hydration -= waterLoss;
  world.atmosphere.water += waterLoss;
  const waterTarget = person.age < 12 ? 1 + person.body * 0.25 : 8;
  if (person.hydration < waterTarget * 0.8 && tile.water > 0.1) {
    const drink = Math.min(tile.water, waterTarget - person.hydration);
    tile.water -= drink;
    person.hydration += drink;
  }
  if (
    distance(person, civ) < 2.4 &&
    person.hunger < 62 &&
    civ.stock.biomass >= 0.8
  ) {
    const meal = Math.min(
      civ.stock.biomass,
      person.age < 12 ? 0.65 : 0.9,
      respirable(world, 1) / 0.94,
    );
    civ.stock.biomass -= meal;
    const retained =
      person.body < 18 ? Math.min(meal * 0.35, 18 - person.body) : 0;
    person.body += retained;
    respire(world, (meal - retained) * 0.94, home);
    addNutrients(home, BIO_NUTRIENTS, (meal - retained) * 0.06);
    person.hunger = clamp(person.hunger + meal * 48);
  }
  if (person.hunger < 12) {
    const catabolism = Math.min(
      person.body,
      dt * 0.015,
      respirable(world, 1) / 0.94,
    );
    person.body -= catabolism;
    respire(world, catabolism * 0.94, tile);
    addNutrients(tile, BIO_NUTRIENTS, catabolism * 0.06);
    person.health = clamp(person.health - dt * 1.15);
  } else
    person.health = clamp(
      person.health + dt * (0.08 + person.traits.resilience * 0.1),
    );
  if (person.hydration < 0.15) person.health = clamp(person.health - dt * 1.3);
  const breathable = oxygenFraction(world);
  if (breathable < 0.15)
    person.health = clamp(person.health - dt * (1 - breathable / 0.15) * 16);
  const nearbyShelter = world.structures.find(
    (s) => s.civId === civ.id && s.progress >= 1 && distance(person, s) < 0.5,
  );
  const sheltered = nearbyShelter
    ? Math.min(
        1,
        nearbyShelter.properties.capacity /
          Math.max(
            1,
            world.citizens.filter((p) => distance(p, nearbyShelter) < 0.5)
              .length,
          ),
      )
    : 0;
  if (tile.temperature < 3)
    person.health = clamp(
      person.health - dt * (3 - tile.temperature) * 0.055 * (1 - sheltered),
    );
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
  const satisfaction =
    (person.hunger + person.energy + person.health) / 3 -
    5 +
    civ.policies.sharing * 3 +
    sheltered * 4 -
    person.sick * 0.2;
  person.happiness = clamp(
    person.happiness + (satisfaction - person.happiness) * 0.004,
  );
  if (!person.task) decide(world, person, civ, population);
  const task = person.task;
  if (!task) return;
  if (task.path.length) {
    const nextIndex = task.path[0],
      next = world.tiles[nextIndex],
      dx = next.x - person.x,
      dy = next.y - person.y,
      length = Math.hypot(dx, dy);
    const pace =
      dt *
      (person.age < 12 ? 1 : 1.55) *
      (0.6 + person.energy / 250) *
      (next.terrain === "hill" ? 0.7 : 1);
    if (length <= pace) {
      person.x = next.x;
      person.y = next.y;
      task.path.shift();
    } else {
      person.x += (dx / length) * pace;
      person.y += (dy / length) * pace;
    }
    next.road = clamp(next.road + 0.002, 0, 1);
    touchTile(world, nextIndex);
    return;
  }
  if (task.kind === "rest") {
    person.energy = clamp(person.energy + dt * (5 + sheltered * 2));
    if (
      person.energy > 94 &&
      astronomy(world.tick, person.x, person.y).solarAltitude > -6
    )
      person.task = null;
    return;
  }
  if (task.kind === "move") {
    person.task = null;
    return;
  }
  const work =
    dt *
    (0.65 + person.traits.diligence * 0.5) *
    (0.75 + civ.policies.effort * 0.5);
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
        for (const [material, amount] of Object.entries(
          structure.properties.cost,
        ))
          returnMaterial(
            world,
            world.tiles[task.tile],
            material as Material,
            amount,
          );
        world.structures = world.structures.filter((s) => s !== structure);
        recordEvent(world, {
          category: "building",
          title: "An assembly gives way",
          detail: `${structure.design.name} could not support its loads. Its matter returns to the site.`,
          civId: civ.id,
          x: structure.x,
          y: structure.y,
        });
      }
      person.experience.assemble = (person.experience.assemble ?? 0) + 1;
      person.task = null;
    }
  } else {
    task.progress += work;
    const duration =
      task.kind === "experiment"
        ? 6
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
      (p.age > 74 &&
        world.tick % 96 === 0 &&
        random(world) < (p.age - 74) * 0.008),
  );
  for (const person of dead) {
    const tile = getTile(world, person.x, person.y)!,
      civ = world.civilizations.find((c) => c.id === person.civId)!;
    returnMaterial(world, tile, "biomass", person.body);
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
      remember(world, relative, `Lost ${person.name}.`, "sad");
    }
    recordEvent(world, {
      category: "life",
      title: `${person.name} is remembered`,
      detail: `${Math.floor(person.age)} years of life in ${civ.name}. Their matter returns to the living world.`,
      civId: civ.id,
      citizenId: person.id,
      x: person.x,
      y: person.y,
    });
  }
  if (dead.length) {
    const ids = new Set(dead.map((p) => p.id));
    world.citizens = world.citizens.filter((p) => !ids.has(p.id));
  }
}
