import { personalContact, type BodyWork } from "./bodywork";
import { beginExperience, reinforce } from "./cognition";
import { SUBSISTENCE } from "./subsistence";
import { remember } from "./world";
import type { Citizen, Task, World } from "./types";

const EPSILON = 1e-9;
/** Coarse handling/choice parameters, not measured feeding or anatomical rates. */
export const FOOD_HANDOFF = Object.freeze({
  kgPerWorkHour: 2,
  bundleKgPerBodyKg: 0.05,
});

export const isFoodHandoff = (
  task: Task | null,
): task is Task & { recipientId: string; targetProvisionMass: number } =>
  task?.kind === "deliver" &&
  task.material === "biomass" &&
  task.recipientId !== undefined &&
  task.targetProvisionMass !== undefined;

const bundleTarget = (person: Citizen) =>
  Math.min(
    SUBSISTENCE.personalRationKg,
    person.body * FOOD_HANDOFF.bundleKgPerBodyKg,
  );

interface Holding {
  person: Citizen;
  provisions: number;
  cargo: Citizen["cargo"];
  cargoAmount: number;
}
interface FoodOpportunity {
  recipient: Citizen;
  target: number;
}
interface FoodIntent {
  actor: Citizen;
  recipient: Citizen;
  task: Task & { recipientId: string; targetProvisionMass: number };
  requested: number;
}
/** One post-meal inventory boundary, sharing the existing personal-contact index. */
export interface FoodWork {
  world: World;
  tick: number;
  contacts: BodyWork;
  holdings: Map<string, Holding>;
  opportunities: Map<number, FoodOpportunity[]>;
  intents: FoodIntent[];
  committed: boolean;
}

export function beginFoodWork(world: World, contacts: BodyWork): FoodWork {
  if (contacts.world !== world || contacts.tick !== world.tick)
    throw new Error("Food work needs contact from its own world tick.");
  const holdings = new Map<string, Holding>(),
    opportunities = new Map<number, FoodOpportunity[]>();
  for (const person of contacts.people.values()) {
    const cargoAmount =
      person.cargo?.material === "biomass" ? person.cargo.amount : 0;
    holdings.set(person.id, {
      person,
      provisions: person.provisions,
      cargo: person.cargo,
      cargoAmount,
    });
    const target = bundleTarget(person);
    // A coarse local hunger/empty-bundle proxy, not access to another person's
    // private intake or reserve compartments, a request, or inferred consent.
    if (
      person.hunger >= 40 ||
      person.provisions + cargoAmount >= target * 0.25 ||
      !personalContact(world, person, person, contacts)
    )
      continue;
    const tile = contacts.positions.get(person.id)!.tile,
      candidates = opportunities.get(tile) ?? [];
    candidates.push({ recipient: person, target });
    opportunities.set(tile, candidates);
  }
  for (const candidates of opportunities.values())
    candidates.sort((a, b) =>
      a.recipient.id < b.recipient.id
        ? -1
        : a.recipient.id > b.recipient.id
          ? 1
          : 0,
    );
  return {
    world,
    tick: world.tick,
    contacts,
    holdings,
    opportunities,
    intents: [],
    committed: false,
  };
}

function available(holding: Holding) {
  return {
    provisions: Math.max(
      0,
      Math.min(holding.provisions, holding.person.provisions),
    ),
    cargo:
      holding.person.cargo === holding.cargo &&
      holding.cargo?.material === "biomass"
        ? Math.max(0, Math.min(holding.cargoAmount, holding.cargo.amount))
        : 0,
  };
}

/** Willingness and keeping a personal buffer are choices, not transfer permissions. */
export function foodWorkOpportunity(
  world: World,
  actor: Citizen,
  work: FoodWork,
): FoodOpportunity | undefined {
  const holding = work.holdings.get(actor.id);
  if (!holding || !personalContact(world, actor, actor, work.contacts)) return;
  const supply = available(holding),
    surplus = supply.provisions + supply.cargo - bundleTarget(actor);
  if (surplus <= EPSILON) return;
  const index = work.contacts.positions.get(actor.id)!.tile;
  for (const { recipient, target } of work.opportunities.get(index) ?? []) {
    if (
      recipient === actor ||
      !personalContact(world, actor, recipient, work.contacts)
    )
      continue;
    return {
      recipient,
      target: Math.min(target, recipient.provisions + surplus),
    };
  }
}

function abandon(world: World, person: Citizen, reward = -0.2) {
  reinforce(person, reward, world.tick);
  person.task = null;
}

/** Existing active tasks earn capacity; assigning a task does not move matter. */
export function workOnFood(
  world: World,
  actor: Citizen,
  dt: number,
  effectiveHours: number,
  work: FoodWork,
): void {
  const task = actor.task;
  if (!isFoodHandoff(task)) return;
  const recipient = work.contacts.people.get(task.recipientId);
  if (
    recipient === actor ||
    !recipient ||
    !personalContact(world, actor, recipient, work.contacts)
  ) {
    abandon(world, actor);
    return;
  }
  const amount =
    Math.max(0, Math.min(dt, effectiveHours)) * FOOD_HANDOFF.kgPerWorkHour;
  if (!Number.isFinite(amount) || amount <= EPSILON) return;
  if (!actor.mind.pending) beginExperience(actor, "deliver", world.tick);
  work.intents.push({ actor, recipient, task, requested: amount });
}

/** All donor debits precede recipient credits: no same-interval forwarding. */
export function finishFoodWork(world: World, work: FoodWork): void {
  if (work.committed || work.world !== world || work.tick !== world.tick)
    throw new Error("Food work must commit once in its own world tick.");
  work.committed = true;
  if (!work.intents.length) return;
  const living = new Set(world.citizens),
    seen = new Set<string>();
  const claims = work.intents
    .sort((a, b) =>
      a.actor.id < b.actor.id ? -1 : a.actor.id > b.actor.id ? 1 : 0,
    )
    .filter((intent) => {
      if (intent.actor.task !== intent.task || seen.has(intent.actor.id))
        return false;
      seen.add(intent.actor.id);
      if (
        !living.has(intent.actor) ||
        !living.has(intent.recipient) ||
        !personalContact(world, intent.actor, intent.recipient, work.contacts)
      ) {
        abandon(world, intent.actor);
        return false;
      }
      return true;
    })
    .map((intent) => {
      const source = work.holdings.get(intent.actor.id)!,
        destination = work.holdings.get(intent.recipient.id)!,
        supply = available(source),
        gap = Math.max(
          0,
          intent.task.targetProvisionMass -
            Math.max(destination.provisions, intent.recipient.provisions),
        ),
        requested = Math.min(
          intent.requested,
          gap,
          supply.cargo + supply.provisions,
        ),
        cargo = Math.min(requested, supply.cargo);
      return {
        ...intent,
        source,
        gap,
        cargo,
        provisions: Math.min(supply.provisions, Math.max(0, requested - cargo)),
        transferred: 0,
      };
    });
  const groups = new Map<string, { sum: number; limit: number }>();
  for (const claim of claims) {
    const amount = claim.cargo + claim.provisions;
    if (amount <= EPSILON) continue;
    const group = groups.get(claim.recipient.id) ?? { sum: 0, limit: 0 };
    group.sum += amount;
    group.limit = Math.max(group.limit, claim.gap);
    groups.set(claim.recipient.id, group);
  }
  for (const claim of claims) {
    const group = groups.get(claim.recipient.id),
      factor = group ? Math.min(1, group.limit / group.sum) : 0;
    claim.cargo *= factor;
    claim.provisions *= factor;
    // Each actor has only one surviving claim. Its finite holders were captured
    // after meals, before any work, and are rechecked above before any credit.
    claim.actor.provisions -= claim.provisions;
    if (claim.cargo > 0) {
      claim.source.cargo!.amount -= claim.cargo;
      if (claim.source.cargo!.amount <= 0) claim.actor.cargo = null;
    }
    claim.transferred = claim.cargo + claim.provisions;
  }
  for (const claim of claims) claim.recipient.provisions += claim.transferred;

  for (const claim of claims) {
    if (claim.transferred <= EPSILON) {
      abandon(world, claim.actor, 0);
      continue;
    }
    claim.task.progress += claim.transferred;
    // A measured delivery is a practiced action, not evidence of eating or healing.
    reinforce(claim.actor, Math.min(0.3, claim.transferred), world.tick);
    if (
      claim.recipient.provisions >=
      claim.task.targetProvisionMass - EPSILON
    ) {
      claim.actor.experience.deliver =
        (claim.actor.experience.deliver ?? 0) + 1;
      claim.actor.skill = Math.min(10, claim.actor.skill + 0.014);
      remember(
        world,
        claim.actor,
        `Handed ${claim.task.progress.toFixed(2)} kg of food to ${claim.recipient.name}.`,
      );
      claim.actor.task = null;
    }
  }
}
