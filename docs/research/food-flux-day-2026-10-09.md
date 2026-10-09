# One measured day of food movement

The inhabited copied world consumed its stored food faster than it harvested replacements during this day, while standing edible plant tissue increased in every surveyed catchment. This establishes a **production/access/consumption imbalance in this bounded current-law case**, not a dead biosphere or a quantified cause of every historical death. The [collapse investigation](community-collapse-2026-10-08.md) remains the historical causal record.

The [machine-readable measurement](food-flux-day-2026-10-09.json) covers tick **228436→228532**, 24 simulated hours, under source `f3aea797f57d0c7ba633f6be1d8d96847fe2ae43`, format 14 / `biosphere-1.8`. The input is a separately prepared, current-law copy of the retained inhabited backup. The format-12 migration begins intake empty and preserves existing bodies: initial buffer filling is not steady daily consumption. Both private runs copied the input before loading it, used finite 240-second process deadlines, and left its SHA-256 unchanged. No live clock or population changed.

An uninstrumented baseline and a build with 19 observation boundaries ended with the **same complete world digest**, `ad1badae485d21655f459c5ecb1a93c2154610bad6efe1169d594344c1807b7e`. All phase/holder closure residuals are zero. Simulation time was 24.75 seconds baseline and 27.40 seconds observed; those timings exclude copied-world loading/migration. Peak individual process RSS was 452.1 and 450.6 MB. These local measurements do not establish combined live-host capacity. The initial probe build had an incorrect `FOUNDING` import; it was corrected before either run.

## Food did not simply disappear

All quantities below use the simulation's biomass-equivalent kilograms: 94% carbohydrate-equivalent organic matrix and 6% mineral. They are not anatomical wet weights. Body reserves are included in total body, never added again.

| Measured flow during the day | kg | Meaning |
| --- | ---: | --- |
| Harvested from actual plants | 702.957 | New transfer into people's cargo |
| Delivered from cargo to communal stores | 664.915 | A holder change within that food account, not additional production |
| Ingested | 2,113.552 | Food enters intake; includes filling initially empty buffers |
| Oxidized from intake | 1,149.365 | Actual metabolic fuel; reserve oxidation was zero |
| Retained as body structure | 88.094 | All in people under one year old |
| Retained as body reserves | 9.718 | A subset of body, not extra material |
| Loose food spoiled | 351.072 | 326.148 communal, 24.924 personally carried |
| Food transferred into two newborn bodies | 4.000 | Existing birth mechanism, separate from metabolic retention |
| Other net food use during people's activities | 3.038 | Residual of this phase after measured harvest/ingestion; not attributed to a specific activity by this probe |

Communal food declined **2,002.656 kg**, but carried food increased **233.951 kg** and swallowed intake increased **866.375 kg**. Therefore the communal stock graph alone overstates loss from the complete food account. The outside-body food decline was **1,768.705 kg**; swallowed intake retained a large part of it. No deaths occurred: 1,439 people became 1,441 through two ordinary births.

| Community | Opening people | Harvest kg | Intake oxidized kg | Loose spoilage kg | Communal stock change kg |
| --- | ---: | ---: | ---: | ---: | ---: |
| civ-1 | 355 | 225.454 | 279.844 | 38.251 | −402.508 |
| civ-11 | 362 | 63.634 | 296.615 | 24.373 | −542.873 |
| civ-21 | 354 | 202.233 | 279.829 | 82.898 | −445.427 |
| civ-3118 | 368 | 211.635 | 293.077 | 205.550 | −611.848 |

All adults funded their maintenance and suffered no metabolic injury in this day. Children collectively incurred 18,423.895 kJ of unmet cold demand, equivalent to 76.766 points under the existing uncalibrated injury rule, without a death. That is a measured thermal shortfall, not a diagnosis of every prior infant. Their 88.094 kg structural retention also demonstrates why the independently reproduced heat/growth coupling needs correction; the copied population includes inherited oversized children, which this study does not resize.

## Landscape and access are different accounts

The four 48-cell-radius, connected-land surveys cover **106.10 ha in union**. Three overlap on the previously reported **36.83 ha**; the fourth has **69.27 ha** separately. Summing each community's survey would count shared ground repeatedly. This is currently represented, connected terrain, not owned territory, individually remembered patches or affordable harvest routes.

Standing edible-tissue proxies increased by 366.146, 343.365, 376.403 and 1,271.999 kg in the four respective surveys. Those overlapping changes are not independent yields. Actual gross photosynthesis in the union was **10,680.520 kg organic matrix**, most of which is not automatically edible, harvested or accessible. These observations rule out calling the entire sampled biosphere exhausted, but cannot establish annual replacement or carrying capacity.

The [subsequent development-law comparison](development-food-day-2026-10-09.json) begins from the same physical state with only its version labels changed. It preserves inherited bodies, sharply reduces further structural deposition and leaves harvest below oxidation/spoilage in the measured day. Aggregate child cold shortfall rises slightly despite lower total growth. This is why correcting a rule must be distinguished from making every outcome more favorable. The [release record](../releases/development-0.2.md) identifies the candidate's validation and actual publication status.

## The remaining work and access question

The same observation records **112 completed harvest attempts** for civ-11, compared with **441–583** in the other communities. Its average yield, **0.568 kg per completion**, exceeds their approximately 0.36–0.46 kg. The completion hook includes zero-yield attempts. Its deliveries total 61.185 kg against 63.634 kg harvested; those totals do not suggest a large accumulated cargo backlog, although this probe does not follow individual bundles. Under the development correction it still harvests only **69.523 kg** against **295.837 kg** oxidized. Excess growth therefore does not explain this remaining acquisition gap.

A bounded source review identifies constraints to measure, not their respective causal shares:

- [Work choice](../../src/simulation/citizens.ts) and [subsistence targets](../../src/simulation/subsistence.ts) do not turn a food reserve target directly into gathering hours. Water, care, cargo delivery, sleep and sickness can take priority; existing tasks continue until completion or interruption. Ordinary gathering also has a conditional probability. The current report does not record those branches or their thresholds for each actor.
- Gathering searches recent remembered patches within 900 m, trying ten candidates ordered by distance. It does not rank their remembered yield. Fallback exploration tries six nearby unknown destinations. [Perception and memory](../../src/simulation/cognition.ts) are bounded: hourly local observations, seven-day food memories and 48 retained places. Crossing terrain does not itself reveal every patch. Surveyed edible tissue must not be treated as knowledge available to residents.
- A harvest requires **2.4 effective work-hours**, with finite tissue, mineral and extraction constraints. Any positive bundle triggers a return trip. Starting a new task waits for another tick, arrival consumes its movement tick, and interruptions discard current task progress. Sub-kilogram batches can therefore require substantial overhead; the observation has not yet measured its actual total.
- The 900 m limit uses straight-line distance, while [pathfinding](../../src/simulation/movement.ts) has a 1,100-expansion limit and movement depends on energy and terrain. It is not a checked round-trip time budget.

The next observation should count adult-hours by activity, gathering eligibility and chosen branch, interruptions and lost progress, exploration substitutions, route failures, and remembered versus realized yields. These are diagnostic measurements, not information granted to residents. Two small controls can then compare nearest-known-patch selection against remembered yield per estimated paid travel/work, and identical gathering started early versus just before a sleep interruption. Keep actors, finite stocks and information access fixed. Neither more food nor unconditional night work is a justified correction before measuring those mechanisms. Seasonal replacement and carrying capacity remain separate open questions.
