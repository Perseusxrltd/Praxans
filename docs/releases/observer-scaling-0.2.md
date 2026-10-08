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
