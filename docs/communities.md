# Following a community through its history

The community directory distinguishes living groups from those with no living inhabitants. It can show every community, followed communities, living groups or historical groups; search is by name and the default order places the newest founding first. Beginnings within seven world days receive a dated marker. A living group receives a needs-care label when someone has nourishment below 20% or health below 35%; this is an observation, not a prediction of extinction.

Following is personal browser state, limited to 64 communities and scoped to the world identity/seed. The list survives reloads and synchronizes between tabs in the same browser. Extinction does not remove a followed group. Account recovery, synchronization between devices and external notifications are future work.

The main observer surfaces followed communities. Their combined stories are available in the journal, alongside a selector for the whole world or any individual group. Community and category filters apply in the database **before** pagination, so a busy unrelated community cannot bury the requested records. `through` bounds a historical view at its displayed world tick. Observation never advances or rewrites simulation state.

## Beginnings, endings and later chapters

Every community retains its identity, founding tick, population counters, observations, material records and permanent events after its last inhabitant dies. Structures and landscape keep participating in the physical simulation. The observer can visit the former home and read births, deaths, experiments, construction, exchanges and diplomatic records. Current institutions and agent activity are not presented as living governance for an extinct group. Agent advice already requires living inhabitants to deliberate.

An ending is dated from the latest archived individual death only when the number of archived death records equals the community's saved death counter and no living inhabitants remain. Tick zero is a valid date. Incomplete or not-yet-committed records leave the final date unknown; no retrospective biography or cause is fabricated. The detail in each original event remains inspectable, including vital measurements only where that release recorded them.

New beginnings by the same steward link back to the earlier community through the existing `relatedId` on the recorded chapter event. This identifies stewardship continuity; the new founders are separate people. Actual branches record the source community in their founding event. Earlier branches whose source was never explicitly recorded remain unlinked. Historical links are readable from both sides.

Material inheritance, abandonment of territorial claims, reoccupation of ruins, merged/dissolved institutions and detailed genealogies still need explicit mechanisms. Existing territory labels retain their recorded attribution. A searchable archive does not itself simulate cultural transmission or preserve knowledge in living minds.

## Read interface

- `GET /api/journal?communities=civ-1,civ-11&category=life&through=192&before=123` reads up to 60 matching records, with an earlier-page cursor. Community lists are optional, validated and limited to 64; an empty explicit list is invalid. Omitting the list reads the whole world.
- `GET /api/communities/civ-1/record?through=192` returns archived event/death counts, first and latest events, the last recorded death and explicit links to branches/other chapters. The community must exist and the requested tick must fall between its founding and the current world tick.

These endpoints are public observer reads, with parameterized queries and indexes over the existing journal. They return no session or agent-key data. The additions use the existing format-8 event fields and do not change the natural laws, inventories or clock.
