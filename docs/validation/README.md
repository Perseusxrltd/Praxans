# Browser world validation

## Community following — 2026-10-08

The community update passes **13 targeted model/server tests**, covering scoped pagination, historical time bounds, complete/incomplete death records, read-only history, extinction, ownership and persistence. It also passes **40 general browser checks, 22 community/extinction browser checks, 12 compiled-production checks and 17 runtime-hotfix checks**, plus TypeScript/build and formatting. Browser scenarios reported no page or console errors; directory, memorial, followed-journal and mobile screenshots were opened and inspected.

The community scenario follows an extinct group, reads its final date, starts a separate community with the same owner, verifies old-key retirement and both historical links, filters followed founding stories, observes the new group's extinction, and retains both histories across reloads. These checks exercise disposable worlds; they never advance the live planet. The physical model is unchanged from the recovery release below.

The backup and deployed release evidence are recorded in [community records](../releases/community-records-0.2.md). Browser-local following is not an account or notification service; incomplete historical evidence remains explicitly unknown.

## Recovery and depth release — 2026-10-08

The current format-8 / biosphere-1.2 build passed **85 model/server tests, 40 browser checks, 12 compiled-production checks, 9 extinction/rebeginning checks, and 17 runtime-hotfix checks**. TypeScript, both application bundles and formatting passed. The supplied web-game interaction client also exercised the observer and manual test clock against a disposable local world. Current screenshots were opened and inspected; the browser scenarios reported no console or page errors.

The hotfix scenario retains the same public SSE connection, browser camera/selection, owner and agent key through a runtime replacement. It checks queued decisions, invalid-candidate rejection, one recorded intervention, persistence across a complete gateway restart, and shutdown during preflight without an orphaned simulation owner. This is a single-host runtime handover test, not proof of uninterrupted service during host or volume failure.

The [actual stopped-world continuation](recovery-continuity.json) migrates a consistent copy from tick **20244** and advances **3,000 ticks** (31.25 simulated days). It preserves the original identity, RNG, inventories, ownership, receipts, archives and clock rows, then verifies exact save/reload at tick **23244**. Of the original 132 small plant cohorts, **58 remain**, with organic tissue declining from **6.332 to 3.172 kg**. No people or animals are resurrected. The final temperature range is **−1.24°C to 4.16°C**. The approximately 2.02 kg oxygen residual was already present in the source; the migration does not erase it or rebase historical conservation counters.

A later [live observation at 434 days](live-recovery-434-days.json) reaches tick **61908** with the same original archive, ownership and precise clock accounting. Plant tissue has recovered to **142.250 kg**, and **267 dormant cohorts** hold **28.236 kg** of additional reserves. No people or animals returned. This is evidence of producer recovery in the actual saved world; the clock is still catching up and indefinite ecosystem stability remains unproven.

The [400-day ecological trial](seasonal-recovery.json) stayed between **−11.92°C and 27.49°C**, retained **11 plant lineages**, and ended with **3,192 dormant cohorts**. Growing tissue declined from approximately **39,226 to 4,246 kg**. This supports survival through the tested seasonal cycle, not a stable long-term biomass, all-biome equilibrium or multi-generation human viability. [The incident investigation](recovery-2026-10-08.md) explains the numerical halt, earlier overheating, rejected climate candidates and physical recovery mechanisms.

Performance changes have separate continuity evidence: [elemental accounting](element-kernel-continuity.json), [stable pathfinding](pathfinding-continuity.json) and [weather buffers](weather-kernel-continuity.json). Exact-result checks matter more than single-machine speed ratios. The actual 38-region continuation took about 504 seconds while other heavy tests ran; it does not establish live-host capacity.

Local logs and browser artifacts are under `output/validation/` and `output/playwright/` and remain outside Git. The [release record](../releases/world-recovery-0.2.md) identifies the successful Railway/Vercel artifacts and passing independent GitHub checks. [Live continuity evidence](live-recovery-continuity.json) verifies the exact original archive, unchanged ownership/keys/receipts and clock arithmetic while the same world catches up. Historical runs below describe the preceding model and must not be substituted for this release's checks.

```sh
npm ci
NODE_OPTIONS=--max-old-space-size=768 node --import tsx --test --test-concurrency=2 tests/web/*.test.ts
npm run build
npm run test:production
npx playwright install chromium
npm run test:browser
npm run test:extinction
npm run test:hotfix
npm run format:check
```

## Historical browser foundation — 2026-10-07

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
