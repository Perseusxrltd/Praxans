# The living model

The design commitment is fixed, inspectable natural rules with outcomes produced by their interactions. The implementation is a coarse simulation foundation. Its numerical units, boundary inventories, approximations, and missing mechanisms are part of the specification.

## Physical setting

Praxans is a fictional Earth analogue with an initial geological age of 4.54 billion years. Aurea is a Sun analogue; Iona is a Moon analogue. Their masses, orbital distances, eccentricities, inclinations, rotation, and axial tilt are constants in `planet.ts`. The star/planet and planet/moon use Keplerian motion. Planetary tilt and actual solar position drive local illumination and seasons.

The observer calendar follows the approximately 365.25-day orbital year using whole-day year boundaries. Universal time and local solar time are distinct. Fine elapsed time is stored separately from the enormous initial age, so adding a tick does not lose precision. The calendar is an observer convention; communities are not required to invent it.

## Coupled mechanisms and limits

| Domain | Implemented mechanisms | Important limits |
| --- | --- | --- |
| Elements | All 118 reference identities and properties; per-element reservoir accounting; H/C/O/N cycles and individual nutrient constraints; mineral trace inventories | No general chemical reaction solver, isotope dynamics, radioactivity, stellar nucleosynthesis, or atomic simulation |
| Organic matter | A carbohydrate-equivalent `C6H10O5` dry matrix; stoichiometric photosynthesis and oxygen-limited respiration; mineral tissue, hydration, decomposition, biochemical energy accounting | Bulk tissues and substrates; no molecular cell metabolism or complete chemical thermodynamics |
| Water and weather | Surface/soil water, vapor, clouds, rain, snow, latent heat, runoff, reduced radiation balance, pressure and wind; forest transpiration; dust entrainment, transport, and rain deposition | Local eddy exchange and a shared well-mixed upper atmosphere, not full planetary fluid dynamics or an ocean circulation model |
| Ground | Seeded plate-related initial fields; slow displacement, strain, uplift, heat flux, stress release, weathering, and conserved exposed/buried elements | Coarse microplates and rates; the geological past is encoded in initial conditions rather than replayed |
| Flora | 18 initial functional lineages, canopy and ground layers, aquatic producers, inherited trait variation, seeds, nutrient/water/light/temperature limits, pollination | An initial biological catalog with functional traits, not abiogenesis, full phylogeny, fungal chemistry, or open-ended speciation |
| Fauna | 20 initial functional lineages: grazers, pollinators, predators, omnivores, fish, and litter recyclers; habitat, feeding, allometric metabolism, oxygen, hydration, mortality, and resource-funded offspring | Cohorts rather than individual insect simulation; reduced behavior, physiology, disease, and reproductive ecology |
| Humans | Eight founders per new community, needs, age, traits, work, learning, shared experience, partnerships, 270-day gestation, births/deaths, contact, exchange, and relationships | Reduced social/physiological models, no demonstrated long-term genetic viability or unconstrained autonomous invention |
| Construction | Material density, compression/tension limits, contact support, coarse beam bending, tipping, costs, work, covered free space, and deterioration | Cuboids and static approximations; no general rigid-body, elastic, fire, manufacturing, or electrical solver |
| Space | Star and satellite motion, day/night, seasonal illumination, lunar phase, approximate eclipse coverage, equilibrium tides | No full n-body integration, ocean tidal flow, or resolved atmosphere seen from orbit |

Lineages present in a particular region depend on its habitat and survival. The catalog size is not a guarantee that every lineage exists in every world window.

## Time and entropy

Time orders the changes. Entropy describes thermodynamic state and irreversible processes; elapsed time is not itself a quantity of entropy. Local biological complexity can increase because this is an open system receiving stellar energy and radiating heat.

The current ledger measures a **selected subset**, in kJ/K:

- Entropy produced by passive heat exchange between neighboring finite heat reservoirs, using their logarithmic temperature changes. Heat transfer cannot overshoot thermal equilibrium.
- An estimate of entropy delivered to surroundings by dissipated respiratory heat, `Q/T`.
- Absorbed stellar radiation, emitted surface thermal radiation, and atmospheric return radiation using the blackbody approximation `4E/(3T)`.

These counters are not total planetary or universal entropy. Full chemical reaction entropy, material mixing entropy, and many unresolved thermal reservoirs are absent. Radiation exchange is recorded as directional flows, separately from heat-mixing production. A migration begins a new measurement epoch at its actual tick; it does not invent measurements for the past.

The biochemical energy ledger is closed over the represented chemical pools and declared inputs/outputs. Temperature uses a reduced thermal balance; there is no claim of a closed total-energy ledger for the entire planet.

## Initial conditions and fairness

The world starts old, vegetated, and inhabited by three small human groups. It does not replay billions of years. New players begin remotely in unoccupied habitable terrain. Each new group receives eight adults, four complementary pairs, unrelated initial parents, the same age distribution, comparable trait means, and equal supplies per person. Site selection requires tolerable temperature, water, local food, timber, and usable land.

Those guarantees equalize initial terms; they do not guarantee identical weather, surroundings, survival, or agent decisions. The [founding trials](validation/founding-trials.json) compare groups of four, eight, and twelve across three seeded initial climates for fourteen days. Eight is a provisional compromise between redundancy, work capacity, and resource pressure, not a biologically established minimum population.

Conservation includes newly materialized terrain and founders as explicit boundary arrivals. Nothing in an agent's action can directly mint elemental mass or give a community an invented building bonus.

## Subsequent interventions

Further development should extend mechanisms while preserving the already living world. Priorities are:

1. Validate seasonal and multi-generation ecosystem/demographic behavior, including extinction, migration, reproduction, and carrying capacity.
2. Introduce a conservative hierarchy of planetary and regional transport so distant active ecosystems can scale without simulating every cell at the same detail.
3. Replace bulk approximations with useful reaction, material-processing, hydrology, disease, and inheritance mechanisms where they materially expand emergence.
4. Expand agent observations, local institutions, memory, and collaborative behavior without privileged recipe unlocks.
5. Add recoverable player accounts and operational monitoring before broad public growth.

These are engineering changes to the simulation, not a technology progression imposed on its inhabitants. Every change to a live law or saved representation needs a migration/continuity argument, validation, and a recorded intervention.

The [fundamentals review](fundamentals.md) expands the unresolved foundations, including continuous distant ecosystems, open-ended material interactions, local information, demographic viability, and external-agent decision time.

## References and provenance

- Physical orbital and planetary values use approximate Earth/Sun/Moon reference values; compare [NASA's planetary fact sheets](https://nssdc.gsfc.nasa.gov/planetary/factsheet/).
- Element data is adapted from [Bowserinator / Periodic-Table-JSON](https://github.com/Bowserinator/Periodic-Table-JSON), retaining CC BY-SA 3.0. See [the source record](periodic-table-source.md).
- Biological lineages, effective material strengths, behavioral weights, and ecological rate constants are model assumptions, not an empirically calibrated reproduction of an Earth ecosystem.
