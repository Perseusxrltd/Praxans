import {
  LAWS,
  refreshTile,
  respire,
  respirable,
  accumulateEnergy,
} from "./laws";
import {
  BIO_NUTRIENTS,
  accumulateAtmosphere,
  CHEMISTRY,
  addNutrients,
  availableMixture,
  takeNutrients,
  oxygenFraction,
} from "./chemistry";
import { updateWeather } from "./weather";
import { updateGeology } from "./geology";
import { updateWeathering } from "./weathering";
import { weatherSediment } from "./landscape";
import { PLANET } from "./planet";
import { heatCapacity } from "./thermodynamics";
import { isAquatic } from "./life";
import { between, clamp, random } from "./random";
import type { Genome, Plant, Tile, World } from "./types";
import { getTile, tileIndex, touchTile } from "./world";

export function inheritGenome(world: World, parent: Genome): Genome {
  return {
    woodiness: clamp(
      parent.woodiness + between(world, -0.04, 0.04),
      0.02,
      0.96,
    ),
    growth: clamp(parent.growth + between(world, -0.06, 0.06), 0.3, 1.8),
    roots: clamp(parent.roots + between(world, -0.04, 0.04), 0.15, 1.2),
    seedSize: clamp(parent.seedSize + between(world, -0.025, 0.025), 0.1, 0.8),
    temperature: clamp(parent.temperature + between(world, -0.6, 0.6), -15, 38),
    defense: clamp(parent.defense + between(world, -0.025, 0.025), 0, 0.5),
    shadeTolerance: clamp(
      parent.shadeTolerance + between(world, -0.025, 0.025),
      0,
      1,
    ),
    waterNeed: clamp(parent.waterNeed + between(world, -0.025, 0.025), 0.05, 1),
    deciduous: clamp(parent.deciduous + between(world, -0.025, 0.025), 0, 1),
    pollination: parent.pollination,
  };
}
export function seedPlant(
  world: World,
  source: Tile,
  target: Tile,
  layer: "plant" | "groundcover" = "plant",
  vegetative = false,
): boolean {
  const parent = source[layer];
  if (
    !parent ||
    (vegetative ? target[layer] : target.seedBank.length >= 4) ||
    target.terrain === "shore" ||
    isAquatic(parent) !== (target.terrain === "water") ||
    parent.carbon < 2 ||
    parent.mineral < 0.04
  )
    return false;
  if (
    !vegetative &&
    parent.genome.pollination > 0.5 &&
    source.pollination < 0.2
  )
    return false;
  const carbon = parent.genome.seedSize,
    mineral = carbon * LAWS.nutrientRatio;
  if (parent.mineral < mineral) return false;
  parent.carbon -= carbon;
  parent.mineral -= mineral;
  const offspring: Plant = {
    carbon,
    mineral,
    generation: parent.generation + 1,
    lineage: parent.lineage,
    genome: inheritGenome(world, parent.genome),
  };
  if (vegetative) target[layer] = offspring;
  else
    target.seedBank.push({
      ...offspring,
      layer,
      depositedTick: world.tick,
      germinationTick:
        world.tick + Math.ceil(96 * (2 + parent.genome.seedSize * 12)),
    });
  touchTile(world, tileIndex(world, target.x, target.y));
  return true;
}

/** Dormant life spends stored reserves; it cannot recover a lineage with no living carrier. */
export function updateSeedBank(
  world: World,
  tile: Tile,
  lightFraction = 1,
): void {
  for (let i = tile.seedBank.length - 1; i >= 0; i--) {
    const seed = tile.seedBank[i],
      aquatic = isAquatic(seed);
    const temperatureStress = Math.max(0, tile.temperature - 35) / 15;
    const wet = tile.water / (tile.water + 2000);
    const turnover = Math.min(
      0.01,
      (0.000008 + wet * 0.00002 + temperatureStress * 0.0001) *
        2 ** ((tile.temperature - 20) / 15),
    );
    const used = respirable(
      world,
      seed.carbon * turnover,
      aquatic ? tile : undefined,
    );
    seed.carbon -= used;
    respire(world, used, tile, aquatic);
    // Failed viability becomes litter. There is no free seed replenishment.
    if (
      seed.carbon < 0.015 ||
      tile.temperature > 70 ||
      tile.temperature < -60
    ) {
      tile.detritus.carbon += seed.carbon;
      tile.detritus.mineral += seed.mineral;
      tile.seedBank.splice(i, 1);
      continue;
    }
    if (
      world.tick < seed.germinationTick ||
      tile[seed.layer] ||
      tile.temperature < 2 ||
      Math.abs(tile.temperature - seed.genome.temperature) > 12 ||
      tile.water < (500 + seed.genome.waterNeed * 1500) / seed.genome.roots ||
      tile.air.sunlight * lightFraction < 15 ||
      (aquatic ? tile.dissolvedOxygen : world.atmosphere.oxygen) < 0.001
    )
      continue;
    if (random(world) >= 0.035 * wet) continue;
    const {
      layer,
      depositedTick: _deposited,
      germinationTick: _germination,
      ...plant
    } = seed;
    tile[layer] = plant;
    tile.seedBank.splice(i, 1);
  }
}

export function growPlant(
  world: World,
  tile: Tile,
  plant: Plant,
  layer: "plant" | "groundcover",
  lightFraction: number,
): void {
  const genome = plant.genome,
    aquatic = isAquatic(plant),
    sunlight = (tile.air.sunlight / LAWS.solarPeak) * lightFraction;
  const tempSuitability = Math.exp(
    -(((tile.temperature - genome.temperature) / 17) ** 2),
  );
  const waterSuitability =
    tile.water / (tile.water + (500 + genome.waterNeed * 2500) / genome.roots);
  const leafFactor =
    1 - genome.deciduous * clamp((8 - tile.temperature) / 14, 0, 1);
  const livingFraction = 1 - genome.woodiness * 0.9;
  const intercept =
    1 - Math.exp(-plant.carbon * (1 - genome.woodiness) * 0.08 * leafFactor);
  const capacity =
    (layer === "groundcover" ? 24 : 160) / (1 + genome.woodiness);
  const lightResponse =
    sunlight / (sunlight + 0.3 * (1 - genome.shadeTolerance) + 0.03);
  const potential =
    plant.carbon *
    0.012 *
    genome.growth *
    livingFraction *
    lightResponse *
    leafFactor *
    tempSuitability *
    waterSuitability *
    Math.max(0, 1 - plant.carbon / capacity) *
    (1 - genome.defense * 0.4);
  const incidentEnergy =
    tile.air.sunlight *
    lightFraction *
    intercept *
    LAWS.tileArea *
    3.6 *
    LAWS.photosyntheticEfficiency;
  const growth = Math.max(
    0,
    Math.min(
      potential,
      incidentEnergy / LAWS.chemicalEnergy,
      world.atmosphere.carbon,
      tile.water / ((aquatic ? 0 : 70) + CHEMISTRY.waterPerOrganic),
      availableMixture(tile, BIO_NUTRIENTS) / LAWS.nutrientRatio,
    ),
  );
  plant.carbon += growth;
  plant.mineral += takeNutrients(
    tile,
    BIO_NUTRIENTS,
    growth * LAWS.nutrientRatio,
  );
  accumulateAtmosphere(world, "carbon", -growth);
  if (aquatic) tile.dissolvedOxygen += growth * CHEMISTRY.oxygenPerOrganic;
  else
    accumulateAtmosphere(world, "oxygen", growth * CHEMISTRY.oxygenPerOrganic);
  tile.water -= growth * CHEMISTRY.waterPerOrganic;
  const transpired = aquatic
    ? 0
    : Math.min(
        tile.water,
        growth * 70 +
          plant.carbon * 0.012 * sunlight * Math.max(0, 1 - tile.air.humidity),
      );
  tile.water -= transpired;
  tile.air.vapor += transpired;
  world.climate.transpired += transpired;
  tile.temperature -=
    (transpired * PLANET.vaporizationHeat + growth * LAWS.chemicalEnergy) /
    heatCapacity(tile);
  accumulateEnergy(world, "captured", growth * LAWS.chemicalEnergy);
  const respiration = respirable(
    world,
    Math.min(
      plant.carbon * 0.005,
      plant.carbon *
        (0.00018 + genome.growth * 0.00012) *
        livingFraction *
        (0.1 + leafFactor * 0.9) *
        2 ** ((tile.temperature - 20) / 10),
    ),
    aquatic ? tile : undefined,
  );
  plant.carbon -= respiration;
  respire(world, respiration, tile, aquatic);
  const stress =
    Math.max(0, 0.15 - waterSuitability) + Math.max(0, 0.25 - tempSuitability);
  const shed = clamp(
    // Leaves turn over much faster than structural wood. Applying leaf loss
    // to the entire tree previously gave even healthy trunks a 44-day half-life.
    (0.00065 + (1 - leafFactor) * 0.002) * (1 - genome.woodiness) +
      0.000003 * genome.woodiness +
      stress * 0.012 * livingFraction,
    0,
    0.03,
  );
  tile.detritus.carbon += plant.carbon * shed;
  tile.detritus.mineral += plant.mineral * shed;
  plant.carbon *= 1 - shed;
  plant.mineral *= 1 - shed;
  if (plant.carbon < 0.04) {
    tile.detritus.carbon += plant.carbon;
    tile.detritus.mineral += plant.mineral;
    tile[layer] = null;
  } else if (world.tick % 24 === 0 && random(world) < 0.12 * waterSuitability) {
    const target = getTile(
      world,
      tile.x + Math.floor(between(world, -2, 3)),
      tile.y + Math.floor(between(world, -2, 3)),
    );
    if (target) seedPlant(world, tile, target, layer);
  }
}

/** Hourly atmosphere, water chemistry, litter cycling, canopy/understory competition, and growth. */
export function updateEcology(world: World): void {
  updateWeather(world);
  if (world.tick % 96 === 0) updateGeology(world);
  updateWeathering(world);
  const shade = new Map<number, number>();
  for (const structure of world.structures)
    if (structure.progress >= 1 && !structure.collapsed) {
      const index = tileIndex(world, structure.x, structure.y);
      shade.set(
        index,
        Math.min(
          1,
          (shade.get(index) ?? 0) +
            structure.properties.coveredArea / LAWS.tileArea,
        ),
      );
    }
  const oxygen = oxygenFraction(world);
  for (let i = 0; i < world.tiles.length; i++) {
    const tile = world.tiles[i],
      aquatic = tile.terrain === "water";
    // Reduced gas exchange: warmer water holds less oxygen. O2 is moved, not created.
    const saturation = aquatic
      ? (tile.water *
          0.000009 *
          Math.exp(-(tile.temperature - 20) * 0.025) *
          oxygen) /
        0.2095
      : 0;
    const exchange = (saturation - tile.dissolvedOxygen) * 0.12;
    const dissolved =
      exchange > 0
        ? Math.min(exchange, world.atmosphere.oxygen)
        : Math.max(exchange, -tile.dissolvedOxygen);
    tile.dissolvedOxygen += dissolved;
    accumulateAtmosphere(world, "oxygen", -dissolved);
    const decay = clamp(
      (0.003 * Math.exp((tile.temperature - 15) / 30) * tile.water) /
        (tile.water + 1500),
      0,
      0.012,
    );
    const decomposedC = respirable(
      world,
      tile.detritus.carbon * decay,
      aquatic ? tile : undefined,
    );
    const decomposedM =
      tile.detritus.mineral * (decomposedC > 0 ? decay : 0.00001);
    tile.detritus.carbon -= decomposedC;
    tile.detritus.mineral -= decomposedM;
    addNutrients(tile, BIO_NUTRIENTS, decomposedM);
    respire(world, decomposedC, tile, aquatic);
    const deficit = Math.max(0, 0.8 - (tile.nutrients.N ?? 0));
    const fuel = respirable(
      world,
      Math.min(
        tile.detritus.carbon * 0.0003,
        deficit / 0.08,
        world.atmosphere.nitrogen / 0.08,
      ),
      aquatic ? tile : undefined,
    );
    if (tile.temperature > 2 && tile.water > 300 && fuel > 0) {
      tile.detritus.carbon -= fuel;
      respire(world, fuel, tile, aquatic);
      accumulateAtmosphere(world, "nitrogen", -fuel * 0.08);
      addNutrients(tile, { N: 1 }, fuel * 0.08);
    }
    const buildingLight = 1 - (shade.get(i) ?? 0);
    const leaves = tile.plant
      ? 1 -
        tile.plant.genome.deciduous * clamp((8 - tile.temperature) / 14, 0, 1)
      : 0;
    const intercept = tile.plant
      ? 1 -
        Math.exp(
          -tile.plant.carbon *
            (1 - tile.plant.genome.woodiness) *
            0.08 *
            leaves,
        )
      : 0;
    if (tile.plant)
      // Ambient light drives leaf physiology; self-interception bounds the
      // actual energy captured inside growPlant. Multiplying both by canopy
      // size made small survivors and seedlings unable to regrow.
      growPlant(world, tile, tile.plant, "plant", buildingLight);
    if (tile.groundcover)
      growPlant(
        world,
        tile,
        tile.groundcover,
        "groundcover",
        buildingLight * (1 - intercept) * (aquatic ? 0.65 : 1),
      );
    if (tile.seedBank.length)
      updateSeedBank(world, tile, buildingLight * (1 - intercept));
    tile.pollination *= 0.96;
    weatherSediment(tile);
    const vegetation =
      (tile.plant?.carbon ?? 0) + (tile.groundcover?.carbon ?? 0);
    tile.road *= Math.exp(
      -0.0002 - Math.min(0.003, vegetation * 0.00003 * tile.moisture),
    );
    refreshTile(tile);
    // Land cover follows the living canopy, with hysteresis to avoid flicker.
    if (tile.terrain === "forest" && tile.trees < 0.35) tile.terrain = "meadow";
    else if (tile.terrain === "meadow" && tile.trees > 1.2)
      tile.terrain = "forest";
    touchTile(world, i);
  }
}
