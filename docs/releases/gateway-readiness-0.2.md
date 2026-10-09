# Gateway readiness and storage compatibility

Prepared 2026-10-09. Publication is pending. This container update leaves the active `food-custody-20261009-2` runtime and its physical world unchanged. The isolated build's runtime SHA-256 remains `39acd20b025d3e3face2afc1a2721a6988c7ec8ca51871617120242def40f49e`; only the gateway behavior changes.

The previous handover held a health request for more than fifteen seconds behind migration startup. The gateway now answers readiness promptly with HTTP 503, `Retry-After: 1`, `acceptingProposals: false` and `updating` or `recovering` while the runtime is unavailable. Ordinary requests still queue, and established observer streams retain the existing runtime-handover behavior. This is truthful unavailability, not a claim that the world continues advancing during the pause.

Automatic fallback now compares the world checksum, storage version, SQL schema and ordered regional checksums from one read transaction. A candidate that commits an incompatible storage change and then fails cannot silently restart the preceding binary merely because the metadata checksum stayed the same. Its pending pointer remains for forward recovery. This bounded compatibility check is not a full integrity check of every history record or payload; the Store verifies payloads when it loads them.

## Validation and deployment boundary

The isolated gateway build retains storage version 1 and all existing physical code. Its build, formatting and checkpoint regression pass. All **25 runtime-handover checks** pass, including actual schema-only candidate failure, prompt truthful readiness, unchanged agent ownership/receipts, retained browser camera and one continuing observer connection. Both browser screenshots were captured; the post-handover screenshot was inspected and the browser reports no errors. All **12 compiled-production checks** pass, including a native backup resumed with the original owner and agent key.

A fresh independent backup at tick **389256** has raw SHA-256 `9a33e9c2845d676ef8fdb5c65b570a69c1646c3c8d5df6cd6b5b3a0a5a059442`. SQLite integrity, metadata, all 38 original regions and all six full historical archives verify off-host. It retains the same world/seed, format 13 / biosphere-1.7, 407 births, 1,639 deaths, zero living people, ownership and exact wall-clock arithmetic. The source copy took 9.75 seconds; the finite copy/compression monitor recorded 5,664,768 bytes minimum free and no additional OOM kill. Backups are private and excluded from Git.

The deployed gateway cannot update itself through a runtime-only hotfix. Publication therefore requires a normal container deployment on the existing Railway service and volume, retaining the durable runtime pointer and matching dependencies. This necessarily replaces the transport process; verification must report actual client reconnection and any interruption. It does not promise to keep one TCP connection through host replacement. The Vercel client assets are unchanged.

## Coherence review and limits

The change stays in transport/SQLite compatibility: it adds no physical rule, resource, clock adjustment, population grant or new migration archive. Ownership still belongs to one runtime, and the gateway's private operator socket remains the publication boundary. The ordinary health endpoint continues to use the runtime while it is available, including preflight while the old worker runs. The legacy raw-region writer, historical archive codec and natural simulation remain unchanged in this container increment.

Storage compression is a separate candidate. It must not be activated before the deployed gateway includes this compatibility rule. Full-region rewrites, monolithic population state, growing archives, finite queues, single-host outages, physiological calibration and long-term ecological viability remain unresolved.
