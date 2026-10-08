# Feasible construction and conditional work — 8 October 2026

**Live at 19:42:59 UTC, tick 290260.** `work-planning-20261008-2` corrects two independent decision failures and bounds disposable candidate validation. The saved representation stays format 9 / biosphere-1.3. It changes future choices without changing physical equations, inventories or saved history. The handover encountered the separate disk failure documented below; it must not be described as seamless.

## What changes

The autonomous planner formerly tried only its highest-ranked remembered design. An affordable observation above the 1,600 kg assembly limit could repeatedly fail while a smaller remembered alternative remained unused. Planning now tries ranked, known, useful and affordable alternatives through the same authoritative construction validator, stopping on the first success. Rejected requests spend no material, work, IDs or randomness. A successful request reserves its actual cost once and starts unfinished; all-blocked attempts retain the existing cooldown.

Adult work selection formerly reused one raw random number for successive comparisons. Below the seasonal reserve target, successful food selection used the entire interval that could later choose non-build assembly. The conditional sampler partitions the selected or rejected interval before a later branch is considered. Urgent food, hydration, fatigue, sickness and other preceding bodily gates retain their priority. Ineligible branches do not sample; selected but infeasible work can continue. Social and experimental assignment return only when a route/task was actually assigned.

The stated probabilities are conditional on reaching each eligible branch. Finite PRNG precision is not unlimited independent entropy, and old/new trajectories are not expected to match after this behavioral correction. Candidate replay remains deterministic. No constructor recipe, instant completion, compulsory labor, new supply or increased geometry/mass limit is introduced. See [the source review](../research/shelter-family-review.md), [numerical review](../research/conditional-labor-sampler-review.md) and ADR-030.

## Validation and boundaries

The original labor fixture selected gathering instead of reachable assembly; its urgent-food control already passed. The corrected tree passes **121/121 model/server tests**, with no skipped or cancelled tests, plus TypeScript and the production build. New causal checks cover rejected construction without mutation, remembered alternatives, unavailable knowledge, one material reservation, work still remaining, ordinary reserve/urgent food priorities and a selected but unreachable food task. Numerical checks cover conditional proportions, failed attempts, endpoint handling, invalid inputs and rounding below one.

The compiled-production scenario passes **12 checks**, the general browser scenario **40**, and the isolated runtime-hotfix scenario **21**, including deliberate validation heap exhaustion and cancellation. Twelve targeted persistence/preflight/artifact tests pass after the lifecycle changes. The unchanged supplied game client produced three connected states without browser errors; desktop and mobile screenshots were inspected. Tests and manual time advancement use disposable saves only.

The exact final artifact also passes **12 handover checks on the independently verified, inhabited live-world backup**: private validation advances 228436 → 228468; the continuing gateway resumes at 228500; restart reaches 228510 with 1,441 inhabitants after two ordinary births. Every preceding inhabitant, four community identities, keys, receipts, 63,018 prior journal rows, both law archives, the once-only renewal and exact clock debt remain. The same compressed observer connection delivers two snapshots and fifteen frames without a fault. This is a disposable-copy continuity test, not evidence that the current live communities survived.

The verified pre-update backup at **tick 228436** contains **1,439 people and 239 births**, with the same 32 historical deaths. Births demonstrate that gestation has completed; they do not establish child-care realism or long-term demographic balance. Housing remains approximately 7.5–11.3 places per community in this backup, and finite food reserves have declined. The two reproduced decision bugs are not yet proven to explain that entire housing shortage. Fixed site radius/spacing, geometry, knowledge, scoring, care and seasonal supply remain separate unresolved constraints.

At **tick 287132**, the later live overview has **zero people, 407 cumulative births and 1,639 deaths**. All four restored communities have died out under the preceding `advisor-recovery-20261008-2` runtime, before this candidate's activation. The planet remains healthy and continues ecological time. This invalidates any claim that finite renewal established sustainable communities. Death timing, local supply, search, food distribution and childhood thermal exposure require investigation on independent copies. No repeated restoration, erased history or rewound clock accompanies this hotfix.

## Validation memory

The first candidate's copied-world validation overlapped about 930 MB of sampled child anonymous memory, leaving insufficient allowance for the live gateway on the 1 GB service. The final candidate supervises an owned validation thread, verifies its actual heap limit before loading the copy and cleans up the private database after success, cancellation or heap exhaustion. Validation alone uses 192 MiB old-generation and 16 MiB young-generation settings; the measured effective V8 heap is 216 MiB, below the 224 MiB ceiling, even with host `NODE_OPTIONS=--max-old-space-size=768`. Production simulation does not inherit this limit.

A 160 MiB trial failed and is retained as counterevidence. The final inhabited handover's sampled child anonymous peak is about 798 MB; local harness memory is reported separately. These measurements do not establish a total live-service ceiling: native SQLite allocations, the gateway and file cache still require headroom. Larger worlds may reject validation safely until capacity is available.

## Artifact and backup

- Active release: `work-planning-20261008-2`.
- Runtime SHA-256: `05af5a6275f6ab8430a1d848983cc4007922a7c2c6bcf519ca8dd18baa656d2d`.
- Compatible dependency SHA-256: `0ca3efac2e32e64895e4f395f1919a966af1b18b017c12aaa088b491f2f0022e`.
- Independent raw backup: 232,562,688 bytes; SHA-256 `a973f2a1e4e3df17eab5d11e63467b635c13eddfed8124ef6b53d480f5da94ce`.
- Compressed off-host copy: 62,210,548 bytes; SHA-256 `ba7fcf8a88b3d1c8f4a4ad31c705354030b1bea47181b5e0545abfc1c9525cac`.

The consistent backup was created in container scratch space and streamed outside the constrained live volume, then decompressed and checked independently. SQLite integrity, metadata, every region and both pre-existing law archives are verified. No previous archive or restoration is replaced. A successful SQLite checkpoint reclaimed approximately 109 MB of completed WAL before backup; it does not increase the service's capacity or bound later active-log growth.

A fresh publication backup at **tick 289492**, after the collapse, is independently verified: raw **225,030,144 bytes**, SHA-256 `4beed425fdc4ba9b4bd70d84b1054977a88571caff72be30582df7dd28681811`; compressed **60,726,136 bytes**, SHA-256 `31686c85a8484253dab5499d9a35be875e6add3afaa2ab201cd0ebb5183ba197`. All prior backups remain. The [continuity record](../validation/work-planning-continuity.json) separates this actual source, the earlier inhabited test and live measurements.

## Actual handover and storage incident

The existing gateway activated the exact artifact from 19:42:43 to 19:42:59 UTC. The durable pointer names the new release, no pending pointer remains, and one sole runtime owns the database. Its release record has identical before/after boundary checksums. At saved **tick 291060**, world identity, format, laws, all seventeen sessions, the agent, three receipts, both stored archive checksums and the count of 69,838 prior journal rows remain. Saved clock arithmetic is exact from the fresh backup. The four dead communities are not restored.

At **19:42:54 UTC**, the old runtime hit `SQLITE_FULL` while candidate validation held its copy reader. Even after a successful checkpoint with **174,792,704 bytes available**, multiple subsequent full-region saves could fill the constrained volume. Handover resumed the last committed tick 290260 after an observer had received 290284: **24 visible ticks were repeated**. No new OOM kill occurred. The same external compressed connection stayed open through three snapshots and 75 frames, but it received a fault and backwards time. This is a failed seamless-handover criterion, despite the passing disposable tests and healthy new runtime.

The heap bound does not solve active-WAL growth. Capacity-safe copying, incremental persistence and realistic disk-pressure handover tests remain necessary before claiming this hosting configuration supports seamless updates. Reclaiming the starting WAL is insufficient. No website bundle changed in this backend release; the canonical Vercel deployment remains `dpl_CSVR78ah5Q5UUGmabnfeEGVqsvQd`.

## Political and social freedom

The owner's clarification is recorded as H06 and in the [agency contract](../agency-and-diplomacy.md). The [political mechanism review](../research/open-social-organization-review.md) proposes overlapping membership, locally acknowledged authority, constrained delegation, refusal, revocation and surviving obligations. These are subsequent work, not features of this hotfix. The existing universal local assembly remains provisional. New saved political records require an explicit migration, archived continuity and measured memory/disk headroom; titles or membership must never create resources or obedience.
