# Advisory input and storage recovery — 8 October 2026

Agents can submit bounded proposals at the world's current simulated tick while it catches up after downtime. A receipt still means pending advice: residents must deliberate, can refuse, and must spend available material and work. The clock backlog is neither skipped nor reset.

The service now reports `acceptingProposals` and returns `WORLD_HALTED` for unavailable new advice. Already committed receipts can be replayed during a halt. Submission staging copies advisory records instead of the entire physical world; validation and database failure leave the original state unchanged.

SQLite retains at most **16 MiB of reusable WAL** when resetting a fully checkpointed log. Active writes and held readers can exceed this value. This avoids retaining a past peak indefinitely; it is not a hard transaction-size or disk-capacity guarantee. The earlier [observer hotfix](observer-scaling-0.2.md) already preserves SQLite's original failure when an automatic rollback has occurred.

## Actual publication

- Railway runtime **`advisor-recovery-20261008-2`**, SHA-256 **`23958276a28a7f01a18d93138529c3dca6856c53c960fda9a119b627014a50b0`**.
- Activated **14:39:31.624–14:39:50.161 UTC**, inside the original gateway/container and persistent volume. Candidate validation started at saved tick 209300; the live writer handed over at **209364**. Format **9**, laws **biosphere-1.3** and generation remain unchanged.
- The durable release's before/after world checksums are identical: `db77b2fa5df012f6320372574b713862ac3c7070180717ea7d6e4c45a8006c9c`.
- Subsequent persisted tick **210388** has exact `250 ms × elapsed ticks` clock advancement from the backup. Both archive checksums remain unchanged, the renewal remains recorded once, and the service still has 38 regions, one agent and three prior receipts. The later overview at tick **210392** shows all four groups of 300.
- The current gateway reports one managed worker and the new active release. The host's OOM-kill count remains one, with no new kill during this update; approximately 106 MB was available at the continuity sample. The earlier memory and disk incidents remain part of the record.
- Vercel **`dpl_8FzQGSEpPiNheVSho2AvbJEeLqJn`**, **READY**, production alias **[praxans.vercel.app](https://praxans.vercel.app)**. Immutable deployment: `praxans-7jfkau28h-perseusxr-projects.vercel.app`. Verification used provider metadata; the deployed page was not fetched. The first CLI attempt failed before returning a deployment ID; the retry succeeded.

The fresh consistent backup at tick **204116** was created in container scratch space and streamed directly off-host, avoiding another backup on the small data volume. Its **205,668,352-byte** raw SHA-256 is `197178de84dea08cf5055b599acc5f0896fc927a6a730bf6b418153bad551968`; compressed SHA-256 is `2aa32593df90fae4cb8a7b4fba8535ff104c49f11333c12f6d8ca018a06c7776`. Integrity, compressed/raw hashes, metadata, all regions and both archive checksums pass independently. The original clock debt and historical deaths remain.

## Validation and limits

All **112 model/server tests** pass locally, with build and formatting. Specific cases cover receipt replay, shared HTTP/MCP budgets, accepted advisory input during actual clock debt, a forced failed commit with no leaked proposal, halted service and a held reader whose active WAL cannot be discarded. The current compiled connection flow passes sixteen browser checks with inspected screenshots.

Ten checks on a disposable copy of the actual 1,200-person backup retain the same compressed observer connection through this exact artifact, then verify restart, people, ownership, prior receipts/events, both archives, one renewal and exact clock arithmetic. No live agent proposal was manufactured solely to test production; the user's agent may retry its own intended submission.

No house was granted by this hotfix. Adonis had roughly eight shelter places for 300 residents in the verified backup; its plentiful but finite food and funded thermal protection supported current health. A proposed large hall still faces the actual geometry, material, consent and work limits. The four-molar-mass/sediment-loop candidate was discarded after slower measured timings despite exact replay; it is absent from this artifact.

The host still has a finite 1 GB memory budget and a 500 MB data volume. Backlog remains around seven hours of wall time at the sampled point. Bounded observer queries/deltas, incremental persistence, regional execution, durable knowledge carriers and general material operations remain in [W18 and the implementation ledger](../roadmap.md). This release fixes advisory availability and retained-log behavior, not massive-civilization capacity or indefinite ecological stability.
