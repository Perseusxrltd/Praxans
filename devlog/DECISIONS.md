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
- **status**: superseded by ADR-026
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

---

### ADR-026: Three Hundred Founders with Real Camp Area and Finite Renewal

- **date**: 2026-10-08
- **status**: accepted
- **context**: The owner requested a few hundred founders and authorized repopulating the extinct historical communities. Increasing headcount without land, provisions, thermal protection or realistic travel concentrated hundreds of people's heat and food decay at one cell.
- **decision**: Supersede ADR-020 for future founding with 300 individually represented adults, comparable traits and finite proportional supplies. Give camp rest/stock access a connected footprint sized by people and stock volume; use spherical walking distance and food-funded thermoregulation, real fiber wraps and carried provisions. Restore the four old communities only through a separate finite, idempotent, recorded boundary intervention.
- **alternatives**: Changing a displayed count leaves eight simulated people. Infinite food, automatic respawning or erasing old deaths bypass the world contract. Concentrated 300-person camps overheated in the tested candidate.
- **consequences**: Format 9 / biosphere-1.3 explicitly migrates existing state. The actual renewal occurred at tick 195860 and preserves earlier history. Three hundred is a selected baseline, not a demographic guarantee; failed coupled seasonal tests and aggregate storage/thermal limits remain documented.

---

### ADR-027: General Component Search and Distinct Experimental Evidence

- **date**: 2026-10-08
- **status**: accepted
- **context**: Template-like post/slab mutations and overpermissive enclosure measurements restricted invention or granted capacity unsupported by connected geometry. Reusing an old observation solely by design could also conceal a contradictory result or confuse a material trial with completed construction.
- **decision**: Search add/remove/translate/resize/axis/material operations on general components. Measure connected enclosure, openings and spill height from geometry. Match evidence by design, properties and method; retain conflicting observations without rewriting their past.
- **alternatives**: Named recipes or renamed designs grant no demonstrated physical effect. Replacing all old observations with new geometry predictions fabricates historical evidence. Simply increasing the part cap does not supply tools, processing or scalable mechanics.
- **consequences**: Five bulk materials, 32 cuboids, 1,600 kg assemblies and idealized samples remain explicit limits. Durable record carriers, general transformations, tools and locally chosen evaluation criteria remain required for broader invention.

---

### ADR-028: Progressive Observation Separate from Simulation Detail

- **date**: 2026-10-08
- **status**: accepted
- **context**: The planet entrance downloaded roughly 30 MB of detailed world state before showing the world. A vast address space and population increase also threatened browser work and server serialization budgets.
- **decision**: Load a small overview and progressive atlas at the entrance, start detailed SSE on entry and close it on return. Project ordinary spectator data without learning internals or full seed genomes. Run geography exploration in a cancellable, bounded worker with explicit raster/cache limits; cameras never generate physical regions or advance time.
- **alternatives**: Sending the complete authoritative world for every view couples observation cost to unseen population. Adding detail when a camera zooms would create physical matter or simulation behavior from spectators. Caching unlimited detail only postpones the memory limit.
- **consequences**: Local browser tests preserve exact world state and verify work bounds, but cold atlas work can still take seconds. Global entity frames, all-region residency and monolithic persistence remain scaling constraints; conservative coarse/fine simulation is separate future work.

---

### ADR-029: Private Agent Briefing and Advisory Input During Clock Recovery

- **date**: 2026-10-08
- **status**: accepted
- **context**: The owner requested one message an agent can use immediately. A long recovery backlog also blocked useful advice even though people continued through difficult conditions.
- **decision**: Provide a private scoped briefing with HTTP/MCP paths, key, schema/consent instructions and idempotent retries, using copy, device sharing or email drafts. Accept bounded proposals at the current logical tick during catch-up; local consent, later feasibility/work and shared decision budgets still apply. Stage only affected advisory records before the atomic save/receipt commit; replay committed receipts even during a halt.
- **alternatives**: Resetting the clock erases unprocessed history. Directly executing advice bypasses inhabitants. Issuing keys without a usable briefing leaves avoidable setup work. Putting credentials in public URLs or persistent browser storage expands their exposure.
- **consequences**: No messages are sent automatically and no agent can mint resources. `acceptingProposals`, `WORLD_HALTED` and `WORLD_CATCHING_UP` distinguish service state from a proposal's outcome. New founding remains gated during backlog; model-only callers retain isolated simulation branches. Stored credentials remain hashes, and account recovery is still unresolved.

---

### ADR-030: Feasible Alternatives and Conditional Work Selection

- **date**: 2026-10-08
- **status**: accepted
- **context**: The planner could repeatedly try an oversized preferred observation while ignoring a feasible remembered alternative. Successive work gates also reused one unconditioned random value, so ordinary food-reserve gathering could exclude every new non-build assembly choice.
- **decision**: Try ranked, known, useful and affordable observations through the authoritative assembly validator, stopping after the first success and retaining the failed-attempt cooldown. After urgent needs, give each reached eligible probabilistic branch its stated conditional chance by rescaling the selected or rejected interval of one initial draw; continue after infeasible assignment and keep the remainder below one.
- **alternatives**: Increasing assembly limits or supplying structures/resources does not correct selection. Trying only the highest score preserves the dead end. Reusing the raw value makes later probabilities depend accidentally on earlier thresholds; separate new random draws are unnecessary for the bounded decision tree.
- **consequences**: Future actions and downstream trajectories change, while existing tick/RNG/state are preserved on activation. Same-candidate replay remains deterministic. Finite input precision is not independent unlimited randomness. Material, work, knowledge and site checks still constrain every request; the universal score, seasonal heuristic and spatial construction ceiling remain explicit model limits. No saved-state migration or physical-law change is involved.

---

### ADR-031: Owned and Bounded Candidate Validation

- **date**: 2026-10-08
- **status**: accepted
- **context**: A copied-world handover passed logically but sampled live-plus-validation memory exceeded the small service's budget. Merely completing offline checks does not establish safe simultaneous validation headroom.
- **decision**: Keep a lightweight disposable supervisor and run its preflight in an owned worker thread with explicit V8 generation limits, checked before world loading. Set construction flags only in that supervisor before creating the isolate so inherited NODE_OPTIONS cannot silently expand the worker's effective heap. The supervisor owns cleanup after heap failure or cancellation; the existing gateway still owns the process and authoritative handover.
- **alternatives**: Unbounded simultaneous copies can displace the continuing world. Skipping forward validation removes a continuity check. An unmanaged child process can survive its supervisor. Reducing the budget to 160 MiB failed on the sampled inhabited world; 192 MiB passed.
- **consequences**: The tested Node-22 worker has a 216 MiB effective total heap. Native memory and file cache remain outside this heap limit and need measurement. Budget exhaustion rejects a hotfix instead of changing or resetting the world. A growing world or migration may require another reviewed budget/hosting change. Runtime simulation, physics and saved-state format are unchanged by the validation mechanism.

---

### ADR-032: Prepare Log Reuse Before Writing and Bound Backup Readers

- **date**: 2026-10-08
- **status**: accepted
- **context**: A reader can delay the automatic checkpoint at commit. Closing the reader does not retry it, so the next complete save can append a second large batch and exhaust disk before reaching its own commit. Short backup batches alone did not prevent a live post-copy failure.
- **decision**: Request a SQLite restart checkpoint before each world transaction. A busy result defers its callback entirely; the simulation retries the exact computed checkpoint before advancing further, with temporary proposal unavailability and preserved receipt replay. Share one asynchronous online-backup helper with short read batches, a deadline, exclusive completed-file publication and staging cleanup.
- **alternatives**: A passive checkpoint only at commit is too late to admit the next large write safely. A single long copy reader retains several save batches. Increasing retained-log limits or copying an active main database file without SQLite does not establish a safe consistent boundary.
- **consequences**: Node 22.16+ is required for its native backup API. One complete transaction, destination copy and migration still require measured capacity; checkpoints do not make monolithic saves incremental. Reader waits preserve clock debt and bounded unsaved work, while arbitrary disk/I/O failures remain distinct faults. File publication requires hard-link and directory-sync support. Physical laws, saved-state format and population are unchanged.

---

### ADR-033: Preserve Migration History in Verified Compressed Blocks

- **date**: 2026-10-08
- **status**: accepted
- **context**: Large plaintext migration archives and a complete rollback clone consume scarce disk and memory before a new physical law can be applied. The collapse corrections need a migration path that preserves existing history within measured host limits.
- **decision**: Version the storage schema independently, retain every old plaintext archive byte, and write new ordinary-JSON archives as compressed 256 KiB blocks with per-block and complete-original checksums. Archive and transform exclusively owned loaded state within the same transaction as the new checkpoint and interventions. Keep the caller-preserving public migration default and one registry of transformations. Exercise real migration archival during private preflight.
- **alternatives**: Deleting earlier archives loses evidence. Compressing a complete serialized world still allocates that large string and buffers. Silently skipping archival in preflight fails to exercise the deployment path. A generic in-place public default could mutate state still owned by callers.
- **consequences**: The additive schema transaction can survive a later failed physical migration, whose checkpoint/history changes roll back. New archive verification bounds compressed and expanded block sizes; legacy verification remains an offline, potentially large-row operation. Largest-record memory, existing plaintext storage, one full checkpoint and combined live/preflight memory remain limits. Future incompatible storage evolution must also strengthen gateway rollback compatibility beyond the metadata checksum. No physical law or inhabitant changes follow from storage version 1.

### ADR-034: Body Protection Requires Performed Local Work

- **date**: 2026-10-08
- **status**: accepted
- **context**: The exact historical replay finds a child dying from cold beside usable fiber, with no caregiver action path. Automatic adult wrapping also supplies protection without competing for work time.
- **decision**: Extend repair tasks with a local recipient and target covering mass. Earn transfer capacity only during an existing active task, then commit finite fiber movements at a common boundary after individual physiology and movement. Share the signed heat calculation with physiology and reinforce each actor's actual marginal result. Observable opposing self-adjustment prompts an ordinary new choice.
- **alternatives**: Free protective bonuses would bypass material and time constraints. A kin-only or universal consent flag would invent social authority and exclude observable physical possibilities. Reading another person's private task as assent/refusal would grant hidden information. Sequential transfer commits would permit ordering-dependent stock reuse.
- **consequences**: Format 10 / biosphere-1.4 records changed future behavior with a state-preserving migration. Contact is still approximated by one occupied surface cell; controller probabilities, age/work thresholds and target estimates require calibration. Body-transfer ordering is corrected within its scope; food allocation, baseline metabolic energy, childhood growth and demographic balance remain separate work.
