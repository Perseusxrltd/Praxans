# First child death: finite-fiber counterfactual

Recorded 2026-10-08. The [historical replay](collapse-first-death-replay.json) reproduced the complete first death event at tick 231549 exactly, from the verified tick-228436 backup under revision `4ed610b`. The observational trace proves that heat regulation reduced Kira Moss's health from **0.9711685799370396 to 0** on the final call. This establishes a proximate cause for this child, without assigning every historical death to the same cause.

The [new probe](first-child-wrap-counterfactual.mjs) runs two isolated calls to the same physical heat-regulation implementation. A read-only source comparison found that the historical physiology file differs only by its diagnostic wrapper and function rename; material properties and respiration laws are identical. The synthetic fixture uses the exact recorded age, body, nourishment, hydration, temperature, activity, shelter resistance, stock access and food/fiber amounts. Other inhabitants and the original camp geometry are not reconstructed.

| Quantity                                  | Recorded bare state | 2 kg already allocated as a wrap |
| ----------------------------------------- | ------------------: | -------------------------------: |
| Total initial fiber, kg                   |  327.15403560661093 |               327.15403560661093 |
| Fiber left in stock initially, kg         |  327.15403560661093 |               325.15403560661093 |
| Initial health                            |  0.9711685799370396 |               0.9711685799370396 |
| Additional heat required in 0.25 hour, kJ |   252.1092248631205 |               31.877851048655497 |
| Final health                              |                   0 |           **0.8383442005676418** |
| Final wrap, kg                            |                   0 |               1.9999925000140626 |

Both cases have zero food, the same 17.907914960749917 kg body compartment, 62.243991178266036 nourishment, 5.298228740187476 kg hydration, 6.940471937138853°C local temperature, no shelter resistance and inactive metabolism. These values remain unchanged during the calls. Hydration is high enough that melting is not attempted, and neither case enters the sweating branch. The wrapped case returns **0.000007499985937409193 kg** of worn fiber to detritus.

Maximum element-ledger residual is **4.547473508864641×10⁻¹³ kg**; chemical energy plus released heat has residual **4.76837158203125×10⁻⁷ kJ**. No food is added or consumed, and neither world advances a tick. [Unrounded results and provenance](first-child-wrap-counterfactual.json) retain the source and replay fingerprints.

Earlier available protection prevents death during this particular thermal call. Preallocation is an intervention comparison: it does not implement instant care or account for earlier work to arrange that wrap. The child still loses **0.13282437936939784 health**, and the missing food/body-reserve connection remains. No conclusion about survival through the day, winter or entire population follows. The next implementation needs an actual finite-material, finite-work care path and a coherent metabolism budget, while retaining the original historical death.
