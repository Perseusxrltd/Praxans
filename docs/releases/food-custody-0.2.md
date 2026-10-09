# Local food exposure, carrying and access

**Candidate under validation; not yet published.** Planned runtime `food-custody-20261009-2` advances world format **12 → 13** and laws **biosphere-1.6 → biosphere-1.7**, while retaining storage format **1**. The active predecessor is recorded in [funded metabolism](funded-metabolism-0.2.md).

The resource audit found that carried food never spoiled, journeys omitted personal supplies from their load limits, and a new settlement could count food across impassable water. These are reproducible defects. They are not independently established causes of the historical collapse.

Loose camp stocks, personal food/cargo and caravan provisions/goods now receive the same hourly temperature/moisture exposure at their represented locations. Actual camp storage retains its existing protection; carrying something grants no storage protection. Exponential elapsed-time loss replaces a daily camp charge, returning the lost material once to local reservoirs. Swallowed intake, body reserves and worn fiber retain their existing physiology or wear account. The Q10 and bulk-material coefficients remain uncalibrated approximations.

The hourly boundary samples current location for the entire hour, including material acquired or transferred shortly beforehand and the first interval after migration. It does not reconstruct an exposure path. Accords credit actual received goods: decay can leave a remainder and trigger another provisioned journey. Fractional retry cargo and the existing 1e-8 kg fulfillment tolerance remain controller conventions.

Journey formation reserves space for each living carrier's personal food, covering and work cargo, as well as shared provisions and goods. Loss of carriers reduces what can move, be accepted in exchange or be taken in a raid. Shared excess returns to the landscape; private custody is preserved. The 30 kg allowance and three-person limit remain controller conventions, not a biomechanical model.

Founding screens count standing food and wood on already represented land connected within the survey radius. The screen gives no ownership, personal discovery, harvest labor, annual yield or protection against another community using the same resources. Existing communities retain their locations.

## Continuing-world boundary

Migration `013-local-inventory-exposure-and-access` changes only version labels at the saved boundary. It preserves actual goods, bodies, intake, memories, tasks, escrow, geography, RNG and clock. Future loose escrowed goods share spoilage while retaining their existing delivery path. No old loss measurements are invented and no community is repopulated.

Historical archive blocks use denser compression only when that makes a block smaller. Every original block and full byte stream must verify; actual replacements verify again before their transaction commits. Identity, date, original byte length and checksum remain exact. The `deflate-parts-1` codec and storage version stay unchanged, so a completed lossless repack is still readable by the preceding storage-v1 runtime if a later law migration fails. Each archive is processed before full terrain is loaded. Before a successful world transaction commits, it renews its held writer lease: lengthy archive work cannot simply leave the previous lease expired at that boundary. A lost token aborts and rolls back the write. This reuses pages; it does not shrink the database file or establish unlimited storage.

## Validation and limits

Local validation is complete; live publication is pending. The fresh tick-368744 backup independently passes SQLite integrity, metadata and all 38 region checksums, and every complete prior archive hash. It retains zero people, 407 births, 1,639 deaths and four historical communities. Raw SHA-256: `24ebc38fd465e24adb462467812404a581da2b1fd38c18d0ca97111106a32362`.

The [food-flow review](../research/food-flows-2026-10-09.md) distinguishes the implemented fixes from the still-proposed daily flow account. Infant feeding, local birth/gestation, handling labor, accessible resource production and seasonal/generational survival remain unresolved. Passing conservation and hotfix tests will not prove ecological or demographic equilibrium.

The [validation record](../validation/food-custody-2026-10-09.json) preserves the initial 200/202 batch and its two passing corrected expectation rechecks. All 11 food cases, final 29 storage/preflight cases, 12 production checks, 40 browser checks and 21 generic hotfix checks pass; build and formatting pass. The unmodified supplied game client advances without browser errors, and desktop/mobile captures were inspected.

A disposable copy of the actual world migrates, advances 96 ticks through three saves and restarts within a 454,299,648-byte quota, with 5,566,464 bytes minimum free. The exact-artifact inhabited handover passes 16 checks, preserves every original inhabitant and records five ordinary births; minimum free space is 7,225,344 bytes. Its combined local RSS reaches 1,379,786,752 bytes, so this is not proof of inhabited operation on the live 1 GB host. No long-term demographic conclusion follows.
