import { FOCUSES } from "./content";
import { canAfford, requestAssembly, RuleError } from "./economy";
import {
  dispatchExpedition,
  knownTarget,
  respondToMessage,
  sendMessage,
  sendTrade,
  validateGoods,
  validateTerms,
} from "./diplomacy";
import { evaluateDesign } from "./laws";
import { SUCCESS_AXES } from "./progress";
import { ADVICE_RULES, enqueueProposal } from "./society";
import type { AgentAction, Civilization, World } from "./types";
import { peopleOf, recordEvent } from "./world";

function validateAction(
  world: World,
  civ: Civilization,
  action: AgentAction,
): void {
  if (
    typeof action.reason !== "string" ||
    !action.reason.trim() ||
    action.reason.length > 400
  )
    throw new RuleError("Every proposal needs a reason of 1–400 characters.");
  switch (action.type) {
    case "focus":
      if (!FOCUSES[action.focus])
        throw new RuleError("Unknown community focus.");
      break;
    case "policy":
      if (
        !["sharing", "effort", "extraction"].includes(action.policy) ||
        !Number.isFinite(action.value) ||
        action.value < 0 ||
        action.value > 1
      )
        throw new RuleError(
          "Policies are bounded preferences between 0 and 1.",
        );
      break;
    case "assemble": {
      const properties = evaluateDesign(action.design);
      if (properties.mass > 1600 || !canAfford(civ.stock, properties.cost))
        throw new RuleError(
          "This geometry exceeds the present material budget or 1,600 kg assembly limit.",
        );
      break;
    }
    case "experiment":
      evaluateDesign(action.design);
      break;
    case "repair": {
      const s = world.structures.find(
        (s) => s.id === action.structureId && s.civId === civ.id,
      );
      if (!s || s.collapsed || s.progress < 1)
        throw new RuleError(
          "Choose an existing standing assembly belonging to this community.",
        );
      break;
    }
    case "aspiration":
      if (
        !action.statement.trim() ||
        action.statement.length > 240 ||
        SUCCESS_AXES.some(
          (axis) =>
            !Number.isFinite(action.weights[axis]) ||
            action.weights[axis] < 0 ||
            action.weights[axis] > 10,
        ) ||
        SUCCESS_AXES.every((axis) => action.weights[axis] === 0)
      )
        throw new RuleError(
          "An aspiration needs a statement and at least one positive priority, each bounded from 0 to 10.",
        );
      break;
    case "institution":
      if (
        ![action.quorum, action.consent, action.foodReserveDays].every(
          Number.isFinite,
        ) ||
        action.quorum < 0.5 ||
        action.quorum > 1 ||
        action.consent < 0.5 ||
        action.consent > 1 ||
        action.foodReserveDays < 0.5 ||
        action.foodReserveDays > 7
      )
        throw new RuleError(
          "Participation and consent must remain between 50% and 100%, with a food reserve of 0.5–7 days per person.",
        );
      break;
    case "trade":
      knownTarget(world, civ, action.target);
      validateGoods(action.offer);
      validateGoods(action.receive);
      if (
        action.offer.material === action.receive.material ||
        civ.stock[action.offer.material] < action.offer.amount
      )
        throw new RuleError(
          "Propose different materials and an outward offer the community actually holds.",
        );
      break;
    case "diplomacy":
      knownTarget(world, civ, action.target);
      if (!["friendship", "neutrality", "rivalry"].includes(action.stance))
        throw new RuleError("Unknown diplomatic stance.");
      break;
    case "communicate":
      knownTarget(world, civ, action.target);
      validateTerms(action.terms);
      if (!action.text.trim() || action.text.length > 1200)
        throw new RuleError("A letter needs 1–1,200 characters.");
      break;
    case "respond": {
      const message = world.diplomacy.messages.find(
        (m) => m.id === action.messageId,
      );
      if (
        !message ||
        message.to !== civ.id ||
        message.status !== "delivered" ||
        !message.terms.length ||
        message.answeredBy ||
        message.expiresTick < world.tick ||
        message.replyTo
      )
        throw new RuleError(
          "There is no delivered, unanswered proposal here to respond to.",
        );
      if (
        !["accept", "decline"].includes(action.decision) ||
        !action.text.trim() ||
        action.text.length > 1200
      )
        throw new RuleError(
          "Return an explicit decision with a bounded letter.",
        );
      break;
    }
    case "expedition":
      knownTarget(world, civ, action.target);
      validateGoods({ material: action.material, amount: 1 });
      if (
        !Number.isInteger(action.people) ||
        action.people < 1 ||
        action.people > 3
      )
        throw new RuleError("Propose one to three willing adults.");
      break;
    default:
      throw new RuleError("Unknown proposal type.");
  }
}

/** Execution is only called after local deliberation. Feasibility is checked again at that later tick. */
export function executeProposal(
  world: World,
  civ: Civilization,
  action: AgentAction,
): string {
  validateAction(world, civ, action);
  switch (action.type) {
    case "focus":
      civ.focus = action.focus;
      return `The assembly adopted ${FOCUSES[action.focus].name}`;
    case "policy":
      civ.policies[action.policy] = action.value;
      return `The assembly adopted a ${action.policy} preference of ${action.value.toFixed(2)}`;
    case "assemble":
      return `Material reserved for assembly ${requestAssembly(world, civ, action.design)}; people must carry out the work`;
    case "experiment":
      if (civ.hypothesis)
        throw new RuleError(
          "An earlier hypothesis still awaits material trials.",
        );
      civ.hypothesis = structuredClone(action.design);
      return "A hypothesis was accepted for material investigation";
    case "repair":
      world.structures.find((s) => s.id === action.structureId)!.maintenance =
        true;
      return "Maintenance accepted; replacement material and local work are still required";
    case "aspiration":
      civ.civics.aspiration = {
        statement: action.statement,
        weights: { ...action.weights },
      };
      return "The community adopted its own interpretation of success";
    case "institution":
      civ.civics.institution = {
        quorum: action.quorum,
        consent: action.consent,
        foodReserveDays: action.foodReserveDays,
      };
      return "The local assembly adopted new bounded decision rules";
    case "trade":
      return `An offer is traveling with party ${sendTrade(world, civ, action.target, action.offer, action.receive)}; the recipient decides on arrival`;
    case "diplomacy":
      return `A ${action.stance} letter is traveling: ${sendMessage(world, civ, action.target, action.reason, [], action.stance)}`;
    case "communicate":
      return `Letter ${sendMessage(world, civ, action.target, action.text, action.terms)} is traveling; no commitment is yet ratified`;
    case "respond":
      return `Reply ${respondToMessage(world, civ, action.messageId, action.decision, action.text)} is traveling`;
    case "expedition":
      return `A willing party departed: ${dispatchExpedition(world, civ, action.target, action.people, action.material)}`;
  }
}

/** Every submission in a batch is queued atomically; its receipt is not an approval or a guaranteed outcome. */
export function applyAgentActions(
  source: World,
  civId: string,
  actions: AgentAction[],
  agentName: string,
): { world: World; outcomes: string[] } {
  if (actions.length < 1 || actions.length > 6)
    throw new RuleError("Send between one and six proposals.");
  const world = structuredClone(source),
    civ = world.civilizations.find((c) => c.id === civId);
  if (!civ || !peopleOf(world, civId).length)
    throw new RuleError(
      "This civilization has no living inhabitants to consider advice.",
    );
  if (world.tick - civ.civics.lastSubmissionTick < 16)
    throw new RuleError(
      "This community deliberates at most one new batch per four simulated hours, across all agent keys.",
    );
  if (
    civ.civics.proposals.filter((p) => p.status === "pending").length +
      actions.length >
    ADVICE_RULES.pendingPerCommunity
  )
    throw new RuleError(
      "The community already has enough proposals to consider; observe their outcomes first.",
    );
  const outcomes: string[] = [];
  for (const action of actions) {
    validateAction(world, civ, action);
    const fingerprint = JSON.stringify({ ...action, reason: "" });
    if (
      civ.civics.proposals.some(
        (p) =>
          p.status === "pending" &&
          JSON.stringify({ ...p.action, reason: "" }) === fingerprint,
      )
    )
      throw new RuleError("That proposal is already awaiting deliberation.");
    const proposal = enqueueProposal(world, civ, action, agentName);
    outcomes.push(
      `Proposal ${proposal.id} queued for local deliberation; Praxans may accept or refuse it`,
    );
    recordEvent(world, {
      category: "agent",
      title: `${agentName} proposes ${action.type}`,
      detail: action.reason,
      civId,
      x: civ.x,
      y: civ.y,
      referenceId: proposal.id,
    });
  }
  civ.civics.lastSubmissionTick = world.tick;
  civ.lastAgentTick = world.tick;
  civ.lastIntent = actions.at(-1)!.reason;
  return { world, outcomes };
}
