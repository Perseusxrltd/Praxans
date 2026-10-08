# Community renewal and operational recovery — 8 October 2026

At tick **195860**, the authorized intervention added **300 new adults to each of the four historical communities**, under the same community identities. The prior founders remain dead; their names, deaths, founding dates, ownership and recorded history were not rewritten. This was a finite operator intervention, not automatic respawning or natural generation of people. The [continuity record](community-renewal-continuity.json) identifies the actual runtime and retained archives.

## What failed before renewal

The [earlier investigation](recovery-2026-10-08.md) found an unfunded atmospheric heat loop, fragile plant/food mechanisms and a biochemical tolerance conditioned on a vanishing living pool. The format-7 world overheated, lost all people and animals, and finally stopped at tick 20276; the last valid saved checkpoint was 20244. Individual historical causes of death were not recorded well enough to assign an exact cause to every founder.

The format-8 recovery fixed the heat/numerical defects and preserved every missed tick. Surviving producers subsequently grew, but that did not recreate extinct people, animals or a complete terrestrial food web. A living carrier, viable habitat and material/energy sources are prerequisites for natural recolonization. Conservation cannot justify inventing organisms whenever a population reaches zero.

## The actual finite intervention

The format-9 / biosphere-1.3 migration added empty carried inventories to existing people and recalculated current structural affordances without granting matter or people. A separate, idempotent request then restored the communities at the migration's actual tick. Each arrival brought 480 kg food, 80 kg wood, 6 kg fiber, 5 kg stone and 2 kg clay. Clothing draws from real fiber. Established land plants and dormant propagules entered screened nearby patches; overlapping restoration areas did not receive a second identical grant.

| Community | New residents | Preserved historical deaths | Added growing plant tissue | Added dormant tissue |
| --- | ---: | ---: | ---: | ---: |
| Fernhaven | 300 | 9 | 150,534 kg | 1,703.4 kg |
| Amber Hollow | 300 | 7 | 20,628 kg | 1,726.8 kg |
| Stonebrook | 300 | 8 | 26,946 kg | 517.8 kg |
| Adonis | 300 | 8 | 372,474 kg | 4,148.4 kg |

These are measured boundary arrivals, not renewable allowances. No animals were introduced. Ordinary future founding uses the separately documented, smaller initial allocation in [the model](../model.md).

The live audit at **13:31:53 UTC**, tick **196276**, verified 1,200 living residents, unchanged original ownership/keys/receipts and the complete prior event prefix, both valid law archives, exact clock arithmetic and one operator record. Growing tissue measured 617,377 kg and dormant tissue 12,798 kg. The audit itself was too expensive for the hosting headroom; the memory incident below is part of this release's evidence.

## Survival and scale evidence

The physical correction connects clothing, metabolic heat, ice melting, carried food, remembered water, seasonal reserves, ground-distance walking and population-scaled camp area. At 300 residents, the camp targets at least 4,800 m² of connected available land. Rest and exposed-stock decay distribute across that area; unmet land requirements do not create new ground.

- A concentrated 300-person camp trial produced **44–49°C** local temperatures over fourteen days and was rejected. Distributing rest and stocks across real camp area retained all 1,200 residents with **22–23°C** camp temperatures in the corresponding candidate bundle. This is a bundle comparison, not isolation of every mechanism.
- The final seven-day coupled candidate retained all four groups of 300, with food reserves still finite. This short trial preceded later observation/evidence transport edits; it does not establish seasonal or genetic viability.
- Isolated 32-person, 600-day homes succeeded, but the combined seven-region seasonal trial left Amber Hollow and Stonebrook with only four and three people. The unsuccessful combined result remains a counterexample to claiming whole-world balance from isolated tests.
- A fresh independently verified production backup at **tick 204116**, 86 simulated days after renewal, still contains four groups of 300 and no subsequent human deaths or births. Adonis has about **130,121 kg food**, **7.62 shelter places**, and mean health **99.97/100**. The other communities have about 110–115 tonnes of food and 10–13 shelter places. This confirms the shelter shortage despite current survival; reserves and thermoregulation are not a replacement for housing or sustainable production.

The 300-person population has not passed multi-generation ensembles. Food/pile volumes, hauling, ventilation and stored-material heat capacity remain aggregate. One local assembly still requires half the community's adults; institutions spanning a large dispersed population are unresolved. Fauna remains absent from the historical world. See the [scale and open-endedness review](../research/scaling-and-open-endedness.md).

## Operational incidents and limits

The renewal runtime handover succeeded and live streams received the restored population. During the subsequent heavy archive/metadata audit and concurrent observation, the 1 GB host recorded an **OOM worker kill**. The continuing gateway restarted from its last durable checkpoint; two observers detected time moving backward and stopped. This was a visible continuity failure. Successful offline handovers do not erase it, and the precise allocating call responsible for the memory peak was not isolated.

At **13:43:56** and **13:51:58 UTC**, backup copies plus database/WAL growth exhausted the 500 MB volume and stopped saving. The transaction handler obscured SQLite's original disk-full error by attempting a second rollback. The observer hotfix preserves the original error. Only redundant or incomplete backup representations were removed, after independent verification where applicable; SQLite performed its own WAL checkpoints. The active database and its WAL were never manually deleted or replaced. Clock debt was retained.

The world resumed under `observer-scaling-20261008` at **14:02:57 UTC**. A later fresh backup was made in container scratch space and streamed directly to an independent local copy, with compressed/raw hashes, integrity and all region/archive checksums verified. It added no backup file to the data volume. Automated off-host retention, capacity alarms, bounded persistence and recovery from storage failure remain operational requirements.

Public observer projections and progressive loading reduce unnecessary work; they do not establish massive-population capacity. The [observer release](../releases/observer-scaling-0.2.md) and [CPU baseline](../research/restored-world-cpu-profile.md) record the actual scope.
