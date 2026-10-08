import { beginExperience, reinforce } from "./cognition";
import {
  PHYSIOLOGY,
  bodyHeatBalance,
  bodyShelter,
  preferredWrapMass,
} from "./physiology";
import { canReachCampStocks } from "./settlement";
import { getTile, tileIndex } from "./terrain";
import { remember } from "./world";
import {
  HOURS_PER_TICK,
  type Citizen,
  type Civilization,
  type Task,
  type World,
} from "./types";

const EPSILON = 1e-9;
export const isBodyRepair = (
  task: Task | null,
): task is Task & {
  recipientId: string;
  targetWrapMass: number;
} =>
  task?.kind === "repair" &&
  task.recipientId !== undefined &&
  task.targetWrapMass !== undefined;

interface BodyIntent {
  actor: Citizen;
  recipient: Citizen;
  task: Task & { recipientId: string; targetWrapMass: number };
  adding: boolean;
  requested: number;
}
interface BodyOpportunity {
  recipient: Citizen;
  target: number;
  benefit: number;
}

/** Transient step data, never saved. One index avoids a population scan per helper. */
export interface BodyWork {
  tick: number;
  people: Map<string, Citizen>;
  positions: Map<string, { x: number; y: number; tile: number }>;
  local: Map<number, Citizen[]>;
  opportunities: Map<number, BodyOpportunity[]>;
  intents: BodyIntent[];
  committed: boolean;
}

export function beginBodyWork(world: World): BodyWork {
  const people = new Map<string, Citizen>(),
    positions = new Map<string, { x: number; y: number; tile: number }>(),
    local = new Map<number, Citizen[]>();
  for (const person of world.citizens) {
    const tile = tileIndex(world, person.x, person.y);
    people.set(person.id, person);
    positions.set(person.id, { x: person.x, y: person.y, tile });
    const residents = local.get(tile) ?? [];
    residents.push(person);
    local.set(tile, residents);
  }
  return {
    tick: world.tick,
    people,
    positions,
    local,
    opportunities: new Map(),
    intents: [],
    committed: false,
  };
}

function stationary(world: World, person: Citizen, work: BodyWork): boolean {
  const start = work.positions.get(person.id);
  return (
    !!start &&
    person.health > 0 &&
    !person.journeyId &&
    start.x === person.x &&
    start.y === person.y &&
    !person.task?.path.length &&
    tileIndex(world, person.x, person.y) === start.tile
  );
}

function contact(
  world: World,
  actor: Citizen,
  recipient: Citizen,
  work: BodyWork,
): boolean {
  return (
    stationary(world, actor, work) &&
    stationary(world, recipient, work) &&
    work.positions.get(actor.id)!.tile ===
      work.positions.get(recipient.id)!.tile
  );
}

function availableFiber(
  world: World,
  person: Citizen,
  civ: Civilization,
): number {
  return (
    (person.cargo?.material === "fiber" ? person.cargo.amount : 0) +
    (canReachCampStocks(world, civ, person) ? civ.stock.fiber : 0)
  );
}

function canReceiveFiber(
  world: World,
  person: Citizen,
  civ: Civilization,
): boolean {
  return (
    canReachCampStocks(world, civ, person) ||
    !person.cargo ||
    person.cargo.material === "fiber"
  );
}

/** Only current, visible bodies in the occupied cell enter this local opportunity list. */
export function bodyWorkOpportunities(
  world: World,
  actor: Citizen,
  civ: Civilization,
  work: BodyWork,
) {
  if (!stationary(world, actor, work)) return [];
  const best = new Map<boolean, BodyOpportunity>();
  const tile = getTile(world, actor.x, actor.y)!;
  const index = tileIndex(world, actor.x, actor.y);
  let candidates = work.opportunities.get(index);
  if (!candidates) {
    candidates = [];
    // One local estimate per cell and quarter-hour, shared by its observers.
    // Contacts and supplies are rechecked below and at the physical boundary.
    // Re-evaluating every body for every helper amplifies work in crowded camps.
    for (const recipient of work.local.get(index) ?? []) {
      if (!stationary(world, recipient, work)) continue;
      const active =
        !!recipient.task && !["rest", "social"].includes(recipient.task.kind);
      const shelter = bodyShelter(world, recipient).resistance;
      const target = preferredWrapMass(
        recipient,
        tile.temperature,
        active,
        shelter,
      );
      const difference = target - recipient.wrapMass;
      // Do not spend every decision adjusting microscopic wear: plan at least one
      // ordinary quarter-hour's reference movement. This is controller granularity.
      if (Math.abs(difference) < PHYSIOLOGY.wrappingKgPerHour * HOURS_PER_TICK)
        continue;
      const before = bodyHeatBalance(
        recipient,
        tile.temperature,
        active,
        shelter,
      );
      const after = bodyHeatBalance(
        recipient,
        tile.temperature,
        active,
        shelter,
        target,
      );
      const benefit =
        Math.abs(before.lossW - before.metabolismW) -
        Math.abs(after.lossW - after.metabolismW);
      if (benefit > EPSILON) candidates.push({ recipient, target, benefit });
    }
    candidates.sort(
      (a, b) =>
        b.benefit - a.benefit || (a.recipient.id < b.recipient.id ? -1 : 1),
    );
    work.opportunities.set(index, candidates);
  }
  const supply = availableFiber(world, actor, civ) > EPSILON,
    receive = canReceiveFiber(world, actor, civ);
  for (const candidate of candidates) {
    const { recipient, target } = candidate;
    if (
      !contact(world, actor, recipient, work) ||
      (target > recipient.wrapMass ? !supply : !receive)
    )
      continue;
    const self = recipient === actor;
    if (!best.has(self)) best.set(self, candidate);
    if (best.size === 2) break;
  }
  // Declining to help someone must not remove the actor's own adjustment option.
  return [...best.values()].sort(
    (a, b) =>
      b.benefit - a.benefit || (a.recipient.id < b.recipient.id ? -1 : 1),
  );
}

function abandon(world: World, person: Citizen, reward = -0.2): void {
  reinforce(person, reward, world.tick);
  person.task = null;
}

/** Called only for an existing active task, after its ordinary fatigue/needs costs. */
export function workOnBody(
  world: World,
  actor: Citizen,
  dt: number,
  effectiveHours: number,
  work: BodyWork,
): void {
  const task = actor.task;
  if (!isBodyRepair(task)) return;
  const recipient = work.people.get(task.recipientId);
  if (!recipient || !contact(world, actor, recipient, work)) {
    abandon(world, actor);
    return;
  }
  const difference = task.targetWrapMass - recipient.wrapMass;
  if (Math.abs(difference) <= EPSILON) {
    abandon(world, actor, 0);
    return;
  }
  // The recipient may not have undergone this tick's wear yet. Queue earned
  // capacity, then cap the target gap against the shared post-physiology state.
  const amount =
    Math.max(0, Math.min(dt, effectiveHours)) * PHYSIOLOGY.wrappingKgPerHour;
  if (!Number.isFinite(amount) || amount <= EPSILON) return;
  if (!actor.mind.pending) beginExperience(actor, "repair", world.tick);
  work.intents.push({
    actor,
    recipient,
    task,
    adding: difference > 0,
    requested: amount,
  });
}

/**
 * Commit against common, post-physiology inventories. Placement and removal have
 * separate gross budgets; fiber removed here cannot fund another placement here.
 * This scopes ordering independence to body work, not the rest of the economy.
 */
export function finishBodyWork(world: World, work: BodyWork): void {
  if (work.committed || work.tick !== world.tick)
    throw new Error("Body work must commit once in its own tick.");
  work.committed = true;
  const civs = new Map(world.civilizations.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const claims = work.intents
    .sort((a, b) =>
      a.actor.id < b.actor.id ? -1 : a.actor.id > b.actor.id ? 1 : 0,
    )
    .filter((intent) => {
      if (seen.has(intent.actor.id)) return false;
      seen.add(intent.actor.id);
      if (intent.actor.task !== intent.task) return false;
      if (!contact(world, intent.actor, intent.recipient, work)) {
        abandon(world, intent.actor);
        return false;
      }
      return true;
    })
    .map((intent) => {
      const civ = civs.get(intent.actor.civId)!;
      const difference = intent.task.targetWrapMass - intent.recipient.wrapMass;
      const requested =
        Math.sign(difference) === (intent.adding ? 1 : -1)
          ? Math.min(intent.requested, Math.abs(difference))
          : 0;
      const carried =
        intent.adding && intent.actor.cargo?.material === "fiber"
          ? Math.min(requested, intent.actor.cargo.amount)
          : 0;
      const stock =
        intent.adding && canReachCampStocks(world, civ, intent.actor)
          ? requested - carried
          : 0;
      const removed =
        !intent.adding && canReceiveFiber(world, intent.actor, civ)
          ? requested
          : 0;
      return { ...intent, civ, carried, stock, removed, transferred: 0 };
    });
  const stockClaims = new Map<string, number>();
  for (const c of claims)
    stockClaims.set(c.civ.id, (stockClaims.get(c.civ.id) ?? 0) + c.stock);
  for (const c of claims)
    c.stock *= Math.min(
      1,
      c.civ.stock.fiber / (stockClaims.get(c.civ.id) || 1),
    );
  const groups = new Map<string, { sum: number; limit: number }>();
  for (const c of claims) {
    const key = `${c.recipient.id}:${c.adding}`;
    const group = groups.get(key) ?? { sum: 0, limit: 0 };
    group.sum += c.carried + c.stock + c.removed;
    group.limit = Math.max(
      group.limit,
      Math.abs(c.task.targetWrapMass - c.recipient.wrapMass),
    );
    groups.set(key, group);
  }
  for (const c of claims) {
    const group = groups.get(`${c.recipient.id}:${c.adding}`)!;
    const factor = Math.min(1, group.limit / (group.sum || 1));
    c.carried *= factor;
    c.stock *= factor;
    c.removed *= factor;
  }
  const bodies = new Map<
    string,
    {
      person: Citizen;
      before: number;
      added: number;
      removed: number;
      temperature: number;
      active: boolean;
      shelter: number;
    }
  >();
  for (const c of claims)
    if (!bodies.has(c.recipient.id))
      bodies.set(c.recipient.id, {
        person: c.recipient,
        before: c.recipient.wrapMass,
        added: 0,
        removed: 0,
        temperature: getTile(world, c.recipient.x, c.recipient.y)!.temperature,
        active:
          !!c.recipient.task &&
          !["rest", "social"].includes(c.recipient.task.kind),
        shelter: bodyShelter(world, c.recipient).resistance,
      });

  // Debit every source before returning any removed fiber to a stockpile.
  for (const c of claims)
    if (c.adding) {
      const body = bodies.get(c.recipient.id)!;
      const cargo = c.actor.cargo;
      const carried =
        cargo?.material === "fiber" ? Math.min(c.carried, cargo.amount) : 0;
      const stock = Math.min(c.stock, c.civ.stock.fiber);
      if (cargo?.material === "fiber") {
        cargo.amount -= carried;
        if (cargo.amount <= 0) c.actor.cargo = null;
      }
      c.civ.stock.fiber -= stock;
      c.transferred = carried + stock;
      body.added += c.transferred;
    }
  for (const c of claims)
    if (!c.adding) {
      const body = bodies.get(c.recipient.id)!;
      const removed = Math.min(
        c.removed,
        Math.max(0, body.before - body.removed),
      );
      if (canReachCampStocks(world, c.civ, c.actor))
        c.civ.stock.fiber += removed;
      else if (removed > 0) {
        if (!c.actor.cargo) c.actor.cargo = { material: "fiber", amount: 0 };
        c.actor.cargo.amount += removed;
      }
      c.transferred = removed;
      body.removed += removed;
    }
  for (const body of bodies.values())
    body.person.wrapMass = body.before + body.added - body.removed;

  const selfTransfers = new Map<string, number>();
  for (const c of claims) {
    if (c.actor === c.recipient && c.transferred > 0)
      selfTransfers.set(c.actor.id, (c.adding ? 1 : -1) * c.transferred);
    if (c.transferred <= EPSILON) {
      abandon(world, c.actor);
      continue;
    }
    c.task.progress += c.transferred;
    const body = bodies.get(c.recipient.id)!;
    // Attribute the actual signed contribution in the common thermal frame.
    // Another helper's improvement cannot reward this actor's harmful removal.
    // Clearing one completed task below cannot change another actor's evaluation.
    const before = bodyHeatBalance(
      c.recipient,
      body.temperature,
      body.active,
      body.shelter,
      c.recipient.wrapMass - (c.adding ? 1 : -1) * c.transferred,
    );
    const after = bodyHeatBalance(
      c.recipient,
      body.temperature,
      body.active,
      body.shelter,
    );
    const oldBurden = Math.abs(before.lossW - before.metabolismW);
    reinforce(
      c.actor,
      (oldBurden - Math.abs(after.lossW - after.metabolismW)) /
        Math.max(1, oldBurden),
      world.tick,
    );
    const complete = c.adding
      ? c.recipient.wrapMass >= c.task.targetWrapMass - EPSILON
      : c.recipient.wrapMass <= c.task.targetWrapMass + EPSILON;
    if (complete) {
      c.actor.experience.repair = (c.actor.experience.repair ?? 0) + 1;
      c.actor.skill = Math.min(10, c.actor.skill + 0.014);
      remember(
        world,
        c.actor,
        `Adjusted ${c.task.progress.toFixed(2)} kg of fiber around ${c.actor === c.recipient ? "my body" : c.recipient.name} through work.`,
      );
      c.actor.task = null;
    }
  }
  // A person's performed self-adjustment is observable; a private preference or
  // silence is not consent. Opposing self-work prompts another ordinary choice,
  // after all real transfers, without becoming a physical permission check.
  for (const claim of claims) {
    if (
      claim.actor === claim.recipient ||
      claim.actor.task !== claim.task ||
      claim.actor.mind.sleeping
    )
      continue;
    const response = selfTransfers.get(claim.recipient.id) ?? 0;
    if (response * (claim.adding ? 1 : -1) < 0) abandon(world, claim.actor, 0);
  }
}
