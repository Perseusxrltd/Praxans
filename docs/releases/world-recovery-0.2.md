# World recovery and agency 0.2

Released **world-recovery-20261008**, format **8**, natural laws **biosphere-1.2**, on 2026-10-08. The repaired Railway runtime and compatible Vercel website are live. The world is processing accumulated clock debt; deployment success does not mean that catch-up has completed.

The previous runtime halted when accumulated biochemical rounding error exceeded a tolerance tied to its shrinking remaining energy pool. Its earlier weather model had already overheated inhabited regions. The saved world retains four historical communities, no living people or animals, and 132 small plant cohorts. See the [incident investigation](../validation/recovery-2026-10-08.md).

This release conditions numerical conservation, balances atmospheric radiation, connects detailed regions to finite planetary heat reservoirs, separates ice from snow, corrects plant growth/wood turnover, and adds finite parent-funded dormant propagules. Existing deaths remain historical facts; no missing organisms or elapsed time are replaced. It also includes material aging, functional personal learning, locally deliberated agent advice, contact-dependent diplomacy, and an explicit new beginning after a community's extinction.

A stable HTTP/SSE gateway prepares subsequent compatible runtime hotfixes without dropping observer connections. Hash-checked immutable artifacts, copied-world preflight, a single ownership lease and durable activation pointers protect continuity. Installing that gateway requires this container deployment. Host, dependency and volume changes are still separate operations.

## Before deployment

The fresh consistent backup `before-recovery-release-20261008.sqlite` was taken from the existing halted service. Its SQLite integrity check passed. At **47,329,280 bytes**, its SHA-256 is **a8bbb992dfbfbc5866490479d71294e787e088f138108b7e0473d577b2dbeeed**, identical to the independently validated incident backup. The gzip representation has SHA-256 **b312bff9fce7f393915dfbee5d47e73e2230fdc4ebef799bf8a55e99f9c84282**. Local raw and gzip copies were verified. Older verified backups are retained compressed on the volume and as full copies off the service; only their redundant on-volume raw representations were removed to recover working space.

Local validation passed **85 model/server tests, 40 browser checks, 12 compiled-production checks, 9 extinction checks and 17 hotfix checks**, plus build, formatting and the supplied game interaction loop. The actual checkpoint migrated without inventory changes and ran 3,000 further ticks with exact reload. The final seasonal test covers 400 days. [Evidence and limits](../validation/README.md) distinguish these results from demographic or planetary equilibrium.

The clean source staging manifest has SHA-256 **150ac3470b45782e8371f80868e0b22950d8c15638f00c2dbcfd27141140fda3** (sorted JSON of relative file paths and SHA-256 values). It excludes databases, credentials, provider links and generated output.

## Deployment verification

| Artifact | Verified result |
| --- | --- |
| Runtime implementation | Git commit `64d4b76b5a5ff361d198fbf97b8f28edfff3d43d` |
| Railway deployment | `7c495f78-0d04-4e90-8994-91747e8a71de`, **SUCCESS**, actual Docker build and health check |
| Container image | `sha256:f66af5e8719dc154c224782950ecf8503800e6e90f22a5dabfd80c4b0c059da3` |
| Existing Railway service | `2369dffc-9a67-4d5f-8b7d-7647650d737b`, production; one awake replica |
| Existing volume | `f49046a9-e87e-4a6a-950b-204a69e9d856`, mounted at `/data`; expected-world guard retained |
| Vercel production | `dpl_2ataP7vjjr8HNy1huS4fiReBp4dV`, provider **READY**, target `production`, public protection disabled |
| Public website | [praxans.vercel.app](https://praxans.vercel.app) |
| Independent GitHub checks | [Push](https://github.com/Perseusxrltd/Praxans/actions/runs/37745511112) and [pull-request merge](https://github.com/Perseusxrltd/Praxans/actions/runs/37745516035) both passed for the implementation commit |

The [live continuity inspection](../validation/live-recovery-continuity.json), taken in one read transaction at **07:49:35 UTC**, checked tick **22740**, the same seed/world and 38 regions, valid saved checksums, all four community identities, unchanged ownership/agent/receipt signatures, and the exact original full-world archive checksum. Migration and release each have one permanent record at tick **20244**. Clock advancement is exactly **624,000 ms = 2,496 ticks × 250 ms**; no debt was erased.

At that inspection, 64 growing plant cohorts remained (3.631 kg tissue), with no living people or animals resurrected. Later health at **07:50:16 UTC** reported tick **23136**, `ok: true`, and 47,592 seconds of real-time debt. It advanced 2,028 ticks in approximately 230 seconds between recorded health samples, and debt decreased. Recovery can take hours on this host. New founding and agent decisions are restricted while it catches up, with observation available.

The small volume had about **189 MB** free after verified backup compression. A capacity sample, including the inspection process, used approximately **593 MB** of its **1,000 MB** memory limit, with no cgroup OOM events. These are observations, not a large-world capacity guarantee. Future preflight copies and backups need adequate temporary space; off-service scheduled retention is still operator work.

Browser flows and screenshots were verified locally. Vercel deployment success is established from provider metadata; the deployed Vercel URL was not fetched during release verification. Direct Railway health and database continuity were checked. The 17 seamless-handover checks ran against disposable worlds; this release installed the gateway through one normal container deployment.


## Subsequent ecological observation

At **09:00:57 UTC**, the same live world reached tick **61908**: **434 simulated days** beyond the intervention. [The recorded observation](../validation/live-recovery-434-days.json) verifies unchanged region count, agent keys, receipts, original archive and exact clock advancement. A follow-up confirms that all seven original sessions are unchanged, alongside three newly created observer sessions. Growing plant tissue increased from **6.332 kg** at the stopped checkpoint to **142.250 kg**, with **58 plant cohorts** and **267 dormant cohorts** holding another **28.236 kg**. These reserves arose through funded reproduction; the migration created no propagules. Temperature was -3.36 to -0.87 degrees Celsius at this sample.

This demonstrates natural producer recovery in the actual formerly collapsing regions, beyond the shorter offline test. It does not repopulate extinct people/animals or establish indefinite ecological equilibrium. The runtime was still processing approximately 42,140 seconds of clock debt.
