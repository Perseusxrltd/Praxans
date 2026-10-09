# Funded human metabolism

Prepared 2026-10-09. **Candidate; live activation is still pending.** Target release `funded-metabolism-20261009-1`, world format **12 / biosphere-1.6**, storage **1**. The previously published runtime remains `ration-boundary-20261009-1` until verified handover.

The collapse investigation found that the thermal model credited baseline body heat without corresponding oxidation. Meals, hunger-triggered catabolism and cold costs used separate accounting paths. A full nourishment indicator was not evidence of available energy. This correction supplies maintenance, heat and activity from one finite substrate budget; it does not rewrite the historical deaths or establish natural demographic balance.

## Material and energy account

| Quantity | Meaning and custody |
| --- | --- |
| `body` | Existing biomass-equivalent body material, including reserves; hydration is separate. This is not anatomical total body weight. |
| `metabolism.intake` | Actual swallowed, unoxidized biomass-equivalent kg. Counted separately in element and chemical-energy ledgers. |
| `metabolism.reserves` | A mobilizable subset already included in `body`. Never counted twice or replenished by resetting its fraction. |
| `metabolism.last` | Measured interval: ingestion, oxidation, retention, demand, released heat, melting, deficits, metabolic health loss and funded activity. |

At 18 kg represented body, resting maintenance requests 110 W and active maintenance 160 W. A kg of the current food material contains 15,980 kJ chemical energy. Oxidation is limited by oxygen, actual intake/reserves, a 440 W maximum and a separate 220 W reserve-release limit. Those limits scale with the existing body approximation; cold does not increase reserve-release capacity by itself. These are engineering assumptions requiring calibration.

The required release is the larger of maintenance and outward heat plus requested melting. Maintenance becomes heat, so adding it to the whole outward loss would count the same packet twice. `respire` supplies the sole oxidation, gas products, chemical release and environmental heating. Melting and sweat remove heat once; minerals and water retain their physical destinations. Signed ambient heat still drives sweating when the environment is hotter than skin.

Intake is used before reserves. Spending reserves reduces both their subset tag and total body material, leaving represented structure intact. A single retention allowance, bounded by `food oxidized × 0.35 / 0.65`, restores reserves before structural growth. It does not repeatedly convert a percentage of the remaining meal buffer on every tick. The inherited growth target, body composition, retention and injury dose remain coarse, uncalibrated approximations.

## Ordered needs and performed activity

All people first prepare their interval. Competing melt requests reserve one finite snow/ice budget per source, capped by available heat power; actual melting still requires paid energy. Current metabolic food requests then share finite reachable camp or caravan supplies, using each holder's own food first. After all current metabolism, optional intake refills precede personal ration pickup. Private custody is retained. Proportional allocation, automatic ingestion and the absence of handling labor remain explicit controller conventions.

Existing physical work and travel receive only the activity fraction funded after resting maintenance. A new task starts its physical interval on the following tick. Stationary conversation uses paid resting metabolism. An existing water-seeking route retains its purpose while thirst persists, so repeated interruption cannot cancel every attempted step. Remembered frozen water can be considered when a person has internal substrate; knowledge of ice alone cannot guarantee enough melting power.

Satiety now follows intake fullness. The historical `hunger` field and agent `nourishment` alias remain, alongside an explicit `satiety` alias. They are not chemical reserves or a starvation diagnosis. A legacy value is replaced at the first metabolic interval. The observer and agent briefing expose intake, usable reserves and measured deficits. Death returns body plus remaining intake exactly once, and future death records preserve the last metabolic interval.

## Preservation and validation

Migration `012-funded-human-metabolism` retains existing body mass and initializes intake empty. It labels 10% of each existing body as a usable subset, adding no matter or inferred historical meal. It preserves inventories, identities, terrain, RNG, clock, ownership and prior history. No community renewal, resurrection or clock reset occurs. Earlier binaries cannot resume format 12.

The new focused tests cover empty reserves despite high nourishment, equal food/reserve oxidation, pulsed meals and time subdivisions, oxygen shortage, signed heat and ice, insulation/power limits, independent reserve amount/capacity sensitivity, one retention allowance, shared scarcity and private custody, finite shared ice, paid work/conversation/journeys, death, actual childbirth and save migration. Existing water-route, care, food, construction-evidence and earlier-format tests exercise the integrated behavior.

The [measured validation record](../validation/funded-metabolism-2026-10-09.json) retains all twenty new metabolic cases, the 188/189 full test batch and its 2/2 corrected-fixture recheck, thirteen focused browser checks, sixteen connection checks, twelve isolated production checks and 21 generic hotfix checks. Screenshots and the supplied unmodified game client were inspected. The contended production timeout remains recorded alongside its successful isolated retry.

The exact artifact passes sixteen checks against a disposable copy with 1,439 original people. One compressed observer continues through migration, at least 96 further committed ticks and a later restart, retaining every original person, ownership, earlier history and exact clock debt; five ordinary births yield 1,444 people. Under the 454,299,648-byte filesystem quota and 315 MB initial non-WAL budget, minimum free space is only 6,561,792 bytes. The local combined RSS exceeds the live 1 GB allowance, so this does not prove that inhabited live preflight fits that host.

A fresh current-world backup at tick 356816 independently passes SQLite integrity, metadata/38-region hashes and all four complete prior-archive hashes. Its disposable migration, three further writes over 96 ticks and restart pass under the same quota and a 216 MiB effective validation heap. A simultaneous seven-day inhabited attempt exceeds its six-minute compute budget without a final result. No seasonal survival claim follows. Live publication remains pending.

## Remaining limits

The model has no organs, core body temperature, tissue-specific fuel chemistry, gestational energy account or validated starvation survival curve. Structural tissue is protected after mobilizable reserves run out. Infant feeding, age-dependent growth, nutrition, recovery and metabolic injury still need causal and empirical validation. Oxygen contention remains sequential; unused ice reservations are not reassigned within the interval. Mechanical work is a coarse paid-activity allowance, not a full potential-energy solver. Personal food spoilage and voluntary provisioning institutions remain open.

The [historical collapse study](../research/community-collapse-2026-10-08.md) remains authoritative about the former runtime. A short inhabited-copy trial does not prove sustainable carrying capacity, season-long survival or generational viability.
