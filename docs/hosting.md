# Operate one continuing world

The website and world have different lifetimes. Vercel serves the browser assets and forwards `/api/*` and `/mcp` to one persistent Railway service. The simulation and SQLite database never run in a Vercel function.

## Railway service

The repository includes `Dockerfile`, `.railway/railway.ts`, and a local `compose.yaml`. The container builds the client and server, removes development dependencies, and starts Node 22. Its entrypoint gives the mounted `/data` directory to the unprivileged runtime user before starting the application.

Create **one service and one persistent volume mounted at `/data`**, attached to that service and environment. Use one replica and keep server sleeping disabled. Do not deploy multiple independently ticking replicas against the same world or clone the database into another publicly active world.

Set the service variables:

| Variable | Value or purpose |
| --- | --- |
| `PRAXANS_DB` | `/data/praxans.sqlite` |
| `WORLD_SEED` | Initial generation seed; ignored after a world exists |
| `SERVER_ORIGIN` | The service's generated HTTPS Railway origin |
| `PUBLIC_ORIGIN` | The browser site's HTTPS origin; initially the Railway origin can serve the same built client |
| `TRUST_PROXY` | `1`, behind the hosting proxy |
| `PRAXANS_RELEASE` | Unique identifier for the deployed code release |
| `PRAXANS_RELEASE_NOTES` | A factual description recorded in the public intervention history |
| `PRAXANS_REQUIRE_EXISTING_WORLD` | Set to `1` after the first successful world creation; missing state then stops startup |

`NODE_ENV=production`, `HOST=0.0.0.0`, and `PORT=8080` are container defaults. Production ignores manual test controls. `/api/health` is the configured deployment health check; Railway's healthcheck hostname is accepted only for that route.

The Railway TypeScript configuration describes the existing `world` service, its `world-volume` attachment at `/data`, one awake replica, Docker build, and health check. It preserves values already stored by Railway rather than committing operator variables. The application enforces the presence of its existing world through `PRAXANS_REQUIRE_EXISTING_WORLD=1`. The SDK version is pinned because its IaC API is still evolving. On a new project, deliberately initialize the variables and configure that project's names, region, volume size, and domain before applying; the checked-in configuration identifies the existing Praxans service.

After linking the project/service with the Railway CLI, preview and apply configuration changes, then deploy the repository:

```sh
railway config plan --out /tmp/praxans-hosting-plan.json
# Review the plan, including the preserved volume attachment and variables.
railway config apply --plan /tmp/praxans-hosting-plan.json --yes
railway up --service world --environment production --detach
railway deployment list --service world --json
railway logs --service world --lines 100
```

Do not approve an imported plan that removes the database volume or environment variables. The legacy `railway.json` format is no longer used here. An environment still explicitly managed by a Config File path must use Railway's documented migration procedure before IaC can manage it; do not clear a working configuration without a reviewed replacement and a backup.

Railway's current configuration import omits some effective defaults, so a later plan can repeat the explicit sleep/restart settings. Check the effective deployment manifest before treating that as a real change. The live manifest must show one replica, `sleepApplication: false`, and `/data` in its volume mounts. The application's expected-world safeguard remains necessary; a declared mount alone does not prove that the intended database is present.

A volume-only operation must also have no service deployment effect. The October 9 resting-demand preparation rejected a resize plan that would redeclare imported defaults and redeploy the service. Its narrower plan retained both existing resource identities and changed only `sizeMB`. When using a private authoring copy, pin `--source-tree` to the reviewed committed `.railway/` tree; a file-content fingerprint is not that Git tree.

**Verify the provider operation and actual filesystem after apply.** For that preparation, the CLI printed “Applied pinned Railway configuration,” but `environmentPatches` recorded **FAILED** with “Max size of 500 MB on current plan.” The workspace's `HOBBY` label did not establish a paid entitlement: the project's `subscriptionType` was `trial`, and `subscriptionPlanLimit.volumes.maxSizeMB` was 500. Neither the volume API nor the mounted filesystem grew. Read the project's effective limits before planning capacity. After a confirmed entitlement change, generate and review a fresh volume-only plan, then verify the provider result and mounted capacity before migration. Retain failed operations; another mutation cannot resolve an unchanged plan limit. The [release record](releases/resting-demand-0.2.md) gives current status.

Check health and the attached volume after the first successful launch. Then enable `PRAXANS_REQUIRE_EXISTING_WORLD=1` and leave it enabled for subsequent releases. This separates intentional first creation from accidentally starting against an empty or wrong volume.

A volume-backed redeploy can briefly stop the process. The next process loads the same checkpoint and computes missed ticks. The lease prevents overlapping owners; an interrupted process may require up to thirty seconds for its lease to expire. The entrypoint waits up to 35 seconds for ordinary lease expiry, avoiding rapid restarts that exhaust a host's retry allowance. If a different owner keeps renewing, startup fails; it never clears that owner's lease. The configured health-check window includes this delay.

## Vercel website

The client has no embedded model keys or database credentials. Set **`WORLD_SERVER_ORIGIN`** as a build-time variable to the Railway HTTPS origin. The build emits the Vercel Build Output API directory with external routes for `/api/*` and `/mcp`, followed by static assets and the application fallback.

```sh
WORLD_SERVER_ORIGIN=https://your-world.up.railway.app npm run build:website
vercel deploy --prebuilt --target preview
```

Alternatively let Vercel run the configured `npm run build:website` command with that environment variable. Use `--target preview` explicitly for a preview: Vercel can assign the first deployment of a new project to production even without `--prod`. Subsequent production releases should be an intentional choice.

Set the Railway service's `PUBLIC_ORIGIN` to the exact deployed website origin. If a later preview receives a different URL, update the origin or use a stable approved website domain. A public observer site and external agents need a deployment that is accessible without team-only preview authentication; configure that only for this intended public project. Direct Railway access remains available through `SERVER_ORIGIN`.

The browser retains its last view during a network or proxy interruption. The observer recovery correction explicitly retries a permanently closed EventSource, with backoff capped at thirty seconds, and receives the current snapshot; native retries handle ordinary stream interruption. Changing regions or returning to the planet cancels obsolete retries. See [tested behavior and publication status](releases/region-checkpoints-0.2.md); the preceding client failed to recover during an actual container replacement. Pausing the browser never pauses the server.

## Inspect and back up

The database contains the world, agent ownership, session records, receipt deduplication, clock checkpoint, and history. Copying only the main SQLite file while it is live can miss WAL data. Use the consistent online backup command:

```sh
PRAXANS_DB=/data/praxans.sqlite node dist/server/maintenance.js inspect
PRAXANS_DB=/data/praxans.sqlite node dist/server/maintenance.js backup /data/backups/before-hotfix.sqlite
```

Run these inside the Railway container, for example through its SSH facility. Locally, the equivalent commands are `npm run world:inspect` and `npm run world:backup -- <new-file.sqlite>`. Inspection refuses a missing file; backup refuses to overwrite an existing destination. Both check/use existing state without creating a universe. Backup requires Node 22.16+ and copies through SQLite’s online backup API in 128-page batches, releasing the source read transaction between batches. It stages a private file on the destination filesystem, then publishes the completed copy with an exclusive hard link and syncs the containing directory. Use a server filesystem that supports these operations.

**Current live container caveat:** the runtime hotfix does not replace `/app/dist/server/maintenance.js` from the older image. The corrected helper installed for `checkpoint-copy-20261008-1` is `/data/incoming/incremental-backup-20261008-1-tools/maintenance.mjs`; use that executable for live copies until a compatible container refresh installs the new build. The current small data volume lacks room for another raw database, so create the copy at a unique path in `/tmp`, stream it off-host, and independently verify it. The `/data/backups` example below applies only where that extra capacity has been demonstrated. The [release record](releases/checkpoint-copy-0.2.md) retains the failed copy-only attempt and successful corrected-writer validation.

For example, after configuring your own Railway SSH identity:

```sh
railway ssh --service world --identity-file /path/to/your/key -- node dist/server/maintenance.js backup /data/backups/before-hotfix.sqlite
railway volume files --volume world-volume download /backups/before-hotfix.sqlite ./before-hotfix.sqlite --json
PRAXANS_DB=./before-hotfix.sqlite node dist/server/maintenance.js inspect
```

The volume file API uses paths relative to its mount: `/backups/...` corresponds to `/data/backups/...` inside the container. Store the downloaded file outside version control; it contains ownership and world state.

Store durable backup copies outside the service volume as well. A retained volume and the in-database migration archive are not independent protection against losing that volume. Host snapshots or an operator-managed backup schedule should cover the chosen retention period; this code does not configure an external backup service automatically.

Allow temporary disk and memory headroom for the online backup, migration archive, WAL and candidate preflight copy. On a small volume, retain verified compressed backups and independent full copies instead of accumulating redundant raw files. Verify the decompressed SHA-256 and independent copy before removing only a redundant backup representation. Never remove or compress the active SQLite file in place. A healthy current checkpoint does not by itself prove that enough capacity remains for the next update. Losslessly repacking existing archive blocks can make pages reusable without changing historical bytes or storage compatibility. It is still a database write under the sole writer and needs a verified backup and a real migration/checkpoint capacity trial. Denser packing postpones capacity exhaustion; it does not establish room for another population tier or indefinite full-world archives.

The October 8 renewal exposed both limits on the 1 GB / 500 MB service: a heavy archive read coincided with an OOM worker restart, and backup staging plus retained WAL exhausted disk space. Read-only inspection can still consume substantial memory. Inspect bounded SQL identity/count fields on the host; perform full archive/state verification on an independent backup. Create large backups in container scratch space and stream them off-host when the data volume lacks proven headroom. Scratch files are not a durable off-host backup.

`journal_size_limit=16777216` limits retained reusable WAL after checkpoint/reset; active transactions and readers may exceed it. A held reader can temporarily retain several checkpoints' writes. Incremental backup copying permits checkpoints between its batches; it does not cap one large write transaction or guarantee progress under continuous external writes. A copy has a 60-second deadline, cleans its unpublished staging files on failure, and requires initial free space for the source page footprint plus 4 MiB. This check is not a storage reservation: concurrent allocation can still fail the copy. Async callers must await completion before closing the source connection. Monitor database, WAL, scratch and total cgroup memory together. If necessary, `PRAGMA wal_checkpoint(TRUNCATE)` asks SQLite to reclaim checkpointed WAL; inspect its busy/result status and never delete a live WAL manually. The transaction wrapper preserves the original disk/I/O error if SQLite already rolled back. A runtime halted by a storage failure still needs recovery after its cause has been corrected; there is no automatic capacity expansion or fault-resume policy.

The [later storage recovery](validation/storage-recovery-2026-10-08.md) reclaimed 174 MB of WAL without changing the saved checksum or clock, verified an independent backup and restarted only the confirmed halted runtime. Thirty-two uncommitted ticks were recomputed. A subsequent healthy interval does not establish safe copy-reader overlap or permanent capacity; confirm the persisted checkpoint and retain the failed continuity evidence before resuming.

Before each world transaction, the writer requests `wal_checkpoint(RESTART)`. Merely closing a reader does not retry a delayed automatic checkpoint: without this boundary, the next large save can append another complete batch before its commit attempts checkpointing. A busy restart defers the transaction before its callback. The clock then retries that exact computed state before advancing more ticks; observation remains available. `waiting-for-storage`, `acceptingProposals: false` and `503 WORLD_STORAGE_BUSY` distinguish this temporary wait from a halted simulation. Existing committed receipts still replay. The existing five-second SQLite busy timeout bounds each attempt, followed by a 250 ms retry delay. This is not automatic recovery from arbitrary I/O, capacity or model failures.

The production smoke test creates an online backup, stops its disposable source, waits for the copied ownership lease to expire, and actually resumes the backup with the original browser owner and agent key.

## Hotfix procedure

During active development, publish meaningful verified increments regularly instead of collecting hours of completed work into one release. Aim for a 15–30 minute release review when work is ready; an independent browser fix need not wait for a long ecological experiment. State the actual active website/runtime release and distinguish deployed changes from candidates still under test. A cadence target never overrides a failing continuity or conservation check.

Ordinary runtime hotfixes can use the stable production gateway without replacing the host container. Build and verify the candidate first, then prepare a unique immutable artifact:

```sh
npm run build
npm run hotfix:prepare -- unique-release-id "Factual changes and their limits." dist/hotfix
```

After the consistent backup and offline validation, upload that directory to an unused staging directory. The gateway service user must be able to traverse/read that private directory; SSH uploads made as root retain root ownership unless explicitly assigned to the service owner. Keep private permissions and verify the exact runtime hash. On the small live volume, use `/tmp` staging to avoid a second incoming copy on `/data`; activation still installs the immutable artifact under the durable runtime directory. The following volume-staging example applies only when that extra space has been demonstrated:

```sh
railway volume files --volume <volume-id> upload dist/hotfix /incoming/unique-release-id --json
railway ssh --service world --identity-file /path/to/your/key -- node dist/server/hotfix.js /data/incoming/unique-release-id
railway ssh --service world --identity-file /path/to/your/key -- node dist/server/hotfix.js --status
```

The operator endpoint is a local Unix socket with mode 0600, never a public HTTP route. The gateway checks the artifact's SHA-256, Node major version and installed dependency fingerprint. It validates migration and forward simulation on a private consistent copy while the old world continues. It then drains requests, retains arrivals, saves/stops the old owner, starts the candidate and switches the durable active-runtime pointer. Existing compressed observer streams keep their connection and resume with a fresh snapshot. Requests retain their idempotency receipts.

The work-planning candidate runs validation in an owned worker thread inside the disposable candidate process, with 192 MiB old-generation and 16 MiB young-generation settings. It verifies the effective heap limit before loading the world, including when host V8 flags would override ordinary worker options. Heap exhaustion or cancellation rejects the candidate and removes its private copy; the continuing owner is not moved. This bounds the JavaScript heap, not SQLite/native buffers, file cache or total service memory. Larger worlds and migrations still require measured headroom. Production simulation does not inherit these validation-only limits.

An invalid candidate leaves the active runtime in place. An interrupted handover retains a durable pending pointer. Missing referenced artifacts and dependency mismatches fail closed; they never choose an older binary silently. Automatic fallback is allowed only when a failed candidate did not change the checkpoint compatibility fingerprint: world checksum, storage version, SQL schema and ordered regional checksums read in one transaction. This is not a full archive or payload integrity scan. During handover or unavailable recovery, health promptly returns HTTP 503 with Retry-After and refuses to describe the runtime as ready. Shutdown terminates preflight children as well as the active owner.

This path handles simulation and API changes with the same installed dependencies. Gateway changes, dependency/runtime upgrades, host maintenance and volume failure need a prepared container/platform operation; a single host cannot make those failures invisible. Installing the gateway itself requires one normal deployment. Keep the active artifact and its compatible dependency set through future container upgrades; do not assume an uploaded container automatically replaces a persisted runtime pointer.

1. Reproduce the issue with a disposable world or an isolated backup, not by advancing the live world with test controls.
2. Make the correction. For a saved-state change, bump `WORLD_VERSION` and register its transformation in `src/server/migrations.ts`. For changed physics, also version the law set. Keep old generators available for worlds pinned to them.
3. Run the relevant model, server, production, and browser checks. Demonstrate that the old state resumes with the same tick, inhabitants, ownership, and conserved matter, apart from an explicitly documented physical intervention.
4. Take a consistent backup. Preserve a copy outside the live volume.
5. Give the code release a unique identity and factual notes. Activate the verified runtime artifact, or deploy a required container change to the **same service, environment, and volume**. Retain the expected-world safeguard.
6. Check health, tick progression, conservation measurements, and the recorded intervention. Routine runtime replacement should retain the same browser stream, camera, community and agent keys.

Registered migrations validate the candidate state and atomically store the transformation, exact pre-migration snapshot, and before/after metadata checksums. Each region has its own checksum. Unknown formats, incompatible laws, missing expected state, and invalid ledgers stop instead of triggering a reset.

Physical community renewal uses a private `runtime/intervention.json` beside the database, validated by `src/server/intervention.ts`. It names the exact world/seed, existing empty community IDs, new population, finite supplies, plant tissue/propagules and a reason. Stage it only as part of an authorized, backed-up operator release. Startup applies it atomically after the law migration and before resuming the clock. Its request digest, before/after checksums and measured boundary arrivals become permanent records. Repeating the exact request is a no-op; reusing its ID with different contents fails. No HTTP or MCP route exposes this power.

Preflight exercises registered law migrations, including their real archive writes, on its consistent private copy. New archives use compressed 256 KiB blocks with individual and complete-original checksums; the exclusively owned loaded object migrates in place. A current-format save creates no new archive. A pending operator renewal still skips its redundant rollback clone only inside the disposable preflight; real startup commits that intervention transaction. Neither path rewrites the source database or operator request. Budget both memory and temporary disk for the candidate while the old owner is running. SQLite-managed checkpointing can reclaim a WAL when no reader/writer prevents it; a busy result is not permission to delete WAL files manually.

SQLite storage version 1 is separate from the physical world format. Body maintenance advanced the latter to format 10 / biosphere-1.4; the live ration-boundary release advances it to format 11 / biosphere-1.5. The live funded-metabolism release advances physical state to format 12 / biosphere-1.6 at tick 363208; its [release record](releases/funded-metabolism-0.2.md) preserves backup, handover and archive verification. The [local inventory/access release](releases/food-custody-0.2.md) advances physical state to format 13 / biosphere-1.7 at tick 378536. The live [region-checkpoint release](releases/region-checkpoints-0.2.md), activated at tick 399368, advances only storage to version 2. The additive archive-schema migration preserves old plaintext rows exactly and commits before any physical migration. If physical migration later fails, the old world/history remain but the storage schema may already be upgraded. Unknown versions or incompatible archive columns/keys fail before journal/schema changes. The earlier format-9 runtime ignores these added storage columns but cannot resume format 10; likewise, the format-10 runtime cannot resume format 11, the format-11 runtime cannot resume format 12, and the format-12 runtime cannot resume format 13. The deployed gateway now includes storage version, schema and ordered regional checksums in its fallback decision. A committed storage-2 candidate cannot automatically fall back to the old storage-1 runtime, even when world metadata is unchanged. Forward recovery must use compatible code.

Region storage version 2 upgrades its schema and encoded rows inside the existing owner's save transaction, preserving original regional bytes and checksums. Its Zstandard reader is required for full region inspection. The current gateway image still contains a storage-1 maintenance build: native backups remain encoding-agnostic, but inspect a storage-2 backup off-host with a compatible new helper. Runtime hotfixes do not replace maintenance executables in the container.

The current maintenance source lists archive descriptors without loading their bodies. `PRAXANS_DB=/path/to/offline-copy.sqlite node dist/server/maintenance.js verify-archives` verifies full original bytes; it refuses an unexpired world lease. Compressed input and decompressed output are bounded per block. Legacy plaintext rows in older backups still require substantial memory and must be verified off-host. This new maintenance build is local until a compatible container/tool installation; the separately installed native-copy helper above remains valid for consistent backups. Before a physical migration, the live ration-boundary loader losslessly converts existing plaintext archives to the already supported block encoding. It verifies every stored block and the complete original checksum before committing each conversion, retaining archive identity/date and original bytes when expanded. These independent conversions can remain if later physical migration fails, and the preceding storage-v1 runtime can still read them. Freed pages become reusable; the database file does not shrink. Ordinary full-region saves still require their own large WAL. See the [ration release](releases/ration-boundary-0.2.md) and [archive release](releases/archive-blocks-0.2.md) for measured capacity and limits.

For an upgrade check on the archived empty format-7 world, `npx tsx scripts/verify-upgrade.ts <offline-backup.sqlite> 288 <report.json>` creates its own disposable copy, verifies checksums, archives, retained rows and inventories, advances three simulated days under the current laws, and checks an exact save/reload. Its field comparisons reflect those registered migrations; extend them for any later state transformation rather than treating the helper as a universal migration contract. It never advances the service database. Set Railway release variables with `--skip-deploys` before uploading their matching code so the preceding binary does not record a release intended for a later law set.

## Recovery and capacity

For a process fault, preserve its files and examine the logs and `/api/health`. A catching-up world may temporarily reject decisions while remaining observable. Do not erase a backlog by overwriting the clock: it represents real consequences still to be computed.

For restoration, stop the sole world process, preserve the damaged state for diagnosis, and restore a verified backup into the same data path, including its associated identity and ownership tables. Do not copy live `-wal`/`-shm` files from a different database generation. Let the backup's lease expire and start compatible code with new-world creation disabled. Restoration is an operator recovery action and can rewind to the backup's time; it should be recorded and communicated.

Do not blindly roll back application code after a data migration. The old binary may not understand the new save. Prefer a forward repair; otherwise use an explicitly planned compatible restore.

Current limits are one process, all materialized regions resident, 100 simultaneous observer streams, finite request quotas, and finite hosting CPU/storage. Monitor lag, memory, disk growth, and backup retention before admitting a much larger population. Hosting plan limits and credits can also stop a service; the application cannot guarantee perpetual hosting independently of its provider.

The format-13 live handover preserved the observer connection and exact clock, but an ordinary `/api/health` request timed out after 15 seconds while the new worker performed archive/migration startup. The gateway currently queues that request with other ordinary requests. Six subsequent local and six public health samples passed; this does not erase the handover latency failure. Reduce blocking migration work and define truthful gateway readiness before claiming uninterrupted HTTP responsiveness. Its sampled disk minimum was only 5,836,800 bytes: another update requires a fresh actual-world capacity assessment.
