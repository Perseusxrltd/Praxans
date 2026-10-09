# Performed harvesting and finite local competition — 9 October 2026

Implementation: world format **16**, laws **biosphere-1.10**, storage **2**. [Publication and validation](../releases/performed-harvesting-0.2.md) are recorded separately. This study addresses a reproduced work model defect; it does not assign a new fraction of the historical deaths to harvesting or establish seasonal survival.

## What changed

The prior model debited source material only when an attempt completed. An interruption left no product, and completion order let early workers empty a patch before others received anything for their funded work. The [historical design record](harvesting-work-design-2026-10-09.md) separates these questions from [observed depletion](observed-foraging-2026-10-09.md) and site-specific learning. The previously consulted Xenophon source A04 motivates questions about provision, practice and knowing a place; it supplies no harvesting coefficients or compulsory institution. No new historical reading or empirical calibration is claimed here.

[harvesting.ts](../../src/simulation/harvesting.ts) now credits finite private cargo from newly funded effective hours, capped by the remaining attempt duration. Attention, diligence, policy and applicable workspace determine productivity within the already paid active interval; harvesting does not oxidize food again or award another heat credit. Old progress supplies no retrospective products. `task.harvestedKg` records actual product credits, survives partial work and remains distinct from cargo that can be ingested later. Completion gives ordinary episodic feedback and performs no additional extraction. Interruption preserves matter; its generic negative reward remains a learning limitation.

The shared contact index verifies the same living actor, occupied source cell, task identity and unchanged material/kind. Claims are deduplicated; incompatible cargo is preserved and prevents harvesting. A replaced plant is not the captured source. Ordinary tending/experiment completions follow harvesting, so later material returns cannot fund earlier work. This is a boundary for physical collision among paid attempts, not a sharing institution or an entirely simultaneous economy.

## Quantities and local kernel

The inherited full-attempt handling references are 6 kg food, 12 kg wood/fiber, 8 kg rock or 5 kg clay, with skill multiplier `1 + 0.06 × skill`. Food attempts last 2.4 effective hours; ordinary extraction lasts 3. These are uncalibrated conventions. The effective-hour unit expresses productivity, not additional elapsed time.

For worker `i`, let `h_i` be new effective work, `T_i` the attempt duration, and `Q_i = h_i × skill_multiplier × reference_kg / T_i`. Main vegetation and understory share this single handling allowance. For plant `p`, tissue accessibility `t_ip` is woodiness for wood, `(1 − woodiness)/2` for fiber, or `(1 − woodiness)(1 − defense)` for food. The inherited cutting fraction is 0.22 under preservation focus, otherwise `0.25 + 0.6 × extraction_policy`.

Set `z_ip = −log(1 − cut_i × t_ip) × h_i / T_i` and `Z_p = sum(z_ip)`. For a common remaining-work fraction `f`, the uncapped organic-matrix removal is `C_p × (1 − exp(−Z_p × f))`; each worker receives its `z_ip/Z_p` share divided by its product's organic fraction. Here the code's `plant.carbon` is aggregate organic-matrix mass, not a pure elemental-carbon or separately conserved anatomical-tissue compartment. Product organic and mineral fractions remain those of the five existing bulk materials.

Apply the worker's handling cap across both layers. If resulting joint mineral demand exceeds a plant's actual remaining mineral, locate the first exhaustion fraction with at most 48 bisection evaluations. The predicate is monotone within a fixed-source phase: raw products are increasing concave zero-origin functions, and the handling multiplier is nondecreasing. Use the upper crossing bracket, cap actual debit by both compartments, and retain floating-point residue. The exhausted source then stops participating in later handling; only remaining effort can use surviving layers. At most two sources can exhaust in a cell, bounding the calculation to at most 101 previews, linear in local claims. Other cells and the global simulation clock need no smaller timestep.

Stone claims share actual captured rock. Clay shares the actual limiting element mixture and debits those elements; abundant unrelated mineral does not create clay. Changed tiles refresh once. Stable actor sorting fixes arithmetic inside this allocation; other world decisions retain their existing order.

## Rejected approximation and numerical controls

The first draft jointly capped each plant before applying cross-layer handling. That avoided a zero-mineral layer consuming capacity, but created a large interval-dependent mixed-material allocation. It was rejected before publication. With 1,000 kg organic matrix, 0.08 kg plant mineral and one worker each gathering food, wood and fiber for 2.4 effective hours, it produced 2.378540 kg at quarter-hour subdivisions and 3.098791 kg at 1/256-hour subdivisions. The latter was still biased.

There is an analytic oracle: all three workers stay handling-limited, with rates `(2.5, 4, 4)` kg/hour. Their combined mineral demand is `0.06×2.5 + 0.01×4 + 0.02×4 = 0.27` kg/hour. Exhaustion occurs at `0.08/0.27 = 0.2962962963` hours, giving `(0.7407407407, 1.1851851852, 1.1851851852)` kg, total **3.1111111111 kg**. The final source-event calculation matches this across the tested subdivisions to floating-point precision.

Uncapped cumulative exposure also matches the inherited single-attempt organic cut across subdivisions. Handling-to-source transitions remain approximate: in the recorded single-worker case, quarter-hour effective subdivisions differ from the 1/256-hour reference by 0.0004132 kg (about 0.007%); this is a measured case, not a universal error bound. Actual effective work per world interval varies with productivity. Large mineral-empty and progressively tiny-mineral layers, two differently accessible layers, scarce clay elements, reversed actor order, incomplete work, ingestion, delivery, save/load, rejected contact/retargeting and legacy migration have separate causal controls in [harvesting.test.ts](../../tests/web/harvesting.test.ts).

Reproduce the controlled kernel study from the repository root with `node --import tsx docs/research/harvest-kernel-probe.mjs <new-output-json-path>`. It constructs disposable worlds and touches no saved or live world.

## Coupled inhabited day

The paired trial starts from the same independently hashed format-13 checkpoint at tick 228436: 1,439 people, including 239 children under one and 1,200 renewed adults. The current laws are applied on disposable copies. Inherited oversized children and initially empty migrated intake make this a transition-state counterfactual, not equilibrium or an exact replay of historical laws. Read-only whole-tick observation is compared with an unobserved run by complete final-world digest.

The previous and candidate arms both end at tick 228532 with 1,441 people: two ordinary births and no new deaths. Actual food harvest increases from **953.034253** to **1,203.319270 kg**. Net loose food still falls; opening intake filling, ingestion and spoilage must be separated before interpreting that balance. Both observed arms reproduce their unobserved final-world hashes exactly: before `268b51ed6c2819fd09d75a7399344a503731a4ac05c66a9d6968aa1e6515c1cb`, after `8b607a90a09ff56eea6fc96e361778cff01ca4cfa26e077e72fc2285eabd1dde`. The [machine record](performed-harvesting-2026-10-09.json) contains source/checkpoint provenance, measured balances and the rejected approximation.

| Measured quantity over 24 hours | Previous rules | Performed harvest |
|---|---:|---:|
| Actual food harvest, kg | 953.034253 | 1,203.319270 |
| Food oxidized, kg | 1,133.666938 | 1,141.524764 |
| Food ingested, kg | 2,008.426559 | 2,004.924981 |
| Net loose food change, kg | −1,413.409698 | −1,159.938322 |
| Effective gathering/extraction work, hours | 5,913.672044 | 4,333.774874 |
| Aggregate child cold deficit, kJ | 19,870.180249 | 17,918.511598 |
| Sum of measured child injury doses, health points | 82.792418 | 74.660465 |
| Lowest final child health | 94.076182 | 93.853667 |

All four communities harvest more in this arm: civ-1 285.746→387.033 kg; civ-11 117.716→160.487; civ-21 253.200→278.189; civ-3118 296.373→377.610. The new task observation records 231 interrupted productive attempts with 164.061741 kg previously credited across all gathered/extracted materials. This is cumulative product observed at interruption, not necessarily cargo still carried at that instant, and is not an additional food-production total.

Aggregate food harvest rises 26.26% and aggregate child injury falls 9.82%, but the lowest child's health is slightly worse. Ingestion is not oxidation, delivery is not production, and initial intake filling makes the loose-food balance a poor steady-state carrying-capacity estimate. This 24-hour comparison validates neither uniform welfare nor generational survival.

## Remaining work

Site-specific return learning, observation during travel, recipient food acceptance/feeding, developmental handling and mobility, physical containers, seasonal ecological replacement, political allocation and carrying capacity remain open. More food produced does not prove equal benefit to all children or communities. This hotfix changes future work while preserving the four extinct communities, their history and the continuing planet.
