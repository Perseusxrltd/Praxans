# Checkpoint reuse and bounded backup copying — 8 October 2026

**Live at 21:21:53 UTC, resumed tick 301940.** `checkpoint-copy-20261008-1` corrects a reproduced storage failure that could permanently halt the world after a backup. It retains format 9, biosphere-1.3, the same planet, all deaths and the original finite renewal. The [measured record](../validation/checkpoint-copy-2026-10-08.json) separates the failed first candidate, disposable tests, live activation and later observation.

## Cause and correction

SQLite normally checkpoints its write-ahead log at commit. A reader can delay that checkpoint. Closing the reader does not automatically retry it: the next large save can append another batch to the retained log, exhausting disk **before** it reaches the next commit. Short backup read batches alone do not solve this writer boundary.

A disposable 24 MiB filesystem reproduces the failure with the reader already closed before the second write. The previous transaction path fails with `SQLITE_FULL`, leaving revision 1; the actual corrected `Store.transaction` commits revision 2 and reuses an approximately 8.5 MB log. This establishes a causal failure mode consistent with the live post-copy halt. The precise read overlapping each historical commit was not instrumented, so it does not attribute every earlier outage to the same reader.

World transactions now request `wal_checkpoint(RESTART)` before beginning. If an existing reader still prevents reuse, the transaction callback has not run and returns `WORLD_STORAGE_BUSY`. The clock retries its exact pending checkpoint before advancing any more time. Observations and committed receipts remain available; new advice receives HTTP 503 with `Retry-After: 5`. The service reports `waiting-for-storage`, distinct from a simulation fault. Each attempt uses the existing five-second SQLite busy timeout, followed by a 250 ms retry delay. Arbitrary disk, I/O and model failures still require diagnosis and recovery.

Backup and preflight callers now use the shared native SQLite online-copy helper. It releases its source read transaction between 128-page batches, bounds copying to 60 seconds and cleans unpublished partial files. A completed, synced file receives its final name through an exclusive hard link. Existing backups cannot be overwritten, including a name created during copying. Callers await completion before closing the source. Node **22.16+** and a filesystem supporting hard links and directory syncing are required; the deployed Linux/Node 22.23.3 host meets these requirements.

## Failure retained in the record

The initial copy-only candidate passed its local checks and copied the live checkpoint from 21:03:37 to 21:03:41 UTC. At **21:03:45**, the old `work-planning-20261008-2` writer nevertheless halted on its following large save. The attempted candidate upload failed because the volume was full; that candidate was never activated. A monitor ending with the copy missed the subsequent failure.

The saved tick was **301940**, while the observer had received **301972**. At 21:07 the WAL occupied 174,362,624 bytes and available space was zero. By the explicit checkpoint operation at 21:14, SQLite had already reduced that log to 16 MiB. The operation reclaimed only that remaining amount; it did not itself reclaim the entire earlier log. The saved checksum and clock matched the independently verified backup throughout. No WAL was manually deleted and no database was replaced.

The final corrected artifact recovered the already halted world from 21:21:41 to 21:21:53. The external observer connection stayed open, but **32 uncommitted ticks were recomputed**. This recovery is not uninterrupted or monotonic simulated time. The event remains visible instead of being relabeled a seamless update.

## Validation

- **25 final lifecycle tests**, including independent concurrent copying/writing, cancellation, timeout, destination races, delayed checkpoints and automatic resumption of the same pending world.
- **12 compiled-production checks** and **21 hotfix checks**, including original owner/key backup restoration, validation heap exhaustion, interrupted validation and the continuing compressed observer. The browser screenshot was inspected.
- **14 exact-artifact checks on the inhabited tick-228436 backup**, using a disposable 454,299,648-byte filesystem with the live starting non-WAL footprint. All original inhabitants, identities, receipts, prior history, both archives and clock debt survive handover and restart. Minimum sampled free space was 43,552,768 bytes; maximum WAL was 108,957,552 bytes. This local quota test does not reproduce live I/O or the live memory limit.
- A separate **16 MiB destination-full probe** fails safely after initial capacity was consumed concurrently, retaining the source and prior backup. Six interrupted native-copy workers release their source readers without corruption.

The copy-only revision also passed a 126-test model/server run before the writer correction. That earlier run is not presented as a complete final-code run. The final checks above exercise the changed lifecycle; physical simulation source is unchanged. GitHub results belong to the pushed commit.

After activation, **another private preflight ran while the new live writer continued**, from 21:23:39 to 21:23:52. It copied tick 302356 and advanced only its disposable copy by 32 ticks. Health remained successful, and the actual world subsequently saved tick **303028** at 21:26:36. The bounded continuity audit retained all 21 prior session signatures, the agent/key binding, three receipts, the count of 69,997 prior journal rows, both archive checksum fields and all earlier interventions. The new release has equal before/after boundary checksums. This live read did not rehash every historical journal body; full archive verification was performed off-host.

The five-minute, 301-sample internal monitor recorded at least **69,763,072 bytes free**, maximum WAL **103,840,512 bytes** and maximum cgroup memory **999,903,232 bytes**. The historical OOM-kill count stayed at one, while memory-limit pressure counters increased. The external stream received three snapshots and 68 frames, with the one documented recovery regression and no new fault. Both diagnostic watchers ended. At **21:29:50**, health was successful at tick **303800**, with 26,602 seconds of retained clock debt. Samples do not bound unsampled peaks or establish permanent capacity.

## Artifact, backup and remaining work

- Runtime SHA-256: `900255cfc52e1b44c59255fcceeaf77ab9e9cd11b3537d9714b28a38f493a372`.
- Compatible dependency SHA-256: `0ca3efac2e32e64895e4f395f1919a966af1b18b017c12aaa088b491f2f0022e`.
- Independent tick-301940 backup: 258,719,744 bytes; SHA-256 `4fe473ebe318b62cea70e02007fda0dcaaa1f8f70d15b9489047c4d2eda45958`.
- Compressed copy: 70,758,706 bytes; SHA-256 `6d000aa51196b4a32305e9d541fccac1e78f55fa72b8f5dbbb71985f01c248c1`.

Independent decompression verified SQLite integrity, metadata, all 38 regions and both complete archived world bodies. Native copying retains SQLite's existing page footprint; it is not compaction. The backup was streamed off-host from scratch space, with no raw copy staged on the small data volume.

The website bundle remains Vercel `dpl_CSVR78ah5Q5UUGmabnfeEGVqsvQd`; its observer uses the corrected Railway runtime. Runtime hotfixes do not replace the container image's maintenance executable. The [hosting guide](../hosting.md) identifies the separately installed current backup helper.

One full-world transaction still needs headroom, and every resident region is serialized. Compressed/incremental persistence, archive capacity, total memory and installed monitoring remain open work before larger migrations or populations. The [collapse investigation](../research/community-collapse-2026-10-08.md) establishes care and allocation defects that this infrastructure release does not fix. The planet still contains zero people, 407 births and 1,639 historical deaths; no new renewal, law migration or clock reset occurred.
