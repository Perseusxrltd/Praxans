import { personalContact, type BodyWork } from "./bodywork";
import { availableMixture, CLAY, takeNutrients } from "./chemistry";
import { reinforce } from "./cognition";
import { MATERIALS } from "./content";
import { refreshTile } from "./laws";
import { touchTile } from "./world";
import type {
  Citizen,
  Civilization,
  Material,
  Plant,
  Task,
  Tile,
  World,
} from "./types";

type HarvestTask = Task & { material: Material };
export const isHarvestTask = (task: Task | null): task is HarvestTask =>
  !!task &&
  (task.kind === "gather" || task.kind === "extract") &&
  task.material !== undefined &&
  Object.hasOwn(MATERIALS, task.material);

/** Inherited attempt/handling conventions, not empirical productivity rates. */
export const harvestDuration = (task: HarvestTask): number =>
  task.kind === "gather" ? 2.4 : 3;
const handlingKg: Record<Material, number> = {
  biomass: 6,
  wood: 12,
  fiber: 12,
  stone: 8,
  clay: 5,
};

interface PlantSource {
  plant: Plant;
  layer: "plant" | "groundcover";
  carbon: number;
  mineral: number;
  woodiness: number;
  defense: number;
}
interface Source {
  tile: Tile;
  index: number;
  rock: number;
  clay: number;
  nutrients: Tile["nutrients"];
  plants: PlantSource[];
}
interface Attempt {
  actor: Citizen;
  civ: Civilization;
  task: HarvestTask;
  material: Material;
  kind: Task["kind"];
  progress: number;
  source: Source;
  skill: number;
  cut: number;
}
interface Claim {
  attempt: Attempt;
  hours: number;
  capacity: number;
}

/** Transient post-physiology boundary. Only occupied work sites are captured. */
export interface HarvestWork {
  world: World;
  tick: number;
  contacts: BodyWork;
  attempts: Map<string, Attempt>;
  claims: Map<string, Claim>;
  committed: boolean;
}

export function beginHarvestWork(
  world: World,
  contacts: BodyWork,
): HarvestWork {
  if (contacts.world !== world || contacts.tick !== world.tick)
    throw new Error("Harvest work needs contact from its own world tick.");
  const sources = new Map<number, Source>(),
    attempts = new Map<string, Attempt>(),
    civs = new Map(world.civilizations.map((civ) => [civ.id, civ]));
  for (const actor of contacts.people.values()) {
    const task = actor.task,
      civ = civs.get(actor.civId);
    if (
      !civ ||
      !isHarvestTask(task) ||
      !personalContact(world, actor, actor, contacts) ||
      contacts.positions.get(actor.id)!.tile !== task.tile
    )
      continue;
    let source = sources.get(task.tile);
    if (!source) {
      const tile = world.tiles[task.tile];
      source = {
        tile,
        index: task.tile,
        rock: tile.rock,
        clay: availableMixture(tile, CLAY),
        nutrients: tile.nutrients,
        plants: [],
      };
      for (const layer of ["plant", "groundcover"] as const) {
        const plant = tile[layer];
        if (
          plant &&
          [plant.genome.woodiness, plant.genome.defense].some(
            (value) => !Number.isFinite(value) || value < 0 || value > 1,
          )
        )
          throw new Error(
            "Harvest accessibility fractions must be within zero and one.",
          );
        if (plant)
          source.plants.push({
            plant,
            layer,
            carbon: plant.carbon,
            mineral: plant.mineral,
            woodiness: plant.genome.woodiness,
            defense: plant.genome.defense,
          });
      }
      sources.set(task.tile, source);
    }
    const cut =
      civ.focus === "preserve" ? 0.22 : 0.25 + civ.policies.extraction * 0.6;
    if (!Number.isFinite(cut) || cut < 0 || cut >= 1)
      throw new Error(
        "Harvest exposure requires a finite cutting fraction below one.",
      );
    attempts.set(actor.id, {
      actor,
      civ,
      task,
      material: task.material,
      kind: task.kind,
      source,
      progress: task.progress,
      skill: 1 + actor.skill * 0.06,
      cut,
    });
  }
  return {
    world,
    tick: world.tick,
    contacts,
    attempts,
    claims: new Map(),
    committed: false,
  };
}

function present(world: World, attempt: Attempt, work: HarvestWork): boolean {
  const { actor, task, source, civ } = attempt;
  return (
    actor.task === task &&
    task.material === attempt.material &&
    task.kind === attempt.kind &&
    actor.civId === civ.id &&
    world.tiles[source.index] === source.tile &&
    task.tile === source.index &&
    personalContact(world, actor, actor, work.contacts) &&
    work.contacts.positions.get(actor.id)!.tile === source.index &&
    (!actor.cargo || actor.cargo.material === task.material)
  );
}

/** Effective productivity is funded by the caller's already-paid active interval. */
export function workOnHarvest(
  world: World,
  actor: Citizen,
  effectiveHours: number,
  work: HarvestWork,
): void {
  if (work.committed || work.world !== world || work.tick !== world.tick)
    throw new Error(
      "Harvest work must occur before commit in its own world tick.",
    );
  if (work.claims.has(actor.id)) return;
  const attempt = work.attempts.get(actor.id);
  if (!attempt || actor.task !== attempt.task) return;
  if (!present(world, attempt, work)) {
    reinforce(actor, -0.2, world.tick);
    actor.task = null;
    return;
  }
  if (attempt.task.progress !== attempt.progress) return;
  const duration = harvestDuration(attempt.task),
    hours = Math.max(0, Math.min(effectiveHours, duration - attempt.progress));
  if (!Number.isFinite(hours) || hours <= 0) return;
  attempt.task.progress += hours;
  work.claims.set(actor.id, {
    attempt,
    hours,
    capacity:
      (hours * attempt.skill * handlingKg[attempt.task.material]) / duration,
  });
}

function harvestPlants(
  source: Source,
  claims: Claim[],
  credits: Map<Claim, number>,
): boolean {
  const states = source.plants
    .filter((captured) => source.tile[captured.layer] === captured.plant)
    .map((captured) => {
      const exposures = claims.map((claim) => {
        const { material, cut, task } = claim.attempt;
        const tissue =
          material === "wood"
            ? captured.woodiness
            : material === "fiber"
              ? (1 - captured.woodiness) * 0.5
              : (1 - captured.woodiness) * (1 - captured.defense);
        return (
          (-Math.log1p(-cut * tissue) * claim.hours) / harvestDuration(task)
        );
      });
      const exposure = exposures.reduce((sum, value) => sum + value, 0);
      return {
        captured,
        carbon: Math.max(0, Math.min(captured.carbon, captured.plant.carbon)),
        mineral: Math.max(
          0,
          Math.min(captured.mineral, captured.plant.mineral),
        ),
        exposure,
        shares: claims.map((claim, index) => ({
          claim,
          share:
            exposure > 0
              ? exposures[index] /
                exposure /
                MATERIALS[claim.attempt.material].carbon
              : 0,
        })),
        exhausted: false,
      };
    });
  // Preview a common fraction of each actor's newly funded interval. No mutation.
  const preview = (fraction: number) => {
    const totals = new Map<Claim, number>();
    const allocations = states
      .filter(
        (state) =>
          !state.exhausted &&
          state.carbon > 0 &&
          state.mineral > 0 &&
          state.exposure > 0,
      )
      .map((state) => {
        const removed = state.carbon * -Math.expm1(-state.exposure * fraction);
        const portions = state.shares.map(({ claim, share }) => {
          const amount = removed * share;
          totals.set(claim, (totals.get(claim) ?? 0) + amount);
          return { claim, amount };
        });
        return { state, portions, carbon: 0, mineral: 0 };
      });
    for (const allocation of allocations)
      for (const portion of allocation.portions) {
        const total = totals.get(portion.claim) ?? 0;
        portion.amount *=
          total > 0
            ? Math.min(1, (portion.claim.capacity * fraction) / total)
            : 0;
        const material = MATERIALS[portion.claim.attempt.material];
        allocation.carbon += portion.amount * material.carbon;
        allocation.mineral += portion.amount * material.mineral;
      }
    return allocations;
  };
  const mineralLimited = (allocations: ReturnType<typeof preview>) =>
    allocations.some((a) => a.mineral > a.state.mineral);
  let remaining = 1,
    changed = false;
  // Each restricted phase exhausts at least one of at most two plant sources.
  for (let phase = 0; remaining > 0 && phase <= states.length; phase++) {
    let fraction = remaining,
      allocations = preview(fraction);
    const limited = mineralLimited(allocations);
    if (limited) {
      // Raw exponential products are increasing and concave in the fraction;
      // their handling multiplier is nondecreasing. Joint mineral demand is
      // therefore monotone within this fixed-source phase. Find its first
      // crossing, then use only the remaining effort on surviving sources.
      let low = 0,
        high = remaining;
      for (let iteration = 0; iteration < 48; iteration++) {
        const middle = (low + high) / 2;
        if (middle === low || middle === high) break;
        if (mineralLimited(preview(middle))) high = middle;
        else low = middle;
      }
      fraction = high;
      allocations = preview(fraction);
    }
    if (limited && !allocations.some((a) => a.mineral >= a.state.mineral))
      throw new Error(
        "A harvest exhaustion event must retire an active source.",
      );
    for (const allocation of allocations) {
      const { state } = allocation;
      const exhausted = allocation.mineral >= state.mineral;
      const scale = Math.min(
        1,
        allocation.carbon > 0 ? state.carbon / allocation.carbon : 1,
        allocation.mineral > 0 ? state.mineral / allocation.mineral : 1,
      );
      let carbon = 0,
        mineral = 0;
      for (const portion of allocation.portions) {
        const amount = portion.amount * scale,
          material = MATERIALS[portion.claim.attempt.material];
        carbon += amount * material.carbon;
        mineral += amount * material.mineral;
        credits.set(portion.claim, (credits.get(portion.claim) ?? 0) + amount);
      }
      state.carbon = Math.max(0, state.carbon - carbon);
      state.mineral = Math.max(0, state.mineral - mineral);
      // Exclude the exhausted source from later handling. Subtraction above
      // preserves any floating-point residue; this flag destroys no matter.
      state.exhausted = exhausted;
      state.captured.plant.carbon = Math.max(
        0,
        state.captured.plant.carbon - carbon,
      );
      state.captured.plant.mineral = Math.max(
        0,
        state.captured.plant.mineral - mineral,
      );
      changed ||= carbon > 0 || mineral > 0;
    }
    remaining = Math.max(0, remaining - fraction);
    if (!limited) break;
  }
  return changed;
}

/**
 * Joint physical collision, not a social sharing rule. Other source-changing
 * task completions must follow this commit; snapshots alone cannot distinguish
 * old matter removed and replaced by another process inside the interval.
 */
export function finishHarvestWork(world: World, work: HarvestWork): void {
  if (work.committed || work.world !== world || work.tick !== world.tick)
    throw new Error("Harvest work must commit once in its own world tick.");
  work.committed = true;
  if (!work.claims.size) return;
  const living = new Set(world.citizens),
    groups = new Map<Source, Claim[]>(),
    credits = new Map<Claim, number>();
  const ordered = [...work.claims.values()].sort((a, b) =>
    a.attempt.actor.id < b.attempt.actor.id
      ? -1
      : a.attempt.actor.id > b.attempt.actor.id
        ? 1
        : 0,
  );
  for (const claim of ordered) {
    if (
      !living.has(claim.attempt.actor) ||
      !present(world, claim.attempt, work)
    )
      continue;
    const group = groups.get(claim.attempt.source) ?? [];
    group.push(claim);
    groups.set(claim.attempt.source, group);
  }
  for (const [source, claims] of groups) {
    const organic = claims.filter(
      (claim) => MATERIALS[claim.attempt.task.material].carbon > 0,
    );
    let changed = harvestPlants(source, organic, credits);
    for (const material of ["stone", "clay"] as const) {
      const attempts = claims.filter(
          (claim) => claim.attempt.task.material === material,
        ),
        requested = attempts.reduce((sum, claim) => sum + claim.capacity, 0);
      if (requested <= 0) continue;
      const available =
        material === "stone"
          ? Math.max(0, Math.min(source.rock, source.tile.rock))
          : source.tile.nutrients === source.nutrients
            ? Math.max(
                0,
                Math.min(source.clay, availableMixture(source.tile, CLAY)),
              )
            : 0;
      let amount = Math.min(requested, available);
      if (material === "clay")
        amount = takeNutrients(source.tile, CLAY, amount);
      else source.tile.rock -= amount;
      for (const claim of attempts)
        credits.set(claim, (amount * claim.capacity) / requested);
      changed ||= amount > 0;
    }
    if (changed) {
      refreshTile(source.tile);
      touchTile(world, source.index);
    }
  }
  for (const [claim, amount] of credits) {
    if (amount <= 0) continue;
    const { actor, civ, task } = claim.attempt;
    if (actor.cargo) actor.cargo.amount += amount;
    else actor.cargo = { material: task.material, amount };
    task.harvestedKg = (task.harvestedKg ?? 0) + amount;
    if (task.material === "biomass") civ.harvests += amount;
  }
}
