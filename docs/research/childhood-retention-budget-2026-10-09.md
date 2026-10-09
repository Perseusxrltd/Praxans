# Childhood retention: separate development from heating

Read-only review of the source reported at `f3aea797f57d0c7ba633f6be1d8d96847fe2ae43`, format 14 / `biosphere-1.8`. **Recommend a staged developmental correction: resting-capped processing, an independent age-reference capacity and finite structural recovery.** This removes the demonstrated expenditure-driven growth permission without adding optional oxygen demand before its allocation semantics are ready. Biosynthetic processing remains explicitly bundled into existing maintenance. The explicit-work alternative below is a later coherent extension, not a claim of calibrated synthesis energetics. Nothing is implemented by this note.

The [earlier actual-function diagnostic](infant-food-access-2026-10-09.md) already distinguishes the mechanism: with equal initial body and intake and no unmet demand, doubling outward heat demand increased 15-minute structural retention from `0.000667180129007413` to `0.0013343602580148256` kg. Changing age zero to one at fixed body left the tested fluxes equal. These are measured model responses, not physiological coefficients, a survival forecast or a historical death share. No new simulation was run here. At the initial source read, `physiology.ts` and `subsistence.ts` matched their diagnostic file hashes exactly; other files, including `laws.ts`, differed. The maintainer's subsequent physiology work changed that fingerprint before this note was finished. This note reviews the recorded baseline and proposal, not the later implementation, and does not claim the old run was reproduced on the new release.

## What the source establishes

In [physiology.ts](../../src/simulation/physiology.ts), `finishMetabolism`, lines 457–486, the total tissue allowance is:

```text
min(unoxidized intake remaining, food oxidized × 0.35 / 0.65)
```

It restores reserves first, then grows structure toward `18 × 0.9 = 16.2 kg`, regardless of age. The additional fuel burned for cold, melting or active work can therefore enlarge the allowance. This conserves matter and chemical energy but confuses expenditure with developmental capacity. The initial measured quarter-hour allocation is equivalent to about 0.064 kg/day at unchanged starting conditions; that arithmetic is not a trajectory. There is no maturation timescale in this calculation. Increasing body also enlarges intake capacity and the body-dependent expenditure allowance, producing feedback unrelated to chronological development.

The surrounding mechanisms do not supply the missing growth constraint:

| Source                                                                                                                                 | Current representation                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [world.ts](../../src/simulation/world.ts), `createCitizen`, lines 295–308                                                              | Newborn body 2 kg, including reserve 0.2 kg; intake zero, hydration 1 kg. Adults start at 18 kg body. These are dry-equivalent body quantities with separately counted water, not anatomical wet weights.                                                                     |
| `physiology.ts`, lines 70–83 and 111–130                                                                                               | Intake capacity scales with body; heat area and baseline power use `max(0.2, body/18)`. Hydration changes rule at age 12. None is a developmental deposition rate.                                                                                                            |
| [citizens.ts](../../src/simulation/citizens.ts), lines 246, 324, 680, 838; [movement.ts](../../src/simulation/movement.ts), `walkPath` | Age advances using hours and the orbital-year constant. Work choice changes at 12; all younger walkers receive the same 0.65 speed multiplier. This is not infant motor development.                                                                                          |
| [engine.ts](../../src/simulation/engine.ts), `updateFamilies`, lines 71–86 and 111–135                                                 | Pregnancy stores a due date and partner, without a fetal compartment or separately funded prenatal development. Birth transfers finite home food/water and parental matter. Parental distance from home is not checked. These remain separate access/development limitations. |

## Developmental permission and biosynthetic work are different

Use the existing counted compartments: total body `B`, its reserve subset `R`, separately counted intake `G`, and derived structure `S = B − R`. No new organ, hormonal state, nutrient grant or mandatory caretaker role is needed.

An envelope alone does not fix the demonstrated response if the old oxidation-dependent allowance remains: warm growth may be below the envelope while cold growth reaches it. First cap the old allowance:

```text
processingBudget = min(G_after_oxidation,
    min(foodOxidizedKg, restingKJ / foodKJPerKg) × 0.35 / 0.65)
```

This removes the extra-expenditure multiplier while retaining an uncalibrated processing convention. Restore reserves from that finite budget using the actual structural reserve gap as now, then limit structural deposition by the independent developmental budget. Debit retained mass from `G` and credit `B`; increment `R` only for the reserve portion. No additional oxygen or heat call is made, and no reserve tag is recomputed from body mass.

The provisional reference uses the existing **total-body** endpoints 2/18 kg, an 18-model-year maturation scale and this concave quadratic. Convert those endpoints to structure with the configured reserve fraction `rho`; using 2→18 directly for `S` would silently make the adult total target 20 kg at `rho = 0.1`.

```text
p = clamp(age / 18, 0, 1)
q = 2p − p²
Sref(age) = (1 − rho) × (2 + 16q)       // currently 1.8 → 16.2 kg
tauHours = 90 × 24
a1 − a0 = intervalHours / (24 × DAYS_PER_YEAR)
ordinary = max(0, Sref(a1) − Sref(a0))
deficit = max(0, Sref(a0) − S)
recovery = deficit × (−expm1(−intervalHours / tauHours))
developmentBudget = min(max(0, Sref(a1) − S), ordinary + recovery)
structureAdded = min(G_remaining, processingBudget_remaining, developmentBudget)
```

`prepareCitizenPhysiology` advances age before preparing metabolism. Snapshot the current age as interval-end and derive `a0 = max(0, a1 − intervalHours/(24×DAYS_PER_YEAR))`, or pass both ages explicitly. Do not age again inside retention. Direct kernel diagnostics must honor that contract; the earlier diagnostic already advanced age before each call. The quadratic has a finite initial slope and reaches zero slope continuously at maturity. Its shape, the 18-year scale and 90-day recovery are conventions, not anatomical fits or a puberty model.

Recovery permits mature adults to rebuild structure lost when childbirth exhausts parental reserves. No missed growth creates free future matter. `Sref` limits possible additions; it does not force attainment or shrink inherited bodies above the bound. The reference-gap cap prevents recovery overshoot during long test intervals.

## Explicit synthesis-work alternative

An explicit finite synthesis-work account is more coherent than interpreting `.35/.65` as an energetic efficiency. Let `g` be proposed total retained biomass, `F` the existing food energy density (15,980 kJ/kg), `M` ordinary maintenance/activity energy, `H` signed outward heat, `L` funded melting heat, and `epsilon` incremental synthesis work in kJ/kg. Define ordinary `M` to exclude this incremental work; otherwise it would be charged twice. For adequate cooling, feasible growth satisfies:

```text
Erequired(g) = max(M + epsilon × g, max(0, H) + L)
g + Erequired(g) / F <= currently available G
Erequired(g) <= assigned oxygen capacity and existing maximum oxidation energy
epsilon × g <= max(0, maximum oxidation energy − M)
```

The last bound is independent of heat already released. The nonnegative outward term preserves the current melting-demand controller; actual thermal balance still uses signed `H`. Do not grant synthesis work from `releasedKJ − maintenanceKJ`: that would give cold another growth subsidy. Choose a feasible `g` before the single oxidation call, then debit oxidized and retained mass separately. Synthesis uses part of that oxidation's energy and must not add a second heat credit. Reserve restoration may retain its existing priority within `g`, capped by the actual reserve gap; remaining structural retention cannot exceed `developmentBudget`. A single effective synthesis cost for both compartments would be a coarse material-processing assumption, not a claim that reserves are anatomical fat.

At equal intake, oxygen, developmental permission and adequate cooling, increasing `H` or ordinary work cannot enlarge this feasible set. Actual growth can still respond to genuine resource changes or relief from heat stress. No universal biological assertion about cold is required.

Two integrations are necessary before calling this complete. First, reserve each prepared person's feasible current oxygen demand before allocating residual oxygen to optional synthesis. The current sequential oxidation path would otherwise let an early person's optional growth consume a later person's maintenance oxygen. Second, bound optional synthesis by actual heat-removal capacity, including finite sweating water and paid melting. Unfunded or undissipatable optional synthesis reduces `g`; it must not itself become compulsory-demand injury. Preserve shared current food priority and the existing reserve fallback for ordinary needs. Do not recruit body reserves to pay optional growth when intake cannot fund it.

All living people, including journey carriers, already pass through `updateCitizens` physiology before journey behavior. Future oxygen staging belongs at that shared preparation boundary. The staged correction above leaves biosynthetic work bundled into maintenance; it is not equivalent to this complete work account.

## Bounds and sensitivity, without claiming calibration

The hard bounds are finite nonnegative mass/energy, `0 <= R <= B`, positive recovery time, the existing total power/oxygen limits, and no deposition beyond both retained substrate and developmental permission. These constraints do not identify human growth coefficients.

For inexpensive component tests, use the following declared engineering stress points rather than a claimed physiological confidence interval:

| Quantity                      | Bounded comparisons                                                                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Incremental synthesis cost    | `epsilon/F = 0, 0.1, 0.5, 1, 2`; zero is an accounting control, not evidence of costless synthesis. Protein/fat stored-energy values are not synthesis costs.                                      |
| Structural recovery           | Proposed `tau = 90` simulated days; compare 30 and 180 days, converted to hours. Compare nearly complete and depleted reserves. These are sensitivity points, not measured recovery prescriptions. |
| Developmental scale           | Proposed quadratic and 18-year maturation; compare 16 and 24 years and a linear shape. Preserve 1.8/16.2 kg structural endpoints. These are surrogate scales, not mapped wet-weight percentiles.   |
| Energy and substrate capacity | Zero, partial and adequate current intake, residual oxygen/power and heat-removal capacity; hold the growth envelope constant when testing energetic causality.                                    |

Record provisional coefficients and their sensitivity explicitly. Published claims must remain narrower than their calibration. These component comparisons are not a request for seasonal ensembles.

## Discriminating controls and migration

1. Repeat the recorded equal-intake heat pair with no heat-removal or oxygen shortfall. Extra cold must not expand either processing or developmental permission. With scarce residual intake it may reduce realized deposition. Apply the same control to work and melting; this is not a universal claim that cold always reduces biological growth.
2. At fixed age/body, compare food abundance, zero intake and insufficient oxygen. Check `ΔG`, `ΔB`, `ΔR`, elements and chemical-plus-released energy; retained tissue must come from actual unoxidized food. With two people and scarce oxygen, optional synthesis must not consume the other's reserved current need, in either order. Preserve current-needs priority over optional intake refill and growth.
3. Compare age-reference bodies just after birth and around maturity with sufficient substrate and matching reserve fractions. Ordinary growth should follow the quadratic's declining slope. Separately compare deficits at fixed age: a one-year-old held at newborn mass may recover faster than a newborn because it is further below its reference. That is not evidence of faster ordinary maturation. Verify mature recovery after childbirth and split intervals to expose clock factors, overshoot and discontinuities.
4. Preserve an oversized legacy child exactly; verify no shrinkage, reserve repartition or refund at migration. Separately fund a birth partly from parental structure and confirm later restoration stays finite. Do not retune parameters to the historical first infant.

A registered law transition is required. Coordinate its version/archive boundary with the maintainer before implementation; existing age, body, reserve and intake fields suffice, while a saved synthesis-work diagnostic would need explicit schema handling. Every inherited body, reserve, intake, age and history must remain exact at migration. Slower growth changes later heat area, appetite, handoff targets and exposure; it does not validate the unchanged infant mobility, feeding or gestation abstractions. No historical replay or seasonal rescue trial is warranted before these local causal controls pass.

## Evidence and calibration scope

The already consulted Aristotle, _Parts of Animals_ I.1 (A01), frames inquiry into common processes and differences; its final-cause argument supplies neither a growth coefficient nor guaranteed maturation. Earlier source access is recorded in the [source register](source-register.json).

For this follow-up, [FAO/WHO/UNU chapter 3, section 3.3 and Table 3.1](https://www.fao.org/4/y5686e/y5686e05.htm) were re-read on 2026-10-09. The expert report describes growth energy requirements decreasing from about 35% in the first three months to about 3% at 12 months, below 2% in the second year, and gradually disappearing by about 20 years. That supports age dependence; it does not validate Praxans's constant 35% retained-mass fraction. The same section separates synthesis expenditure from stored tissue energy, assigning stored-energy equivalents of 23.6 kJ/g protein and 38.7 kJ/g fat. Neither is a synthesis-work coefficient. The source concerns healthy reference populations; its underlying Butte studies were not independently read. No equation or table was fitted here.

Before fitting numerical growth rates, define how the model's structural material relates to measured tissue composition. Wet-weight percentiles cannot be copied directly into `S`. Use age-resolved, composition-aware measurements and sensitivity ranges, with poor nutrition allowed to prevent attainment. That is the outstanding calibration work, separate from the source-proven expenditure/development coupling.

Reviewed `physiology.ts` SHA-256: `d75bc40692087c5d0abed968b1fcec4b6d6edd83f643cbe86105692fb438d83c`.
