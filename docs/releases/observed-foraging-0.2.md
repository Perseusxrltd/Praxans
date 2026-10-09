# Resource plans respond to new observations — 9 October 2026

**Live from 2026-10-09 09:29:13 UTC, tick 543172.** Runtime `observed-foraging-20261009-1` lets a strictly later personal observation of an empty resource interrupt a gathering or extraction task. The ongoing task previously ignored that new evidence. The controller retains paid costs, finite material, hidden-information boundaries and the possibility of attempting an old or same-tick empty memory. Format **15 / biosphere-1.9**, storage **2**, physical extraction and saved representation stay unchanged. No physical migration or material grant is included.

The [study and measured quantities](../research/observed-foraging-2026-10-09.md) distinguish known depletion from unseen depletion, competition and batched extraction. One exactly observed inhabited-copy day removes 113.465 effective hours of known-empty gathering and changes total harvest from 936.865 to 953.034 kg. Amber Hollow harvest falls, aggregate child cold injury rises and harvesting remains below food oxidation. Neither arm has a new death during those 24 hours. This is not demonstrated survival improvement or an additional historical death attribution. [Progressive harvesting](../research/harvesting-work-design-2026-10-09.md) remains an unimplemented design.

Implementation commit: `61594c0431834265057a9bc5e1b8bcf5bfaf32b5`.

## Validation

All **245 model/server cases** pass, including six controls for fresh versus stale information, small positive yield, extraction, strict timestamp ordering, hidden destination changes and saved-task continuity. The compiled build, source formatting, **25 hotfix checks** and **12 isolated production checks** pass. The unmodified supplied game client retains three connected, advancing frames without errors; its final disposable-world screenshot was inspected. Client SHA-256: `1210f58b47aadd9cb4b141fb4b2dc9e17a929aa1a813cdd26b5306a0d08b6808`. Both complete implementation CI workflows pass: push **37911024294** and PR **37911030898**, including their configured browser/runtime integration stages. Later evidence-only commits have separate CI status. These checks do not mutate the live world.

The initial code fails two new behavior controls, as expected. A first candidate used an inclusive observation timestamp; a subsequently added same-interval control caught that ambiguity. The final strictly later rule passes the focused controls and the full suite. Current source and diagnostic fingerprints match the measured results. Independent read-only review confirms the aggregate arithmetic and declared adverse outcomes, without claiming another test run.

The pre-update backup at **535140**, raw SHA-256 **`ba3354e5ab533f94af39759fda1de1f50facadc7b7f13c9f15e9efcea733b52c`**, passes independent SQLite, metadata, 38-region and eight-full-archive verification. Python/libzstd verifies the actual compressed regional frames without importing the application codec. Every pre-existing durable row from the preceding verified backup remains identical, including events, history, interventions, archive bytes, sessions, stable agent identity and receipts. No intervention or archive was added between these backups. Exact clock arithmetic and extinct community history remain intact.

The first live attempt stopped before activation because non-WAL allocation exceeded the preceding 335 MB test allowance. A read-only sample measured 335,089,664 bytes allocated outside WAL and 102,428,672 bytes free. The existing runtime continued; a copy test with 345 MB reserved outside WAL then passed exact load, 96 ticks, three saves and exact restart before retry. This was a local release guard, not a simulation halt.

The backup's finite host monitor records at least **86,929,408 bytes** free, **999,911,424 bytes** peak cgroup memory and no OOM/kill; continued memory-cap pressure remains. The new empty-world quota trial retains 76,951,552 bytes free, under a 226,492,416-byte effective heap, with 358,453,248 bytes sampled child RSS. It preserves every earlier durable row and archive. This correction adds no saved field or storage operation; the copy test does not establish inhabited-host capacity or seasonal viability.

## Repository coherence

The structural review covers **974 Git-visible files**, 81 source files, **721 import/asset edges** and **577 local Markdown targets**, with no missing target or layer violation. Two deliberate historical-replay dynamic imports remain outside static resolution. Semantic review checks task/experience timestamps, actual perception, paid reconsideration, unchanged reservoir transfers, version compatibility and agreement between the model, H02 ledger, research, release and devlog. It records batch production, gathering-reward disconnection, travel perception, developmental care, source contention and host capacity as unresolved. Legacy Python behavior, arbitrary runtime paths, Markdown anchors and full planetary closure are outside this review.

## Artifact

- Runtime SHA-256: `0eeeeb246a0922502a22dd67810c9a374bc410938b62c30103fcc9b1fb732c89`.
- Runtime size: 501,611 bytes.
- Dependency SHA-256: `0ca3efac2e32e64895e4f395f1919a966af1b18b017c12aaa088b491f2f0022e`.
- Source-content SHA-256: `0d84ead8c61e27bd5a4ca4ee279b1b0f965429edd1abf02d1cc15c4e029b8cdc`.
- Target: the existing Railway gateway/service/volume and canonical Vercel observer, preserving one writer and the continuing world.

## Publication

The existing gateway accepted the retry with HTTP 200 at **09:29:13.319 UTC**. Copied-state preflight read tick 543108 and privately checked through 543140; the new runtime resumed the actual world at **543172**. At **09:31:10 UTC**, saved tick **543844** retains identity, generation, format/laws/storage, all eight archive checksums, 407 births, 1,639 historical deaths, four extinct communities and the one historical renewal. The gateway bytes and Railway target remain unchanged; one managed world worker is running. Saved clock arithmetic and outstanding clock debt are preserved.

One direct Railway observer remains connected from **09:28:15 to 09:32:33 UTC**, receiving **five snapshots and 150 frames**, ticks **542908 → 544328**, without an observed fault, disconnect or backward tick. All **22 sampled health responses** are successful. Sparse samples do not establish availability or latency for every request.

The finite 86-sample handover watcher records **86,380,544 bytes** minimum free disk and **999,911,424 bytes** peak cgroup memory, no OOM/kill and no monitoring error. Memory-cap pressure continues. The first guarded attempt and its earlier observer are retained separately from the actual handover. This does not establish uninterrupted availability for every request or inhabited-host capacity.

Vercel deployment **`dpl_J8kosga3RZdWizRoWxdhS9uL8Dhy`** is READY in production at **https://praxans.vercel.app**, with immutable URL `praxans-9hccmdgqe-perseusxr-projects.vercel.app`. Prebuilt website publication and provider metadata inspection pass. The live Vercel URL was not fetched by verification.

The independently verified post-update backup at tick **543396**, raw SHA-256 **`5259b8ecf15f3811c59943863919397624df9d8ced0785a8ed05e8397d476039`**, preserves all **38 regions** and **eight complete archives**. Every pre-update durable row matches: **71,184 events, 5,574 history rows, 27 interventions, eight archive headers/3,036 original parts, 30 sessions, one stable agent identity and three receipts**. Extinct community identities and counts match. The sole new intervention is this code release, at tick 543172, with identical before/after metadata checksum **`e1cf4e72aad67ec7335f3238f84273ab885d9d261d7ef33265fd4cbe3dfd038c`**. The archive set and source backup remain unchanged.

The publication follow-up resolves **721 import/asset edges and 582 local Markdown targets** across the same 974 files, with no missing target or layer violation. It reconciles live status, the guarded retry, completed backup/CI evidence and remaining limits; runtime source content is unchanged. Both external observers and the finite handover/copy watchers have ended. Publication and verification evidence remain in [the validation record](../validation/observed-foraging-2026-10-09.json). The draft PR stays open and unmerged. No renewal, reset, rewind, reseed or database replacement accompanies this work.
