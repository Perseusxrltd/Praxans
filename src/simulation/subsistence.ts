import { astronomy } from "./planet";
import { clamp } from "./random";
import type { Citizen, Civilization, World } from "./types";
import { canReachCampStocks } from "./settlement";

export const SUBSISTENCE = Object.freeze({
  ordinaryReserveKg: 7,
  winterDailyFoodKg: 1.6,
  planningSpoilagePerDay: 0.006,
  longestReserveDays: 180,
  workTravelHours: 0.5,
  personalRationKg: 3,
  description:
    "An explicit adult seasonal-planning heuristic: long growing-season days encourage building reserves before daylight shortens, including expected cold demand and spoilage. It is not learned astronomy or a guarantee that the habitat can supply the target.",
});

type RationClaim = {
  person: Citizen;
  civ: Civilization;
  x: number;
  y: number;
  amount: number;
};

export interface RationPickup {
  readonly world: World;
  readonly tick: number;
  readonly claims: readonly RationClaim[];
  readonly stocks: ReadonlyMap<Civilization, number>;
  committed: boolean;
}

/**
 * The existing automatic 3 kg reserve controller, after current bodily needs.
 * This is not a learned sharing agreement or a physical carrying limit. Capture
 * contact before any pickup: the aggregate camp footprint depends on its stock.
 */
export function prepareRationPickup(
  world: World,
  people: readonly Citizen[] = world.citizens,
): RationPickup {
  const civs = new Map(world.civilizations.map((civ) => [civ.id, civ]));
  const claims: RationClaim[] = [],
    stocks = new Map<Civilization, number>(),
    seen = new Set<string>();
  for (const person of people) {
    if (seen.has(person.id)) continue;
    seen.add(person.id);
    const civ = civs.get(person.civId);
    const amount = Math.max(
      0,
      SUBSISTENCE.personalRationKg - person.provisions,
    );
    if (
      !civ ||
      person.health <= 0 ||
      person.journeyId ||
      !amount ||
      !canReachCampStocks(world, civ, person)
    )
      continue;
    claims.push({ person, civ, x: person.x, y: person.y, amount });
    if (!stocks.has(civ)) stocks.set(civ, civ.stock.biomass);
  }
  return { world, tick: world.tick, claims, stocks, committed: false };
}

/**
 * Transfer real residual stock before departure. Proportional contention is an
 * explicit controller convention, not a universal social preference. Existing
 * personal rations, work cargo and caravan provisions are never pooled here.
 */
export function finishRationPickup(world: World, pickup: RationPickup): void {
  if (pickup.world !== world || pickup.tick !== world.tick || pickup.committed)
    throw new Error(
      "Ration pickup must commit once in its original world tick.",
    );
  pickup.committed = true;
  const members = new Set(world.citizens),
    communities = new Set(world.civilizations),
    seen = new Set<string>(),
    groups = new Map<Civilization, RationClaim[]>();
  for (const claim of pickup.claims) {
    const { person, civ } = claim;
    if (
      seen.has(person.id) ||
      !members.has(person) ||
      !communities.has(civ) ||
      person.health <= 0 ||
      person.journeyId ||
      person.civId !== civ.id ||
      person.x !== claim.x ||
      person.y !== claim.y
    )
      continue;
    seen.add(person.id);
    const amount = Math.min(
      claim.amount,
      Math.max(0, SUBSISTENCE.personalRationKg - person.provisions),
    );
    if (!amount) continue;
    const group = groups.get(civ) ?? [];
    group.push({ ...claim, amount });
    groups.set(civ, group);
  }
  for (const [civ, claims] of groups) {
    // Stable arithmetic as well as stable awards, independent of iteration order.
    claims.sort((a, b) => (a.person.id < b.person.id ? -1 : 1));
    const requested = claims.reduce((sum, claim) => sum + claim.amount, 0);
    const budget = Math.max(
      0,
      Math.min(pickup.stocks.get(civ) ?? 0, civ.stock.biomass),
    );
    const share = Math.min(1, budget / requested);
    let remaining = budget;
    for (const claim of claims) {
      const amount = Math.min(remaining, claim.amount * share);
      remaining -= amount;
      claim.person.provisions += amount;
    }
    civ.stock.biomass -= budget - remaining;
  }
}

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
