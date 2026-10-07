Original prompt: let's rebuild the whole game, from the ground up, as an internet browser game, where people can plug their agent (any, from codex to grok bot or hermes) and they can just watch their mini autonomous civilisation grow. it's like watching plants grow... but it's a real civilisation simulation, as pushed as we possibly can.

## Accepted direction

- One persistent shared world. People can observe or connect an agent to a community; the world continues while everyone is offline.
- Fixed, inspectable natural constraints; no building recipes or technology unlock tree. Outcomes arise from coupled processes, resources, geometry, and behavior.
- An old Earth-like planet with a star and moon, an immense frontier, diverse ecosystems, and small initial human groups.
- Elements, weather, geology, seasons, day/night, age, precise time, and explicit entropy mechanisms. Spend complexity on mechanics and intelligence.
- Keep the same world through hotfixes, recorded as interventions. Vercel hosts the browser; one Railway service and persistent volume own the simulation.
- Eight founders is a provisional opening balance, not a demonstrated minimum viable population.

## Implemented foundation

The active runtime is TypeScript: `src/simulation/`, `src/server/`, and `src/client/`. Python/Pygame code is retained as historical reference, with its independent assessment under `docs/assessment-2026-10-07/`. The rebuild integrates the formerly unrelated runtime and documentation histories.

Current state format: **7**. Natural-law version: **biosphere-1.1**. The model includes elemental ledgers, reduced weather and geology, 18 plant and 20 animal lineages, inherited traits, autonomous needs and material experimentation, geometry-derived shelter, and scoped HTTP/MCP actions. The observer has actual seeded-planet onboarding, landscape inspection, a periodic/clock/entropy field guide, persistent journal, and recorded interventions.

SQLite stores region checksums, ownership, agent keys, events, migrations, and the clock checkpoint. One-writer leases, bounded missed-time recovery, an expected-world safeguard, and consistent online backups preserve continuity. Unknown or corrupt state never triggers an automatic replacement world.

## Hosting and continuity

The website is **https://praxans.vercel.app**. The world runs on Railway with `/data/praxans.sqlite` on the existing persistent volume. Production must retain `PRAXANS_REQUIRE_EXISTING_WORLD=1`, one replica, and server sleeping disabled.

The first live off-service backup passed SQLite integrity and world/region checksum inspection at tick 4736: seed 1847, 24 people, three communities, nine regions. The world resumed after the hosting update and recorded `browser-foundation-1-hosting` at tick 5972. Never use this live universe for automated mutation tests or create another public copy to test a change.

The infrastructure definition is `.railway/railway.ts`; it preserves existing variables and explicitly retains the volume attachment. Review a plan before applying. Authentication state, local host links, world databases, backup files, and generated screenshots remain outside Git.

See `docs/hosting.md` for procedures and `docs/releases/browser-foundation-0.1.md` for provider artifacts and final verification scope.

## Validation

- 43/43 model and server tests passed in the final local run.
- 36/36 browser checks passed, with actual screenshots opened and inspected.
- 10/10 compiled production checks passed, including restart, downtime recovery, agent continuity, and actual backup restoration.
- Nine 14-day founding trials passed their opening survival checks; results include current model versions in `docs/validation/founding-trials.json`.
- Production build and formatting checks passed. The container was built on Railway; local Docker is unavailable.
- The supplied develop-web-game client ran against a disposable local save. `render_game_to_text` and test-only `advanceTime` remain available; production refuses manual clock controls.

Validation details and practical limits are in `docs/validation/README.md`. A short deterministic run is not proof of long-term ecological or demographic stability.

## Next core work

The latest user question asks what fundamentals remain missing. `docs/fundamentals.md` is a proposal, not a physical intervention. Priority contracts are full represented energy accounting, useful material transformations and chemical form, continuous planetary state across levels of detail, local information, demographic viability, ecological regulators, transport, and external-agent authority/decision time.

Only materialized regions currently run detailed simulation. There is no general chemical solver, complete planetary entropy ledger, open-ended speciation, demonstrated multi-generation population viability, or recoverable player account yet. Do not imply otherwise in product copy or release notes.

Future changes must start from the living world's current history, with targeted causal tests, longer seasonal/generational ensembles, a migration argument where needed, a verified backup, and a recorded intervention. Do not replay or rewrite its creation to fix new assumptions.
