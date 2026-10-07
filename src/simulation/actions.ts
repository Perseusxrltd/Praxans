import { FOCUSES } from "./content";
import {
  dispatchTrade,
  requestAssembly,
  RuleError,
  updateRelations,
} from "./economy";
import { evaluateDesign } from "./laws";
import type { AgentAction, World } from "./types";
import { peopleOf, recordEvent } from "./world";

/** Clone first: every action in a batch succeeds, or none of them changes the shared world. */
export function applyAgentActions(
  source: World,
  civId: string,
  actions: AgentAction[],
  agentName: string,
): { world: World; outcomes: string[] } {
  if (actions.length < 1 || actions.length > 6)
    throw new RuleError("Send between one and six actions.");
  const world = structuredClone(source),
    civ = world.civilizations.find((c) => c.id === civId);
  if (!civ || !peopleOf(world, civId).length)
    throw new RuleError(
      "This civilization has no living inhabitants to carry out decisions.",
    );
  const outcomes: string[] = [];
  for (const action of actions) {
    if (
      typeof action.reason !== "string" ||
      !action.reason.trim() ||
      action.reason.length > 400
    )
      throw new RuleError("Every decision needs a reason of 1–400 characters.");
    let outcome: string;
    switch (action.type) {
      case "focus":
        if (!FOCUSES[action.focus])
          throw new RuleError("Unknown community focus.");
        civ.focus = action.focus;
        outcome = FOCUSES[action.focus].name;
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
        civ.policies[action.policy] = action.value;
        outcome = `${action.policy} preference set to ${action.value.toFixed(2)}`;
        break;
      case "assemble":
        outcome = `Assembly begun: ${requestAssembly(world, civ, action.design)}`;
        break;
      case "experiment":
        evaluateDesign(action.design);
        if (civ.hypothesis)
          throw new RuleError(
            "The community is still working on its previous hypothesis.",
          );
        civ.hypothesis = structuredClone(action.design);
        outcome = "Hypothesis queued for material trials";
        break;
      case "trade":
        outcome = `Exchange dispatched: ${dispatchTrade(world, civ, action.target, action.offer, action.receive)}`;
        break;
      case "diplomacy": {
        const target = world.civilizations.find((c) => c.id === action.target);
        if (
          !target ||
          target === civ ||
          !["friendship", "neutrality", "rivalry"].includes(action.stance)
        )
          throw new RuleError(
            "Choose another community and a valid diplomatic stance.",
          );
        if (world.tick - civ.relations[target.id].lastDiplomacyTick < 96)
          throw new RuleError(
            "Give this community a day to respond before another diplomatic approach.",
          );
        civ.relations[target.id].lastDiplomacyTick = world.tick;
        updateRelations(
          civ,
          target,
          action.stance === "friendship"
            ? 10
            : action.stance === "rivalry"
              ? -18
              : 3,
        );
        outcome = `${action.stance} expressed to ${target.name}`;
        recordEvent(world, {
          category: "diplomacy",
          title: `${civ.name} reaches out to ${target.name}`,
          detail: action.reason,
          civId,
        });
        break;
      }
      default:
        throw new RuleError("Unknown action.");
    }
    civ.lastAgentTick = world.tick;
    civ.lastIntent = action.reason;
    recordEvent(world, {
      category: "agent",
      title: `${agentName}: ${outcome}`,
      detail: action.reason,
      civId,
      x: civ.x,
      y: civ.y,
    });
    outcomes.push(outcome);
  }
  return { world, outcomes };
}
