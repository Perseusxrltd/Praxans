import { evaluateDesign } from "./laws";
import { hasPeace, tradeUtility } from "./diplomacy";
import { measureSuccess } from "./progress";
import { clamp } from "./random";
import { distance, housing, peopleOf, recordEvent, uid } from "./world";
import type {
  AgentAction,
  Citizen,
  CivicProposal,
  Civilization,
  World,
} from "./types";

export const ADVICE_RULES = Object.freeze({
  pendingPerCommunity: 6,
  hoursBetweenBatches: 4,
  deliberationHours: 4,
  expiryHours: 48,
  minimumVotingAge: 18,
  assemblyRadius: 3,
  description:
    "Advisory proposals require local adult participation, quorum and consent. Keys share one community budget. Trust is earned from observed outcomes and never grants direct control.",
});

export function enqueueProposal(
  world: World,
  civ: Civilization,
  action: AgentAction,
  agentName: string,
  source: CivicProposal["source"] = "agent",
): CivicProposal {
  const proposal: CivicProposal = {
    id: uid(world, "proposal"),
    source,
    agentName,
    action: structuredClone(action),
    submittedTick: world.tick,
    dueTick: world.tick + 16,
    expiresTick: world.tick + 192,
    decidedTick: null,
    status: "pending",
    ballots: [],
    outcome: "Waiting for a local assembly",
    review: null,
  };
  civ.civics.proposals.push(proposal);
  return proposal;
}

function preference(
  world: World,
  person: Citizen,
  civ: Civilization,
  action: AgentAction,
): { utility: number; reason: string } {
  const population = peopleOf(world, civ.id).length,
    food = civ.stock.biomass / Math.max(1, population);
  const deprived = person.hunger < 40 || person.health < 45;
  const result = (utility: number, reason: string) => ({ utility, reason });
  switch (action.type) {
    case "focus": {
      const utility = {
        nourish: food < 3 || deprived ? 0.9 : 0.2,
        balance: 0.25,
        build:
          food < 1 ? -0.7 : housing(world, civ.id) < population ? 0.45 : -0.1,
        discover:
          deprived || food < 1 ? -0.8 : person.traits.curiosity * 0.8 - 0.15,
        connect: deprived ? -0.5 : person.traits.sociability * 0.65 - 0.1,
        preserve: food < 1 ? -0.3 : person.traits.resilience * 0.6,
      }[action.focus];
      return result(
        utility,
        "Weighed this priority against bodily needs and personal interests",
      );
    }
    case "policy": {
      const ideal =
        action.policy === "effort"
          ? clamp(
              0.2 +
                person.traits.diligence * 0.6 -
                (1 - person.energy / 100) * 0.5,
              0,
              1,
            )
          : action.policy === "sharing"
            ? 0.35 + person.traits.sociability * 0.6
            : clamp(
                0.25 + (food < 2 ? 0.35 : 0) - person.traits.resilience * 0.15,
                0,
                1,
              );
      return result(
        0.3 - Math.abs(action.value - ideal),
        "Compared the proposal with a personally tolerable practice",
      );
    }
    case "assemble": {
      const p = evaluateDesign(action.design);
      if (!p.stable)
        return result(-2, "The proposed assembly cannot support its loads");
      if (
        civ.stock.biomass - p.cost.biomass <
        population * civ.civics.institution.foodReserveDays
      )
        return result(-2, "Protected food reserves would be consumed");
      return result(
        deprived
          ? -0.6
          : p.coveredArea > 0.5 || p.storageVolume > 0.05 || p.workSurface > 0.5
            ? 0.45
            : -0.2,
        "Considered material costs and useful physical affordances",
      );
    }
    case "experiment":
      return result(
        deprived || food < 1 ? -0.8 : person.traits.curiosity * 0.75,
        "Considered whether there is room for material investigation",
      );
    case "repair":
      return result(
        deprived ? -0.25 : 0.55,
        "Considered keeping an existing useful structure standing",
      );
    case "institution":
      return result(
        0.25 -
          Math.abs(action.consent - (0.5 + person.traits.sociability * 0.25)) -
          Math.max(0, action.quorum - 0.75) -
          Math.abs(action.foodReserveDays - 1) * 0.05,
        "Weighed participation, consent and the burden of the proposed reserve",
      );
    case "aspiration": {
      const w = action.weights,
        total = Object.values(w).reduce((a, b) => a + b, 0);
      const resonance =
        (w.wellbeing +
          w.resilience +
          w.knowledge * person.traits.curiosity +
          w.ecology * person.traits.resilience +
          w.connection * person.traits.sociability +
          w.reach * civ.culture.ambition) /
        Math.max(total, 1);
      return result(
        resonance - 0.3,
        "Considered how the declared ambition values a life like mine",
      );
    }
    case "trade":
      return result(
        deprived && action.offer.material === "biomass"
          ? -1
          : 0.3 + person.traits.sociability * 0.2,
        "Considered the cost of approaching another community with an offer",
      );
    case "communicate":
    case "diplomacy":
      return result(
        food < 1
          ? -0.7
          : action.type === "diplomacy" && action.stance === "rivalry"
            ? civ.culture.ambition -
              person.traits.sociability -
              (hasPeace(world, civ.id, action.target) ? 0.8 : 0)
            : 0.25 + person.traits.sociability * 0.2,
        "Weighed communication costs and the existing relationship",
      );
    case "respond": {
      if (action.decision === "decline")
        return result(0.25, "Considered returning a clear refusal");
      const message = world.diplomacy.messages.find(
        (m) => m.id === action.messageId,
      );
      if (!message) return result(-2, "The referenced proposal is not present");
      const outgoing = message.terms.filter(
        (t) => t.kind === "transfer" && t.from === "recipient",
      );
      const incoming = message.terms.filter(
        (t) => t.kind === "transfer" && t.from === "sender",
      );
      if (
        outgoing.some(
          (term) =>
            term.kind === "transfer" &&
            (term.goods.amount > civ.stock[term.goods.material] ||
              (term.goods.material === "biomass" &&
                civ.stock.biomass - term.goods.amount <
                  population * civ.civics.institution.foodReserveDays)),
        )
      )
        return result(
          -2,
          "This commitment would endanger the reserve or promises goods we do not have",
        );
      if (outgoing.length && !incoming.length)
        return result(
          civ.culture.care + person.traits.sociability - 1.15,
          "Considered an unrepaid gift or obligation",
        );
      return result(
        (civ.relations[message.from]?.affinity ?? 0) / 180 +
          person.traits.sociability * 0.4,
        "Considered reciprocal obligations and whether the counterpart can be trusted",
      );
    }
    case "expedition":
      return result(
        food < 1
          ? -0.7
          : -(civ.relations[action.target]?.affinity ?? 0) / 100 +
              civ.culture.ambition * 0.7 -
              person.traits.sociability * 0.6 -
              0.35 -
              (hasPeace(world, civ.id, action.target) ? 0.8 : 0),
        "Weighed hostility, possible gain, bodily risk and commitments",
      );
  }
}

export function updateCouncils(
  world: World,
  execute: (world: World, civ: Civilization, action: AgentAction) => string,
): void {
  for (const civ of world.civilizations) {
    const adults = peopleOf(world, civ.id).filter(
      (p) => p.age >= ADVICE_RULES.minimumVotingAge && p.health > 0,
    );
    const living = new Set(adults.map((p) => p.id));
    const pending = civ.civics.proposals.filter((p) => p.status === "pending");
    for (const person of adults) {
      if (
        person.journeyId ||
        person.mind.sleeping ||
        person.energy < 15 ||
        distance(person, civ) > ADVICE_RULES.assemblyRadius
      )
        continue;
      const proposal = pending.find(
        (p) => !p.ballots.some((b) => b.citizenId === person.id),
      );
      if (!proposal) continue;
      const opinion = preference(world, person, civ, proposal.action);
      const influence =
        proposal.source === "agent" ? (person.mind.adviceTrust - 0.4) * 0.5 : 0;
      proposal.ballots.push({
        citizenId: person.id,
        support: opinion.utility + influence > 0.15,
        reason: opinion.reason,
      });
      person.energy = clamp(person.energy - 0.15);
    }
    for (const proposal of pending) {
      const ballots = proposal.ballots.filter((b) => living.has(b.citizenId));
      const quorum = Math.ceil(adults.length * civ.civics.institution.quorum);
      if (world.tick < proposal.dueTick) continue;
      if (!adults.length || ballots.length < quorum) {
        if (world.tick >= proposal.expiresTick) {
          proposal.status = "expired";
          proposal.decidedTick = world.tick;
          proposal.outcome =
            "The local assembly did not reach quorum before the proposal expired";
        } else continue;
      } else {
        const support =
          ballots.filter((b) => b.support).length / ballots.length;
        proposal.decidedTick = world.tick;
        if (support + 1e-12 < civ.civics.institution.consent) {
          proposal.status = "refused";
          civ.civics.refused++;
          proposal.outcome = `The assembly declined: ${ballots.filter((b) => b.support).length}/${ballots.length} participants supported it`;
        } else {
          try {
            const baseline = measureSuccess(world, civ);
            proposal.outcome = execute(world, civ, proposal.action);
            proposal.status = "accepted";
            civ.civics.accepted++;
            if (proposal.source === "agent")
              proposal.review = {
                dueTick: world.tick + 192,
                baseline,
                result: null,
                tick: null,
              };
          } catch (error) {
            // Changed resources or routes can invalidate an accepted proposal. Natural rules still win.
            if (!(error instanceof Error) || error.name !== "RuleError")
              throw error;
            proposal.status = "failed";
            proposal.outcome = `Supported, but could not proceed: ${error.message}`;
          }
        }
      }
      recordEvent(world, {
        category: "agent",
        title: `${civ.name}: proposal ${proposal.status}`,
        detail: `${proposal.action.reason} — ${proposal.outcome}`,
        civId: civ.id,
        x: civ.x,
        y: civ.y,
        referenceId: proposal.id,
      });
    }
    const reviews = civ.civics.proposals.filter(
      (p) =>
        p.review && p.review.tick === null && world.tick >= p.review.dueTick,
    );
    for (const proposal of reviews) {
      const review = proposal.review!,
        after = measureSuccess(world, civ);
      review.result = after;
      review.tick = world.tick;
      const change =
        clamp(
          (after.wellbeing - review.baseline.wellbeing) * 0.002 +
            (after.resilience - review.baseline.resilience) * 0.001 +
            (after.knowledge - review.baseline.knowledge) * 0.003 +
            (after.connection - review.baseline.connection) * 0.001,
          -0.04,
          0.03,
        ) / reviews.length;
      for (const person of adults)
        person.mind.adviceTrust = clamp(
          person.mind.adviceTrust + change,
          0.05,
          0.95,
        );
    }
    if (civ.civics.proposals.length > 64)
      civ.civics.proposals = civ.civics.proposals.filter(
        (p, i, all) =>
          p.status === "pending" ||
          p.review?.tick === null ||
          i >= all.length - 64,
      );
  }
}

/** Unconnected communities can consider incoming proposals without an external model. */
export function autonomousDiplomacy(world: World): void {
  for (const civ of world.civilizations) {
    if (civ.civics.proposals.some((p) => p.status === "pending")) continue;
    const message = world.diplomacy.messages.find(
      (m) =>
        m.to === civ.id &&
        m.status === "delivered" &&
        m.terms.length &&
        !m.replyTo &&
        !m.answeredBy &&
        world.tick - m.deliveredTick! >= (civ.claimed ? 384 : 96) &&
        m.expiresTick > world.tick,
    );
    if (!message) continue;
    const outgoing = message.terms.filter(
      (t) => t.kind === "transfer" && t.from === "recipient",
    );
    const incoming = message.terms.filter(
      (t) => t.kind === "transfer" && t.from === "sender",
    );
    const viable =
      (civ.relations[message.from]?.affinity ?? -100) >= -10 &&
      outgoing.every(
        (term) =>
          term.kind !== "transfer" ||
          (civ.stock[term.goods.material] >= term.goods.amount &&
            (term.goods.material !== "biomass" ||
              civ.stock.biomass - term.goods.amount >=
                peopleOf(world, civ.id).length *
                  civ.civics.institution.foodReserveDays)),
      );
    const balanced =
      !outgoing.length ||
      incoming.some(
        (a) =>
          a.kind === "transfer" &&
          outgoing.every(
            (b) =>
              b.kind !== "transfer" ||
              tradeUtility(world, civ, a.goods, b.goods),
          ),
      );
    const decision = viable && balanced ? "accept" : "decline";
    enqueueProposal(
      world,
      civ,
      {
        type: "respond",
        messageId: message.id,
        decision,
        text:
          decision === "accept"
            ? "We are willing to undertake these commitments."
            : "These commitments do not suit our present circumstances.",
        reason: "Consider a reply to the delivered proposal.",
      },
      "The local assembly",
      "inhabitants",
    );
  }
}
