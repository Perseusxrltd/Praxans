# Infant food access and funded growth: bounded diagnostic

On 2026-10-09, actual physiology and subsistence functions reproduced a custody limitation: an infant used its own food, but could not use food held by a co-located adult. Moving that adult away gave identical metabolic results. The four-hour reserve draw caused **no injury or death**. A separate funded interval confirmed that the current retention rule permits more growth when additional cold demand increases food oxidation. These are controlled model responses, not measured shares of the historical collapse or evidence of infant viability.

The [public result JSON](infant-food-access-2026-10-09.json) contains unrounded interval traces, compartment transfers, checks, every simulation-file hash, and the exact executable probe. The nine cases completed in **2.212 seconds**, within the two-minute compute budget; measured peak process RSS was about 192.3 MiB. No application files, saved worlds, live services, parameters or existing research documents were changed.

## Equal food, different custody

Each disposable fixture had one age-zero infant with 2 kg body matter, including a 0.2 kg reserve subset, and one adult with 18 kg body matter and a 1.8 kg reserve subset. These are the engine's dry-equivalent biomass compartments, not anatomical wet weights or measured fat. Before observation, actual `feedIntake` transferred 0.9 kg from the fixture's finite 3.9 kg food pool into the adult's intake. The remaining **3 kg** was assigned to either the infant's provisions or the adult's provisions. This initial assignment is a controlled counterfactual, not an implemented care action. It does not validate an infant's ability to carry 3 kg or prepare raw biomass.

Both people were outside camp-stock access; camp food was zero and neither belonged to a journey. The adult was either in the infant's cell or 20 cells away. Each case ran sixteen 0.25-hour intervals, preparing both people before shared feeding, then finishing metabolism and refilling intake. Every case was repeated with reversed preparation/finish order.

Initial temperature was 33°C, with no wrap, shelter or activity. Actual respiration and sweating remained enabled. Infant/adult hydration started at 1.5/8 kg, liquid water and finite atmospheric oxygen were available, and no environmental reservoir was reset during a case. Temperature stayed at 33°C; hydration stayed above 80% of the applicable target. The adult's intake preload funded all its metabolism without consuming any of the comparison food or its reserve. These choices isolate represented access rather than simulate normal infant surroundings.

| Infant outcome after four hours   | Food on infant | Food on nearby adult | Food on distant adult |
| --------------------------------- | -------------: | -------------------: | --------------------: |
| Ingested food, kg                 |    0.100000000 |                    0 |                     0 |
| Food oxidized, kg                 |    0.019824781 |                    0 |                     0 |
| Reserve oxidized, kg              |              0 |          0.019824781 |           0.019824781 |
| Structure retained, kg            |    0.009066978 |                    0 |                     0 |
| Reserve retained, kg              |    0.000940724 |                    0 |                     0 |
| Final intake, kg                  |    0.070167517 |                    0 |                     0 |
| Final body, kg                    |    2.010007702 |          1.980175219 |           1.980175219 |
| Final reserve subset, kg          |    0.200940724 |          0.180175219 |           0.180175219 |
| Comparison food remaining, kg     |            2.9 |                    3 |                     3 |
| Unmet maintenance/cold demand, kJ |          0 / 0 |                0 / 0 |                 0 / 0 |
| Final health                      |            100 |                  100 |                   100 |

The infant released 316.8 kJ in every case. Nearby/distant adult cases had exactly equal metabolic totals, and both actor orders gave exactly equal final person states and metabolic totals within each custody case. No RNG draws occurred. Equal total food therefore did not mean equal represented access. The short interval demonstrates reserve substitution without injury; it does not establish a starvation duration.

This follows [subsistence.ts](../../src/simulation/subsistence.ts), `feedIntake` at line 60: ingestion draws from the person's own provisions/cargo, accessible camp stock or its actual journey's supply. It has no donor-to-recipient path for another person's private food. Automatic ingestion also has no infant preparation or caregiver requirement. The experiment establishes that missing path, not that every nearby adult would choose to feed an infant.

## Growth under added heat demand

Three independent 15-minute cases began with the same 2 kg infant body, 0.2 kg reserve and 0.1 kg intake, funded by an actual transfer from finite camp food before observation. Temperature alone set outward heat loss equal to either baseline maintenance or twice maintenance. There was no additional feeding during the interval, reserve oxidation, reserve refill, injury, sweating or unmet demand.

| Initial condition       | Maintenance-matched heat loss | Twice-maintenance heat loss |
| ----------------------- | ----------------------------: | --------------------------: |
| Ambient temperature, °C |             28.71144065062113 |          24.422881301242263 |
| Maintenance, kJ         |                          19.8 |                        19.8 |
| Released heat, kJ       |                          19.8 |           39.59999999999999 |
| Food oxidized, kg       |         0.0012390488110137672 |       0.0024780976220275335 |
| Structure retained, kg  |          0.000667180129007413 |       0.0013343602580148256 |
| Final intake, kg        |           0.09809377105997882 |         0.09618754211995764 |

The retention ratio was **1.9999999999999993**. Changing only initial age from zero to one year in the maintenance-matched case left fluxes equal within the declared 1e-10 tolerance. This fixed-body comparison tests the kernel's explicit age dependence; it is not an anatomically realistic comparison of those ages.

In [physiology.ts](../../src/simulation/physiology.ts), `finishMetabolism` at line 375 oxidizes intake/reserve to fund demand. Lines 457–486 limit retained tissue to remaining intake and `foodOxidizedKg × 0.35 / 0.65`, restore reserves first, then permit structure up to 16.2 kg. Extra cold oxidation therefore increases the retention allowance when sufficient unoxidized intake remains. Matter and chemical energy were conserved. The 35% controller and its heat/growth coupling remain **uncalibrated assumptions**; this experiment does not show that cold improves biological development or quantify a historical cause of death.

## Accounting, scope and next test

All cases checked the actual whole-fixture elemental ledger, chemical inventory plus released energy, oxygen stoichiometry, and direct intake/body/reserve identities. Reserve is counted only as a subset of body. Maximum final elemental residual was approximately 4.77e-7 kg against a declared 5e-6 kg tolerance; maximum direct human-biomass residual was 2.66e-15 kg against 1e-10 kg. Maximum chemical-plus-released residual was 2.86e-7 kJ against 1e-3 kJ. Actual sensible heat plus evaporative latent heat matched released energy within 1e-6 kJ per interval. Larger whole-fixture tolerances account for floating-point summation of the generated, inert environmental reservoirs; tighter compartment identities constrain the small human transfers.

The probe called `prepareMetabolism`, `feedMetabolicNeeds`, `finishMetabolism` and `refillMetabolicIntake`, matching their order in [citizens.ts](../../src/simulation/citizens.ts) at lines 607–622. It did **not** run `stepWorld`, ordinary nonthermal water loss, cognition, movement, care work, ration packing, spoilage, weather/ecology, birth or other injury/recovery paths. Ages advanced with the shared tick duration. Infant hydration was deliberately initialized to 1.5 kg; current birth initializes 1 kg. Gestation and birth access remain separate questions: [engine.ts](../../src/simulation/engine.ts) at lines 71–86 still draws birth matter/water from home stock and parental body without checking the parent's distance from home. None of those excluded processes is validated here. The completed [collapse study](community-collapse-2026-10-08.md) remains historical evidence under its recorded older rules; its long replay was not repeated.

The smallest next access candidate is an optional, paid, local handoff from an actual holder, followed by ordinary ingestion. Test donor choice and finite work separately from the physical transfer: contact loss must prevent delivery, duplicate claims must not spend food twice, and same-tick forwarding must not recycle newly received stock. Allow kin and non-kin behavior without compulsory redistribution. This would add a missing physical possibility; the diagnostic does not calibrate feeding skill, lactation, food preparation, child appetite or growth. Investigate age-dependent tissue retention separately rather than tuning it to recover a historical child.

Historical framing reuses the already consulted [Xenophon, Oeconomicus IX](https://www.gutenberg.org/cache/epub/1173/pg1173.txt), source A04: available stores and their use are separate questions. Its elite household prescriptions are not behavioral laws. For physiological accounting, previously consulted [FAO/WHO/UNU chapter 2](https://www.fao.org/4/y5686e/y5686e04.htm) and [chapter 3](https://www.fao.org/4/y5686e/y5686e05.htm), M16–M17, distinguish expenditure from retained tissue energy and the importance of body composition. These selected passages were accessed on 2026-10-08; underlying studies were not independently read and no equation was fitted here. Exact earlier access scope is in the [source register](source-register.json). No new external source was fetched for this diagnostic.

## Reproduction

The run used Node 22.22.0 and format 13 / `biosphere-1.7`. All 39 `src/simulation/**/*.ts` files were hashed before import and after completion; their aggregate SHA-256 was unchanged:

```text
4045eee226933d26fc9dff34ee0323850bac993f51c68b6226eb7098868847de
```

The JSON records the exact hashing method, per-file hashes, package-lock hash and probe text. Its script SHA-256 is `d3c9ea251c0d93531c993d7594aed3bc500060ad42b5380e07ea9451e2ad33c3`. Use matching source for reproduction; running a later engine is a new comparison, not an exact replay. From the repository root, restore the embedded probe if needed and run its bounded command:

```sh
node --input-type=module -e 'import fs from "node:fs"; const r = JSON.parse(fs.readFileSync("docs/research/infant-food-access-2026-10-09.json", "utf8")); fs.mkdirSync("output/research", { recursive: true }); fs.writeFileSync(r.reproduction.path, r.reproduction.script);'
timeout --signal=TERM --kill-after=5s 120s node --max-old-space-size=384 --import tsx output/research/infant-food-access-2026-10-09.mjs
```

The executable writes its result under `output/research/`; it imports no database or server API and never advances a saved world.
