"""Source-derived arithmetic only; no world, database, host, or Git operations.

The constants are explicit inputs read from the named source files. This is not
a stepWorld replay, a physiological calibration, or a human survival forecast.
"""

from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import math
import re

ROOT = Path(__file__).resolve().parents[2]
SOURCES = [
    "types", "content", "laws", "chemistry", "citizens", "physiology",
    "weathering", "subsistence", "engine",
]
fingerprints = []
for name in SOURCES:
    relative = f"src/simulation/{name}.ts"
    fingerprints.append({
        "path": relative,
        "sha256": hashlib.sha256((ROOT / relative).read_bytes()).hexdigest(),
    })

assert fingerprints == json.loads(
    (ROOT / "docs/research/starvation-storage-arithmetic.json").read_text()
)["sourceFingerprints"], "Historical inputs changed; use the pinned checkout in collapse-reproduction.md."

# Refuse to attach current fingerprints to obsolete copied constants after a
# model change. These are guards on this audit's inputs, not implementation tests.
contracts = {
    "types": [r"HOURS_PER_TICK\s*=\s*0\.25"],
    "content": [r"biomass:\s*\{[^}]*carbon:\s*0\.94,[^}]*mineral:\s*0\.06,"],
    "laws": [r"chemicalEnergy:\s*17000,"],
    "citizens": [
        r"person\.hunger < 12",
        r"dt \* 0\.015",
        r"person\.health - dt \* 1\.15",
        r"person\.hunger \+ meal \* 48",
        r"Math\.min\(meal \* 0\.35,",
        r"person\.age < 12\s*\? 1\.15\s*:\s*\(active \? 1\.75 : 1\.3\)",
    ],
    "physiology": [r"basalWatts:\s*85,", r"restingWatts:\s*25,", r"activeWatts:\s*75,"],
    "subsistence": [r"winterDailyFoodKg:\s*1\.6,", r"planningSpoilagePerDay:\s*0\.006,", r"longestReserveDays:\s*180,"],
    "weathering": [
        r"2 \*\* \(\(tile\.temperature - 20\) / 10\), 0\.05, 8",
        r"0\.004 \* warmth \* \(1\.3 \+ damp\)",
        r"1 - protectedFraction \* 0\.6",
    ],
}
for name, patterns in contracts.items():
    text = (ROOT / f"src/simulation/{name}.ts").read_text()
    for pattern in patterns:
        assert re.search(pattern, text, re.S), f"Audit inputs changed in {name}; review arithmetic before rerunning."

dt_hours = 0.25
organic_fraction = 0.94
chemical_kj_per_organic_kg = 17000
food_kj_per_kg = organic_fraction * chemical_kj_per_organic_kg
catabolism_kg_per_hour = 0.015
low_hunger_damage_per_hour = 1.15
initial_health = 100
low_hunger_ticks = math.ceil(initial_health / (dt_hours * low_hunger_damage_per_hour))
low_hunger_hours = low_hunger_ticks * dt_hours
body_consumed_kg = catabolism_kg_per_hour * low_hunger_hours

food_rates = {"restingAdult": 1.3, "activeAdult": 1.75, "child": 1.15}
appetite = {}
for name, rate in food_rates.items():
    daily_food = rate * 24 / 48
    appetite[name] = {
        "nourishmentPointsPerHour": rate,
        "equilibriumMealKgPerDayIgnoringGrowthAndThermalFood": daily_food,
        "meanChemicalWattsIfEntireMealRespired": daily_food * food_kj_per_kg / 86.4,
        "hoursToNourishment12From90ContinuousArithmetic": (90 - 12) / rate,
        "hoursToNourishment12From100ContinuousArithmetic": (100 - 12) / rate,
    }

def reserve(demand, decay, days):
    return demand * days if decay == 0 else demand * math.expm1(decay * days) / decay

stock = 144000
days = 180
conditions = []
for temperature in [-30, -10, 0, 10, 20]:
    warmth = min(8, max(0.05, 2 ** ((temperature - 20) / 10)))
    for name, raw_damp, protection in [
        ("dry", 0, 0),
        ("dampUnprotected", 1, 0),
        ("dampFullyProtected", 1, 1),
    ]:
        damp = raw_damp * (1 - protection * 0.6)
        rate = 0.004 * warmth * (1.3 + damp)
        conditions.append({
            "temperatureC": temperature,
            "condition": name,
            "thermalFactor": warmth,
            "lossRatePerDay": rate,
            "fractionLostAfterOneDay": -math.expm1(-rate),
            "kgLostFrom144TonnesInOneDay": stock * -math.expm1(-rate),
            "halfLifeDaysWithoutUseOrProduction": math.log(2) / rate,
            "fractionRemainingAfter180DaysWithoutUseOrProduction": math.exp(-rate * days),
            "constantConditionInitialReserveKgFor1_6KgDailyFor180Days": reserve(1.6, rate, days),
        })

target = reserve(1.6, 0.006, days)
sources = [
    {
        "id": "F01",
        "author": "FAO/WHO/UNU",
        "title": "Human energy requirements, chapter 2: Principles and definitions",
        "publicationYear": 2004,
        "url": "https://www.fao.org/4/y5686e/y5686e04.htm",
        "accessedOn": "2026-10-08",
        "readScope": "Selected HTML passages from sections 2.1–2.4 and the energy-unit footnote; title/contents page also read.",
        "claimType": "expert_methodological_synthesis",
        "use": "Energy intake, expenditure and tissue deposition require distinct accounting; basal energy depends on body size/composition and state; 1 kcal = 4.184 kJ.",
        "limits": "Healthy-population dietary guidance is not a starvation mortality curve or validation of this model's body pool, damage coefficients or normative goals. Underlying studies were not independently read.",
    },
    {
        "id": "F02",
        "author": "FAO/WHO/UNU",
        "title": "Human energy requirements, chapter 3: Energy requirements of infants from birth to 12 months",
        "publicationYear": 2004,
        "url": "https://www.fao.org/4/y5686e/y5686e05.htm",
        "accessedOn": "2026-10-08",
        "readScope": "Selected HTML passages in sections 3.1 and 3.3 on doubly labelled water, tissue synthesis/deposition and body-composition measurement; methodological limitations in section 3.4.",
        "claimType": "expert_methodological_synthesis",
        "use": "Measured expenditure already includes thermoregulation and tissue synthesis; stored tissue energy is added separately. Body-composition measurement determines the meaning of mass-based comparisons.",
        "limits": "No table or equation was fitted to Praxans. The component studies, particularly their malnutrition data, were not independently read; no infant survival limit is inferred.",
    },
]

result = {
    "schemaVersion": 1,
    "recordedAtUTC": datetime.now(timezone.utc).isoformat(),
    "method": "Closed-form source arithmetic; no simulation, saved world, database, host or Git access. State-independent comparisons do not predict historical death times.",
    "sourceFingerprints": fingerprints,
    "units": {
        "simulatedHoursPerTick": dt_hours,
        "ticksPerSimulatedDay": 96,
        "nourishmentAndPersonalEnergy": "dimensionless 0–100 indicators; personal energy is a rest/fatigue indicator, not kJ",
        "bodyAndFood": "kg of an effective 94% organic/6% mineral material; hydration is separate; not anatomical fat or fresh-food mass",
        "chemicalKJPerKgOrganic": chemical_kj_per_organic_kg,
        "chemicalKJPerKgFoodOrBody": food_kj_per_kg,
        "chemicalKcalPerKgFoodOrBodyUsing4_184KJPerKcal": food_kj_per_kg / 4.184,
    },
    "isolatedLowHungerGate": {
        "assumptions": "Starts below 12 nourishment at 100 health; enough oxygen and body substrate; no feeding, thermal/disease/dehydration injury, recovery or other processes. Only the low-hunger subtraction is counted.",
        "healthLostPerHour": low_hunger_damage_per_hour,
        "bodyCatabolismKgPerHour": catabolism_kg_per_hour,
        "ticksToRemove100Health": low_hunger_ticks,
        "simulatedHoursToRemove100Health": low_hunger_hours,
        "bodyConsumedKgOverThoseTicks": body_consumed_kg,
        "remainingBodyKgFrom18": 18 - body_consumed_kg,
        "remainingBodyKgFrom2": 2 - body_consumed_kg,
        "chemicalKJReleasedPerHourAtFullCatabolism": catabolism_kg_per_hour * food_kj_per_kg,
        "equivalentChemicalWattsAtFullCatabolism": catabolism_kg_per_hour * food_kj_per_kg / 3.6,
        "creditedRestingWattsAt18KgBody": 110,
        "creditedActiveWattsAt18KgBody": 160,
    },
    "appetiteArithmetic": appetite,
    "growingChildMeanChemicalWattsAt35PercentMealRetention": appetite["child"]["meanChemicalWattsIfEntireMealRespired"] * 0.65,
    "seasonalTarget": {
        "equation": "S0 = c*expm1(k*D)/k solves dS/dt = -c-k*S with S(D)=0; zero-k limit is c*D",
        "assumptions": "Continuous constant loss and demand, no production, accessible homogeneous stock; real source decay occurs once per day and varies by local conditions.",
        "dailyDemandKgPerPerson": 1.6,
        "planningLossRatePerDay": 0.006,
        "days": days,
        "maximumKgPerPerson": target,
        "maximumKgFor300People": target * 300,
        "zeroLossKgPerPerson": reserve(1.6, 0, days),
        "requiredKgForConsumptionBeforeEndOfDayDecay": target * 0.006 / math.expm1(0.006),
        "requiredKgForBeginningOfDayDecayBeforeConsumption": target * 0.006 / math.expm1(0.006) * math.exp(0.006),
    },
    "stockDecayConditions": conditions,
    "thermalClamp": {
        "coldFloorFactor": 0.05,
        "coldFloorBeginsAtTemperatureC": 20 + 10 * math.log2(0.05),
        "maximumWetRateReductionWithFullProtection": 1 - 1.7 / 2.3,
        "note": "These are effective assumptions, not empirical lower bounds on all food deterioration.",
    },
    "consultedSources": sources,
}

assert low_hunger_ticks == 348
assert math.isclose(food_kj_per_kg, 15980)
assert math.isclose(target, 518.5812136171572, rel_tol=1e-8)
assert reserve(1.6, 0, 180) == 288
output = ROOT / "output/research/starvation-storage-arithmetic-recheck.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({
    "method": "arithmetic only",
    "lowHungerHours": low_hunger_hours,
    "catabolizedKg": body_consumed_kg,
    "maximumReserveKgPerPerson": target,
    "conditions": len(conditions),
    "output": str(output.relative_to(ROOT)),
}, indent=2))
