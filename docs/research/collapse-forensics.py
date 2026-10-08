"""Read only the verified local backup's public simulation events/history.

No Store/world loading, world advancement, SQL writes, authentication tables,
network, Git, or live paths. Output is aggregate evidence under output/research.
"""
from pathlib import Path
import hashlib
import json
import re
import sqlite3
import statistics
from collections import Counter, defaultdict

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "output/backups/before-work-planning-release-20261008.sqlite"
EXPECTED = "4beed425fdc4ba9b4bd70d84b1054977a88571caff72be30582df7dd28681811"
RENEWAL = 195860
(ROOT / "output/research").mkdir(parents=True, exist_ok=True)

def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

assert sha256(SOURCE) == EXPECTED
connection = sqlite3.connect(SOURCE.as_uri() + "?mode=ro&immutable=1", uri=True)
connection.execute("PRAGMA query_only=ON")
meta = connection.execute("""select json_extract(json,'$.tick'),
 json_array_length(json,'$.citizens'),json_extract(json,'$.births'),
 json_extract(json,'$.deaths'),json_extract(json,'$.lawsVersion'),
 json_array_length(json,'$.chunks') from world""").fetchone()
births = dict(connection.execute("""select json_extract(json,'$.citizenId'), tick
 from world_events where tick>=? and json_extract(json,'$.category')='life'
 and json_extract(json,'$.title') like 'Welcome, %'""", (RENEWAL,)))
pattern = re.compile(r"^(\d+) years of life.*?At the end: (\d+)% nourishment, (\d+)% rest, ([\d.]+) kg hydration and (-?[\d.]+) °C")
deaths = []
for tick, serialized in connection.execute("""select tick,json from world_events
 where tick>=? and json_extract(json,'$.title') like '% is remembered'
 order by tick,sequence""", (RENEWAL,)):
    event = json.loads(serialized)
    match = pattern.search(event["detail"])
    assert match, (tick, event["id"])
    age, food, rest, hydration, temperature = map(float, match.groups())
    state = event["lifeState"]
    assert set(["nourishment", "rest", "hydration", "temperature", "oxygenFraction", "sickness"]) <= set(state)
    birth_tick = births.get(event.get("citizenId"))
    deaths.append({"tick": tick, "dayAfterRenewal": (tick - RENEWAL) / 96,
                   "civId": event["civId"], "ageYearsFloor": int(age),
                   "group": "child" if age < 12 else "adult",
                   "birthTick": birth_tick,
                   "ageDaysFromBirthEvent": None if birth_tick is None else (tick - birth_tick) / 96,
                   "nourishmentPercent": state["nourishment"], "restPercent": state["rest"],
                   "hydrationKg": state["hydration"], "temperatureC": state["temperature"],
                   "sickness": state["sickness"], "oxygenFraction": state["oxygenFraction"],
                   "eventFieldNames": sorted(event)})
history = [json.loads(row[0]) for row in connection.execute(
    "select json from world_history where tick>=? order by tick", (RENEWAL,))]
communities = [{"id": row[0], "name": row[1], "allHistoryBirths": row[2],
                "allHistoryDeaths": row[3], "endCommunalFoodKg": row[4]}
               for row in connection.execute("""select json_extract(c.value,'$.id'),
                json_extract(c.value,'$.name'),json_extract(c.value,'$.births'),
                json_extract(c.value,'$.deaths'),json_extract(c.value,'$.stock.biomass')
                from world,json_each(world.json,'$.civilizations') c""")]
connection.close()
assert sha256(SOURCE) == EXPECTED

def describe(values):
    return {"min": min(values), "median": statistics.median(values),
            "mean": statistics.mean(values), "max": max(values)} if values else None

def temperature_band(value):
    return "below0" if value < 0 else "0to10" if value < 10 else "10to20" if value < 20 else "20plus"

def food_band(value):
    return "exactly0" if value == 0 else "above0below12" if value < 12 else "12to40" if value < 40 else "40to62" if value < 62 else "62plus"

def summarize(rows):
    return {"count": len(rows), "firstTick": min(r["tick"] for r in rows),
            "lastTick": max(r["tick"] for r in rows),
            "ageYearsFloor": dict(sorted(Counter(r["ageYearsFloor"] for r in rows).items())),
            "ageDaysForRecordedBirths": describe([r["ageDaysFromBirthEvent"] for r in rows if r["birthTick"] is not None]),
            "temperatureC": describe([r["temperatureC"] for r in rows]),
            "temperatureBands": dict(Counter(temperature_band(r["temperatureC"]) for r in rows)),
            "nourishmentPercent": describe([r["nourishmentPercent"] for r in rows]),
            "nourishmentBands": dict(Counter(food_band(r["nourishmentPercent"]) for r in rows)),
            "hydrationBelow0_15Kg": sum(r["hydrationKg"] < 0.15 for r in rows),
            "hydrationKg": describe([r["hydrationKg"] for r in rows]),
            "restPercent": describe([r["restPercent"] for r in rows]),
            "restBelow23Percent": sum(r["restPercent"] < 23 for r in rows),
            "oxygenFraction": describe([r["oxygenFraction"] for r in rows]),
            "oxygenBelow0_15": sum(r["oxygenFraction"] < 0.15 for r in rows),
            "sickness": describe([r["sickness"] for r in rows]),
            "sicknessBands": dict(Counter("zero" if r["sickness"] == 0 else "positiveAtMost20" if r["sickness"] <= 20 else "above20" for r in rows)),
            "nourishmentBandsWhenSicknessZero": dict(Counter(food_band(r["nourishmentPercent"]) for r in rows if r["sickness"] == 0))}

groups = {group: summarize([r for r in deaths if r["group"] == group]) for group in ["child", "adult"]}
by_civ = []
for civ in communities:
    rows = [r for r in deaths if r["civId"] == civ["id"]]
    by_civ.append({**civ, "newDeaths": len(rows),
                   "firstDeathTick": rows[0]["tick"], "lastDeathTick": rows[-1]["tick"],
                   "firstDeathDay": rows[0]["dayAfterRenewal"], "lastDeathDay": rows[-1]["dayAfterRenewal"],
                   "deathSpanDays": (rows[-1]["tick"] - rows[0]["tick"]) / 96,
                   "children": summarize([r for r in rows if r["group"] == "child"]),
                   "adults": summarize([r for r in rows if r["group"] == "adult"])})
bins = defaultdict(Counter)
for row in deaths:
    day = int(row["dayAfterRenewal"] // 30) * 30
    bins[day][row["group"]] += 1
timeline = [{"fromDayInclusive": day, "toDayExclusive": day + 30, **counts} for day, counts in sorted(bins.items())]
peak = max(history, key=lambda row: row["population"])
first_zero = next(row for row in history if row["population"] == 0)
def nearest_before(tick):
    candidates = [row for row in history if row["tick"] <= tick]
    return candidates[-1] if candidates else None
history_points = {"firstAfterRenewal": history[0], "peakPopulation": peak,
                  "lastDailyBeforeFirstDeath": nearest_before(deaths[0]["tick"]),
                  "firstZeroPopulationDailySample": first_zero}
for level in [400000, 200000, 100000, 50000, 10000, 1000, 1]:
    history_points[f"firstCommunalFoodBelow{level}Kg"] = next((row for row in history if row["food"] < level), None)
assert len(deaths) == 1607 and len(births) == 407
assert len(deaths) == meta[3] - 32 and groups["child"]["count"] == len(births)
result = {"source": str(SOURCE.relative_to(ROOT)), "sha256": EXPECTED,
          "sourceBytes": SOURCE.stat().st_size,
          "method": "SQLite immutable/read-only and query_only; selected public world_events/world_history and metadata scalars. No full world loaded or advanced. SHA verified before and after.",
          "metadata": dict(zip(["tick", "population", "births", "deaths", "lawsVersion", "regions"], meta)),
          "renewalTick": RENEWAL, "newBirthEvents": len(births), "newDeathEvents": len(deaths),
          "firstNewDeath": deaths[0], "lastNewDeath": deaths[-1],
          "byAgeGroup": groups, "byCommunity": by_civ, "thirtyDayDeathBins": timeline,
          "historyPoints": history_points,
          "structuredLifeStateRecords": len(deaths),
          "correction": "An initial prose-only summary incorrectly said sickness was unavailable. Every death has structured lifeState; this corrected report uses its exact nourishment/rest/hydration/temperature/oxygen/sickness values.",
          "limitations": ["Age is floored in prose; newborn ages are reconstructed from birth events. Other reported physical values come from structured lifeState, not the rounded prose.",
                          "Sickness and oxygen are present. Health-loss components, body mass, wraps, carried food, exact stock access and task are absent; no medical or single-factor cause is recorded.",
                          "world_history.food is communal stock only, excluding carried rations/cargo; samples are daily and global, not per-community or per-person.",
                          "Population/food chronology and mechanism reproductions do not by themselves identify each causal contribution. This extractor does not replay the world. The separate published collapse-first-death-replay.json records the completed historical replay.",
                          "The parent's work-planning activation began after extinction; later source choices must not be attributed to historical residents."]}
(ROOT / "output/research/collapse-forensics-recheck.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"byAgeGroup": groups, "byCommunity": [{k: row[k] for k in ["name", "newDeaths", "firstDeathDay", "lastDeathDay", "deathSpanDays"]} for row in by_civ], "thirtyDayDeathBins": timeline, "historyPoints": history_points}, indent=2))
