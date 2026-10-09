# Work, harvest timing and local scarcity — 9 October 2026

**Historical design record.** This was written against the completion-batched implementation before format 16. The subsequent [performed-harvesting study](performed-harvesting-2026-10-09.md) records the implemented kernel, the rejected source-first approximation and validation. Its [release record](../releases/performed-harvesting-0.2.md) owns publication status. The original questions below remain as design provenance; they are not a claim that the new boundary is still unimplemented or that the communities have sustainable food production.

The [care/work study](care-work-budget-2026-10-09.md) records 307.297 effective gathering-hours discarded by interruptions in one current-law day. Some progress predates its opening checkpoint. This is lost represented effort; no material has yet been produced by that unfinished work. Most zero-yield completions also lack a fresh memory saying that their destination is empty. Search, local observation, simultaneous competition and batch production must therefore be measured separately.

The previously consulted Xenophon passages on provision and learning a place, A04 in the [source register](source-register.json), motivate asking what people observe, remember and accomplish. They do not supply harvesting rates or prescribe an institution. No new historical reading or empirical calibration is claimed here.

## Existing causal boundaries

In [citizens.ts](../../src/simulation/citizens.ts), actual metabolism funds active time before attention, diligence and effort determine effective work. Food gathering completes after 2.4 effective hours; other extraction after three. Completion can produce up to 6 kg of food, 12 kg of wood/fiber, 8 kg of stone or 5 kg of clay, scaled by skill and limited by actual resources. These are inherited model conventions. Plant collection also applies a per-completion cutting fraction and actual organic/mineral requirements.

Workers finish sequentially. When several reach their completion thresholds against the same small resource, earlier transfers can leave later workers with nothing despite their prior labor. That source order alone does not quantify avoidable hunger: finite material, different arrival times, depleted habitat and costs can still make work unsuccessful. A paired scarce-source test must separate the timing convention from the allocation convention.

The adaptive network records reward for gathering, but the present gathering branches do not consult its `gather` activation. Place ranking uses distance and observed quantities, without a learned record of that particular site's returns. Changing general reward weights alone would not repair this disconnect. Suppressing all food seeking after failures would also be a poor substitute for learning about particular attempts and places.

## Proposed performed-work boundary

Build each claim from **only newly funded effective work** at an actual reachable source. Accumulated or inherited `task.progress` remains spent effort and earns no retroactive products. Remove the existing terminal extraction when incremental transfers are introduced; completion must not pay twice.

Claims on main-layer and understory plants share the actor's handling budget. Food, wood and fiber claims on one plant share its organic and mineral compartments. Derived edible, woody and fibrous fractions overlap in this model; they are not separate reservoirs. Jointly constrain all products by both compartments, with no negative stock or repeated use of an actor's time. Stone and clay must continue to debit their existing physical sources.

The cutting fraction is currently applied once per completed attempt. Applying that same fraction every quarter-hour would silently multiply extraction pressure. Define an effort-dependent rate or bounded cumulative removal, then test equal funded effort under subdivision. Keep any numerical approximation and uncalibrated handling references explicit.

Capture source identities after ecology, fauna and decay, where people currently act in the tick. Revalidate the same plant objects and their remaining compartments before committing: tending during the people phase can remove material from a donor, and a replacement plant is a different source. Later additions must not retroactively fund an earlier claim. Require a living actor, actual contact, the matching continuing task and unchanged journey status; deduplicate claims and commit once.

A shared allocation of competing paid attempts would represent unresolved collision within the coarse cell. Its assumptions need to be stated independently of ownership or social cooperation. Credit products to the actual worker's private cargo. Append compatible cargo, reject incompatible cargo and preserve it through interruption. Current cargo cannot serve as a lifetime harvest counter, because the next interval can ingest some of it. Credit harvested production once on extraction, and let later delivery move the existing material.

Only later physiology or performed handoff may use newly obtained food. The work interval must not produce, forward and consume the same newly credited matter several times. Keep a gathering task active while a partial bundle accumulates; neither partial cargo nor a completed display label should grant additional labor. Local observed outcomes can inform learning without disclosing other people's intentions or awarding completion experience every tick.

## Discriminating controls

1. **Competition:** identical funded attempts against abundant, scarce and empty sources, reversing actor order. Compare batch versus progressive work and sequential versus joint allocation separately. Verify each cargo award, source debit and paid hour.
2. **Mixed material and layers:** simultaneous food, wood and fiber claims, first with organic limitation and then mineral limitation. Include duplicate requests and both vegetation layers. Verify each elemental reservoir and the shared handling budget.
3. **Interruption and custody:** interrupt halfway, consume part of the collected cargo, then resume or change location. Earlier products remain accounted for; earlier unsuccessful effort cannot be redeemed at another source. Repeat after save/load and with a legacy partial task whose cargo is empty.
4. **Time subdivision:** apply equal new effort using different interval sizes while ecology is fixed. Detect accidental repeated cutting fractions; separate numerical rate error from failed conservation.
5. **Information and physiology:** keep a hidden distant change invisible until an actual observation or performed attempt. Measure delivered food, ingestion, oxidation, travel and cold injury in a coupled inhabited continuation; increased extraction alone does not establish better survival or renewable yield.

Changing the physical timing of extraction requires an explicit versioned transition and continuity tests through the existing migration chain. New saved fields additionally require a format migration. Preserve stocks, plants, cargo, old effort, clock and history without compensatory products. Seasonal carrying capacity, resource-location teaching, developmental handling ability, fine contact geometry and independent political allocation remain open requirements.
