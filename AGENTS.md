# Agent notes for Praxans

Praxans is an authoritative Node/TypeScript shared-world simulation with a React browser observer. The Python/Pygame files are a retained historical reference. The user explicitly authorized the browser rebuild and model-neutral agent connections.

## Start here

1. Read `README.md`, `docs/architecture.md`, and `docs/model.md`.
2. Read `docs/hosting.md` before changing persistence or deployment.
3. Read `progress.md` for work in progress and `devlog/AGENT_GUIDE.md` before updating the devlog.
4. Inspect the actual file tree and existing tests before adding structure.

## Preserve the living world

- Never delete, reset, replace, or reseed a live database to accommodate code changes.
- Never start a fresh universe as a silent fallback for a missing expected volume, failed migration, corrupt save, or unknown version.
- Use one simulation process per database and persistent volume. Respect the ownership lease.
- Preserve integer ticks, RNG state, current inhabitants, material reservoirs, regions, agent ownership, and history across updates.
- Bump `WORLD_VERSION` for saved-state changes and the law version for changed physical rules. Add an explicit migration and a continuity test. Already revealed terrain and the world's generation version stay pinned.
- Give each deployed code release a unique `PRAXANS_RELEASE` and a factual description. Physical interventions must be visible in the permanent record.
- Back up before a live hotfix; validate the backup. A data migration can make a blind code rollback incompatible.
- Browser pause affects only observation. External agents cannot set the clock, create resources, or bypass natural laws.

## Runtime and verification

- Node 22.13+; `npm ci`, `npm run dev`, `npm run build`, and `npm start` are the supported entry points.
- Simulation state and deterministic logic belong in `src/simulation/`; transport and SQLite belong in `src/server/`; observation belongs in `src/client/`.
- Prefer coupled, measurable processes over scripted events, building recipes, technology trees, or invented resources.
- Keep model limits explicit. A reference element is not a full reaction network; coarse cohorts are not molecular biology; a large map is not infinite compute.
- Run the appropriate model/server tests after behavioral changes. Run build and production checks after lifecycle changes. Use real browser interaction and inspect screenshots after playable UI changes.
- `npm run test:browser` and `npm run test:production` create disposable saves. Never point automated mutation or time-advance tests at the live world.
- Keep the public `render_game_to_text` observer hook and test-only `advanceTime` hook usable. Production must not expose manual time controls.
- Do not run model inference or add hosted AI spending just to run the simulation. Players run their own agents through scoped HTTP/MCP connections.

## Metadata and privacy

- `.molthub/project.md` is canonical. Do not create `molthub.yaml` or `.mothub/`.
- Public metadata contains durable project identity and collaboration context, never private task boards, owner memory, credentials, live operator notes, or model keys.
- Saves, `.env` files, host linking files, tokens, caches, and generated browser output stay out of Git. Scope keys to one civilization and never include them in screenshots or logs.
- Preserve the user's WSL permission preferences and Windows/WSL configuration separation. Full local access does not authorize unrelated actions.

## Handoff

Report the runnable result, relevant checks, actual deployment status, and material model or hosting limits. Update the devlog and canonical public metadata when their durable facts change. Never describe a prepared configuration as a successful deployment.
