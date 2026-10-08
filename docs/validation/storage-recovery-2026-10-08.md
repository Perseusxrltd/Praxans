# Recovery of the second work-planning storage halt

The same runtime is advancing again after a second `SQLITE_FULL` halt. This is an operational recovery, not a new code release or a permanent capacity fix. The [measured record](storage-recovery-2026-10-08.json) retains the failure, backup, checkpoint operation, continuity comparison and finite observation window.

## What failed

The work-planning runtime halted at **19:45:59 UTC**, approximately three minutes after activation. Its health response reported tick **291124**; the last committed checkpoint was **291092**. At diagnosis, the 454,299,648-byte filesystem had only **4,096 bytes available**, with a 258,719,744-byte main database and 174,370,816-byte WAL.

This is separate from the earlier preflight-copy failure at 19:42:54 and from the human extinction, which had already happened. Log exhaustion is established. The observations do not identify which concurrent read prevented WAL reuse during this second failure. Full-region saves and a constrained volume make even short reader overlap consequential; the idle state after an error does not reconstruct that overlap.

## Preserve and resume

At **20:19:17 UTC**, SQLite's own `wal_checkpoint(TRUNCATE)` succeeded with `busy: 0`. The logged frame count was already fully backfilled. Available space rose to **174,379,008 bytes**, while the saved world checksum, tick and wall-clock checkpoint remained identical. No WAL was manually deleted and no database was replaced.

A consistent backup of tick **291092** was then made in container scratch space and streamed off-host. Independent decompression verified:

- Raw SQLite: **226,304,000 bytes**, SHA-256 `55e7c89e349b46809a6f0a6e2fa2d28b20343fca483ffa9d120e9eaf84275bd7`.
- Gzip: **61,212,127 bytes**, SHA-256 `6459ea919ed35b26c183fdc24ba2d6f22faa6b5600b559c386d8402cd11c642f`.
- SQLite integrity, metadata, all 38 regions, both complete archived world bodies and the matching clock passed verification on the independent copy.

At **20:24:04 UTC**, the confirmed halted child received `SIGTERM`. Its existing fault-aware close path skips saving failed in-memory state and closes its lease. The continuing gateway launched the same current artifact. The **32 uncommitted ticks were recomputed from the saved checkpoint**; the clock debt was retained. This is recovery after a visible fault, not seamless or uninterrupted time.

At saved tick **292948**, the bounded continuity comparison retained world identity, generation, format 9, biosphere-1.3, all 18 sessions, the agent's identity/key binding, all three receipt identities, the count of 69,845 prior journal rows, both stored archive checksums and every intervention record. Clock arithmetic matched exactly. The sole runtime was PID 966; the historical OOM-kill counter stayed at one. This check compares bounded signatures and counts; it does not claim to rehash the full journal on the live host.

## Observed limit

All **21 health samples**, from **20:25:53 to 20:31:27 UTC**, passed while the world advanced from tick **291636 to 293208**. Sampled ticks were monotonic. Reusable WAL repeatedly returned to 16 MiB; minimum sampled free space was **74,182,656 bytes**. Memory remained close to the host limit at times. The record contains sampled values, not a guarantee about unsampled peaks.

The watcher has ended; it is not an installed monitor. The runtime remains `work-planning-20261008-2`, SHA-256 `05af5a6275f6ab8430a1d848983cc4007922a7c2c6bcf519ca8dd18baa656d2d`. The website bundle is unchanged. Capacity-safe backup/preflight copying, bounded persistence and operational monitoring remain necessary. Reclaiming space and restarting the current code cannot certify future hotfixes as seamless.
