Original prompt: let's rebuild the whole game, from the ground up, as an internet browser game, where people can plug their agent (any, from codex to grok bot or hermes) and they can just watch their mini autonomous civilisation grow. it's like watching plants grow... but it's a real civilisation simulation, as pushed as we possibly can.

## Accepted direction

- One persistent shared world: observe or connect a model-neutral HTTP/MCP agent to a small human community. Everyone's communities coexist; inhabitants continue without their agents.
- Fixed, inspectable natural constraints and coupled processes. No building recipes, compulsory technology tree or unlimited matter.
- An old Earth-like planet, star and moon, immense frontier, varied ecosystems, material elements, weather, tectonics, seasons, day/night, age and entropy.
- Preserve the same world through recorded interventions. Vercel hosts the observer; one Railway service and volume own the clock and database. Compatible runtime hotfixes must retain observation and ownership.
- Eight founders is provisional, not proven multi-generation viability. An extinct community's owner may explicitly begin anew in wilderness while retaining its history.
- Agent influence develops through earned trust and local institutions; inhabitants can refuse. Success has several dimensions. Diplomacy depends on contact, information, consent and physical journeys.

## Recovery release — 2026-10-08

The previous format-7 / biosphere-1.1 runtime halted at tick 20276; its last valid saved checkpoint is **20244**. Four historical communities remain, with no living people or animal cohorts and **132 surviving plant cohorts** (6.3319 kg organic tissue). The biochemical guard tripped on accumulated rounding error. Earlier overheating and fragile plant/food mechanisms caused the preceding ecological collapse. Never reset the database, reseed, restore an earlier live state or erase clock debt to recover it.

The deployed release **world-recovery-20261008** is format **8** / **biosphere-1.2**. It adds compensated energy/atmosphere accounting, funded atmospheric radiation, conservative exchange with finite planetary thermal bands, ice/snow separation, corrected small-plant growth and structural turnover, finite parent-funded dormancy and usable urgent food. It preserves historical deaths and starts empty seed banks because no earlier propagule history was represented. See `docs/validation/recovery-2026-10-08.md` for the causes, rejected candidates and limits.

This release also includes landscape/fabric aging, repair/salvage, exact material geometry, functional personal memory/learning/sleep, locally deliberated advice, plural progress, carried diplomacy and explicit owner-led rebeginning after extinction. The stable HTTP/SSE gateway validates immutable compatible candidates on copied checkpoints, drains/queues requests, hands off the sole lease and persists active/pending runtime pointers. It retains compressed browser streams. Host, gateway, dependency or volume failures still require platform operations.

**Current local validation:** 85 model/server tests, 40 browser checks, 12 compiled-production checks, nine extinction checks and 17 runtime-hotfix checks pass. Build and formatting pass; current browser screenshots and supplied game-loop output were inspected, with no browser errors. The hotfix checks include invalid candidate rejection, one release record, retained camera/connection/key, a full gateway restart and shutdown during preflight without an orphan.

The actual incident backup migrates with zero inventory changes and advances **3,000 ticks** (31.25 days), with exact reload at **23244**. It retains **58 plants**, 3.1717 kg tissue and no people/animals; final temperatures are −1.24 to 4.16°C. Its approximately 2.02 kg oxygen residual was inherited, not erased. The **400-day** seasonal trial retains 11 plant lineages and 3,192 dormant cohorts, with temperatures −11.92 to 27.49°C. Biomass falls substantially; neither trial proves ecological equilibrium or multi-generation human survival.

Fresh backup `before-recovery-release-20261008.sqlite` is byte-identical to the validated incident backup: **a8bbb992dfbfbc5866490479d71294e787e088f138108b7e0473d577b2dbeeed**, 47,329,280 bytes. Local/remote gzip copies and a local raw copy passed integrity, metadata and region checksums. Older backups also passed fresh comparisons against independent raw copies and are retained compressed on the volume. Only redundant raw backup representations were removed; the live database remains intact. About 189 MB was free afterward.

**Deployed and verified:** Railway `7c495f78-0d04-4e90-8994-91747e8a71de` is SUCCESS on the original service/volume. Vercel production `dpl_2ataP7vjjr8HNy1huS4fiReBp4dV` is READY. The live inspection at tick 22740 verifies the exact original full-world archive, unchanged community/ownership/agent/receipt signatures and precise clock arithmetic. Later health at tick 23136 remained healthy with a shrinking 47,592-second backlog. The host needs hours to compute missed time; observation remains available while new founding/advice waits. The service has not finished catch-up or restored its extinct populations.

Implementation commit `64d4b76` is pushed to `codex/praxans-browser`; independent push and pull-request GitHub CI both passed. The actual source matches the clean deployed staging manifest. Provider IDs, continuity samples and limits are in `docs/releases/world-recovery-0.2.md`. Subsequent evidence-only documentation changes do not alter the deployed runtime. Keep draft PR #1 current without merging or changing the default branch.

The latest live ecological inspection at **09:00:57 UTC**, tick **61908** (**434 simulated days** after the repair), confirms recovery from 6.332 to **142.250 kg** of growing plant tissue, plus **267 dormant cohorts** containing **28.236 kg**. Original ownership, keys, receipts, archive and clock arithmetic remain intact, with three additional observer sessions. No people or animals were resurrected; approximately 42,140 seconds of debt remains. See `docs/validation/live-recovery-434-days.json`. This is stronger actual-world recovery evidence, not a claim of indefinite equilibrium.

## Hosting and continuity

Website: **https://praxans.vercel.app**. Railway world: **https://world-production-8384.up.railway.app**, `/data/praxans.sqlite` on its existing volume. Keep `PRAXANS_REQUIRE_EXISTING_WORLD=1`, one replica and sleeping disabled. `.railway/railway.ts` preserves operator values and the existing volume. Never apply a plan dropping either.

Backups, databases, credentials, provider links, generated screenshots and local validation logs remain outside Git. `docs/hosting.md` describes backup, hotfix and restoration procedures. The foundation release and historical validation remain in `docs/releases/browser-foundation-0.1.md` and the clearly labeled historical section of `docs/validation/README.md`.

## Ongoing scope

The canonical implementation ledger is `docs/roadmap.md`; the agency contract is `docs/agency-and-diplomacy.md`. Every accepted requirement must remain tracked, with implemented approximations separated from planned depth. The broad rebuild goal remains active.

Only materialized regions run detailed ecology. Planetary thermal bands represent heat continuity, not a complete global fluid, water, mineral or ecological system. General chemistry, microbial life, animal resting stages, durable language/writing, open-ended speciation, multi-generation genetic viability, larger-world scheduling and recoverable player accounts remain unresolved. Do not imply that functional cognition is cellular neuroscience or that all life necessarily survives.

Future changes must preserve current history and use causal tests, seasonal/generational ensembles, explicit migrations, independent verified backups and recorded interventions. The active TypeScript runtime is in `src/simulation/`, `src/server/` and `src/client/`; Python/Pygame remains historical reference.

## Community following released — 2026-10-08

The user requested better community following, discovery and lasting histories. Commit **2ff6c1e** adds the searchable lifecycle directory, browser-local following, followed-community journal scope, indexed historical filters, dated lifecycle records and explicit branch/later-chapter links. The implementation is format 8 / biosphere-1.2 observational work: no changed physical law, rewritten history or reset clock. Accounts, cross-device following, notifications, territorial inheritance and ruin reoccupation remain in the requirement ledger.

Both independent GitHub runs passed: **87 model/server tests, 40 browser checks, 22 community/extinction checks, 12 compiled-production checks and 17 hotfix checks**, plus build/format. Thirteen targeted local tests, the supplied game loop and inspected desktop/mobile screenshots also pass. A disposable copy of the actual 38-region backup retained its compressed connection through a runtime replacement.

A fresh consistent backup at tick **78836** is independently verified, raw SHA-256 **d45a9a6eac0178ed4b1a2d27cca1406e5bb97cb7192765f0d19b101f2d5bdf2f**, 98,598,912 bytes. A verified 30,120,336-byte compressed copy remains on the volume and locally; the independent full copy remains local. Only redundant/partial representations were removed.

The compatible runtime **community-records-20261008** is active in the same Railway container: unchanged gateway process, new sole runtime, durable active pointer and no pending pointer. Release tick **82900** has identical before/after state checksums. At tick **87380**, every prior community, 12 sessions, agent, three receipts, 2,028 journal records and the original archive match; the clock advances exactly 8,544 × 250 ms from the backup. Four public community histories match their recorded deaths. About 38,761 seconds of clock debt remains. Plant tissue has reached roughly 3,213 kg naturally; no people or animals were respawned.

Vercel **dpl_Bvs29UugvLY47yFvnNRm8Xjj2Noy** is READY and aliased to **https://praxans.vercel.app**. An existing tab needs refresh to load the new controls. The user has been told publication is complete.

**Remaining transport verification:** the external compressed observer disconnected during live handover, and the operator SSH command lost its final reply. Status, the durable pointer, an idempotent confirmation and the single release record prove the runtime became active; the gateway stayed alive and no memory failure occurred. The cause of the external disconnect is not established. Do not claim an uninterrupted live stream merely from the passing local tests. Details and artifact signatures are in `docs/releases/community-records-0.2.md` and `docs/validation/community-records-continuity.json`; W13 tracks the limitation. A fresh two-minute external compressed probe passed with 72 frames and ticks 88652 → 89704, without error. Preserve that distinction and do not add live interventions solely for testing. Implementation is committed/deployed; evidence and draft PR #1 record the final release.
