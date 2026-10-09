# Care work and food acquisition — 9 October 2026

**A reproducible controller defect caused people to undo one another's covering work.** Correcting it reduces funded body-work time by 62.85% and raises harvested food by 29.20% in one matched inhabited-world day. Food consumption still exceeds harvesting, some children still suffer cold deficits, and the lowest recorded child health is slightly lower. This is a current-system follow-up to the [historical collapse study](community-collapse-2026-10-08.md), not an attribution of those historical deaths to a mechanism introduced afterward.

The [quantities and provenance](care-work-budget-2026-10-09.json) retain source fingerprints, signed transfers, allocation stages, routes, work closure, physiological costs and both actor orders of the small causal control. The [release record](../releases/body-care-planning-0.2.md) distinguishes implementation, validation and publication.

## The reproduced feedback

For the existing model's 18 kg dry-equivalent adult at 15°C without shelter, the exact-balance wrap target is 1.728 kg at rest and 0.81675 kg during activity. These are model arithmetic, not measured garment requirements. An adult wearing 1.2 kg can choose to add covering while idle. Once that repair starts, another observer classifies the recipient as active and can choose to remove covering. The fixed targets then disagree because the care itself changed the activity classification.

A finite two-adult fixture runs three actual `updateCitizens` intervals, including food oxidation, fatigue, wear, task choice and paid work. In the willing-helper arm, both actor orders produce a 0.1 kg self-addition and a 0.1 kg helper removal during the same interval. Declining the helper action removes that opposing transfer. The world has no macro-weather step during this short control; local physiological exchanges still run. All element and chemical-energy checks pass.

The correction uses the interval between the existing resting and active wrap targets as a voluntary planning tolerance. A person already inside it need not adjust clothing when a task starts or finishes. Opportunity scores and reinforcement use the corresponding heat-demand interval. Ongoing autonomous tasks reconsider their own goals from current local covering, temperature and shelter; cancellation consumes the already-funded interval and grants no replacement work. Physical transfer functions still permit deliberate opposing actions. Another person's private target is not consulted.

This convention requires no new physical equation, reservoir or saved field. It does not establish a physiological comfort zone: resting can still require extra fuel, work can still require cooling water, and unavailable fuel or water can still cause injury. The unit controls include that adverse case. Under the corrected controller, all four short control arms perform no unnecessary covering transfer; only ordinary wear changes the recipient's covering.

## The matched inhabited day

The input is an independently preserved 1,439-person checkpoint at tick 228436, continued under format 15 / biosphere-1.9 in disposable copies. Each camp has 300 adults, aged approximately 19–43; the remaining 239 people are children under one. Many inherited children are oversized and the migrated intake buffers initially hold zero. Neither arm is a steady-state population or a historical-law replay.

Both arms finish at tick 228532 after 24 hours, with 1,441 people, two ordinary births and no new deaths. Each observational run reproduces its uninstrumented reference's complete world digest exactly. The preceding uninstrumented reference is reused from the earlier development/food study. The source backup is unchanged. Full final digests and every input/source fingerprint remain in the JSON.

| Community | Funded body-work hours, before → after | Food-gathering hours, before → after | Harvested food kg, before → after |
| --- | ---: | ---: | ---: |
| Fernhaven | 2,094.25 → 802.75 | 1,298.75 → 1,877.25 | 237.926 → 267.357 |
| Amber Hollow | 3,175 → 983 | 283 → 711 | 69.523 → 130.442 |
| Stonebrook | 2,214 → 976.75 | 1,002.50 → 1,398.75 | 213.488 → 241.957 |
| Adonis | 2,135.50 → 811.25 | 1,379 → 2,042 | 204.189 → 297.108 |
| Total | 9,618.75 → 3,573.75 | 3,963.25 → 6,029 | 725.126 → 936.865 |

Measured self/helper opposing recipient-intervals fall from 385 to zero. These are counts of intervals with actual signed transfers, not names inferred from a task. Funded hours include inefficient partial transfers and abandoned work; they are distinct from productive transfer volume. Covering mass closes within 9.7×10⁻¹² kg before and 6.9×10⁻¹³ kg after. Gathering-progress accounts close within 6.8×10⁻¹² effective work-hours. Whole-world relative elemental error stays below 1.86×10⁻¹⁰; this is not a closed total-energy ledger.

The before trace contains no failed task routes, taskless activity exits or blocked walking intervals. It does contain many zero-yield completed harvests, limited remembered candidates and discarded partial gathering progress when rest interrupts. Those observations separate search, competition, task scheduling and physiological costs; they do not assign an independent causal share to each. Different subsequent choices and RNG trajectories are part of this whole-day counterfactual.

## Scarce fiber and competing uses

Amber Hollow starts with 323.55 kg loose fiber. Removals from existing adult coverings raise that stock. At tick 228464 it reserves **474.348 kg** for a new, stable material arrangement with **11.824 m² represented work surface**, zero covered area and zero storage volume. The end-of-step stock falls from 481.562 to 9.673 kg, including that interval's other transfers. The same construction and cost occur in both arms.

This is a real competing use of finite material. A work surface is an existing modeled affordance; zero housing capacity alone does not make the arrangement useless. Whether its value justifies committing scarce fiber before child protection requires better planning, information and social allocation. A blanket construction ban or free replacement fiber would not explain that decision.

In the preceding controller, 7,895 Amber Hollow claims are reduced by the shared-stock boundary. Earned transfer capacity is 1,135.472 kg; target/access caps leave 1,050.933 kg of claims, finite-source sharing leaves 426.964 kg, and recipient caps leave 416.484 kg actually moved. Its watched child's tiny transfers occur while far below its target, so they are not evidence of a microscopic completion loop. Body-work source limitations remain in 1,128 claims after the correction.

An unchanged allocator also scales shared stock before aggregate recipient caps. If several people target one recipient, later recipient capping can leave some stock unused without redistributing it to other recipients in that interval. The transfers remain conservative. Its separate practical importance has not been isolated; do not attribute all scarce-fiber work to this ordering.

## Physiological limits and next questions

Total food oxidation falls from 1,145.719 to 1,134.969 kg. Harvesting remains below oxidation in both arms, even before spoilage and retention. Adult metabolic health loss is zero in both. Children's aggregate cold shortfall falls from 19,005.515 to 18,091.156 kJ, with summed metabolic health-point loss falling from 79.190 to 75.380 across all intervals. Recovery and nonmetabolic changes are separate, so those sums are not final health losses.

The lowest observed child health falls from 94.058 to 93.855. Some children receive less covering while Amber Hollow's children receive more. Neither equal individual benefit nor seasonal survival follows from the aggregate improvement. The injury coefficient, development, contact, handling and controller tolerance remain declared approximations.

Next work should separate depleted-patch repetition, memory and perception, finite handling capacity, overcommitted helper effort, material reservations for construction, and ecological replacement across shared catchments. Use real observation and work carriers; preserve room for disagreement and mistakes. Calibration and longer demographic trials remain necessary. Diagnostic elapsed times from runs with differing concurrent host work are not a controlled speed benchmark, and these local runs do not prove inhabited operation within the live 1 GB memory limit.
