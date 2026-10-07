# Foundations still to resolve

Design review, 2026-10-07. This is a proposed development order, not a claim that these mechanisms already exist and not a change to the live world's laws. The [model specification](model.md) describes the implementation today.

Praxans has a physical setting, coupled natural processes, autonomous communities, and a continuing history. Its next gains will come from completing causal connections. Adding another animal or another mineral will not compensate for water appearing without a source, information traveling without a carrier, or a forest ceasing to change when nobody observes it.

## The contract of the universe

Keep three things distinct:

- **Invariants:** represented matter is accounted for, transfers have a source and destination, capacities are finite, and simulation time cannot silently rewind.
- **Model choices:** spatial resolution, effective strengths, metabolic rates, chemical approximations, and behavioral assumptions. These need validation and may improve through versioned interventions; they are not newly discovered fundamental laws of nature.
- **Initial conditions:** the old planet's geology, soils, atmospheric composition, populations, inherited variation, and human knowledge. These describe its starting history without pretending that billions of years were simulated.

Every represented process should declare its inputs, outputs, location, duration, limiting conditions, and uncertainty. Every omitted reservoir or external forcing needs an explicit boundary. That makes the promise of emergence testable.

## Missing or incomplete foundations

| Foundation | Why it changes the world | Current gap and proposed next step |
| --- | --- | --- |
| Energy, work, and dissipation | Muscles, tools, moving water, fire, and machinery must obtain usable energy and leave waste heat. Local order can grow while the open planet exports entropy. | Elemental and biochemical ledgers exist, with selected entropy measurements. Add explicit thermal reservoirs and transfers for work, phase changes, and reactions before claiming total-energy closure. Define the system boundary and energy reference states. |
| Transformable matter | Discovery needs materials whose behavior changes through actions: heating, cooling, crushing, mixing, separating, joining, shaping, and applying force. Containers, tools, kilns, and eventually engines should work because of those interactions. | Five bulk construction media and cuboid statics do not yet support general manufacturing. Add a small, validated set of physical operations and reaction families with conditions, rates, products, and energy costs. Stoichiometric reaction rules are laws of the model; a named item-unlock recipe is a different thing. All 118 element identities need not receive equal simulation detail. |
| Chemical form and accessibility | An element locked in rock is not equivalent to a dissolved nutrient. Temperature, pressure, acidity, oxidation state, solubility, and concentration determine what can react, nourish, or poison. | Reference phase properties and bulk nutrient limits exist, but chemical speciation is mostly unresolved. Introduce a few consequential compounds and accessible reservoirs first. Account for their atoms, heat, and toxicity, and distinguish naturally plausible abundance from merely belonging to the periodic table. |
| Continuous planetary circulation | Oceans store heat; rivers connect slopes to coasts; aquifers outlast a rainfall; sediment, dissolved nutrients, salt, and dust travel differently. Upstream actions should matter downstream. | Current runoff, soil water, and shared upper air are reduced models. Introduce connected drainage basins, groundwater storage, coarse ocean/atmospheric transport, sediment deposition, and salinity with conserved exchanges across boundaries. |
| Life's regulators | Microbes, fungi, parasites, infection, immune responses, decomposition, fire, and storms constrain biomass and recycle resources. Ecosystems can overshoot, collapse, and recover. | Decomposition and food webs exist; these regulators are incomplete. Begin with microbial nutrient transformations, detritus/soil feedbacks, resource-limited disease transmission, and physically fueled fire. Disturbances need causes and rates, not scripted punishments or automatic balance restoration. |
| Reproduction and evolutionary continuity | Variation, inheritance, mate availability, development, migration, and selection determine which lineages persist. Domestication should follow repeated selection, with tradeoffs. | Traits vary, but the initial lineage catalog and reduced reproduction model do not establish long-term viability or open-ended speciation. Represent ancestry and viable population structure before expanding evolutionary claims. New variants must be funded by real reproduction, not spontaneous population replenishment. |
| Local information and knowledge | People learn through senses, experiments, records, teaching, and contact. Discoveries can spread, be misinterpreted, or disappear when their holders die. | Shared observations and scoped agent actions are not a complete perception or communication model. Give knowledge provenance, uncertainty, transmission time, and a carrier. A spectator's omniscient interface must not become an accidental source of privileged actions. |
| Human agency and institutions | Families, cooperation, norms, specialization, exchange, conflict, authority, and record keeping affect survival. They need memory, incentives, limited attention, and the ability to disagree. | Current focus choices and relationship rules are useful approximations. Define whether an external agent advises a group, acts as a leader, or controls individuals. Treat instructions as proposals subject to capability, communication, and human decisions. Institutions should be shared practices and remembered agreements, with real enforcement costs. |
| Space, transport, and capacity | Distance, slope, load, storage, spoilage, and travel risk give settlements and trade their geography. Tools matter because they alter real capabilities and costs. | Local work and stocks exist, but transport, inventories, access, and mechanical interactions remain coarse. Give transfers finite capacity and travel time; model storage losses and load-bearing paths before adding abstract production bonuses. |
| A world that evolves without observers | Distant forests, watersheds, and animal populations must have a history before an arriving player sees them. Zooming in must not create resources or improve survival. | Only materialized regions currently run the detailed simulation. Build a conservative hierarchy of planetary cells, regions, and local detail, all driven by the same clock. Refinement must allocate the parent's existing inventory; coarsening must aggregate it without losing history or ownership. |
| Time scales and numerical causality | Combustion, a pregnancy, a drought, and plate motion have very different time scales. A result should not change radically because a server is busy or a numerical step was made smaller. | The current tick represents 900 simulated seconds. Add substeps or event scheduling where the represented process requires them; keep slow systems coarse. Specify action ordering, random streams, catch-up behavior, and numerical error budgets. Reproducibility requires the same seed, law version, initial state, and ordered external inputs. |

## Decisions that are easy to overlook

### An immense frontier is not an isolated breeding experiment

Eight adults is a provisional opening camp, supported only by short survival trials. It is not a credible perpetual isolated human population. Long-lived societies need suitable age structure, reproductive diversity, care for dependents, and some route to later contact or migration. The current three initial groups and remote newcomer placement do not resolve that on their own.

The simulation must decide what a newly arriving group *is*: migration from a represented population, a transfer from an explicitly modeled external population, or a recorded creator intervention. Today founders and newly materialized terrain enter through a declared boundary ledger. A fully represented planet should eventually replace that accounting boundary with actual movement and subdivision of existing state. Remote starts should remain reachable over time if contact is part of demographic viability.

### Starting old requires an ecological inheritance

The opening conditions should include plausible soils, decomposer communities, nutrient reservoirs, seed banks, population ages, hydrological stores, and regional species relationships. Humans need pre-existing survival knowledge appropriate to their history. They should not be adult blank slates that must discover how to eat, nor should they receive a hidden list of guaranteed future technologies.

A warm-up simulation can reject implausible initial conditions before opening a disposable world. It cannot silently rerun or replace the already living world's past. Any correction to this world's starting assumptions must now be a forward intervention with disclosed effects.

### External intelligence has a different clock and prior knowledge

At the current nominal speed, one real second is one simulated hour. A thirty-second agent response spans thirty simulated hours. Communities therefore need competent autonomous survival, durable intentions, and a defined decision horizon while their external agent is thinking or disconnected. A slow or absent provider must never stop everyone else's universe.

Hosted models already know about agriculture, metalworking, and electricity. We cannot truthfully promise that connecting one makes it forget those ideas. We can require that every proposed experiment or construction obey local observations, available materials, work, geometry, and tested physical effects. Whether agents may use outside knowledge is an explicit game rule. API rate limits alone do not equalize intelligence or computing budgets.

Likewise, if all world details are public to spectators, owners can pass them to their agents. Local information limits can define inhabitant behavior, but cannot provide strong secrecy against a participant who can inspect an unrestricted public atlas. Decide how much detail is public before promising competitive fog of war.

### Entropy is not a universal decay timer

Time measures ordering and duration. Entropy measures thermodynamic state and irreversible processes. A colder object does not rot merely because a global entropy counter increases; decay needs mechanisms and conditions. Organisms and societies can become more organized using incoming energy while producing and exporting entropy. Resource depletion, erosion, fatigue, corrosion, and decomposition should each have their own causal processes.

### A persistent world needs persistent evidence

For unexpected outcomes, we should be able to inspect the relevant budgets and causes: what left a reservoir, what arrived, what an inhabitant perceived, and why an action failed. Exact replay needs ordered external decisions as well as randomness and checkpoints; a readable event journal is not automatically a complete replay log.

Hotfix records should distinguish a corrected equation, a change in resolution, new measurable state, and an explicit addition or removal of matter. Never fabricate historical measurements for a quantity introduced today. Keep recoverable identities, backups, and operating capacity alongside the scientific model: otherwise the world can survive a simulation tick but fail its inhabitants when a browser cookie or host volume is lost.

## Proposed order of work

1. **Make the existing foundation measurable.** Publish conserved quantities, process boundaries, numerical tolerances, external-agent authority, and the newcomer origin rule. Extend validation across full seasons and generations. Preserve the live world's current assumptions until a specific replacement is ready.
2. **Make time and geography continuous across scales.** Establish coarse planetary inventories and transport, age unobserved ecosystems, and prove conservation through refinement and coarsening. Add communication and transport costs so physical and informational distance agree.
3. **Open up material interactions.** Extend the energy model and introduce heat, combustion, containers, processing, and mechanically useful tools through composable operations. This is the largest expansion of what an agent can actually discover.
4. **Deepen ecological and demographic feedbacks.** Add soil biology, disease, ancestry, care, and migration, then evaluate population viability, disturbances, recovery, and selection over generations.
5. **Expand cultural evolution.** Build on local memory and communication to support teaching, records, institutions, specialization, trade networks, and disagreement. Avoid granting outcomes just because a society has acquired a technology label.

These tracks overlap, but their contracts should precede more content. Nothing requires simulating every atom; each approximation must preserve the causal relationships relevant to the next scale.

## Evidence required before each intervention

- **Budget tests:** every transfer has an accounted source and destination; no negative inventories, unbounded work, or impossible heat flow.
- **Counterfactual tests:** removing the water, nutrients, fuel, route, mate, or information needed for an outcome prevents that outcome for the expected reason.
- **Resolution tests:** observation, camera position, region loading, and smaller numerical steps do not create systematic survival or resource advantages; approximation errors remain bounded and reported.
- **Long-run ensembles:** several climates and seeds over seasons and generations, including scarce-resource and disturbance scenarios. Measure distributions and extinctions; do not require every group to survive.
- **Continuity tests:** an old save resumes with its identities, clock, history, and budgets preserved, with any intentional changes explicitly recorded.

This is a proposal for the next core-system work, not an assertion that the live foundation already satisfies all of these tests.
