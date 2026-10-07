# Browser foundation validation

Validated locally on 2026-10-07 with Node 22.22, Chromium/Playwright, native SQLite, and the format-7 / biosphere-1.1 model. The legacy Python assessment has its own [separate evidence](../assessment-2026-10-07/README.md).

## Model and server checks

The automated suite covers deterministic tick replay and serialization, elemental/biochemical balances, geometry-derived shelter, atomic construction and trade, scoped HTTP/MCP requests, and the causal dependencies of plant growth, food webs, weather, astronomy, and mineral transport.

The final local run passed **43/43 model and server tests**, with no skipped or cancelled tests. The TypeScript/client/server build and formatting checks also passed, including the pinned Railway infrastructure definition.

Persistence checks cover registered migrations, unchanged older-world inventories and geography, pre-migration snapshots, rejected unknown/corrupt saves, permanent events beyond the in-memory ring, transactional rollback, consistent backups, a single clock owner, downtime recovery, and refusing to generate a replacement for missing expected live state.

Clock and entropy checks cover the calendar, fine time beside geological age, time zones, conservation of exchanged heat, nonnegative irreversible heat-mixing production, blackbody radiation entropy, metabolic heat accounting, and honest measurement epochs.

The 24-day autonomous test with seed 1847 kept **24 people alive**, reached **12 assemblies**, and retained **54 observations**. Its final largest element error was approximately **0.000648 kg**, biochemical-energy error **0.000838 kJ**, and active-region temperatures **27.86–33.32 °C**. Each simulated day passed validation, including a bound against runaway temperature. This is one deterministic short-run scenario, not evidence of multi-generation equilibrium.

## Browser checks

The 36-check Playwright scenario covers the actual planet entrance, two independent observers, local pause, map layers, camera movement, fullscreen, people and wildlife inspection, all 118 elements and reference phase changes, the full clock, real entropy counters, recorded interventions, archive pagination, frontier founding, key issuance/copy/revocation, a real agent decision, and mobile layouts.

Screenshots were opened and inspected; browser console/page errors were checked. The supplied `develop-web-game` interaction client also exercises the observable game hooks. Browser screenshots and state reports are generated under `output/playwright/`, with selected non-secret views copied into `docs/images/`.

## Compiled production checks

The ten-check production scenario runs the compiled server with its ordinary clock in a disposable database. It verifies background ticking, disabled manual time controls, the runnable example steward, online backup, restart continuity, missed-time recovery, persistent browser ownership and agent keys, release records, and restoration of the backup itself.

In the recorded run the ordinary save resumed from tick 19 to tick 40 after an interruption; its online backup at tick 14 also resumed with the original owner/key. Tick counts vary slightly with machine scheduling; the continuity assertions are the acceptance criterion.

## Founder population trials

`npm run balance:founders` compares **4, 8, and 12 founders per community** in three seeded initial settings: temperate, warm/dry, and cool/wet. Equal supplies per person and autonomous behavior are used; no external AI assists them. All nine 14-day runs retained their initial populations. The current machine-readable results include the law and state versions in [founding-trials.json](founding-trials.json).

These trials support a survivable opening under the tested conditions. They do not demonstrate that eight is optimal, cover every frontier biome, model long-term genetic viability, or establish that the ecosystem is stable for centuries.

## Reproduce

```sh
npm ci
npm test
npm run build
npm run test:production
npx playwright install chromium
npm run test:browser
npm run format:check
npm run balance:founders
```

Use only disposable saves for automated mutation and time-advance tests. Docker is not installed in the local validation environment; the Railway build is the container execution check. Provider deployment results belong in the release record and must be distinguished from these local checks.
