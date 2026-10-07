import { FAUNA_BY_ID, habitatSuitability } from "./life";
import { BIO_NUTRIENTS, addNutrients, oxygenFraction } from "./chemistry";
import { LAWS, refreshTile, respirable, respire, returnMaterial } from "./laws";
import { seedPlant } from "./ecology";
import { between, clamp, random } from "./random";
import { nearbyTiles, getTile, tileIndex } from "./terrain";
import type { Animal, FaunaSpecies, Plant, Tile, World } from "./types";

const edible = (plant: Plant, nectar = false) =>
  Math.max(
    0,
    Math.min(
      (plant.carbon *
        (nectar
          ? Math.max(0, plant.genome.pollination) * 0.006
          : (1 - plant.genome.woodiness) * (1 - plant.genome.defense) * 0.3)) /
        0.94,
      plant.mineral / 0.06,
    ),
  );
const canHunt = (hunter: Animal, prey: Animal): boolean => {
  if (hunter === prey || hunter.species === prey.species || prey.count <= 0)
    return false;
  const a = FAUNA_BY_ID[hunter.species],
    b = FAUNA_BY_ID[prey.species];
  if (a.habitat === "water" && b.habitat !== "water") return false;
  return b.dryMass * prey.traits.size <= a.dryMass * hunter.traits.size * 1.4;
};
export function eatPlant(
  animal: Animal,
  tile: Tile,
  requested: number,
  nectar = false,
): number {
  let eaten = 0;
  for (const plant of [tile.groundcover, tile.plant])
    if (plant && eaten < requested) {
      const amount = Math.min(requested - eaten, edible(plant, nectar));
      plant.carbon -= amount * 0.94;
      plant.mineral -= amount * 0.06;
      eaten += amount;
    }
  animal.body += eaten * 0.7;
  tile.detritus.carbon += eaten * 0.3 * 0.94;
  tile.detritus.mineral += eaten * 0.3 * 0.06;
  return eaten;
}
export function hunt(
  world: World,
  animal: Animal,
  prey: Animal,
  tile: Tile,
  requested: number,
): number {
  if (
    !canHunt(animal, prey) ||
    requested <= 0 ||
    Math.hypot(animal.x - prey.x, animal.y - prey.y) > 1.5
  )
    return 0;
  const members = Math.min(
    prey.count,
    Math.max(
      1,
      Math.ceil(requested / Math.max(0.0000001, prey.body / prey.count)),
    ),
  );
  const fraction = members / prey.count,
    meat = prey.body * fraction,
    water = prey.hydration * fraction;
  prey.body -= meat;
  prey.hydration -= water;
  prey.count -= members;
  animal.body += meat * 0.8;
  animal.hydration += water * 0.8;
  returnMaterial(world, tile, "biomass", meat * 0.2);
  tile.water += water * 0.2;
  world.ecology.deaths += members;
  world.ecology.predation += members;
  return meat;
}
export function pollinate(world: World, animal: Animal, tile: Tile): void {
  if (
    FAUNA_BY_ID[animal.species].diet !== "nectar" ||
    ![tile.plant, tile.groundcover].some((p) => p && p.genome.pollination > 0.5)
  )
    return;
  tile.pollination = Math.min(
    1,
    tile.pollination + (animal.count / (animal.count + 50)) * 0.4,
  );
  world.ecology.pollinations++;
}

/** Small vertebrates, fish and insects follow the same finite resource accounting as people. */
export function updateFauna(world: World): void {
  const cells = new Map<number, Animal[]>();
  for (const animal of world.animals) {
    const key = tileIndex(world, animal.x, animal.y),
      current = cells.get(key) ?? [];
    current.push(animal);
    cells.set(key, current);
  }
  const oxygen = oxygenFraction(world);
  for (const animal of world.animals) {
    if (animal.count <= 0) continue;
    const species = FAUNA_BY_ID[animal.species];
    let tile = getTile(world, animal.x, animal.y)!;
    const targetMass = species.dryMass * animal.traits.size * animal.count;
    const aquatic = species.habitat === "water";
    const ectotherm =
      species.metabolism < 0.5
        ? clamp(2 ** ((tile.temperature - 20) / 10), 0.04, 4)
        : 1;
    const metabolic =
      (animal.count *
        (species.dryMass * animal.traits.size * 4) ** 0.75 *
        293 *
        species.metabolism *
        ectotherm) /
      (24 * LAWS.chemicalEnergy * animal.traits.efficiency);
    const fuel = Math.min(
      animal.body,
      respirable(world, metabolic * 0.94, aquatic ? tile : undefined) / 0.94,
    );
    animal.body -= fuel;
    respire(world, fuel * 0.94, tile, aquatic);
    addNutrients(tile, BIO_NUTRIENTS, fuel * 0.06);
    const waterLoss = Math.min(
      animal.hydration,
      targetMass * (aquatic ? 0.001 : 0.008),
    );
    animal.hydration -= waterLoss;
    if (aquatic) tile.water += waterLoss;
    else tile.air.vapor += waterLoss;
    const thirst = Math.max(0, animal.body * 3 - animal.hydration),
      drink = Math.min(tile.water, thirst);
    tile.water -= drink;
    animal.hydration += drink;
    if (animal.hydration > animal.body * 4) {
      const excreted = animal.hydration - animal.body * 4;
      animal.hydration -= excreted;
      tile.water += excreted;
    }
    const hypoxia = aquatic
      ? tile.dissolvedOxygen / Math.max(1, tile.water) < 0.000002
      : oxygen < 0.15;
    const temperatureStress = Math.max(
      0,
      Math.abs(
        tile.temperature - species.temperature - animal.traits.temperature,
      ) - species.tolerance,
    );
    const starved =
      animal.body < targetMass * 0.55 || animal.hydration < animal.body * 0.3;
    animal.health = clamp(
      animal.health +
        (starved ? -2 : 0.12) -
        (hypoxia ? 8 : 0) -
        temperatureStress * 0.3,
    );
    animal.ageDays += 1 / 24;
    const resting =
      species.diet === "nectar" &&
      (tile.air.sunlight < 40 || tile.temperature < 8);
    const hungry = animal.body < targetMass * 1.3;
    if (hungry && !resting) {
      let best = tile,
        bestScore = -Infinity;
      for (const candidate of nearbyTiles(world, animal, species.mobility)) {
        const suitable = habitatSuitability(species, candidate);
        if (suitable <= 0.05) continue;
        const at = cells.get(tileIndex(world, candidate.x, candidate.y)) ?? [];
        const prey = at.filter((p) => canHunt(animal, p));
        const green = [candidate.plant, candidate.groundcover].reduce(
          (sum, p) => sum + (p ? edible(p, species.diet === "nectar") : 0),
          0,
        );
        const litter = Math.min(
          candidate.detritus.carbon / 0.94,
          candidate.detritus.mineral / 0.06,
        );
        const food =
          species.diet === "predator"
            ? prey.reduce((sum, p) => sum + p.body, 0)
            : species.diet === "detritivore"
              ? litter
              : green;
        const threat = at.some(
          (p) =>
            FAUNA_BY_ID[p.species].diet === "predator" && canHunt(p, animal),
        );
        const score =
          suitable * 2 +
          Math.min(3, food / Math.max(0.001, targetMass * 0.2)) -
          Math.hypot(candidate.x - animal.x, candidate.y - animal.y) * 0.09 -
          (threat ? 2 : 0);
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      if (best !== tile) {
        const oldKey = tileIndex(world, animal.x, animal.y),
          newKey = tileIndex(world, best.x, best.y);
        cells.set(
          oldKey,
          (cells.get(oldKey) ?? []).filter((a) => a !== animal),
        );
        const group = cells.get(newKey) ?? [];
        group.push(animal);
        cells.set(newKey, group);
        animal.x = best.x;
        animal.y = best.y;
        tile = best;
      }
      const requested = Math.max(
        0,
        Math.min(targetMass * 0.12, targetMass * 1.3 - animal.body),
      );
      if (species.diet === "predator") {
        const prey = (cells.get(tileIndex(world, tile.x, tile.y)) ?? []).find(
          (p) => canHunt(animal, p),
        );
        if (prey) hunt(world, animal, prey, tile, requested);
        animal.activity = "Hunting";
      } else if (species.diet === "detritivore") {
        const amount = Math.min(
          requested,
          tile.detritus.carbon / 0.94,
          tile.detritus.mineral / 0.06,
        );
        tile.detritus.carbon -= amount * 0.94;
        tile.detritus.mineral -= amount * 0.06;
        animal.body += amount;
        animal.activity = "Recycling leaf litter";
      } else {
        const eaten = eatPlant(
          animal,
          tile,
          requested,
          species.diet === "nectar",
        );
        world.ecology.grazed += eaten;
        if (species.diet === "nectar" && eaten > 0) {
          pollinate(world, animal, tile);
          animal.activity = "Visiting flowers";
        } else animal.activity = "Grazing and foraging";
        if (eaten > 0 && species.seedDispersal > random(world)) {
          const target = getTile(
            world,
            tile.x + Math.floor(between(world, -2, 3)),
            tile.y + Math.floor(between(world, -2, 3)),
          );
          if (target)
            for (const layer of ["plant", "groundcover"] as const)
              if (seedPlant(world, tile, target, layer)) {
                world.ecology.dispersedSeeds++;
                break;
              }
        }
      }
    } else
      animal.activity = resting ? "Sheltering through the night" : "Resting";
    if (
      animal.health > 75 &&
      animal.count >= 2 &&
      animal.body > targetMass * 1.16 &&
      world.tick - animal.lastBirthTick > species.reproductionDays * 96
    ) {
      const young = Math.min(
        species.litter * Math.max(1, Math.floor(animal.count / 2)),
        Math.floor(
          (animal.body - targetMass) /
            (species.dryMass * animal.traits.size * 0.35),
        ),
      );
      if (young > 0) {
        animal.ageDays *= animal.count / (animal.count + young);
        animal.count += young;
        animal.lastBirthTick = world.tick;
        animal.generation++;
        world.ecology.births += young;
        // Surplus existing tissue is divided among offspring; adding a count creates no mass.
        const weight = young / animal.count;
        animal.traits.size = clamp(
          animal.traits.size + between(world, -0.03, 0.03) * weight,
          0.6,
          1.5,
        );
        animal.traits.temperature = clamp(
          animal.traits.temperature + between(world, -0.5, 0.5) * weight,
          -8,
          8,
        );
        animal.traits.efficiency = clamp(
          animal.traits.efficiency + between(world, -0.025, 0.025) * weight,
          0.6,
          1.5,
        );
      }
    }
    if (animal.ageDays > species.lifespanDays) animal.health -= 0.25;
    refreshTile(tile);
    world.changedTiles.push(tileIndex(world, tile.x, tile.y));
  }
  for (const animal of world.animals)
    if (animal.count > 0 && (animal.health <= 0 || animal.body <= 1e-12)) {
      const tile = getTile(world, animal.x, animal.y)!;
      returnMaterial(world, tile, "biomass", animal.body);
      tile.water += animal.hydration;
      world.ecology.deaths += animal.count;
      animal.count = 0;
      animal.body = 0;
      animal.hydration = 0;
    }
  world.animals = world.animals.filter((animal) => animal.count > 0);
}
