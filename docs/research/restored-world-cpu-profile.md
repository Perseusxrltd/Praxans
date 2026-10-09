# Restored-world CPU profile — 8 October 2026

**Weather, ecology and chemistry are the first measured optimization targets in this interval.** On a disposable local copy of the restored world, 64 actual `stepWorld` ticks took **15.780 s**, averaging **246.6 ms/tick**. Ecology accounted for 56.4% of sampled time, citizen updates 25.9%, garbage collection 9.2% and contact detection 1.8%. This narrows the immediate recommendation in the [scaling memo](scaling-and-open-endedness.md); it does not remove the population scans' quadratic growth limit.

The [machine-readable record](restored-world-cpu-profile.json) preserves input/code fingerprints, measurements and limitations. This is one local measurement, not production capacity or seasonal evidence. No new external source is claimed.

**Follow-up:** the combined molar-constant and sediment-iteration candidate preserved the 64-tick serialized-world digest but was slower in both tested orders. The parent reverted it; it will not be deployed. The profile identifies costly work, but these measurements do not establish an effective optimization.

## Scope and integrity

The verified standalone backup was copied into a new `/tmp/praxans-restored-cpu-*` directory and loaded through `Store`. Source, initial copy and source-after-run SHA-256 checks agreed. The source was never opened for writing. The private directory was removed after the successful run; the advanced world was not saved.

The frozen, non-minified bundle ran on Node **22.22.0**, Linux x64, an **Intel Core Ultra 7 155H**, with `--max-old-space-size=1024`. State advanced from tick **199028 to 199092**, with **1,200 people, 38 regions, 38,912 cells, four communities and 15 structures**. Population remained 1,200. This covered **16 simulated hours**, including 16 hourly ecology updates and **no daily boundary**. There were **zero animal cohorts**. Daily family/trade/storage work, populated fauna, external agent submissions and long-run behavior are therefore unmeasured.

V8 sampled the tick loop at a requested **1,000 μs interval**, producing 14,028 samples over 16.003 s. **Database loading, source hashing, post-run validation, saving, observer projection and rendering are excluded.** Four progress messages/yields and profiler overhead remain inside the sampled envelope and are reported separately where identifiable. No warmup ticks were discarded. Loading took 1.382 s and validation 0.524 s outside that envelope.

## Measured costs

| Tick group or statistic                   |                     Wall duration |
| ----------------------------------------- | --------------------------------: |
| 64 `stepWorld` calls, summed              |                       15,779.9 ms |
| Enclosing loop, including progress/yields |                       15,794.8 ms |
| Mean / p50 / p95 / maximum tick           | 246.6 / 58.4 / 892.7 / 1,127.3 ms |
| 16 hourly ticks, mean                     |                          802.0 ms |
| Other 48 ticks, mean                      |                           61.4 ms |

These phase buckets partition the weighted profiler samples. They are estimates, not independently timed phases; optimization/inlining limits attribution.

| Exclusive phase bucket                            | Sampled duration |  Share |
| ------------------------------------------------- | ---------------: | -----: |
| `updateEcology`                                   |       9,021.3 ms | 56.38% |
| `updateCitizen`                                   |       4,151.4 ms | 25.94% |
| Garbage collection, not attributable to one phase |       1,471.8 ms |  9.20% |
| `stepWorld` self, inlined or unclassified work    |         806.5 ms |  5.04% |
| `detectContacts`                                  |         285.9 ms |  1.79% |
| Outside `stepWorld`, profiler or idle             |         233.2 ms |  1.46% |
| Other identified phases combined                  |          32.1 ms |  0.20% |

Within ecology, **`updateWeather` accounts for 5,144.3 ms inclusively (32.15% of the whole sample)**. The two sediment helpers' self time totals **1,814.7 ms (11.34%)**. `molarMass` contributes **540.7 ms inclusively (3.38%)**, almost all beneath `oxygenFraction` (**570.3 ms, 3.56%**). Inclusive figures overlap; do not add them to each other or the phase table.

The identifiable hourly disease-search callback at profiled `citizens.ts:643` contributes **178.6 ms inclusively (1.12%)**. Two distinct shelter-occupancy callbacks at lines 235 and 619 total **488.5 ms (3.05%)**; their enclosing searches must not be added again. These callback figures omit some caller/array machinery and are not exact whole-feature costs. Local indexing remains justified for growth, but contact and disease searches were not the dominant measured work here.

Peak RSS sampled after ticks was **352.05 MiB**. Process high-water RSS was **352.11 MiB**, including work outside the profiler. Neither measures the live host's combined server, SQLite, observer, backup and preflight footprint. Process CPU usage was 20.726 s user plus 1.676 s system; background threads can make that exceed elapsed wall time. The mean tick is already near the 250 ms wall budget before service work; this run demonstrates no operational headroom or higher-population capacity.

## Initial candidates

The first two proposals below were subsequently tested together and reverted. Their original rationale is retained; neither change has an isolated performance result.

1. **Precompute four immutable molar masses.** In the profiled [chemistry source](../../src/simulation/chemistry.ts), `oxygenFraction` calls `molarMass("O2")` at line 274, `"N2"` at 280, `"Ar"` at 281 and `"CO2"` at 282 on every invocation. [elements.ts](../../src/simulation/elements.ts) freezes the element records and symbol table; their scalar atomic masses cannot change. Compute these four numeric constants once using the existing function, retaining the original division and addition order. Do not cache the atmospheric ratio: respiration and other transfers change its inputs within a tick. Do not cache/reuse mutable `atoms()` result objects. The `CHEMISTRY` calls at lines 85–87 already run once during module initialization.
2. **Reduce allocations in measured material transfers without changing transfers.** [landscape.ts](../../src/simulation/landscape.ts) uses `Object.entries` and per-symbol writes in `entrainSediment` and `depositSediment`. Own-property iteration can avoid entry-pair arrays while preserving enumeration, subtraction/addition order and the existing delayed transport pass. Preserve zero-key behavior and exact source/destination transfers; skipping apparent zero work or changing pass order needs separate justification. The profile identifies cost, not a measured speedup from this proposal.
3. **Then measure local indexes against population growth.** Preserve candidate order, eligibility, tie-breaking and RNG consumption before changing any behavioral rule. Distinguish dense contact neighborhoods from distant populations; both the number of scans and actual contacts matter. Keep observer and persistence measurements separate from simulation-only profiles.

For a semantics-preserving correction, first compare the old and new helpers over varied atmospheric/element mixtures, then use existing conservation and deterministic replay checks. Compare exact tick/RNG/entity identities and ledgers on the same private source state. If those agree, repeat this bounded profiling workload under the same runtime conditions and report variability. The independent baseline batch did not run the later comparison recorded below.

## Measured follow-up: candidate reverted

The parent ran a combined **four cached molar masses + `Object.keys` sediment iteration** candidate. Research read the four reports and replay driver and verified the frozen engine hashes; it did not rerun them. All runs used the same backup and advanced tick 199028→199092, ending with 1,200 people, the same RNG and identical `SHA256(JSON.stringify(world))`. Initial digests also agree. This checks those serialized endpoints, not every intermediate tick or other starting states.

| Sequential run order | Before, elapsed | Candidate, elapsed |
| -------------------- | --------------: | -----------------: |
| Before → candidate   |       15,297 ms |          17,001 ms |
| Candidate → before   |       18,156 ms |          27,130 ms |

The candidate was slower in both orders. These are noisy descriptive timings for a changed bundle; they cannot assign the difference to either individual change. `Object.keys` still allocates a key array, so the tested candidate was not allocation-free. No daily boundary, loading, persistence, validation, observers or rendering is included. The parent reverted the entire candidate and reports it will not be deployed; a future optimization needs new discriminating evidence.

Evidence remains in `output/validation/observer-perf-{before,after}{,-repeat}.json`, `engine-{before,after}-observer-perf.mjs` and `replay-observer-perf.ts`. The JSON research record retains their hashes and exact timings, separate from the original sampled profile.

## Reproduction artifacts

Local artifacts are in `output/validation/`: `profile-restored-population.ts`, the frozen `.mjs` bundle and source map, `restored-world-profile-build.json`, `restored-world-profile-64.json`, the matching `.cpuprofile`, `analyze-restored-profile.mjs` and `restored-world-profile-64-analysis.json`. These generated files and the private backup remain outside Git. Source maps identify the exact profiled code even if the working tree later changes.

From the repository root, the recorded workload was:

```sh
node --max-old-space-size=1024 output/validation/profile-restored-population.mjs output/backups/before-observer-scaling-20261008.sqlite output/validation/restored-world-profile-64 64
node output/validation/analyze-restored-profile.mjs
```

Use a new output prefix for subsequent runs and pass that prefix plus the matching bundle to the analyzer. Reusing the frozen bundle measures the recorded implementation, not later source edits. The retained JSON records full hashes; this batch changed only research documents and authorized local profiling artifacts.

The later [advisory/storage release](../releases/agent-recovery-0.2.md) records actual activation of the advisory staging and WAL-retention work. Earlier pending statuses in this research record describe their observation time. The rejected molar-mass/sediment candidate remains excluded from the deployed artifact.
