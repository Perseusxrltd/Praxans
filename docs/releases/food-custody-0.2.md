# Local food exposure, carrying and access

**LIVE from 2026-10-09 02:18:35 UTC**, at tick **378536**. Runtime `food-custody-20261009-2` advances world format **12 → 13** and laws **biosphere-1.6 → biosphere-1.7**, while retaining storage format **1**. Source commit `0f84b6af528d4a74f685588833a01e04a68e5067`; runtime SHA-256 `39acd20b025d3e3face2afc1a2721a6988c7ec8ca51871617120242def40f49e`. The preceding release is recorded in [funded metabolism](funded-metabolism-0.2.md).

The resource audit found that carried food never spoiled, journeys omitted personal supplies from their load limits, and a new settlement could count food across impassable water. These are reproducible defects. They are not independently established causes of the historical collapse.

Loose camp stocks, personal food/cargo and caravan provisions/goods now receive the same hourly temperature/moisture exposure at their represented locations. Actual camp storage retains its existing protection; carrying something grants no storage protection. Exponential elapsed-time loss replaces a daily camp charge, returning the lost material once to local reservoirs. Swallowed intake, body reserves and worn fiber retain their existing physiology or wear account. The Q10 and bulk-material coefficients remain uncalibrated approximations.

The hourly boundary samples current location for the entire hour, including material acquired or transferred shortly beforehand and the first interval after migration. It does not reconstruct an exposure path. Accords credit actual received goods: decay can leave a remainder and trigger another provisioned journey. Fractional retry cargo and the existing 1e-8 kg fulfillment tolerance remain controller conventions.

Journey formation reserves space for each living carrier's personal food, covering and work cargo, as well as shared provisions and goods. Loss of carriers reduces what can move, be accepted in exchange or be taken in a raid. Shared excess returns to the landscape; private custody is preserved. The 30 kg allowance and three-person limit remain controller conventions, not a biomechanical model.

Founding screens count standing food and wood on already represented land connected within the survey radius. The screen gives no ownership, personal discovery, harvest labor, annual yield or protection against another community using the same resources. Existing communities retain their locations.

## Continuing-world boundary

Migration `013-local-inventory-exposure-and-access` changes only version labels at the saved boundary. It preserves actual goods, bodies, intake, memories, tasks, escrow, geography, RNG and clock. Future loose escrowed goods share spoilage while retaining their existing delivery path. No old loss measurements are invented and no community is repopulated.

Historical archive blocks use denser compression only when that makes a block smaller. Every original block and full byte stream must verify; actual replacements verify again before their transaction commits. Identity, date, original byte length and checksum remain exact. The `deflate-parts-1` codec and storage version stay unchanged, so a completed lossless repack is still readable by the preceding storage-v1 runtime if a later law migration fails. Each archive is processed before full terrain is loaded. Before a successful world transaction commits, it renews its held writer lease: lengthy archive work cannot simply leave the previous lease expired at that boundary. A lost token aborts and rolls back the write. This reuses pages; it does not shrink the database file or establish unlimited storage.

## Validation and limits

Local validation and independent live state/archive checks are complete; a health-request timeout remains a failed continuity criterion. The fresh tick-368744 backup independently passes SQLite integrity, metadata and all 38 region checksums, and every complete prior archive hash. It retains zero people, 407 births, 1,639 deaths and four historical communities. Raw SHA-256: `24ebc38fd465e24adb462467812404a581da2b1fd38c18d0ca97111106a32362`.

The [food-flow review](../research/food-flows-2026-10-09.md) distinguishes the implemented fixes from the still-proposed daily flow account. Infant feeding, local birth/gestation, handling labor, accessible resource production and seasonal/generational survival remain unresolved. Passing conservation and hotfix tests will not prove ecological or demographic equilibrium.

The [validation record](../validation/food-custody-2026-10-09.json) preserves the initial 200/202 batch and its two passing corrected expectation rechecks. All 11 food cases, final 29 storage/preflight cases, 12 production checks, 40 browser checks and 21 generic hotfix checks pass; build and formatting pass. The unmodified supplied game client advances without browser errors, and desktop/mobile captures were inspected.

A disposable copy of the actual world migrates, advances 96 ticks through three saves and restarts within a 454,299,648-byte quota, with 5,566,464 bytes minimum free. The exact-artifact inhabited handover passes 16 checks, preserves every original inhabitant and records five ordinary births; minimum free space is 7,225,344 bytes. Its combined local RSS reaches 1,379,786,752 bytes, so this is not proof of inhabited operation on the live 1 GB host. No long-term demographic conclusion follows.

## Actual publication and continuity

The same Railway deployment, volume and gateway PID 8 now use runtime child 1687. Saved tick **378792** retains all four extinct community records, **0 people / 407 births / 1,639 deaths**, the prior 25 sessions, one agent and three receipt signatures, one historical renewal and exact clock arithmetic. All 70,409 prior journal rows remain by count; private-copy tests additionally compared full content signatures. This live audit did not hash the complete active journal.

Each of the **five repacked historical archives and new archive 013** was exported in bounded blocks and independently decoded and hashed off-host. Original IDs, dates and complete byte hashes match. The new archive has **447 blocks**, **117,075,634 original bytes** and SHA-256 `652005d9abf489e13306e4f9fa8b89b154cbb7959ccbb08192be30bce95faf77`; its metadata changes only version labels at migration. No history or world inventory was discarded.

Vercel deployment **`dpl_EvfTkFoxbyoaq6S4CqyDiyDR2xR4`** is **READY**, with `praxans.vercel.app` and `praxans-perseusxr-projects.vercel.app` assigned by the provider. Immutable deployment: `praxans-lbsrc2y0k-perseusxr-projects.vercel.app`. Website verification uses the local browser suite and Vercel deployment metadata; it does not claim a live browser navigation.

One direct compressed observer retains **three snapshots and 66 frames**, without stream termination, world fault or backward time. **Thirteen completed health samples** return healthy, but one request at **02:18:25 UTC** exceeds its **15-second deadline** while the law/archive handover is underway. The initial strict no-fault verification therefore fails and its evidence is retained. Ordinary gateway requests wait for the new worker to become available; preserving a connection does not guarantee response latency. Six subsequent local and six public health requests pass, with increasing ticks. No claim of a perfectly seamless HTTP handover follows.

The finite host monitor records **181 samples**, minimum free **5,836,800 bytes**, peak sampled cgroup memory **999,911,424 bytes**, memory-limit events **5,869 → 6,918** and OOM kills **1 → 1**. The observers, resource monitors and follow-up requests have ended. About seven hours of clock debt remains preserved. Denser archives provided room for this update; full-region writes, migration latency and inhabited-host capacity remain urgent constraints.

Both complete GitHub implementation workflows **37873843917 (push)** and **37873847250 (PR)** passed: build/format, model/server, production, browser, extinction, renewal, exploration, connection, startup and runtime hotfix integration. Their scope is the implementation commit; later evidence-only changes have their own workflow status. The live health-request timeout remains a separate failed criterion.
