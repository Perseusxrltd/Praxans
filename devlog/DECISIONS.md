# Architectural Decision Records

> **Purpose**: Documents every non-trivial design choice made during Thonglets/Praxans development.
> See `AGENT_GUIDE.md` for formatting rules and how to add new entries.

---

## Records

### ADR-001: Observer-Only Design

- **date**: 2025-11-01
- **status**: accepted
- **context**: The game needed a clear identity. Adding player control mechanics would create tension between autonomous AI behavior and player intent, making neither fully satisfying.
- **decision**: Make the simulation strictly observer-only. No live player control over the colony. Players watch, inspect, and analyze but never command.
- **alternatives**: Hybrid control (rejected — dilutes the AI-driven narrative). Full player control (rejected — different game entirely).
- **consequences**: All UI is read-only observer tools. The LLM advisor drives colony strategy autonomously. Feature requests for "player commands" are rejected by convention.

---

### ADR-002: Single-File Monolith Origin

- **date**: 2025-11-01
- **status**: superseded (by ADR-008)
- **context**: Rapid prototyping needed the fastest iteration cycle possible. A single `praxans_game.py` allowed all 20 classes to be co-located for quick cross-referencing and editing.
- **decision**: Keep the entire game in one file during the prototype phase.
- **alternatives**: Multi-file from the start (rejected — premature abstraction before the architecture stabilized).
- **consequences**: The file grew to ~4,356 lines. Worked well for prototyping but became unwieldy as the system count grew. Eventually superseded by → ADR-008.

---

### ADR-003: LLM Integration via Ollama

- **date**: 2025-11-01
- **status**: superseded (by ADR-017 for the browser runtime)
- **context**: The game's AI advisor and goal-generation systems need an LLM. Cloud APIs are expensive and add latency; a local model keeps the game self-contained.
- **decision**: Use Ollama for local LLM inference. Make it optional — the game must boot and run without it.
- **alternatives**: OpenAI API (rejected — cost, latency, internet dependency). No LLM at all (rejected — core differentiator of the game).
- **consequences**: Ollama import is guarded with `try/except ImportError`. The game runs in "reduced mode" without it. Model preference is `qwen3.5:9b` with fallback chain.

---

### ADR-004: Optional Dependencies Pattern

- **date**: 2025-11-01
- **status**: superseded (by ADR-017 for the browser runtime)
- **context**: Both `ollama` and `noise` (Perlin noise) are useful but not critical. Requiring them makes the install heavier and blocks CI environments.
- **decision**: Guard both imports with `try/except ImportError`. Provide math-based fallbacks for noise. Provide stub behavior when Ollama is absent.
- **alternatives**: Hard-require everything (rejected — breaks CI and casual testing).
- **consequences**: Every import site for `ollama` or `noise` must be guarded. The `noise` fallback is a deterministic math approximation. LLM features are simply disabled without Ollama.

---

### ADR-005: Procedural Asset Fallbacks

- **date**: 2025-11-01
- **status**: superseded (by ADR-017 for the browser runtime)
- **context**: The assets directory was empty during early development. The game needed to render terrain, entities, and buildings without external art.
- **decision**: Generate all visuals procedurally in code (colored rects, dithered patterns, particle effects). Fall back to these when PNG assets are missing.
- **alternatives**: Require an asset pack at launch (rejected — blocks development). Use placeholder rectangles only (rejected — too ugly).
- **consequences**: The graphics system has code-drawn fallbacks for every visual element. When the SNES PNG pack was added later (→ ADR-012), the fallbacks remained as a safety net.

---

### ADR-006: Civilization Advisor Architecture

- **date**: 2025-11-01
- **status**: superseded (by ADR-010)
- **context**: The LLM advisor needs to analyze colony state and issue directives. Initially, this ran synchronously on the main thread.
- **decision**: Run advisor queries on a timed interval (30s) with a structured prompt that includes full game state.
- **alternatives**: Per-frame LLM queries (rejected — too expensive). Event-driven queries (rejected — too complex initially).
- **consequences**: The advisor became the central strategic brain. Slow/failed LLM calls would freeze the render loop — a problem that was later fixed by → ADR-010.

---

### ADR-007: Structured Snapshot Persistence

- **date**: 2026-01-06
- **status**: superseded (by ADR-017 for the browser runtime)
- **context**: Players wanted to resume sessions. The game state is complex (lineage, faction, fog-of-war, camera, festival timing) and needs full fidelity.
- **decision**: Serialize full colony state to `logs/snapshot_*.json` at session end. Resume from snapshots via `--load-latest-snapshot` or `--snapshot-file`.
- **alternatives**: Save to SQLite (rejected — overkill for JSON-shaped data). Save only key metrics (rejected — can't truly resume).
- **consequences**: Snapshots grew to 70–150KB as state fidelity expanded. Archive JSONs (`logs/archive_*.json`) were added for lighter end-of-session summaries with scoring metadata.

---

### ADR-008: Multi-Package Architecture Split

- **date**: 2026-03-06
- **status**: superseded (by ADR-017 for the browser runtime)
- **context**: The single-file monolith (→ ADR-002) reached ~8,000+ lines. Adding diplomacy, ecology, quests, and a storyteller in one file was untenable. The `entities/praxan.py` extraction had already proven the pattern.
- **decision**: Split into packages: `systems/`, `ui/`, `llm/`, `graphics/`, `map/`, `events/`, `entities/`, `defs/core/`. Each package owns a clear domain.
- **alternatives**: Keep the monolith (rejected — unmaintainable). Split by feature flags (rejected — doesn't reduce file size).
- **consequences**: `praxans_game.py` remains the entry point and still holds top-level state (~350KB). `entities/praxan.py` uses `from praxans_game import *` (wildcard import, intentional tight coupling). New systems are always added as modules under `systems/`.

---

### ADR-009: RimWorld-Style DefDatabase

- **date**: 2026-03-06
- **status**: superseded (by ADR-017 for the browser runtime)
- **context**: Buildings, technologies, items, jobs, and moods were hardcoded in Python dicts across multiple files. Adding or modifying content required code changes.
- **decision**: Implement a `DefDatabase` that recursively loads all `defs/**/*.json` at startup. Access content via `DefDatabase.get_all("BuildingDef")` etc. `game_content.py` exposes a lazy proxy dict for backward compatibility.
- **alternatives**: YAML files (rejected — requires extra dependency). Hardcoded dicts (rejected — doesn't scale). SQLite (rejected — overkill for static content).
- **consequences**: All authored game content lives in `defs/core/*.json`. Adding a new building type means editing a JSON file, not Python code. `DefDatabase` is the single source of truth (→ convention in CLAUDE.md).

---

### ADR-010: Async LLM with 4 Channels

- **date**: 2026-03-06
- **status**: superseded (by ADR-017 for the browser runtime)
- **context**: Synchronous LLM calls (→ ADR-006) froze the render loop when Ollama was slow or failed. As the game added faction intent, historian narratives, and memory digests, multiple concurrent LLM workloads needed scheduling.
- **decision**: Implement `LLMScheduler` with 4 async channels: `CHANNEL_COUNCIL` (colony decisions), `CHANNEL_FACTION` (faction intent), `CHANNEL_HISTORIAN` (narrative memory), `CHANNEL_MEMORY` (state summarization). All work runs off the main thread. `OllamaClient` wraps Ollama, strips `<think>` tags, handles model fallback.
- **alternatives**: Single async queue (rejected — can't prioritize council over historian). Web workers (rejected — Python, not JS).
- **consequences**: Slow/failed LLM calls never freeze rendering. Each channel can be independently rate-limited. The scheduler is polled each frame via `scheduler.poll()`.

---

### ADR-011: Staggered Tick Engine

- **date**: 2026-03-06
- **status**: superseded (by ADR-017 for the browser runtime)
- **context**: With 50+ entities and multiple subsystems, running all updates every frame caused performance spikes. RimWorld's tick bucketing pattern was a known solution.
- **decision**: Implement `TickManager` with three tiers: Normal (every frame), Rare (every 250 ticks, ~4s), Long (every 2000 ticks, ~33s). Register entities with appropriate frequencies.
- **alternatives**: Fixed delta accumulation (rejected — doesn't reduce per-frame work). LOD-based updates (rejected — too complex for current scale).
- **consequences**: Infrequent updates (mood recalculation, faction pressure, ecology checks) run on Rare/Long ticks, smoothing the frame budget. New systems must choose their tick tier explicitly.

---

### ADR-012: SNES-Inspired PNG Asset Pack

- **date**: 2026-03-06
- **status**: superseded (by ADR-017 for the browser runtime)
- **context**: Procedural fallback graphics (→ ADR-005) worked but looked generic. The game needed a visual identity.
- **decision**: Ship an original SNES-inspired PNG asset pack for terrain, actors, buildings, resources, hazards, NPCs, overlays, and transitions. Include a generator script at `scripts/generate_snes_assets.py`. The graphics system prefers shipped PNGs and falls back to procedural only if an asset is missing.
- **alternatives**: Use Creative Commons tilesets (rejected — licensing complexity, inconsistent style). Commission pixel art (rejected — budget).
- **consequences**: The `graphics/sprites.py` module manages sprite loading and caching. All new visual elements should have a corresponding PNG in `assets/`.

---

### ADR-013: Living Atlas Observer UI

- **date**: 2026-03-06
- **status**: superseded (by ADR-017 for the browser runtime)
- **context**: The original UI was a minimal HUD with hardcoded panels. As the game grew, it needed a proper command center, modal workbooks, scrollable drawers, and end-of-run flows.
- **decision**: Rebuild the UI into a "Living Atlas" observer shell. Command center (start/resume/scenarios/archives/settings), clickable HUD, scrollable inspect drawer, modal workbooks (research, evolution, analytics, archive), and end-of-run summary with scoring.
- **alternatives**: Web-based UI (rejected — too much overhead for a Pygame game). Immediate-mode GUI library (rejected — limited styling).
- **consequences**: UI is split across `ui/shell.py`, `ui/hud.py`, `ui/inspect.py`, `ui/analytics.py`, `ui/panels.py`, `ui/theme.py`, etc. Every HUD control is both clickable and hotkey-driven. `ui/input_router.py` manages UI state and entity picking.

---

### ADR-014: Diplomacy System Replacing Hardcoded Rivalries

- **date**: 2026-03-06
- **status**: superseded (by ADR-017 for the browser runtime)
- **context**: Faction interactions were hardcoded as simple rivalry booleans. The game needed nuanced inter-faction relations that evolve dynamically.
- **decision**: Implement a full diplomacy system with standings (-100..+100), relation tiers (Allied/Friendly/Neutral/Tense/Hostile), treaties (Trade/NAP/Alliance), diplomatic incidents, and autonomous actions.
- **alternatives**: Keep simple rivalries (rejected — too shallow). Player-driven diplomacy (rejected — violates observer-only design → ADR-001).
- **consequences**: `systems/diplomacy.py` (26KB) manages all inter-faction relations. Factions can autonomously form alliances, declare hostility, and push migration goals.

---

### ADR-015: Wildcard Import for Praxan Entity

- **date**: 2025-11-01
- **status**: superseded (by ADR-017 for the browser runtime)
- **context**: `entities/praxan.py` needs access to nearly all top-level game state (constants, globals, world map, resource lists). Explicit imports would create a 50+ line import block that mirrors the entire top-level namespace.
- **decision**: Use `from praxans_game import *` in `entities/praxan.py`. This is intentional tight coupling — the entity class is inseparable from the game state by design.
- **alternatives**: Dependency injection (rejected — massive refactor for unclear benefit at current scale). Explicit imports (rejected — impractical given the breadth of access needed).
- **consequences**: Refactoring `praxans_game.py` top-level state must consider that `praxan.py` depends on everything. This is documented in `CLAUDE.md` as a key convention.

---

### ADR-016: Staged Rebuild Around an Explicit Simulation Core

- **date**: 2026-10-07
- **status**: superseded (by ADR-017 for the browser runtime)
- **context**: An assessment of `master` found passing unit tests alongside failed live restoration, inactive systems, inconsistent time ownership, and UI overlap. The default branch separately contains documentation and metadata on an unrelated history. See `docs/assessment-2026-10-07/README.md` for reproduced findings and evidence.
- **decision**: Propose repository-history integration followed by live reliability repairs and a staged extraction of explicit world state, simulation clock, RNG, lifecycle, and ordered systems. Retain Python/Pygame initially, authored content, useful subsystem behavior, and compatibility with existing saves. Adapt the observer UI to read models and keep local AI optional behind validated asynchronous interfaces.
- **alternatives**: A complete engine rewrite has no measured requirement yet and would also require rebuilding content, persistence, and behavioral coverage. Continuing feature expansion before establishing reliable execution and restoration would compound the observed integration failures.
- **consequences**: Each migration stage needs runtime integration and save-continuity acceptance checks. Deterministic simulation tests become possible once time and randomness are owned by the core. This proposal does not supersede accepted ADRs or authorize implementation; the current assessment scope is review and planning.


---

### ADR-017: Authoritative Shared Browser World

- **date**: 2026-10-07
- **status**: accepted
- **context**: The owner explicitly requested a complete browser rebuild in which independent player agents inhabit one shared world. This supersedes the Python-first assessment proposal in ADR-016 and the runtime-specific legacy choices in ADR-003–015; their original descriptions remain historical records.
- **decision**: Use an explicit deterministic TypeScript simulation in one authoritative Node process, a React/Canvas observer with a data-derived WebGL planet entrance, SQLite persistence, and model-neutral HTTP/MCP agent requests. Integrate the unrelated runtime and documentation histories while retaining the old Python code as a reference.
- **alternatives**: A browser-only save cannot provide one continuously shared history. Hosting external model inference inside the tick loop couples the world's life to a provider and its response time. A direct port of global Pygame state preserves the lifecycle problems found in the assessment.
- **consequences**: The server owns time, matter, decisions, and durable state. Browser pause is local. Players run their own agents; the game makes no paid model calls. Current code, setup, and public metadata are browser-first.

---

### ADR-018: An Old Planet with Coupled, Inspectable Natural Rules

- **date**: 2026-10-07
- **status**: accepted
- **context**: The owner requires a living ecosystem grounded in natural rules, a periodic table, a defined position around a star and satellite, diverse flora/fauna, seasons, a world age, and entropy. Authored building recipes or technology unlocks do not satisfy that direction.
- **decision**: Initialize an old Earth-sized planet with established ecosystems and small human groups. Use seeded spherical geography, elemental and biochemical inventories, coupled water/air/soil/food-web processes, trait inheritance, and material geometry. Keep one integer tick with a precise calendar and fine elapsed age. Measure selected irreversible and radiative entropy flows without presenting them as total planetary entropy.
- **alternatives**: A catalog of element names without active reservoirs is insufficient. Full atomic physics, global fluid dynamics, and replaying billions of years are not tractable in this foundation. A scripted technology ladder would replace the desired emergent constraints with author-defined progression.
- **consequences**: Equations, parameters, and limits are public. Revealed regions persist; unmaterialized land has initial priors and joins the ledger through explicit boundary inventories. The planet and available compute are finite. Future model depth must preserve the already existing world.

---

### ADR-019: Persistent Hosting and Recorded Interventions

- **date**: 2026-10-07
- **status**: accepted
- **context**: The owner says that once the world is alive it must continue, with subsequent changes acting as recorded interventions, and explicitly selected Railway with a persistent volume behind the Vercel website.
- **decision**: Keep the simulation in one always-on Railway service with SQLite on `/data`; Vercel serves assets and proxies requests. Persist the wall-clock checkpoint, material regions, identities, history, and ownership. Use a single-owner lease, bounded replay of missed time, consistent backups, an expected-world guard after first creation, and versioned atomic migrations with pre-migration snapshots and intervention records.
- **alternatives**: Ephemeral/serverless simulation instances lose continuity or create competing clocks. Silently replacing an incompatible or missing live save creates another universe. Skipping missed ticks ages life without simulating its consequences.
- **consequences**: Hotfixes reuse the same service and volume. Unknown or damaged state stops rather than resets. Operators must retain independent backups, observe hosting limits, and check migration compatibility before rollback. Every code release receives a unique recorded release identifier.

---

### ADR-020: Eight Provisional Founders with Comparable Initial Terms

- **date**: 2026-10-07
- **status**: accepted
- **context**: New players need viable, fair beginnings far from established communities, while maintaining resource pressure and allowing the ecosystem to determine outcomes.
- **decision**: Start new communities with eight adults, four complementary pairs, matched age/trait distributions, and equal supplies per person. Search unoccupied frontier sites with water, tolerable temperatures, food, timber, and usable land. Account for founders and new terrain as explicit arrivals into the simulated volume.
- **alternatives**: Taking people from an existing player's community harms that player's starting terms. Unlimited supplies bypass natural constraints. Four, eight, and twelve were compared in nine fourteen-day trials; all survived, so those trials do not establish a unique optimal number.
- **consequences**: Eight remains a provisional opening balance. Survival is not guaranteed, and genetic or multi-generation viability remains unproven. Future changes to founder policy must respect existing communities and be documented.

---

### ADR-021: Material Aging and Knowledge with Physical Carriers

- **date**: 2026-10-07
- **status**: accepted
- **context**: The owner requested changing landscapes, decaying buildings, custom invention, personal learning and deeper cognition. These need consequences beyond named discoveries or permanent shelter bonuses.
- **decision**: Represent transported sediment and signed surface change, remaining material fabric, exposure damage, collapse, repair and salvage. Derive cover, work surfaces and bulk storage from material geometry. Give people bounded sensory and knowledge memories, adaptive activity preferences, sleep consolidation and nearby teaching; material experiments consume samples and retain both successes and failures.
- **alternatives**: Scripted decay timers discard environmental causes. Recipe unlocks grant effects without demonstrated feasibility. A complete neural or chemical model is not implemented by adding terminology or more parameters.
- **consequences**: Format 8 / biosphere-1.2 explicitly migrates existing matter and people without rewriting their past. Knowledge needs a living carrier; useful ideas guide gathering. These remain functional cognition and cuboid/material approximations, with their limits and causal tests documented.

---

### ADR-022: Advisory Agents, Plural Success and Carried Diplomacy

- **date**: 2026-10-07
- **status**: accepted
- **context**: The owner explicitly chose authority emerging through trust and institutions, including Praxans' right to refuse. They also requested engaging rewards, freely interpreted success and realistic open diplomacy dependent on contact.
- **decision**: Queue agent advice for locally attended deliberation with shared simulation-time limits, quorum, consent, individual needs and bounded experiential trust. Expose six outcome dimensions, signed daily changes and once-only historical milestones. Contacts produce dated reports; provisioned volunteers carry messages and goods. Bilateral commitments need reciprocal assent; fulfillment, refusal, breach and limited raids have material consequences.
- **alternatives**: Direct control bypasses inhabitants. A compulsory scalar score fixes one meaning of success and invites narrow optimization. Instant global diplomacy bypasses knowledge, distance and logistics. Executing arbitrary prose grants effects without supporting mechanics.
- **consequences**: Submission receipts are not acceptance. More keys or faster polling cannot buy decisions or rewards. Public observation precludes strong competitive secrecy. Free conversation supports peace, cooperation and rivalry, while richer politics, language, warfare, material transformations and institutional enforcement remain explicit future work.

---

### ADR-023: Stable Gateway and Durable Runtime Handover

- **date**: 2026-10-08
- **status**: accepted
- **context**: The owner requires the existing world to remain observable while runtime hotfixes are applied. A normal volume-backed container deployment can interrupt both the clock owner and browser connections.
- **decision**: Keep a stable public HTTP/SSE gateway and one replaceable private simulation worker. Verify immutable artifacts and forward simulation on a private consistent copy, drain requests, save and release the old owner, then activate the candidate through durable pending/current pointers. Preserve stream connections, queued requests, idempotency, clock debt and intervention history.
- **alternatives**: Two independently ticking replicas create conflicting history. Blind fallback can load an incompatible old binary after migration. Erasing clock debt discards consequences. Public hotfix endpoints unnecessarily expose an operator capability.
- **consequences**: A local mode-0600 Unix socket controls activation. Hash, Node and dependency compatibility checks fail closed. Automatic fallback requires an unchanged checkpoint. Gateway, dependency and host changes still need a prepared platform deployment; one host cannot conceal every infrastructure failure.

---

### ADR-024: Conditioned Conservation and Funded Ecological Recovery

- **date**: 2026-10-08
- **status**: accepted
- **context**: The live world halted when accumulated rounding error crossed a shrinking biochemical tolerance. Separate earlier overheating collapsed its people and animals; surviving plants exposed missing dormancy, light-response and woody-turnover mechanisms. Longer seasonal tests also exposed isolated-region freezing.
- **decision**: Preserve historical ledgers and use compensated future energy/atmosphere transfers with a throughput-scaled numerical tolerance. Fund atmospheric radiation, distinguish frozen ground from snowfall, and connect detailed regions to finite planetary thermal reservoirs. Correct plant energy response and structural turnover; represent parent-funded dormant propagules whose reserves, viability and germination obey their environment.
- **alternatives**: Disabling conservation masks real violations. Resetting time or rebasing counters rewrites history. Temperature clamps replace physical causes. Scripted respawning invents organisms and material. Short summer checks failed to expose the tested winter collapse.
- **consequences**: Existing populations, material and recorded deaths survive the migration unchanged; old seed banks are empty because their history was not represented. Natural recovery needs surviving carriers or immigration and is not guaranteed. The thermal bands are an explicit Earth-analogue approximation, with complete global moisture, material transport, ecology and demographic stability still unresolved.

---

### ADR-025: Community Lifecycles as Evidence-Based Observer Records

- **date**: 2026-10-08
- **status**: accepted
- **context**: The owner requested better following of communities, new arrivals and extinct groups. The existing journal already retains their events, but a live-looking list and global pagination hide their distinct histories.
- **decision**: Provide a searchable lifecycle directory, browser-local following and community/category archive filters applied before pagination. Derive an ending date only from complete recorded death evidence and current absence of inhabitants; use explicit existing event links for branches and later beginnings. Keep observation separate from physical simulation and retain historical groups in the directory and follow list.
- **alternatives**: Removing empty groups erases the user's route to their history. Filtering only the latest global journal page hides quieter communities. Inventing dates or ancestry fills gaps with unsupported events. A shared follow list would expose personal observer choices.
- **consequences**: Public history reads use parameterized indexed queries and contain no management credentials. Following survives reloads in the same browser; accounts, cross-device synchronization, notifications, inheritance and detailed genealogy remain explicit future work. The change uses compatible format-8 event fields and leaves the natural laws unchanged.
