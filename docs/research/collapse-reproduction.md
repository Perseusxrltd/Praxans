# Reproduce the collapse investigation

The [causal report](community-collapse-2026-10-08.md) distinguishes saved observations, a historical replay, small controls using a pinned later revision and unresolved hypotheses. Published JSON files retain their original measured values and provenance. Recheck scripts write ignored `output/research` files. They are diagnostics, not changes to the live simulation or requests to restore people.

## Independent inputs

Full backups contain ownership and other private state and are deliberately excluded from Git. The investigation used these independently verified local files:

| Snapshot                                       |   Tick | SHA-256 of uncompressed SQLite file                                |
| ---------------------------------------------- | -----: | ------------------------------------------------------------------ |
| `before-advisor-recovery-20261008.sqlite`      | 204116 | `197178de84dea08cf5055b599acc5f0896fc927a6a730bf6b418153bad551968` |
| `before-construction-planning-20261008.sqlite` | 228436 | `a973f2a1e4e3df17eab5d11e63467b635c13eddfed8124ef6b53d480f5da94ce` |
| `before-work-planning-release-20261008.sqlite` | 289492 | `4beed425fdc4ba9b4bd70d84b1054977a88571caff72be30582df7dd28681811` |

The source files belong under `output/backups/`. Do not point these scripts at the running database. The forensics extractor checks its expected source hash and uses SQLite immutable/read-only mode; habitat analysis checks file, metadata and region hashes; neither advances simulation. The historical replay advances only parsed in-memory state.

## Death history and habitat

From the repository root with Python 3, Node 22 and installed project dependencies:

```sh
python3 docs/research/collapse-forensics.py
node --import tsx docs/research/collapse-habitat.mjs \
  output/backups/before-advisor-recovery-20261008.sqlite \
  output/backups/before-construction-planning-20261008.sqlite \
  output/backups/before-work-planning-release-20261008.sqlite
```

Compare against [death aggregates](collapse-forensics.json) and [habitat measurements](collapse-habitat.json), ignoring fresh diagnostic timestamps and output names. The original aggregate file's statement that it performs no historical replay describes that extractor; the separately completed replay below is additional evidence.

The habitat snapshot uses four-neighbor connectivity in represented terrain, spherical distances and standing edible tissue. It does not establish sustainable yield, historical maximum travel, ownership permissions or successful bounded paths. Overlapping catchments must be counted once. Derived hectares use the model's 100 m² cell area.

## Small mechanism controls

These results used revision `35a1665bff52a425d1476c7c22db2440bed05406`, whose listed source hashes match all three published mechanism/protection/arithmetic files. Subsequent care, allocation and metabolic changes intentionally produce different behavior. The current diagnostic scripts reject changed source fingerprints before running their controls. Do not run the original fixtures against the new laws and present them as a reproduction.

Prepare a separate checkout at the measured revision (choose a fresh path), then run its diagnostic files:

```sh
praxans_controls_dir=/tmp/praxans-collapse-controls-35a1665
git worktree add --detach "$praxans_controls_dir" 35a1665bff52a425d1476c7c22db2440bed05406
ln -s "$PWD/node_modules" "$praxans_controls_dir/node_modules"
(cd "$praxans_controls_dir" && node --import tsx docs/research/collapse-mechanism-probe.mjs)
```

This checkout needs no private backup for the small controls; the published replay JSON supplies the protection fixture.

The [published result](collapse-mechanism-probe.json) records five one-tick ration cases and 26 isolated thermal calls, including update-order reversal, ample food, maximum sharing and finite-fiber age/protection controls. Source fingerprints identify the functions at that pinned revision. The later work-planning changes are present in this source; these fixtures do not masquerade as a historical full-world replay. Synthetic initial conditions do not add material to the preserved world.

## Protection and arithmetic follow-ups

```sh
(cd "$praxans_controls_dir" && node --import tsx docs/research/first-child-wrap-counterfactual.mjs)
(cd "$praxans_controls_dir" && python3 docs/research/starvation-storage-arithmetic.py)
```

The [two-call protection result](first-child-wrap-counterfactual.json) reuses the exact relevant terminal conditions from the replay, keeping total fiber fixed. It does not reconstruct other inhabitants or the historical camp geometry. The [starvation/storage arithmetic](starvation-storage-arithmetic.json) is source-derived calculation only, with its own source fingerprints, equations and reading register; it is not another world trial. The accompanying [interpretation](starvation-storage-review.md) states the missing coupling and calibration limits. Both recheck scripts preserve published results.

## Exact historical replay

The [completed historical result](collapse-first-death-replay.json) took **768.6 seconds for 3,113 ticks**, not a seasonal survival test. Its first-death event exactly matches the archived journal. It reads one target before/after heat regulation into a bounded 96-entry trace. The patch only wraps the original function; it does not change physical calculations.

To prepare a new disposable historical checkout, choose a new local path and apply the [recorded observational patch](collapse-thermal-trace.patch):

```sh
praxans_replay_dir=/tmp/praxans-collapse-replay-4ed610b
git worktree add --detach "$praxans_replay_dir" 4ed610b48c604ab9734a301ecdddda55fc9f6111
ln -s "$PWD/node_modules" "$praxans_replay_dir/node_modules"
git -C "$praxans_replay_dir" apply "$PWD/docs/research/collapse-thermal-trace.patch"
node --import tsx docs/research/collapse-first-death-replay.mjs "$praxans_replay_dir" --verify-inputs
node --import tsx docs/research/collapse-first-death-replay.mjs "$praxans_replay_dir"
```

The [portable runner](collapse-first-death-replay.mjs) requires the exact baseline revision, the sole tracked source modification to be `physiology.ts`, the patched file's SHA-256, and the two expected backup hashes. It refuses an existing result destination. `--verify-inputs` checks that provenance without advancing anything. Its preparation/hash guards and output paths were added when publishing the original diagnostic; the expensive historical simulation was **not rerun merely for that packaging change**. The original completed trace remains the evidence. A future rerun must independently produce `deathEventExactlyReproduced: true`.

The final call proves the immediate cold-exposure health loss for one infant. It does not identify every earlier contributor to that person's health, a clinical cause, a causal share of all deaths, or future survival under a complete care system.

## Timeline

The [committed figure](../images/community-collapse-2026-10-08.png) plots [extracted daily history and age-group death counts](collapse-timeline.json). It shows communal food only, excluding personal provisions, cargo and unharvested plants. All 407 child and 1,200 adult death counts reconcile with the public journal; daily history cannot partition food production and loss.

`render-collapse-timeline.mjs` uses standard Plotly and Playwright to write an interactive standalone HTML file and export the PNG. Plotly is an ignored diagnostic dependency, not a new application dependency:

```sh
npm install --prefix output/validation/collapse-chart --no-audit --no-fund --ignore-scripts plotly.js-dist-min@3.3.0
node docs/research/render-collapse-timeline.mjs
```

The original 1280×1000 export was visually inspected, including the complete source/limitation footer, and the rendering page reported no errors. This figure illustrates the recorded failure; it is not evidence of a realistic natural mortality curve.

The [publication verification record](../validation/community-collapse-2026-10-08.json) retains artifact hashes, the rechecked results, source comparisons and catalog validation. The application source fingerprint remains unchanged by this research batch.
