# Progressive world entrance — 8 October 2026

The planet entrance loads a small world overview and a coarse surface first, then refines the surface. Detailed local observation opens when the visitor enters the world and closes on returning to the planet. Personal learning internals and full seed genomes remain on the authoritative server instead of being repeatedly sent to ordinary spectators.

- Railway runtime **`observer-scaling-20261008`**, SHA-256 `5fc073c011c12a966d1f2321b6910e18cf654b0c5594307bd53919724109e1f9`.
- Activated **14:02:49–14:02:57 UTC** in the continuing gateway, resuming saved tick **200180**. Format 9 / biosphere-1.3 remain unchanged.
- Vercel production **`dpl_26YvFNQz88tWZx7Z8DZ6Maxuqs3r`**, READY, aliased to [praxans.vercel.app](https://praxans.vercel.app). Existing tabs need a refresh for the client update.
- Dependency fingerprint: `0ca3efac2e32e64895e4f395f1919a966af1b18b017c12aaa088b491f2f0022e`.

The earlier opening snapshot measured **30,101,057 decoded bytes**, including **14,737,650 bytes of citizens**. A measured live overview after the fix is approximately **3.8 KB**. Atlas images refine from 256×128 to 1024×512; generation yields between row batches and shares in-flight work. The planet still uses the actual seed and continuing astronomical clock.

Eight compiled browser checks verify overview-only entrance, actual population, progressive refinement, detail-on-entry, stream closure on return, unchanged authoritative state and no browser errors. Sixteen connection checks also pass. Screenshots were inspected. A full 1,200-person backup retained its same compressed observer connection across a disposable runtime replacement, with nine ownership/history/clock/archive/restart checks passing. The actual live activation returned success and did not increase the OOM count; no additional full live stream was held solely to stress-test that handover.

The transaction wrapper now preserves the original SQLite failure when SQLite has already rolled back. A disposable full-disk regression verifies the cause, retained prior rows and later successful transactions. Preflight avoids parsing a second complete population; on Linux it makes the expendable candidate the preferred OOM victim where permitted. Neither change expands available memory or disk.

This is partial scaling work. On the loaded service, one observed cold preview took **6.81 seconds**; the fix is not evidence of universal subsecond opening. Detailed frames still contain global entity lists, all materialized regions remain resident, and checkpoints serialize large records. The [scaling review](../research/scaling-and-open-endedness.md) defines measured next steps and bounded-publication targets without claiming they are already achieved.

## Return-to-planet follow-up

Both GitHub runs for `2c6dd09` exposed a navigation regression: reloading directly into observation never fetched an entrance overview, so Home returned to a loading state until another request completed. The earlier eight startup checks did not cover that sequence. The fix derives a small overview from the latest received snapshot on returning home, including its actual clock and population, and rejects older cached summaries for the same world. It does not request a full snapshot on first arrival or mutate the simulation.

The corrected client passes **40 general browser checks and 12 startup checks**, plus TypeScript/build and formatting. The new scenario reloads an observer, holds the overview request open, verifies immediate clock/population continuity, then returns a deliberately older response and verifies that time and totals do not move backwards. Browsing leaves the disposable world unchanged. Desktop, mobile and returned-planet screenshots were inspected with no browser errors.

Vercel **`dpl_CSVR78ah5Q5UUGmabnfeEGVqsvQd`** is **READY**, production alias **[praxans.vercel.app](https://praxans.vercel.app)**; immutable deployment `praxans-e31e9cidz-perseusxr-projects.vercel.app`. Publication completed at approximately **15:24 UTC** on October 8. Verification used provider metadata and local browser checks; the deployed page was not fetched. The Railway runtime remains `advisor-recovery-20261008-2`, unchanged SHA-256 `23958276a28a7f01a18d93138529c3dca6856c53c960fda9a119b627014a50b0`. This browser publication does not restart the live writer or repeat the renewal.
