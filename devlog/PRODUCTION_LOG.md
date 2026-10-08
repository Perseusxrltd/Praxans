# Production Log

> **Purpose**: Chronological chronicle of every significant development event.
> Newest entries first. See `AGENT_GUIDE.md` for formatting rules.

---

## Log

### [2026-10-08] Reuse Checkpoints Before Writing and Bound Backup Readers

- **type**: bugfix
- **systems**: world_storage, runtime_handover, agent_gateway, browser_validation
- **files**: `backup.ts`, `store.ts`, `app.ts`, `preflight.ts`, `worker.ts`, `checkpoint-copy-0.2.md`
- **agent**: Codex

Reproduced disk exhaustion after a reader had already closed: a delayed automatic checkpoint was not retried before the following large transaction. Added pre-write WAL restart, explicit storage-busy replies and retry of the exact pending checkpoint before advancing time. Shared native online copies release their readers in bounded batches, handle cancellation/deadline and publish complete files exclusively. Node 22.16+ is now required. → ADR-032.

The initial copy-only attempt passed short validation but the old writer halted after copying; its upload failed and it was never activated. The corrected release went live at 21:21:53, recovering saved tick 301940 with 32 uncommitted ticks recomputed. Final lifecycle/production/hotfix tests, an inhabited backup under a live-sized quota, and a subsequent private preflight while the new live writer ran pass. Saved tick 303028 retains ownership, receipts, history checks, archives, renewal and exact clock debt. The five-minute monitor ended with no new OOM kill but continuing memory pressure. No population or physical-law change occurred; survival and capacity work remains open.

---

### [2026-10-08] Historical Collapse Reproduced and Care Defects Isolated

- **type**: audit
- **systems**: human_physiology, civilization_intelligence, settlement_space, community_history, browser_validation
- **files**: `community-collapse-2026-10-08.md`, `collapse-first-death-replay.json`, `collapse-mechanism-probe.mjs`, `collapse-habitat.json`, `roadmap.md`
- **agent**: Codex

Reconciled the 1,607 deaths after renewal, including all 407 children before age one. An exact historical replay from an independently verified inhabited backup reproduces the first infant death inside heat regulation, with accessible stock fiber but no caregiver wrapping path. Small finite-resource controls reproduce ration-order deprivation and the protection possible from existing fiber; no preserved world was altered.

Published the chronology, figure, source checks, narrow causal conclusions and remaining growth, metabolism, storage and connected-food questions. Updated survival and scale requirements while retaining H06 political freedom. The prior work-planning hotfix is live and its two GitHub CI runs pass; this study is not a claim that care/allocation defects are fixed or that another restoration is justified.

---

### [2026-10-08] Reclaimed Completed WAL and Resumed the Preserved Checkpoint

- **type**: infrastructure
- **systems**: world_storage, runtime_handover, world_hosting
- **files**: `storage-recovery-2026-10-08.md`, `storage-recovery-2026-10-08.json`, `hosting.md`
- **agent**: Codex

Detected a second disk-full halt after the work-planning handover. SQLite checkpoint reclamation recovered 174 MB without changing the saved world or clock; a new off-host backup passed full integrity, region and archive verification. Restarted the confirmed halted child under the same gateway/artifact, preserving committed state and recomputing 32 uncommitted ticks.

The bounded identity/clock comparison and all 21 later health samples pass through tick 293208. The temporary watcher ended. This restores operation but does not resolve copy-reader overlap, large save transactions or the small host's capacity limits; no new physical intervention or release was made.

---

### [2026-10-08] Feasible Work Published; Collapse and Storage Failures Retained

- **type**: bugfix
- **systems**: civilization_intelligence, world_state, civic_relations, browser_validation
- **files**: `engine.ts`, `citizens.ts`, `random.ts`, `construction-planning.test.ts`, `numerics.test.ts`, `roadmap.md`
- **agent**: Codex

Reproduced a preferred-design dead end and a shared-draw exclusion of new builders, then added authoritative alternative selection and conditional work sampling. Published `work-planning-20261008-2` at tick 290260 after 121 model/server checks, 21 hotfix checks and twelve exact-artifact handover checks on the inhabited backup. Bounded, owned validation rejects heap failure without moving the continuing owner. → ADR-030; → ADR-031.

The independent tick-228436 backup has 1,439 people and 239 births; a later live overview at tick 287132 has zero people, 407 births and 1,639 cumulative deaths under the preceding runtime. This is renewed demographic collapse, not successful long-term balance. Histories and the continuing planet remain intact; diagnosis precedes any new physical restoration.

Recorded the owner's free political/social emergence requirement as H06. The research review separates overlapping membership, custody, consent, scoped authority and communicated revocation; these remain subsequent mechanism work requiring explicit state migration and measured capacity.

The fresh tick-289492 backup is independently verified. During publication, candidate copying retained WAL while the old runtime saved, exhausting disk despite roughly 175 MB initial headroom. The new runtime recovered the last committed state; the continuing external stream showed a fault and 24 repeated ticks. At saved tick 291060, identity, clock arithmetic, ownership, keys, receipts and archive checksums remain, with no new OOM kill. The release record preserves this failed seamless-update criterion and required storage follow-up.

---

### [2026-10-08] Planet Return Preserves the Current Observation

- **type**: bugfix
- **systems**: browser_observer, browser_validation
- **files**: `main.tsx`, `startup-smoke.ts`
- **agent**: Codex

GitHub exposed a missing overview after reloading directly into observation. Home now derives its small planet view from the latest received snapshot and ignores older cached summaries for that world. Forty general browser checks and twelve startup checks pass, including held/stale responses, with inspected desktop/mobile screenshots. Vercel `dpl_CSVR78ah5Q5UUGmabnfeEGVqsvQd` is READY at the canonical website; the simulation runtime, clock and restoration are unchanged. See the follow-up in `docs/releases/observer-scaling-0.2.md`.

---

### [2026-10-08] Advisory Recovery and SQLite Retention Published

- **type**: bugfix
- **systems**: agent_gateway, civic_relations, world_storage, runtime_handover, browser_validation
- **files**: `actions.ts`, `app.ts`, `store.ts`, `server.test.ts`, `persistence.test.ts`, `AgentInvitation.tsx`
- **agent**: Codex

Activated `advisor-recovery-20261008-2` at tick 209364 in the existing Railway gateway. Advisory batches can enter the current logical tick during recovery without skipping clock debt; staging avoids cloning physical state and failed commits leave no partial proposal. Halted service has an explicit code, while committed receipts remain readable. SQLite limits retained reusable WAL to 16 MiB; active writes/readers can exceed that size. → ADR-029.

All 112 model/server tests pass locally, including failed-commit, stopped-service and held-reader/WAL regressions. Ten continuity checks on a fresh 1,200-person backup retain the compressed connection, keys, history, archives and clock. The live saved checkpoint subsequently advances to 210388 with exact clock arithmetic, unchanged archive checksums and no additional OOM kill. Website/provider evidence and subsequent CI results belong to the release record.

---

### [2026-10-08] Progressive Planet Entrance and Smaller Spectator Data

- **type**: feature
- **systems**: browser_observer, agent_gateway, runtime_handover, browser_validation
- **files**: `observer.ts`, `atlas.ts`, `types.ts`, `app.ts`, `main.tsx`, `PlanetWelcome.tsx`, `startup-smoke.ts`
- **agent**: Codex

Published `observer-scaling-20261008` and Vercel `dpl_26YvFNQz88tWZx7Z8DZ6Maxuqs3r`. The entrance uses a small overview and progressive atlas; local SSE starts on entering and closes on returning to orbit. Public projections omit large internal learning/seed data while preserving authoritative state. Eight startup checks, sixteen connection checks and a nine-check real-backup handover pass; screenshots were inspected. Cold atlas latency remains material. → ADR-028.

---

### [2026-10-08] Finite Renewal and Population-Scaled Survival

- **type**: milestone
- **systems**: world_renewal, human_physiology, settlement_space, material_geometry, natural_systems, human_cognition, world_storage
- **files**: `renewal.ts`, `intervention.ts`, `physiology.ts`, `subsistence.ts`, `movement.ts`, `settlement.ts`, `geometry.ts`, `economy.ts`, `migrations.ts`
- **agent**: Codex

At tick 195860, format 9 / biosphere-1.3 and the separate authorized intervention restored four historical communities with 300 new adults each. Earlier deaths, identities, ownership and archives remain. Cold protection, ice melting, clothing, provisions, ground travel, dormancy, stock decay and camp area share explicit material/energy/space constraints. General component search and distinct trial/construction evidence replace narrower assumptions. → ADR-026; → ADR-027.

The verified tick-204116 backup retains all 1,200, but housing remains scarce and reserves finite. Failed concentrated-camp and coupled seasonal trials remain recorded. A heavy live audit coincided with an OOM restart and visible checkpoint rollback; two disk-full incidents stopped saves. Independent backups and SQLite-managed reclamation preserved the world. No fauna restoration or multi-generation equilibrium is claimed.

---

### [2026-10-08] Planet Survey and Private Agent Handoff

- **type**: feature
- **systems**: planet_exploration, browser_observer, agent_gateway, browser_validation
- **files**: `PlanetExplorer.tsx`, `planet-survey.worker.ts`, `renderer.ts`, `AgentInvitation.tsx`, `exploration-smoke.ts`, `connection-smoke.ts`
- **agent**: Codex

Published a bounded, cancellable planet-to-cell geography survey with community visits and improved local rendering. Added one private copyable connection briefing with share-sheet, email-draft and manual-copy fallbacks. Seventeen exploration and sixteen connection checks pass, with inspected desktop/mobile screenshots and exact camera-only state preservation. A shared agent message remains a user-controlled action. → ADR-028; → ADR-029.

---

### [2026-10-08] Community Directory Published Without Replacing the World

- **type**: milestone
- **systems**: community_history, world_hosting, runtime_handover, world_storage, browser_validation
- **files**: `community-records-0.2.md`, `community-records-continuity.json`, `roadmap.md`, `progress.md`
- **agent**: Codex

Activated the compatible community runtime inside the original Railway container at tick 82900 and published the Vercel observer. Independently verified the fresh backup, all previous identities/ownership/events, the original archive and exact clock arithmetic. Both GitHub runs pass all 87 model/server tests and the browser, production and hotfix checks.

The external observer probe disconnected during handover; its cause is not established. The gateway/world remained healthy, and a compressed handover on a disposable copy of the actual 38-region backup passed. The release record and W13 distinguish successful world continuity from the remaining external transport verification.

---

### [2026-10-08] Follow Communities Through Their Lives and History

- **type**: feature
- **systems**: community_history, browser_observer, world_storage, agent_gateway, world_state, browser_validation
- **files**: `Communities.tsx`, `communities.css`, `Archive.tsx`, `main.tsx`, `app.ts`, `store.ts`, `community-record.test.ts`, `extinction-smoke.ts`, `communities.md`
- **agent**: Codex

Added a searchable lifecycle directory, personal following and scoped permanent journals. Extinct communities retain historical pages, materials and recorded links to later beginnings; final-loss dates require a complete match to archived individual deaths. No earlier provenance or biography is fabricated. → ADR-025.

Thirteen targeted model/server tests, 40 general browser checks, 22 community/extinction checks, 12 compiled-production checks and 17 runtime-handover checks pass. Following survives reload and extinction; current desktop/mobile screenshots were inspected without browser errors. Deployment and continuing-world verification are recorded separately after activation.

---

### [2026-10-08] Recovery Released to the Original World

- **type**: milestone
- **systems**: world_hosting, world_storage, runtime_handover, browser_validation
- **files**: `world-recovery-0.2.md`, `live-recovery-continuity.json`, `roadmap.md`, `progress.md`
- **agent**: Codex

Railway built and deployed `world-recovery-20261008` to the existing service and volume; the compatible Vercel production artifact is READY. The live world passed its old failing tick and continued under format 8 / biosphere-1.2. A transactional inspection verified the exact original archive, four community identities, ownership, agent keys, receipts, and clock advancement with no debt skipped. Independent push and pull-request GitHub runs passed for `64d4b76`.

The world remains in catch-up with substantial elapsed time to process; new founding/advice is temporarily restricted. Older backups were verified against independent copies and retained compressed to reclaim space. No people or animals were resurrected, and natural ecological recovery remains conditional on surviving carriers and resources. Provider IDs, runtime samples and test limits are in the release record.

---

### [2026-10-08] Saved-World Recovery and Runtime Handover

- **type**: bugfix
- **systems**: natural_systems, world_state, civilization_intelligence, world_storage, runtime_handover, browser_validation, browser_observer
- **files**: `climate.ts`, `chemistry.ts`, `ecology.ts`, `weather.ts`, `thermodynamics.ts`, `citizens.ts`, `gateway.ts`, `artifact.ts`, `sse.ts`, `recovery-2026-10-08.md`
- **agent**: Codex

Reproduced the live halt from its unchanged checkpoint: a shrinking biochemical tolerance rejected accumulated rounding error. The prior heat model separately caused lethal overheating; 132 small plant cohorts still survived at the saved tick. Added compensated transfers, funded radiation, finite planetary heat exchange, ice/snow separation, viable small-plant/wood turnover and parent-funded dormancy. Preserved all recorded deaths, matter, identities and missed time. → ADR-024.

Implemented the stable observer gateway, private activation socket, immutable artifacts, copied-checkpoint preflight, queued-request/lease handover and durable runtime pointers. Seventeen hotfix checks pass, including stream continuity, invalid candidate rejection and complete gateway restart. Initial installation still needs a container deployment. → ADR-023.

The current local suite passes 85 model/server, 40 browser, 12 compiled-production and nine extinction checks, plus build/format. A 400-day ecological trial retains 11 plant lineages, and the actual stopped-world backup advances 3,000 ticks with exact reload. Neither proves demographic equilibrium or recovery of extinct animals. A fresh identical consistent backup precedes the release; actual provider status is tracked in `docs/releases/world-recovery-0.2.md`.

---

### [2026-10-07] Material Memory, Earned Influence and Contact

- **type**: feature
- **systems**: natural_systems, human_cognition, civilization_intelligence, civic_relations, world_storage, agent_gateway, browser_observer, browser_validation
- **files**: `landscape.ts`, `weathering.ts`, `cognition.ts`, `society.ts`, `diplomacy.ts`, `progress.ts`, `migrations.ts`, `DevelopmentPanel.tsx`, `roadmap.md`
- **agent**: Codex

Implemented conserved landscape/fabric aging, repair and salvage; exact geometric work/storage affordances; personal experiments, memory, sleep and teaching. Added locally deliberated advice with refusal, six outcome dimensions, carried correspondence/exchanges, reciprocal commitments and limited physical raids. The canonical requirement ledger preserves the owner's accepted scope and distinguishes implemented approximations from unresolved foundations. → ADR-021, ADR-022.

The format-8 / biosphere-1.2 migration preserves the prior world's matter, people, time and identity while starting honest measurement epochs. During release checks, the existing host was found stopped after rapid lease rejections exhausted its restart allowance. Restarted the same deployment, saved a fresh backup and added a bounded startup wait that leaves the existing lease intact. The original interruption's cause is not established by the available logs; release validation remains recorded separately.

---

### [2026-10-07] Live Browser Launch and Core-Systems Review

- **type**: milestone
- **systems**: world_hosting, world_storage, browser_validation, natural_systems, civilization_intelligence
- **files**: `railway.ts`, `hosting.md`, `fundamentals.md`, `browser-foundation-0.1.md`, `progress.md`
- **agent**: Codex

Published the Vercel browser site and the persistent Railway world. Verified a consistent backup outside the volume, the original world's continuation through hosting updates, the public-origin configuration, and enforced refusal to create a replacement world if its expected state is missing. Recorded the hosting intervention at tick 5972; subsequent inspection at tick 6900 retained all 24 people and valid region checksums. Provider artifacts and test scope are in `docs/releases/browser-foundation-0.1.md`. → ADR-019.

The final local model/server suite passed 43 tests, alongside 36 browser checks, 10 compiled-production checks, nine founding trials, and the actual Railway container build. Documented proposed next fundamentals: continuous planetary state across resolutions, energy and material transformations, ecological regulators, population viability, local information, and external-agent decision time. The roadmap itself changes no live physical laws.

---

### [2026-10-07] Persistent Browser World Foundation

- **type**: milestone
- **systems**: world_state, natural_systems, civilization_intelligence, world_storage, agent_gateway, browser_observer, world_hosting, browser_validation
- **files**: `README.md`, `types.ts`, `engine.ts`, `app.ts`, `store.ts`, `migrations.ts`, `main.tsx`, `PlanetWelcome.tsx`, `Dockerfile`
- **agent**: Codex

Implemented the authorized shared browser rebuild with a data-derived planet entrance, autonomous communities, scoped HTTP/MCP agents, and one continuing world. Coupled elemental, planetary, weather, ecological, mechanical, and selected entropy processes replace the browser draft's recipe-based progression. Retained the Python baseline as historical evidence and updated canonical public metadata. → ADR-017, ADR-018, ADR-020.

Added checked region persistence, a permanent journal, recorded migrations/releases, a precise clock with missed-time recovery, one-writer leases, an expected-world safeguard, and consistent backups. The compiled production checks resume both an interrupted world and an online backup with the same owner and key. Configured the Vercel website and a single Railway service with a persistent `/data` volume. → ADR-019.

Local model/server, browser, production, and founding validation is documented in `docs/validation/README.md`; hosting and scientific limits are explicit. The final release record identifies the deployed artifacts and verification outcome.

---

### [2026-10-07] Runtime Assessment and Rebuild Proposal

- **type**: audit
- **systems**: praxans_game, runtime_config, ticker, ui_shell, ui_planet_select, test_suite
- **files**: `docs/assessment-2026-10-07/README.md`, `docs/assessment-2026-10-07/evidence.json`, `devlog/DECISIONS.md`, `devlog/CHANGELOG.md`
- **agent**: Codex

Assessed the executable `master` baseline in an isolated worktree and documented its unrelated history with the documentation-only default branch. Existing unittest/pytest checks passed, but live probes found inactive governance/migration updates, four partial save-restore failures that the batch runner marked successful, inconsistent frame pacing, and UI layout collisions. Added evidence, screenshots, and a staged rebuild proposal (→ ADR-016); runtime source and remote branches were not changed.

---

### [2026-03-07] Production Logging System Created

- **type**: infrastructure
- **systems**: none (documentation only)
- **files**: `devlog/AGENT_GUIDE.md`, `devlog/DECISIONS.md`, `devlog/SYSTEM_REGISTRY.md`, `devlog/CHANGELOG.md`, `devlog/PRODUCTION_LOG.md`
- **agent**: Antigravity

Created a 5-file LLM-agent-optimized production logging system in `devlog/`. Populated with full project history from inception (~Nov 2025) to present. All files use structured markdown with machine-parseable metadata for agent workflows.

---

### [2026-03-07] Dynamic Point-Lighting for Night Cycle

- **type**: feature
- **systems**: effects_renderer, scene_renderer
- **files**: `graphics/effects_renderer.py`
- **agent**: Antigravity

Implemented dynamic point-lighting with additive blending for the night cycle. Removed dead atmospheric overlay code. Ensured new building types emit appropriate light.

---

### [2026-03-07] LLM Settings Configuration Overlay

- **type**: feature
- **systems**: ui_shell, runtime_config, llm_client
- **files**: `ui/shell.py`, `runtime_config.py`
- **agent**: Antigravity

Added a settings overlay in the UI for enabling/disabling LLM, configuring Ollama connection URL, selecting models, and adjusting AI temperature. → ADR-003.

---

### [2026-03-07] Fog of War Refactored to RimWorld-Style LoS

- **type**: refactor
- **systems**: spatial_index, praxan_entity
- **files**: `systems/spatial.py`
- **agent**: Antigravity

Replaced the simple radius-based fog of war with a Line of Sight algorithm that blocks vision behind terrain and buildings. Previously revealed areas remain permanently visible.

---

### [2026-03-07] Camera Controls Refactored

- **type**: refactor
- **systems**: praxans_game
- **files**: `praxans_game.py`
- **agent**: Antigravity

Implemented fluid continuous zoom with momentum-based panning and zoom-to-cursor functionality. Made zoom more permissive and world navigation more subtle and optimized.

---

### [2026-03-07] Full Game Review and Bug Hunt

- **type**: audit
- **systems**: all
- **files**: multiple
- **agent**: Antigravity

Conducted thorough review of all game systems to verify interconnections and fix broken references after DefDatabase migration, tick method introduction, and Storyteller engine integration. Achieved stable cohesive game state.

---

### [2026-03-06] Inter-Faction Diplomacy System

- **type**: feature
- **systems**: diplomacy, society, event_bus
- **files**: `systems/diplomacy.py`
- **agent**: Antigravity

Implemented full diplomacy system with standings (-100 to +100), relation tiers (Allied through Hostile), treaties (Trade/NAP/Alliance), diplomatic incidents, and autonomous faction actions. Replaces hardcoded rivalries. → ADR-014.

---

### [2026-03-06] Living Atlas Observer UI Shell

- **type**: milestone
- **systems**: ui_shell, ui_hud, ui_inspect, ui_analytics, ui_panels, ui_input_router, ui_theme
- **files**: `ui/shell.py`, `ui/hud.py`, `ui/inspect.py`, `ui/analytics.py`, `ui/panels.py`
- **agent**: Antigravity

Rebuilt the entire UI into a Living Atlas observer shell. Added command center (start/resume/scenarios/archives/settings), clickable HUD, scrollable inspect drawer, modal workbooks (research, evolution, analytics, archive), and end-of-run summary with scoring. → ADR-013.

---

### [2026-03-06] Multi-Package Architecture Split

- **type**: milestone
- **systems**: all
- **files**: `systems/`, `llm/`, `graphics/`, `map/`, `events/`, `ui/`
- **agent**: Antigravity

Split the monolithic `praxans_game.py` into 7 packages: `systems/`, `ui/`, `llm/`, `graphics/`, `map/`, `events/`, and `entities/`. Each package owns a clear domain. → ADR-008.

---

### [2026-03-06] RimWorld-Style DefDatabase

- **type**: feature
- **systems**: def_database
- **files**: `systems/def_database.py`, `defs/core/*.json`, `game_content.py`
- **agent**: Antigravity

Implemented DefDatabase: recursively loads all `defs/**/*.json` at startup. All building, tech, item, job, and mood definitions moved from hardcoded Python dicts to JSON. `game_content.py` provides backward-compatible lazy proxy dict. → ADR-009.

---

### [2026-03-06] Staggered Tick Engine

- **type**: feature
- **systems**: ticker
- **files**: `systems/ticker.py`
- **agent**: Antigravity

Implemented RimWorld-inspired staggered tick system with three tiers: Normal (every frame), Rare (every 250 ticks, ~4s), Long (every 2000 ticks, ~33s). Prevents performance spikes at scale. → ADR-011.

---

### [2026-03-06] Async LLM Scheduler with 4 Channels

- **type**: feature
- **systems**: llm_scheduler, llm_client, llm_memory, llm_prompts, llm_interpreters
- **files**: `llm/scheduler.py`, `llm/client.py`, `llm/memory.py`
- **agent**: Antigravity

Implemented async LLM scheduler with 4 channels: COUNCIL (colony decisions), FACTION (faction intent), HISTORIAN (narrative memory), MEMORY (state summarization). All LLM work runs off the main thread. OllamaClient wraps Ollama with `<think>` tag stripping and model fallback. → ADR-010.

---

### [2026-03-06] SNES-Inspired PNG Asset Pack

- **type**: content
- **systems**: sprites, terrain_renderer, entity_renderer
- **files**: `assets/`, `graphics/sprites.py`, `scripts/generate_snes_assets.py`
- **agent**: Antigravity

Added original SNES-inspired PNG asset pack covering terrain, actors, buildings, resources, hazards, NPCs, overlays, and transitions. Graphics system prefers PNGs, falls back to procedural. → ADR-012.

---

### [2026-03-06] Graphics Package Extraction

- **type**: refactor
- **systems**: scene_renderer, terrain_renderer, entity_renderer, effects_renderer, sprites, palette, frame_models, graphics_content
- **files**: `graphics/`
- **agent**: Antigravity

Extracted world/entity/effects rendering from `praxans_game.py` into a `graphics/` package with render-frame models, terrain caching, and a scene renderer pipeline.

---

### [2026-03-06] Ecology System

- **type**: feature
- **systems**: ecology, spatial_index
- **files**: `systems/ecology.py`
- **agent**: Antigravity

Added ecology system with biome-aware environmental dynamics, resource cycling, and ecosystem health tracking.

---

### [2026-03-06] Quest System

- **type**: feature
- **systems**: quests, event_bus
- **files**: `systems/quests.py`
- **agent**: Antigravity

Added structured quest system with objectives, progress tracking, and integration with the event bus.

---

### [2026-03-06] Storyteller Engine

- **type**: feature
- **systems**: storyteller, event_bus, cascades, incidents
- **files**: `systems/storyteller.py`, `events/bus.py`, `events/cascades.py`, `events/incidents.py`
- **agent**: Antigravity

Added event/crisis storytelling engine with event bus, cascade chains, and incident triggers. Drives emergent narrative beats.

---

### [2026-03-06] Colony Policy Manager

- **type**: feature
- **systems**: policies
- **files**: `systems/policies.py`
- **agent**: Antigravity

Added colony policy system with food (lavish/simple/raw_only), medical (best/herbal/none), and hostility (flee/fight/ignore) policies.

---

### [2026-03-06] F12 Developer Overlay

- **type**: feature
- **systems**: dev_mode
- **files**: `systems/dev_mode.py`
- **agent**: Antigravity

Added developer overlay accessible via F12: entity spawning, force kill/heal, incident triggers, speed override, and god mode.

---

### [2026-03-06] Event Bus and Incidents Framework

- **type**: feature
- **systems**: event_bus, cascades, incidents
- **files**: `events/bus.py`, `events/cascades.py`, `events/incidents.py`
- **agent**: Antigravity

Created events package with a publish-subscribe event bus, cascade chain processing, and incident definitions for the storyteller.

---

### [2026-03-06] 20 Automated Test Files

- **type**: infrastructure
- **systems**: test_suite
- **files**: `tests/`
- **agent**: Antigravity

Added comprehensive test suite covering: advisor contracts, diplomacy, game content, scenarios, graphics rendering, grief system, headless smoke, LLM (contracts, interpreters, memory, scheduler), map generation, observer analytics, quests, run archive/snapshot, runtime config, society dynamics, UI input router, and UI render smoke.

---

### [2026-02-24] Codebase Audit and Bug Hunt

- **type**: audit
- **systems**: all
- **files**: multiple
- **agent**: Antigravity

Conducted comprehensive repository audit: dependency/vulnerability audit followed by deep-scan bug hunt. Generated prioritized remediation plan.

---

### [2026-01-06] Feature Expansion: Heritable Traits and Lineage

- **type**: feature
- **systems**: praxan_entity, genetics
- **files**: `praxans_game.py`, `genetics.py`
- **agent**: Antigravity

Added heritable praxan traits, lineage tracking, mutation drift, and a dedicated evolution observer panel. Traits include metabolism efficiency, learning affinity, immune strength, fertility drive, social cohesion, and adaptability.

---

### [2026-01-06] Faction Society Mechanics

- **type**: feature
- **systems**: society
- **files**: `society_dynamics.py`, `society_content.py`
- **agent**: Antigravity

Added deeper faction society mechanics: doctrine drift, leadership succession, schism pressure, and migration-frontier behavior. Factions autonomously accumulate pressure, split, and push migration goals.

---

### [2026-01-06] Observer Scenario Presets

- **type**: feature
- **systems**: game_scenarios
- **files**: `game_scenarios.py`
- **agent**: Antigravity

Added 6 scenario presets for autonomous runs: `standard`, `fertile_floodplain`, `harsh_winter_basin`, `plague_start`, `scarce_stone`, `high_mutation`. Each defines distinct ecological and evolutionary starting conditions.

---

### [2026-01-06] Observer Analytics and Archives

- **type**: feature
- **systems**: observer_analytics, run_archive, run_snapshot
- **files**: `observer_analytics.py`, `run_archive.py`, `run_snapshot.py`
- **agent**: Antigravity

Added structured timeline, mortality summaries, lineage dominance tracking, and faction churn analytics. Run archives emit `logs/archive_*.json` with phase, end-state, and observer score metadata.

---

### [2026-01-06] Snapshot Resume Support

- **type**: feature
- **systems**: run_snapshot, runtime_config
- **files**: `run_snapshot.py`, `runtime_config.py`
- **agent**: Antigravity

Implemented full colony state serialization to `logs/snapshot_*.json`. Resume via `--load-latest-snapshot` or `--snapshot-file`. Snapshot fidelity covers lineage, faction, fog-of-war, camera, festivals, encounters, hazards, and NPCs. → ADR-007.

---

### [2026-01-06] Biome Resource Bonuses and Modifier Fixes

- **type**: bugfix
- **systems**: praxan_entity, map_generation
- **files**: `praxans_game.py`
- **agent**: Antigravity

Fixed biome resource bonuses (food, wood, stone now respect biome properties). Confirmed `gather_rate` modifier functional. Verified `health_regen` already working. Addressed issues identified in SYSTEM_CONNECTIONS_ANALYSIS.md.

---

### [2026-01-06] Project Diagnostic — Status: Excellent

- **type**: audit
- **systems**: all
- **files**: `archive/legacy_docs/PROJECT_DIAGNOSTIC.md`
- **agent**: Antigravity

Comprehensive project review: 4,356 lines, 20 classes, zero linter errors, no TODO/FIXME flags. Code quality rated Excellent. System health score 82/100. All core gameplay, LLM integration, and UI systems verified functional.

---

### [2025-12-01] Deep Analysis Report — Rendering Pipeline

- **type**: audit
- **systems**: scene_renderer, praxans_game, map_generation
- **files**: `archive/legacy_docs/DEEP_ANALYSIS_REPORT.md`
- **agent**: Antigravity

Comprehensive code review for display/rendering issues. Identified 4 potential root causes: camera position/zoom, chunk surface generation, display driver issues, and silent exception handling. Created diagnostic steps and prioritized fix list.

---

### [2025-11-01] System Connections Analysis

- **type**: audit
- **systems**: all
- **files**: `archive/legacy_docs/SYSTEM_CONNECTIONS_ANALYSIS.md`
- **agent**: Antigravity

First comprehensive system integration check. Analyzed 20 major classes. Found 15 fully connected, 3 partially connected, 2 disconnected. Identified 5 missing modifier implementations (health_regen, workshop_bonus, build_speed, gather_rate, happiness_base) and underutilized biome properties.

---

### [2025-11-01] Project Inception — Praxans Prototype

- **type**: milestone
- **systems**: praxan_entity, praxans_game
- **files**: `praxans_game.py`
- **agent**: human + Antigravity

Initial creation of the Praxans AI Civilization Simulator. Single-file monolith with 20 major classes: Praxan AI entity, 6 building types, resource system, civilization advisor with Ollama LLM, chunk-based world generation with 8 biomes, fog of war, particles, tooltips, camera, day/night, seasons, weather, encounters, hazards, NPCs. Observer-only design established. → ADR-001, ADR-002, ADR-003.
