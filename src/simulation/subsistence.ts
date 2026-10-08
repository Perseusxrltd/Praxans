import { astronomy } from "./planet";
import { clamp } from "./random";
import type { Civilization, World } from "./types";

export const SUBSISTENCE = Object.freeze({
  ordinaryReserveKg: 7,
  winterDailyFoodKg: 1.6,
  planningSpoilagePerDay: 0.006,
  longestReserveDays: 180,
  workTravelHours: 0.5,
  description:
    "An explicit adult seasonal-planning heuristic: long growing-season days encourage building reserves before daylight shortens, including expected cold demand and spoilage. It is not learned astronomy or a guarantee that the habitat can supply the target.",
});

const seasons = new WeakMap<
  World,
  { day: number; targets: Map<string, number> }
>();

/** Moving food into personal rations does not remove it from community wellbeing. */
export function edibleReserves(world: World, civ: Civilization): number {
  return (
    civ.stock.biomass +
    world.citizens.reduce(
      (sum, p) =>
        sum +
        (p.civId === civ.id
          ? (p.provisions ?? 0) +
            (p.cargo?.material === "biomass" ? p.cargo.amount : 0)
          : 0),
      0,
    )
  );
}

/** Observe this place's light cycle; never consult future food, weather or other settlements. */
export function foodReservePerPerson(world: World, civ: Civilization): number {
  const day = Math.floor(world.tick / 96);
  let cached = seasons.get(world);
  if (!cached || cached.day !== day) {
    cached = { day, targets: new Map() };
    seasons.set(world, cached);
  }
  let seasonal = cached.targets.get(civ.id);
  if (seasonal === undefined) {
    const now = astronomy(day * 96, civ.x, civ.y).daylight;
    const before = astronomy(
      Math.max(0, (day - 7) * 96),
      civ.x,
      civ.y,
    ).daylight;
    const shortening = before > now + 0.001;
    // Store while the growing season can supply food. Waiting until days have
    // already shortened made the reserve goal arrive after the main harvest.
    const risk = Math.max(
      clamp((now - 12) / 2, 0, 1),
      shortening ? clamp((15 - now) / 3, 0, 1) : clamp((12 - now) / 4, 0, 1),
    );
    const days = SUBSISTENCE.longestReserveDays * risk;
    seasonal =
      (SUBSISTENCE.winterDailyFoodKg *
        Math.expm1(SUBSISTENCE.planningSpoilagePerDay * days)) /
      SUBSISTENCE.planningSpoilagePerDay;
    cached.targets.set(civ.id, seasonal);
  }
  return Math.max(
    SUBSISTENCE.ordinaryReserveKg,
    seasonal,
    civ.civics.institution.foodReserveDays * SUBSISTENCE.winterDailyFoodKg,
  );
}
