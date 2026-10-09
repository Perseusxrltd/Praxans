# Scale audit — 8 October 2026

**Praxans currently represents a planetary surface, selected 10 m surface cells, and smaller construction geometry. It does not represent a continuous volume from the surface to the core.** This audit makes those boundaries explicit and connects the next work to canonical requirements **P13–P16** in the [roadmap](../roadmap.md). The [machine-readable audit](scale-audit.json) records constants, derived quantities, source fingerprints, and requirements; the [candidate queue](mechanism-candidates.json) supplies falsifiable next steps.

These are code observations and checked arithmetic from the working tree on 2026-10-08. Numerical choices are model assumptions unless separately identified as evidence. This research changes no simulation rules or live stock. New depth reservoirs and metric changes require explicit later migrations and law review; they must not silently multiply existing resources.

## Start with observation, then distinguish the scales

Aristotle connects a curved lunar-eclipse shadow and the changing visible stars at different latitudes with a spherical Earth (_On the Heavens_ II.14, [A10](https://classics.mit.edu/Aristotle/heavens.2.ii.html)). These observations suggest a useful question: do local movements, horizons, and planetary coordinates agree? His geocentric explanation, natural-place arguments, and quoted circumference of 400,000 stades are separate historical claims, not model constants.

Vitruvius distinguishes loads, foundations, firm ground, and loose or marshy ground (_Architecture_ III.4.1–2, [A11](https://www.gutenberg.org/cache/epub/20239/pg20239.txt)). Agricola extends the inquiry to shafts, uncertain ore indications, haulage, drainage, ventilation, and supports that depend on the surrounding rock (_De Re Metallica_ V, [A12](https://www.gutenberg.org/cache/epub/38015/pg38015.txt)). The actionable relationship is between geometry, material, work, and access. Their dimensions, prescriptions, explanations of vapours, and claims of safety do not establish calibrated engineering laws.

NASA's [Earth](https://science.nasa.gov/earth/facts/) and [Sun](https://science.nasa.gov/sun/facts/) summaries (`M08`, `M10`) check orders of magnitude for celestial size and distance. The USGS [interior summary](https://pubs.usgs.gov/gip/dynamic/inside.html) (`M09`) distinguishes crust, mantle, liquid outer core, and solid inner core. These are modern expert summaries, not newly measured Praxans geology. Sources, passages read, translations, and limits are recorded in the [register](source-register.json).

## What is represented at each level

| Level                    | Current representation and units                                                                                                                                  | Physical scope and missing connection                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Star and orbit           | Aurea: mass 1.98847 × 10³⁰ kg, radius 695,700 km, luminosity 3.828 × 10²⁶ W, photospheric temperature 5,772 K. Praxans semimajor axis 149,597,870,700 m.          | Celestial motion and radiative boundary conditions; no evolving stellar interior or stellar material ledger.                                                              |
| Planet and moon          | Praxans: radius 6,371 km, mass 5.9722 × 10²⁴ kg, tilt 23.43928°, eccentricity 0.0167. Iona: radius 1,737.4 km, orbit semimajor axis 384,400 km.                   | Earth-like assumptions. The planet's gravitational mass is not the sum of generated surface inventories. The inherited age of 4.54 billion years is not replayed history. |
| Planetary climate        | 36 equal-area latitude bands, about 14,168,458 km² each; heat capacity 80,000 kJ/m²/K; finite heat exchanges.                                                     | Diffusive energy-balance model. No resolved planetary air circulation, complete ocean, or coarse biological/material inventory.                                           |
| Continents and biomes    | Coordinate-seeded spherical fields, local terrain and climate priors; biome classification attached to surface cells.                                             | Geography can be addressed before a chunk exists. An unmaterialized continent is not already a fully evolved ecosystem or an inventoried mineral body.                    |
| Geological regions       | Seeded microplate spacing 4,096 cells, nominally 40.96 km; velocity components within approximately ±6 cm/year. Region-level buried/exposed trace-element stocks. | Effective tectonic and weathering processes; no three-dimensional plate geometry, depth, host-rock volume, pore pressure, mantle convection, or core state.               |
| Materialized region      | 32 × 32 cells; 320 × 320 projected metres; 102,400 m² = 10.24 ha.                                                                                                 | A storage/computation chunk, not necessarily an ecological boundary. Its sides do not both measure 320 ground metres at every latitude.                                   |
| Habitat and surface cell | Declared cell area 100 m²; a nominal 120 m home catchment contains 441 cell centres on a complete integer-centred disk, or 4.41 ha of cell footprints.            | Surface water, ice, organic cohorts, minerals, rock, weather, and organisms. The catchment is a present decision restriction, not a biological limit.                     |
| Construction             | Floating-point component positions and dimensions in metres; dimensions 0.025–6 m; assemblies up to 32 components, top at most 8 m.                               | Smaller geometric detail within surface locations. This is not a 25 mm voxel world, nor a resolved microscopic material model.                                            |
| Underground to core      | A regional field named `buried`, effective uplift/geothermal flux, and a scalar surface elevation.                                                                | No soil horizons, bedrock column, excavated cavity, underground travel, aquifer volume, mantle or core material reservoir. These are explicit P14/P15 requirements.       |

Code anchors: [planet](../../src/simulation/planet.ts), [climate](../../src/simulation/climate.ts), [surface](../../src/simulation/surface.ts), [geology](../../src/simulation/geology.ts), [terrain](../../src/simulation/terrain.ts), [types](../../src/simulation/types.ts), and [assembly evaluation](../../src/simulation/laws.ts).

The default new-world window is 96 × 96 cells, **0.9216 km²**. A reported 38 materialized regions imply **38,912 cells and 3.8912 km²**, even though their coordinates belong to a planetary surface. The 38-region number is an implementation collaborator's runtime report; no live database was inspected for this audit.

## Area is not distance

The projection has standard parallel 45°, with `k = √(1/2)`, planet radius `R`, and tile side `d = 10 m`. Its mapping is:

```text
longitude = 2π × wrapX(x) / LONGITUDE_TILES
sin(latitude) = k − y × d × k / R
LONGITUDE_TILES = round(2πRk / d / 32) × 32 = 2,830,560
NORTH_TILE = −263,872
SOUTH_TILE = 1,538,079
```

There are **1,801,952 addressable latitude rows**, hence **5,100,533,253,120 addressable surface cells**. Multiplying by the declared 100 m² gives 510,053,325.312 km². The sphere of radius 6,371 km has 510,064,471.910 km²: the difference is approximately **0.00219%**, principally the chunk-aligned polar cutoff, with a smaller longitude-rounding effect. The address space is not an allocated array of trillions of tiles.

For small steps, east–west distance is approximately `d cos(latitude)/k`, and north–south distance `d k/cos(latitude)`. Direct spherical calculation gives:

| Starting latitude | One cell east, metres | One cell south, metres |
| ----------------- | --------------------: | ---------------------: |
| 0°                |              14.14214 |                7.07107 |
| 30°               |              12.24745 |                8.16496 |
| 45°               |              10.00000 |                9.99999 |
| 60°               |               7.07107 |               14.14211 |
| 80°               |               2.45576 |               40.71992 |

The current shared `distance` helper is planar Euclidean distance in cells; it also does not itself take the shorter wrapped longitude difference. Walking and search limits consequently need a common geographic metric before distant latitudes and seam crossings are treated as physical metres. A projected disk preserves area approximately but changes shape on the ground. The original camps are near 45° N, so this is chiefly a global extension issue, not an explanation for their different winter outcomes.

**Bounded test:** coordinate round trips and east/south steps at the five latitudes above, plus a longitude-seam pair; compare distance, path cost, and catchment area under one declared convention. Preserve tile IDs and stored positions. A metric correction can change movement costs and observations, so it must be versioned even if no resource mass changes. Candidate `R13`, requirement P13.

## Quantities need an area, volume, form, and owner

### Surface minerals are not an underground column

Generation initializes ordinary cells with **20–100 kg rock**, hill cells with **200–600 kg rock**, and another **27–68 kg** in nutrient/rock/clay mineral mixtures. The mineral scalar summarizes its elemental mixture; it must not be added a second time to the elemental account.

At the model's stone density of 2,400 kg/m³, a 1 mm solid layer across a 100 m² cell would weigh **240 kg**, and a 1 m layer **240,000 kg**. Thus the ordinary loose-rock stock corresponds to only **0.083–0.417 mm** spread across the cell; a hill's stock corresponds to **0.833–2.5 mm**. The mixed mineral stock would correspond to 0.113–0.283 mm _if_ assigned that same density; this comparison is illustrative, not a soil bulk-density estimate. These are usable surface pools, not a complete regolith or bedrock volume.

Regional geological traces are generated as kilograms per region, not ore grades: base abundance 12 kg for F/Cl/Ba/Sr, 0.0002 kg for Au/Pt/Ir/Os/Rh/Re, and 0.15 kg for other included traces, multiplied by a seeded factor from 0.2 to 2.7. Initially 1.5% is exposed. Without host volume, depth, chemical form, and concentration, these totals cannot be interpreted as a mineable ore body or converted to ppm. The existing exclusions for major rock constituents and synthetic/unstable elements remain part of that abstraction.

`finishTask` removes up to `8 × skill` kg from local loose rock or `5 × skill` kg of an available clay mixture. It does not create a cavity or call surface displacement. This is surface extraction, despite the task's name. Erosion separately converts displaced material to height using `mass/(2400 × 100)` metres and then to elevation units by dividing by 600.

### Water and heat have different effective depths

| Pool or equation                        | Current quantity                                                                          | Interpretation                                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Land water capacity                     | 16,000 kg per cell                                                                        | 160 mm water equivalent over 100 m²; no soil porosity or depth profile is supplied.                                                       |
| Initial water-terrain stock             | 200,000 kg per cell                                                                       | 2 m water equivalent. It is not a bathymetric ocean column.                                                                               |
| Vapour saturation calculation           | 500 m × 100 m² = 50,000 m³                                                                | An effective local lower-atmosphere column.                                                                                               |
| Shared generated atmosphere             | N₂ 780,840 kg, O₂ 239,130 kg, Ar 12,800 kg per cell, plus water and CO₂-equivalent carbon | Roughly full-column atmospheric mass scale, not the same 500 m volume. Carbon uses the chemistry conversion, not direct CO₂ kilograms.    |
| Local heat capacity                     | `105000 + water × 4.186 + (ice + snow) × 2.1` kJ/K                                        | A base effective reservoir plus explicit water/ice contributions. The base is not derived from the counted loose-rock and mineral masses. |
| Height used by pressure and water heads | `max(0, elevation − 0.19) × 600` m, with water depth added for flow                       | A scalar surface height. Below-sea-level geometry and underground hydraulic heads are not resolved.                                       |

The distinct air and thermal reservoirs are not by themselves evidence of a conservation bug. Their area, depth, ownership, overlap, and exchange contracts need to be explicit before adding another layer. NASA/USGS describe ocean depths and interior layers in kilometres; those compilations do not license replacing current stocks with planetary masses. A mantle is also not an ordinary shallow liquid-rock resource waiting to be gathered.

### Standing vegetation is not edible production

`plant.carbon` means **carbohydrate-equivalent organic tissue**, with the explicit formula C₆H₁₀O₅ in [chemistry](../../src/simulation/chemistry.ts); it is not elemental carbon. Plant mineral tissue is separate. Material definitions similarly distinguish organic and mineral fractions.

The main-layer capacity is `160/(1 + woodiness)` kg of organic tissue per cell; groundcover uses 24 in the numerator. At woodiness 0.8–0.96 the main capacity is only **8.89–8.16 tonnes organic equivalent per hectare**. A restoration of 48 kg main tissue per cell adds 4.8 t/ha before its mineral fraction. Increasing this common pool simultaneously changes potential wood, food, light interception, respiration, and growth.

The IPCC forest defaults (`M01`, tables 4.7 and 4.9) provide a scale check: older temperate continental Asian/European forest above-ground biomass defaults to **120 tonnes dry matter/ha**, with a broad 20–320 range; corresponding above-ground biomass growth defaults to **4 t dry matter/ha/year**, range 0.5–7.5. Those values are neither edible yield nor total net primary production. Sparse, young, boreal, and tundra woodlands differ greatly. A plant's present 48 kg initialization cannot establish that it represents mature woodland.

P13/P16 therefore need distinct quantities for standing structural mass, living foliage/roots, nonstructural reserves, reproductive tissue, edible accessible mass, and annual delivered yield. Any tissue split must partition existing mass and chemical energy. Candidate `R06` develops that question; it must not borrow a forest carbon stock and count it all as food.

## Building down requires an actual volume

`evaluateDesign` currently rejects negative component z and any top above 8 m. Dimensions have a 25 mm minimum; support tests use a 2 mm ground tolerance and an 8 mm contact tolerance. These are numerical thresholds, not evidence of millimetre-resolved ground physics. Component origins are bounded to ±5 m, but an origin of +5 with width 6 reaches +11 m. The allowed assembly bounds therefore do not guarantee that the full footprint fits one nominal 10 m cell. Mapping geometry to neighboring cells is a separate requirement.

No excavate action, vertical citizen position, depth cell, cavity, or underground support state exists in the inspected [action schema](../../src/server/schema.ts) and [types](../../src/simulation/types.ts). Ground-level components receive assumed support from the z≈0 plane. Lowering that plane visually would not establish a mine, basement, tunnel, soil horizon, or void.

The smallest useful P14/P15 sequence is:

1. Define a shallow test column with finite layers, thicknesses, constituent masses, bulk/solid density, pore water, temperature, and known versus unobserved material. Keep current surface pools intact.
2. Excavate a bounded volume from that column. Transfer material into carried loads or a spoil pile; pay work, tool wear, and haulage. Access and tool competence limit the operation; depth does not reveal resources for free.
3. Represent the remaining solid and cavity. Check load transfer and support, overburden, drainage, air exchange, heat, and traversable routes. Filling the cavity returns material and changes volume; it does not erase the excavation history.
4. Permit underground components only where geometry, access, and support allow them. A structural name grants no shelter or mining bonus.

**Discriminating fixture:** removing 1 m³ of the model's solid stone requires 2,400 kg to leave that source. Test both adequate and insufficient source mass, then fill the pit and reconcile mass and geometry. A second tiny fixture compares supported and unsupported openings with identical removed volume. Air and water tests must precede allowing prolonged enclosed occupancy. These are proposed simulation tests, not engineering instructions or claims that the feature exists. Candidates `R14`/`R15`.

## Time resolution must match the process

| Process                                       | Current cadence or parameter                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Authoritative tick                            | 250 real milliseconds = 0.25 simulated hour = 900 simulated seconds                                                                 |
| Simulated day                                 | 96 ticks; 24 real seconds at uninterrupted target speed                                                                             |
| Orbital year                                  | Computed from semimajor axis and gravitational masses: **365.250827345 days**; approximately 8,766.020 real seconds at target speed |
| Inhabitants and journeys                      | Every tick; effective movement 1,800 m/hour before terrain/fatigue effects                                                          |
| Ecology, weather, fauna, contact and councils | Hourly; personal place perception is also hourly                                                                                    |
| Community planning                            | Every four simulated hours                                                                                                          |
| Stocks, families, trade, migration, geology   | Daily                                                                                                                               |
| Planetary heat solver                         | Advances in steps of at most one simulated hour; compensated totals and bounded finite exchange                                     |

These are update intervals, not the natural lifetimes of the processes. A 900-second tick does not by itself resolve fast combustion, support failure, infiltration, or local air depletion. Millimetre geometry can require a much smaller stability/error budget for an interacting process; it does not require the whole planet to run at that resolution.

Wind exchange currently moves a bounded fraction between neighboring local cells once an hour (`min(0.22, abs(velocity) × 0.05)`), with equal-volume heat/vapour exchange. The code describes unresolved turbulent exchange; it is not a resolved metre-per-second advection solver. Numerical refinement must specify which process it refines. The endpoint-perception discrepancy in `R04` is already an example of spatial detail and update cadence failing to agree.

## Conservative exchange across detail levels

The current climate implementation already excludes materialized surface area from coarse solar/radiative forcing, and transfers heat between local and band reservoirs in equal and opposite amounts. Preserve these properties. The coarse band still has an effective full-area heat capacity; a future depth contract must state what unresolved mixed reservoir it represents. No general coarse material/organism partition exists yet.

```text
For an extensive pool Q:
    Q_total = Q_parent_residual + sum(Q_owned_children)

Refine:    debit parent residual; credit children with the same total.
Coarsen:   return child inventories; retain identity/history and unresolved variation.
Transfer:  debit source; credit destination once, including carried quantities.
React:     conserve represented elements; account for chemical energy and heat.
```

A parent summary must not also be counted as another owned inventory. All pools need a spatial owner, area/volume, depth interval, unit, physical/chemical form, temperature, and provenance. Extensive mass and energy add; temperature, concentration, density, and suitability require appropriate weighted aggregation. Unknown inhabitants' information remains unknown after refinement. An observer moving the camera must not generate a favorable ecosystem or reveal deposits to residents.

Where a coarse step spans several fine steps, exchange the **same integrated boundary flux** with opposite signs; do not independently calculate two incompatible deliveries. A one-hour/four-quarter-hour fixture can test this without a whole-world run. New geological depth initially outside the represented ledger requires an explicit boundary/representation migration. Later refinement of already represented depth must partition its stock rather than introduce it again.

A uniform 1 mm surface grid would require approximately **5.10 × 10²⁰ cells**; filling the whole spherical planet with 1 mm voxels would require **1.08 × 10³⁰ voxels**. Even one 320 m square region to 10 m depth would require **1.024 × 10¹⁵** such voxels. Use selective geometry and process-specific refinement with bounded error and finite budgets. Visual detail alone supplies neither material resolution nor a conservation proof. Candidate `R16`, requirement P16.

## Acceptance and research handoff

P13 is the organizing contract for the remaining queue. P14 defines finite depth ownership; P16 proves conservative representation changes; P15 makes excavation and underground construction depend on those contracts. This is a dependency order, not a request to combine them into one release. Seasonal ecology, knowledge, migration, and exchange must identify where their stocks, carriers, observations, and time intervals sit in the same model.

This batch checked arithmetic, JSON/source references, local documentation links, and code fingerprints. It read the cited primary passages and modern summaries; it did not calibrate geotechnical constitutive equations, inspect the live database, or run survival ensembles. Proposed numerical acceptance tests remain unexecuted. The current recovery increment and its reported trials are tracked separately in the [first batch log](2026-10-08-first-batch.md); a scale proposal must not be confused with a recovery result.
