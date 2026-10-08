# Conditional labor sampler — review, 8 October 2026

This is the pre-implementation review. The [work-planning release record](../releases/work-planning-0.2.md) tracks the resulting implementation, executed tests and deployment separately.

**The proposed interval rescaling is mathematically sound for a continuous uniform input.** It removes the accidental overlap that excludes builders below the food-reserve target while retaining each branch's probability _conditional on reaching that eligible branch_. It does not preserve old task frequencies, remove the priority of earlier feasible branches, or create additional random entropy. The parent will implement and test the candidate; research changed no runtime code and ran no simulation.

## Mathematical contract

For uniform `u` in `[0,1)` and `0<p<1`, the selected interval `[0,p)` maps to `[0,1)` by `u/p`; the rejected interval `[p,1)` maps there by `(u-p)/(1-p)`. Conditional on either result, the remainder is uniform. A selected but infeasible branch can therefore continue with its rescaled remainder. This assumes feasibility does not secretly inspect and condition that remainder; keep it private to the sampler.

With food probability 0.65 and assembly probability 0.42, two otherwise eligible, feasible branches give first-food probability 0.65 and assembly probability `(1−0.65)×0.42 = 0.147`. If food attempts always fail, assembly's probability is 0.42. A pure arithmetic check over 10,000 midpoint inputs produced **6,500 food / 1,470 assembly / 2,030 fallthrough**, and **4,200 assembly** when selected food attempts were treated as failures. These are numerical checks, not simulation or empirical PRNG-quality results; later fallback food in the actual code changes final task frequencies.

[random.ts](../../src/simulation/random.ts) returns a 32-bit-quantized value below one, including zero. Finite inputs cannot provide an arbitrarily long sequence of exactly independent draws; sufficiently narrow branch histories have no representable initial input. Current probabilities are effective behavioral assumptions. Describe the result as a deterministic conditional sampler using one initial lottery draw, not proof of independent biological or political choices.

## Floating point and endpoints

- `p=0` returns false and `p=1` returns true, leaving the remainder unchanged: correct. Clamp probability with explicit bounds `0,1`; the project's general `clamp` defaults to 100. Reject NaN rather than allowing it to poison every later comparison. Current valid probability inputs should be finite.
- `u=p` belongs to the rejected interval and maps to zero. `u=0` can select every positive-probability branch whose earlier attempted task fails; that rare boundary behavior is valid.
- **The raw rejected formula can round to one.** A valid initial grid value `u₀=0.5−2^-32`, selected with `p₀=u₀+Number.EPSILON/4`, maps to `0.9999999999999999`. Then rejection with `p=0.35000000000000003` gives `(u−p)/(1−p) === 1`. This was reproduced with JavaScript number arithmetic. A remainder of one would suppress later branches with `p<1`.
- Preserve the invariant after rescaling: `0 ≤ remainder < 1`. The largest double below one is `1−Number.EPSILON/2`; using that as the upper saturation bound handles the demonstrated rounding case. This is a tiny numerical correction, not an exact-real probability claim. Test the two-step case, not only generator endpoints.

## Fit to the current decision path

Source anchors refer to [citizens.ts](../../src/simulation/citizens.ts), lines 174–405, as inspected before the candidate implementation.

| Branch                                                                      | Integration requirement                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hydration, carried cargo, personal food return, sleep/sickness, children    | Keep the current preceding priority gates. The child rest/social choice is separate.                                                                                                                                    |
| Urgent communal food, lines 259–263                                         | Keep deterministic priority when food is below `population×(2+2×sharing)` and food-search assignment succeeds. Keep initialization at its present location if preserving this path's current RNG-call count.            |
| Seasonal food, connect exploration, repair, assembly, social, wood, tending | Call the sampler only after their existing deterministic guards pass. Keep feasibility/assignment after selection; continue with the rescaled remainder on failure. Do not hoist all sampler calls ahead of the guards. |
| Stone/clay group, line 355                                                  | Preserve one probability gate for the group, followed by its material loop. Calling the sampler once per material would be another policy change.                                                                       |
| Experiment, lines 376–393                                                   | Preserve the forced-hypothesis short circuit: an explicit hypothesis bypasses the lottery.                                                                                                                              |

**Two existing returns need attention.** Social assignment at lines 341–342 and experiment assignment at 392–393 return even if `assignTask` fails. They must return only on success to meet the proposed continuation contract. This is distinct from rescaling comparisons. Keep the earlier urgent branches' behavior outside this narrow change unless separately reviewed.

`assignTask`, `gatherTask`, path search, repair-needs calculation and the camp-rest hash do not consume simulation RNG. Failed task assignment changes no authoritative person/task state. Successful assignment sets the task and experience and should return immediately. A food search can successfully assign exploration without obtaining food yet; measure that separately from actual harvest.

Connect-frontier selection at line 287 **does** call `random(world)` after lottery selection, even when the frontier list is empty. Children and later task completion/disease also have their own random calls. Preserve those call sites unless intentionally changing them. More reachable work can change which helpers run and future RNG consumption; no old/new whole-world replay equality is promised.

## Small decisive tests

1. **Reserve food plus a non-build project:** a healthy, rested adult in daylight, balance focus, no damaged structure or connect branch, a reachable unfinished project and a feasible remembered food patch. Put stock above the urgent threshold but below the computed reserve target. Prefill the person's rations so packing does not move stock across a boundary. At a non-hourly decision tick, set the fixture RNG to **3** immediately before the decision. Its first value is **0.7202267837710679**; food rejects and leaves **0.2006479536316224**, below even the minimum non-build assembly probability **0.22**. Expect an assembly task, with no grant or instant completion. Ensure no earlier test setup consumes the chosen draw.
2. **Urgent-food control:** use the same person, project, food patch and RNG, but lower communal stock below `population×(2+2×sharing)`. A feasible urgent food-search assignment must win; assembly must not start. Also retain the existing hunger/sleep interruption regression.
3. **Failure and numerical controls:** exercise selected-but-failed assignment followed by a feasible alternative; an ineligible guard that does not rescale; one stone/clay group gate; forced hypothesis bypass; `p=0/1`, `u=p`, NaN and the demonstrated two-step round-to-one case. A small midpoint-grid check can verify the conditional proportions without a long simulation.

The [numerical record](conditional-labor-sampler-numerics.json) retains exact arithmetic outputs and inspected source hashes. These tests are proposed for the implementation; only the number-arithmetic checks were executed by research.

## Implementation evidence reported by the parent

On 8 October 2026, the parent reported that the RNG-3 fixture reproduced the original exclusion (gathering instead of assembly), while the urgent-food control passed. The conditional sampler and success-only social/experiment returns are now present in source; the parent's targeted candidate checks were still running when this addendum was written. This report does not claim they all passed or that the candidate was deployed. The parent also reported the separate eligible-planner-alternative regression passing.

The numerical record's hashes identify the pre-correction source, intentionally retained. Later differences in `random.ts` and `citizens.ts` are expected implementation changes, not a reason to overwrite the original review evidence. Research did not execute either behavioral fixture or modify the implementation.
