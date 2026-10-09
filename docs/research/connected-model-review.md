# Connected geometry and settlement review — 8 October 2026

**The final reviewed revision passes the connected-geometry and conserved-transfer checks, rejects disconnected stock access, allocates its requested area when land permits, and reuses valid population/geometry caches.** The earlier defects and their corrections are preserved below. Aggregate stock locations, loading/retrieval, thermal capacity and longer-term survival remain unresolved model limits.

This is a bounded review of the revised `geometry.ts`, `evaluateDesign`, settlement layout, rest/access paths, stock decay and component proposal search. It adds code and fixture evidence to the [construction](open-construction.md) and [founding](300-person-founding.md) reviews; it adds no new historical source claims. The [measurement record](connected-model-review.json) preserves source fingerprints, exact outputs and the completed earlier seasonal diagnostic. No live world was opened or changed.

## Checks executed

Run the [isolated probe](connected-model-probe.mjs) with the repository's existing dependencies:

```sh
node --import tsx docs/research/connected-model-probe.mjs /tmp/praxans-connected-review.json
```

The probe uses pure geometry calls, synthetic 225-cell settlement fixtures and one daily stock-decay call. It creates no simulation world through the world generator, advances no clock and opens no database or server. Its synthetic objects supply the fields these narrow functions currently use; they are not a complete simulation fixture.

At **2026-10-08T12:34:26.217Z**, geometry source SHA-256 `00c6a7f97c617c871a306125d6b0186fd182f82b70626cc9c2bcf6b69498713c` and settlement source `6f029fee07b451eae5bb3255eafb96320a8c17723015348e044d07d8e29312a9` produced:

| Check                                                                        | Expected and observed                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Connected open-top bin                                                       | 0.95 m³                                                                                     |
| Detached walls                                                               | 0 m³                                                                                        |
| Missing floor                                                                | 0 m³                                                                                        |
| Lower spillway                                                               | 0.40 m³                                                                                     |
| A 0.1 mm side slit                                                           | 0 m³                                                                                        |
| Quarter-turn rotation and translation                                        | Unchanged 0.95 m³                                                                           |
| Supported internal solid                                                     | Storage reduced by its displaced volume to 0.825 m³                                         |
| Distributed loss of 144,000 kg initial food at uniform 20°C and humidity 0.5 | 1,033.07646185 kg lost; the organic/mineral return reconciled to approximately 3 × 10⁻¹² kg |

The geometric tests exercise connections and boundaries, not a catalogue of containers. `evaluateDesign` still applies stability before granting capacity. All seven also pass in the final inspected revision below. These checks support the correction within its scope; they do not establish fluid dynamics, gas sealing, granular flow or full mechanical realism.

## Initial findings and their disposition

**The initial access halo crossed disconnected land.** In a fixture with land only at `(0,0)` and `(1,1)`, both intervening cardinal cells are water. `findPath` from the second land cell to camp returned `null`, but `canReachCampStocks` returned `true`. Camp storage cells were correctly filtered by a cardinal land flood; the subsequent 1.5-cell access halo added diagonal land without the same connectivity rule. The final revision uses cardinal adjacency and rejects this access. A route must not be inferred solely from proximity.

**The initial allocation fell short even on open land.** Three hundred people requested 4,800 m², but the integer-centred disk of radius 3.90882 cells contained 45 cells, or 4,500 m²: 15 m²/person. The final revision searches within radius plus one cell and targets `ceil(area/100)` connected cells, reaching 48 cells on open land. Its description now correctly says “targets” rather than “at least.” With only the camp cell available on an island, allocation remains 100 m². That physical shortage is retained; requested, represented, connected and allocated area remain distinct.

**Initial warm layout-cache hits still scanned every person.** `campLayout` reduced `world.citizens` before testing its cache. Ten repeated access calls after warm-up visited 12,000 people in the 1,200-person fixture. The final revision caches per-community counts and performs zero measured population visits for that repeated workload. Its invalidation checks cover explicit membership transfer, a new tick, changed array length and array replacement; the inspected same-length affiliation changes call the explicit invalidator.

**Geometric volume is not a stock location or a loading operation.** A completely sealed empty cavity returns 0.95 m³, correctly describing a void but not access to it. The model has no operation to place food inside before sealing or reopen it for use. `decayStocks` also sums every completed, non-collapsed same-community structure's capacity without considering its location, then reduces exposure of the camp's aggregate stock. Keep this as an explicit unresolved coupling: actual stored portions, container access, transport and exposure must ultimately agree. An open-top bin's granular capacity alone does not establish rain, air or water protection.

## Computational bound and useful cache boundary

The exact face partition has at most **65³ = 274,625 transient cells** for 32 components. The four typed arrays alone use **1,922,375 bytes**, about 1.83 MiB per invocation; face lists, temporary objects and runtime overhead are additional. A stable arrangement under the current static contact tolerance reaches that bound.

After one warm-up, three direct Node calls took approximately **32.1, 25.0 and 68.8 ms** under concurrent host load. This is a small CPU cost observation, not a full-runtime forecast or a representative-PC result. Ordinary small assemblies have much smaller partitions.

In the initial revision, `updateWeathering` called `refreshStructure` and recomputed the same enclosed volume every hour even when only fabric mass and damage changed. The final revision caches raw volume by component-array identity and a coordinate/dimension fingerprint; current stability and condition remain separate. In-place dimension changes, element replacement and wall removal invalidate correctly in the narrow checks. Repeated maximum-partition cache hits took approximately **0.06–0.15 ms** in the final three-call sample. This does not measure a cold calculation or establish total runtime speed. Other unchanged geometric affordances may have a similar useful separation, while material-sensitive results need material-aware keys.

## Final isolated verification

At **2026-10-08T12:39:20.593Z**, geometry SHA-256 `bfaec32d5ae35fdaa63df8c9ad6af600aa651e89d04e66d502c4ca37eb6bd5ac` and settlement SHA-256 `6e9e72c7f3f7394edd10204caefaa32af6a9b2ca4614ad85ef76d13bf2c8af91` passed the repeated seven geometry cases and food-return reconciliation. The final probe also established:

- Disconnected diagonal land has no stock access; the cardinal path remains absent.
- Open land receives 48 cells / 4,800 m² and 48 distinct rest cells for the synthetic 300-person cohort.
- A one-cell island remains constrained rather than receiving fictitious land.
- Ten warm stock-access calls cause zero global population visits, counting both `reduce` callbacks and iterator yields.
- Geometry mutation changes capacity from 0.95 to 0.40 m³, restoring the part returns 0.95, and removing a wall returns zero.
- Population-cache area changes correctly after explicit transfer, tick, length and array-identity changes.

Only the inspected fields and paths were exercised. The [record](connected-model-review.json) retains both earlier and corrected outputs; no deployment is inferred from these checks.

## Corrections to the previous record

The previous square-neighborhood warning was wrong. Current `nearbyTiles` explicitly filters a disk; the probe returns **13 cells at radius 2**, whereas the enclosing square has 25. The research warning was stale and is corrected in the earlier note. Disk rasterization and loss of connected land remain real, separate area questions.

The earlier fixed 24 m camp-access mismatch and undistributed child/idle rest branches are also superseded in the inspected revision: food, refill and wrapping use `canReachCampStocks`, while those rest paths use the shared camp layout. The new access-connectivity counterexample above is narrower than those corrected issues.

The component generator now draws general dimensions and permits add/remove, material substitution, axis swaps, translation and scaling. That removes the earlier named-shape-like post/slab prior. The initial log-uniform size range and operation probabilities remain declared search assumptions, not physical impossibilities or unlocks. The fixed design/teaching value weights, sample-versus-full-size evidence distinction and global knowledge eviction remain in `R23`.

## Completed earlier 32-founder seasonal diagnostic

The parent-supplied file `output/validation/renewal-complete-catchments-storage-32.json` was read after completion. It ran **600 days in seven saved regions / 7,168 cells**, with complete 120 m catchments and sealed outer edges. Its implementation fingerprint is `1c3c7b2c9b69ae6c5e816101fea70df9ebe13d09d3e66776437bfc6f3d4f3318`; its initial source tick is 128180. Research did not rerun it.

| Community | Initial arrivals | Final population | New recorded deaths |
| --------- | ---------------: | ---------------: | ------------------: |
| Fern      |               32 |               48 |                   0 |
| Amber     |               32 |                4 |                  44 |
| Stone     |               32 |                3 |                  40 |
| Adonis    |               32 |               47 |                   0 |

“New deaths” subtracts the initial historical death count from the final count. Final population also reflects births and membership changes; it cannot be inferred from arrival count alone. The last-death samples include young children with varied terminal nourishment, hydration and temperature, so these totals do not establish one universal cause of death.

The combined run therefore does **not** demonstrate balanced seasonal survival. The separate single-community results were more optimistic. Domain transport, proportional atmospheric allocation and shared RNG consumption differ, so this is evidence of model/domain sensitivity rather than a controlled attribution to one cause. The parent reports that **none of that restoration configuration was deployed**.

## Completed 300-person short comparison

Research subsequently read `renewal-full-world-300.json` and `renewal-full-world-300-space.json` in the same output directory. Both refer to the same source backup and tick **151764**, report the same initial community samples and intervention/matter summaries, and continue **38 saved regions / 38,912 cells for 14 days**. This checks the reported inputs; research did not compare complete serialized initial states or rerun the simulations.

| Community | Concentrated final temperature | Footprint final temperature | Concentrated final food stock | Footprint final food stock |
| --------- | -----------------------------: | --------------------------: | ----------------------------: | -------------------------: |
| Fern      |                        44.12°C |                     22.43°C |                      114.85 t |                   134.02 t |
| Amber     |                        47.98°C |                     22.93°C |                      114.49 t |                   133.54 t |
| Stone     |                        48.20°C |                     21.88°C |                      113.88 t |                   130.00 t |
| Adonis    |                        49.19°C |                     22.28°C |                      113.78 t |                   132.31 t |

Both runs retain all 1,200 arrivals with no new recorded deaths. Initial temperatures in the files are approximately 20.18–20.31°C. The early parent description of “about 30 tonnes spoiled” must be qualified: the outputs establish **net stock drawdown**, not a separately measured spoilage flow. Consumption, harvesting, carried provisions, cargo and other transfers must be reconciled before assigning that whole difference to decay.

The comparison supports the **changed implementation bundle**: footprint, rest/access, distributed stock loss, connected storage and general component search. It does not isolate the causal contribution of each change; behavior and shared RNG consumption can diverge. The combined 32-person seasonal failures remain relevant counterevidence against a broad survival claim. The parent's final small footprint/cache refinements are covered by the isolated checks above; their additional full-world recheck was still pending when reported.

The current limits remain explicit: stocks are allocated over an aggregate footprint rather than individually persistent piles/containers; heat capacity does not yet include every represented material/body/structure pool; local oxygen transport through piles is unresolved; material processing, tools, joints, loading/retrieval and physical knowledge carriers still need bounded mechanisms. `R01`, `R03`, `R21` and `R24` preserve the duration/domain limits, and `R22`/`R23` retain the remaining construction and evidence work. Fourteen days is not seasonal balance or a guarantee of survival.
