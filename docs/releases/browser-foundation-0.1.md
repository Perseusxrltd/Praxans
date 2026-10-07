# Browser foundation 0.1 — 2026-10-07

Praxans now has a browser observer, model-neutral HTTP/MCP agent connections, and one continuously running world. This is a coarse simulation foundation with [explicit limits](../model.md). The [fundamentals roadmap](../fundamentals.md) proposes the next physical, ecological, informational, and demographic work.

## Published artifacts

| Artifact | Release evidence |
| --- | --- |
| Public website | [praxans.vercel.app](https://praxans.vercel.app) |
| Vercel deployment | `dpl_Cw8qu4vnN893G9rfHvmt15nir1eU`, reported `READY`, production alias assigned |
| Vercel build | Static browser output with `/api/*` and `/mcp` forwarded to the Railway world |
| World service | [world-production-8384.up.railway.app](https://world-production-8384.up.railway.app) |
| Railway deployment | `05cfc6db-28d7-454f-b240-0f878cd0f8b0`, reported `SUCCESS`; Docker build and `/api/health` check passed |
| Runtime release | `browser-foundation-1-hosting`; state format `7`, laws `biosphere-1.1` |
| Hosting | One replica, server sleeping disabled, existing `world-volume` attached at `/data` |
| Source review | [`codex/praxans-browser`](https://github.com/Perseusxrltd/Praxans/tree/codex/praxans-browser), integrating the previously unrelated runtime and documentation histories |

The Vercel CLI assigned the first deployment to production even though the command omitted `--prod`. Future previews should explicitly use `--target preview`. Vercel verification used deployment metadata and the locally exercised browser build; the deployed Vercel URL was not HTTP-probed. Direct live Railway checks verified health, the accepted website origin, clock progression, and the intervention record.

## World continuity

The first creation recorded `browser-foundation-1` at tick 0. A consistent online backup at **tick 4736** was downloaded outside the hosting volume and passed SQLite integrity, metadata checksum, and every region checksum check. It contained seed 1847, 24 people, three communities, and nine regions.

The hosting change recorded `browser-foundation-1-hosting` at **tick 5972**, with identical before/after world checksums for that infrastructure intervention. After the final container deployment, inspection verified **tick 6900**, the same seed, 24 people, three communities, nine regions, format 7, and valid checksums. The live health endpoint subsequently reported ordinary running state with zero recovery lag. These ticks are observations from the release check, not a frozen display of the current world.

The running container confirmed:

```text
PUBLIC_ORIGIN=https://praxans.vercel.app
PRAXANS_DB=/data/praxans.sqlite
PRAXANS_REQUIRE_EXISTING_WORLD=1
PRAXANS_RELEASE=browser-foundation-1-hosting
```

World state, backup files, authentication state, and private agent keys are excluded from the source repository. The checked-in Railway definition preserves the existing variables and volume. The live universe was not reseeded during hosting updates.

## Validation scope

- **43/43** local model and server checks passed, including conservation, replay, causal ecology, scoped HTTP/MCP actions, migrations, entropy, leases, and expected-world enforcement.
- **36/36** real browser checks passed, including desktop/mobile observation, founding, the full key lifecycle, and a real agent action. Screenshots were opened and inspected.
- **10/10** compiled production checks passed, including ordinary background ticking, restart, missed-time recovery, consistent backup, and actual restoration with the original owner and key in a disposable world.
- **Nine founding trials** compared 4/8/12 people in three initial climates for 14 simulated days. All retained their founders; this is opening balance evidence only.
- TypeScript/client/server build and formatting checks passed. The final Docker image was built and health-checked by Railway.

See [the validation record](../validation/README.md) for reproducible commands and measurements. The GitHub workflow repeats the build, model/server, compiled-production, and browser checks for source changes.

## Practical boundaries

Detailed simulation currently covers materialized regions. General chemical reactions, ocean circulation, complete planetary energy/entropy accounting, open-ended speciation, and multi-generation population viability remain incomplete. External agents need an HTTP or MCP integration; no paid model inference is run by the world server.

Ownership currently depends on a browser cookie and scoped keys; recoverable accounts are future work. One server, 100 simultaneous observer streams, finite disk/CPU, and provider quotas constrain capacity. A verified first backup exists, but automated off-service backup retention is not configured. Future physical or saved-state changes need explicit continuity validation, backups, and a recorded intervention.
