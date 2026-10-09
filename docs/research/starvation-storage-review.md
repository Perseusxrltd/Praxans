# Starvation, body reserves and seasonal food accounting

Recorded 2026-10-08. The main issue is the connection between budgets: appetite, body oxidation, credited body heat and health damage are separate rules. The reserve equation is mathematically sound for its stated assumptions; the demand, storage losses and body model need calibration and causal accounting. [Reproducible arithmetic](starvation-storage-arithmetic.py) and its [results/source register](starvation-storage-arithmetic.json) use no world simulation or database. The historical replay was left untouched.

## Units and the starvation clock

| Source quantity                          | Actual represented unit                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `HOURS_PER_TICK`                         | 0.25 simulated hour; 96 ticks per simulated day                                       |
| `person.hunger`, `person.energy`, health | Dimensionless 0–100 indicators; personal `energy` is a rest/fatigue indicator, not kJ |
| Food and `person.body`                   | kg of effective 94% organic/6% mineral material; separate hydration pool              |
| `LAWS.chemicalEnergy`                    | 17,000 kJ/kg organic equivalent; therefore 15,980 kJ/kg food or body material         |
| Low-hunger body catabolism               | 0.015 kg body material per simulated hour, limited by body and oxygen                 |
| Low-hunger health damage                 | 1.15 health points per simulated hour                                                 |

See [`updateCitizen`](../../src/simulation/citizens.ts), [`materialMatter` and respiration](../../src/simulation/laws.ts), and the [material properties](../../src/simulation/content.ts). Organic `carbon` here uses a carbohydrate-equivalent composition, not elemental carbon, anatomical fat or fresh-food mass. The model's adult 18 kg and newborn 2 kg body compartments cannot be compared directly to measured whole-body weights.

Once nourishment remains below 12, **348 quarter-hour subtractions remove 100 health in 87 simulated hours**. At the full catabolism rate this consumes **1.305 kg**, leaving 16.695 kg of an initially 18 kg compartment, or 0.695 kg of a 2 kg compartment. This calculation excludes temperature, illness, feeding, dehydration and recovery. It starts at the injury threshold, not the last meal; it is not an observed or real-world survival time. The arbitrary health coefficient determines the result independently of the remaining body's usable energy. That is an **uncalibrated injury abstraction**, not by itself proof that someone could safely consume the entire remaining body.

Mean meal arithmetic gives 0.650 kg/day for a resting adult, 0.875 for an active adult and 0.575 for a child, before cold/melting costs or pregnancy. These are steady appetite balances using 48 nourishment points/kg; meals occur in discrete pulses. At zero growth, their mean chemical powers are approximately 120.22, 161.83 and 106.35 W. Retaining 35% of a growing child's meals leaves only approximately 69.13 W oxidized on that arithmetic. These are model consequences, not dietary recommendations.

## Source-proven coupling gaps

[`regulateTemperature`](../../src/simulation/physiology.ts) credits an 18 kg body with 110 W at rest or 160 W while active, scaled by body size, regardless of actual substrate oxidation. Its [`fuel`](../../src/simulation/physiology.ts) helper can oxidize accessible food for additional cold demand or ice melting, but cannot mobilize body reserves. Hunger-triggered catabolism releases only **239.7 kJ/hour, equivalent to 66.58 W**, and does not report this energy to the body's heat calculation. It does warm the tile through `respire`, so its heat is not wholly absent from the environment.

Consequently, a nourished indicator can coexist with lethal unfunded cold demand and substantial body material. Conversely, a starving body still receives its fixed baseline heat credit. **This is a causal-accounting gap**, even when the aggregate matter and chemical-energy ledgers close. Its two sides can bias injury in different directions; simply adding another body-burning path is not a complete correction.

The [exact first-child replay and finite-fiber comparison](first-child-wrap-counterfactual.md) establish the issue's relevance in one historical case: heat regulation killed a bare child with 62.244 nourishment, 17.908 kg body, no accessible food and 327.154 kg stock fiber. Earlier allocation of 2 kg fiber prevents death during that single quarter-hour; it does not solve the continuing fuel shortage. This follow-up proves a proximate mechanism for that child, while other deaths and longer outcomes remain separate questions.

**Smallest coherent direction:** make one metabolic accounting path distinguish oxidation, retained matter and unmet demand. Record actual food/body oxidation and what heat or work it can fund before changing coefficients. A future mobilizable-body compartment needs a declared structural minimum, rate limit and age/body mapping, with sensitivity analysis. Existing body matter must be partitioned, not enlarged. A digested-food buffer likewise needs unoxidized matter: meals already sent through `respire` cannot also fill a new energy store. Hunger catabolism and thermal catabolism must draw from the same budget, with oxygen, water products, minerals and heat recorded once. Saved-state or physical-rule changes require the corresponding explicit migration/version review.

## Storage losses and seasonal planning

[`decayStocks`](../../src/simulation/weathering.ts) runs **daily**, not hourly. Food loss is `S × (1 − exp(−k))`, where `k = 0.004 × clamp(2^((T−20)/10), 0.05, 8) × (1.3 + damp)` per day. Lost food becomes detritus; decomposition releases its energy later. Stock drawdown therefore is neither measured food consumption nor instantaneous destruction of world matter.

| Fixed local condition                                | Fraction of food lost per day | Loss from 144 t in one day |
| ---------------------------------------------------- | ----------------------------: | -------------------------: |
| 20°C, dry                                            |                      0.51865% |                  746.86 kg |
| 20°C, maximally damp, unprotected                    |                      0.91578% |                1,318.72 kg |
| 20°C, same damp environment, full modeled protection |                      0.67769% |                  975.88 kg |
| 0°C, dry to maximally damp/unprotected               |              0.12992–0.22974% |           187.08–330.82 kg |

Even unlimited storage volume only reduces the fully damp **rate coefficient** by 26.09%; it does not reduce the dry base. The thermal floor applies below approximately −23.22°C and still removes 37.44–66.22 kg/day from 144 t under the dry/damp endpoints. **Q10 = 2, its floor and these loss rates are effective assumptions**, not universal deterioration laws. Ambient humidity is not food water content or water activity. The source has no food-specific drying state, pest population or deterioration history.

Protection is shared over the volume of all communal materials, so storing stone and wood dilutes the food's calculated protection without explicit placement. Personal provisions and carried food have no corresponding biological decay path. These are **representation gaps**: moving the same food between inventory types changes its loss rule. The short personal-ration limit bounds one effect, but does not make its physical interpretation consistent. A future physical storage mechanism should act on food batches and their actual location, containment, moisture and temperature, including finite water/heat transfers during drying. A recipe flag must not grant preservation.

The [seasonal target](../../src/simulation/subsistence.ts), `S₀ = c × expm1(kD)/k`, solves `dS/dt = −c − kS` with no production and `S(D)=0`. At **c = 1.6 kg/person/day, k = 0.006/day, D = 180 days**, it gives **518.581213617473 kg/person**, or **155.574 t for 300**. With no loss, the target is 288 kg/person. Applying daily consumption and loss in opposite orders gives 517.027 and 520.139 kg/person, bracketing the continuous result; no factor-of-24 error was found.

The assumptions remain consequential. Constant 0°C dry/damp losses require approximately 324.49–356.77 kg/person for the same fixed consumption interval, whereas constant 20°C gives 476.85–737.10 kg/person. Actual weather, protection, harvest and changing population invalidate either constant scenario as a forecast. The prior bare-child 0°C example already requires approximately 2.657 kg/day including ordinary meals, above the uniform 1.6 planning value. The target uses an explicit daylight heuristic; it neither learns actual local losses nor guarantees that the habitat can supply it. Increasing founding stocks alone can increase absolute daily spoilage and delay these structural problems.

## Discriminating checks before another survival claim

1. **One heat and metabolism budget:** use equal matter/oxygen with food present, food absent but explicitly mobilizable body matter present, and exhausted reserves. Reconcile substrate consumed, retained matter, respiratory products, heat and residual unmet demand each step. Test pulsed meals as well as steady feeding; a missing digestion buffer must not turn normal intervals between meals into unfunded energy. No heat allocation may reuse already dissipated chemical energy.
2. **Separate injury calibration from accounting:** keep temperature, hydration, shelter and activity fixed; vary starting body reserves and initial nourishment independently. Measure each health-loss component rather than prescribing a desired number of days alive. Structural tissue loss, energy deficit and illness should have explicit roles. Bounds require appropriate physiological evidence; none is established by the 87-hour arithmetic.
3. **Storage equivalence:** place equal food at equal physical exposure in communal stock, personal provisions and a container. Identify every justified difference; reconcile loss into detritus and subsequent respiration. Test one daily exponential decay against equivalent subintervals with consumption disabled, then add meals and log their ordering. This distinguishes an inventory-name shortcut from physical protection.
4. **Reserve adequacy:** first validate the constant-condition equation against a small isolated stock ledger. Then use a bounded camp trace that records actual meals, heat/melting fuel, body retention, spoilage, harvest and transfers. Compare locally observed estimates with realized flows before changing seasonal demand or running another broad population trial.

Ancient sources frame the questions: Xenophon's household storage and seasonal provision (A04) and the _Arthashastra_'s distinct inventory flows (A08), in the [existing source register](../../docs/research/source-register.json), do not calibrate a loss coefficient or dictate allocation. FAO's grain-storage review (M03) separates moisture, temperature, oxygen and organisms. Newly consulted FAO/WHO/UNU _Human energy requirements_ (2004), [chapter 2](https://www.fao.org/4/y5686e/y5686e04.htm) and [chapter 3](https://www.fao.org/4/y5686e/y5686e05.htm), distinguishes measured expenditure, tissue synthesis and retained tissue energy, and documents body-composition and measurement limitations. Selected passages were read on 2026-10-08; underlying studies were not independently read. Healthy-population requirements and normative health goals are not starvation mortality curves or universal community objectives.

No coefficient was changed and no automatic renewal is proposed. The preserved deaths remain evidence about the old mechanisms; correcting accounting does not promise permanent survival.
