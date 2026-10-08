import { MATERIALS } from "./content";
import { RuleError } from "./economy";
import { knows, learnObservation } from "./cognition";
import { returnMaterial } from "./laws";
import { astronomy } from "./planet";
import { clamp, random } from "./random";
import {
  distance,
  findPath,
  getTile,
  peopleOf,
  recordEvent,
  tileIndex,
  uid,
} from "./world";
import type {
  Accord,
  AccordTerm,
  Caravan,
  Citizen,
  Civilization,
  DiplomaticMessage,
  Goods,
  Relation,
  World,
} from "./types";

export function inheritedContact(
  world: World,
  other: Civilization,
): Relation["contact"] {
  return {
    sinceTick: world.tick,
    lastSeenTick: world.tick,
    encounters: 0,
    comprehension: 0.35,
    origin: "inherited-record",
    report: {
      tick: world.tick,
      name: other.name,
      x: other.x,
      y: other.y,
      population: peopleOf(world, other.id).length,
      stock: { ...other.stock },
      confidence: 0.5,
    },
  };
}

function relationTo(
  world: World,
  from: Civilization,
  to: Civilization,
): Relation {
  return (from.relations[to.id] ??= {
    affinity: 5,
    tradeCount: 0,
    lastDiplomacyTick: world.tick - 96,
    lastRaidTick: world.tick - 96 * 7,
    kept: 0,
    broken: 0,
    contact: {
      ...inheritedContact(world, to),
      origin: "encounter",
      comprehension: 0.12,
      report: {
        tick: world.tick,
        name: to.name,
        x: to.x,
        y: to.y,
        population: peopleOf(world, to.id).length,
        stock: {},
        confidence: 0.35,
      },
    },
  });
}

/** A dated self-report obtained through an encounter. It does not refresh remotely. */
export function encounter(
  world: World,
  a: Civilization,
  b: Civilization,
  exchange = false,
): void {
  if (a === b) return;
  const first = !a.relations[b.id] || !b.relations[a.id];
  for (const [from, to] of [
    [a, b],
    [b, a],
  ]) {
    const relation = relationTo(world, from, to),
      contact = relation.contact;
    if (contact.encounters === 0 || world.tick - contact.lastSeenTick >= 24) {
      contact.encounters++;
      contact.comprehension += (1 - contact.comprehension) * 0.04;
      contact.lastSeenTick = world.tick;
    }
    contact.report = {
      tick: world.tick,
      name: to.name,
      x: to.x,
      y: to.y,
      population: peopleOf(world, to.id).length,
      stock: exchange ? { ...to.stock } : { ...contact.report.stock },
      confidence: exchange ? 0.8 : 0.4,
    };
  }
  if (first)
    recordEvent(world, {
      category: "diplomacy",
      title: `${a.name} and ${b.name} meet`,
      detail:
        "People came within speaking distance. They now have a dated account of another community; future communication still needs a journey.",
      civId: a.id,
      x: a.x,
      y: a.y,
    });
}

export function detectContacts(world: World): void {
  const seen = new Set<string>();
  for (let i = 0; i < world.citizens.length; i++) {
    const a = world.citizens[i];
    if (a.mind.sleeping || a.journeyId) continue;
    for (let j = i + 1; j < world.citizens.length; j++) {
      const b = world.citizens[j];
      if (
        a.civId === b.civId ||
        b.mind.sleeping ||
        b.journeyId ||
        distance(a, b) > 2
      )
        continue;
      const key = [a.civId, b.civId].sort().join("/");
      if (seen.has(key)) continue;
      seen.add(key);
      encounter(
        world,
        world.civilizations.find((c) => c.id === a.civId)!,
        world.civilizations.find((c) => c.id === b.civId)!,
      );
    }
  }
}

export function contactLevel(relation: Relation, tick: number): string {
  if (tick - relation.contact.lastSeenTick > 96 * 90) return "distant memory";
  if (
    relation.contact.origin === "inherited-record" &&
    !relation.contact.encounters
  )
    return "inherited account";
  if (
    relation.contact.comprehension > 0.55 &&
    relation.tradeCount + relation.kept >= 2
  )
    return "familiar partners";
  if (relation.contact.comprehension > 0.35) return "communicating";
  return "early encounters";
}

export function knownTarget(
  world: World,
  civ: Civilization,
  targetId: string,
): Civilization {
  const target = world.civilizations.find((c) => c.id === targetId);
  if (!target || target === civ || !civ.relations[targetId])
    throw new RuleError(
      "This community needs an actual contact or inherited account before it can address that destination.",
    );
  return target;
}

export function hasPeace(world: World, from: string, to: string): boolean {
  return world.diplomacy.accords.some(
    (a) =>
      a.status === "active" &&
      ((a.from === from && a.to === to) || (a.from === to && a.to === from)) &&
      a.terms.some(
        (t) => t.kind === "peace" && world.tick < a.ratifiedTick + t.days * 96,
      ),
  );
}

export function hasPassage(
  world: World,
  visitor: string,
  owner: string,
): boolean {
  return world.diplomacy.accords.some(
    (a) =>
      a.status === "active" &&
      ((a.from === visitor && a.to === owner) ||
        (a.from === owner && a.to === visitor)) &&
      a.terms.some(
        (t) =>
          t.kind === "passage" &&
          (t.from === "sender" ? a.from : a.to) === owner &&
          world.tick < a.ratifiedTick + t.days * 96,
      ),
  );
}

function route(
  world: World,
  civ: Civilization,
  target: Civilization,
): number[] {
  const report = civ.relations[target.id].contact.report;
  if (distance(civ, report) > 640)
    throw new RuleError(
      "The reported destination exceeds the present 640-tile overland journey horizon.",
    );
  const path = findPath(
    world,
    civ,
    report,
    Math.min(world.tiles.length, 12000),
  );
  if (!path)
    throw new RuleError(
      "There is no traversable route through the represented terrain to this contact.",
    );
  return path;
}

function candidates(world: World, civ: Civilization, raid: boolean): Citizen[] {
  return peopleOf(world, civ.id)
    .filter(
      (p) =>
        p.age >= 18 &&
        p.age < 65 &&
        p.health > 70 &&
        p.hunger > 55 &&
        p.energy > 45 &&
        !p.journeyId &&
        !p.cargo &&
        !p.pregnancy &&
        distance(p, civ) < 3 &&
        (!raid ||
          p.traits.resilience + civ.culture.ambition + p.mind.adviceTrust >
            1.3),
    )
    .sort((a, b) => b.energy - a.energy || a.id.localeCompare(b.id));
}

function launch(
  world: World,
  civ: Civilization,
  target: Civilization,
  kind: Caravan["kind"],
  offer: Goods,
  request: Goods | null,
  requestedPeople?: number,
): Caravan {
  if (
    world.caravans.some(
      (c) => c.stage !== "legacy" && c.from === civ.id && c.to === target.id,
    )
  )
    throw new RuleError(
      "A party from this community is already traveling to that contact.",
    );
  const eligible = candidates(world, civ, kind === "raid");
  if (!eligible.length)
    throw new RuleError(
      "Enough willing, rested adults must be present at home before this journey can begin.",
    );
  const path = route(world, civ, target);
  // Budget both legs, nighttime rest and a margin for slow terrain; no food is created in transit.
  const foodEach = 1 + path.length * 0.22;
  const carrying = Math.max(offer.amount, request?.amount ?? 0);
  const count =
    requestedPeople ??
    Math.max(1, Math.ceil(carrying / Math.max(1, 30 - foodEach)));
  const population = peopleOf(world, civ.id).length;
  if (
    count > Math.min(3, Math.max(1, Math.floor(population / 3))) ||
    carrying + foodEach * count > count * 30
  )
    throw new RuleError(
      "This journey exceeds the available party size or 30 kg carrying capacity per adult, including provisions.",
    );
  const party = eligible.slice(0, count);
  if (party.length !== count)
    throw new RuleError(
      "Enough willing, rested adults must be present at home before this journey can begin.",
    );
  const provisions = foodEach * count;
  if (
    civ.stock[offer.material] < offer.amount ||
    civ.stock.biomass <
      provisions + (offer.material === "biomass" ? offer.amount : 0)
  )
    throw new RuleError(
      "The community lacks the outward cargo or food needed for the journey.",
    );
  const remaining =
    civ.stock.biomass -
    provisions -
    (offer.material === "biomass" ? offer.amount : 0);
  if (remaining < (population - count) * civ.civics.institution.foodReserveDays)
    throw new RuleError(
      "The journey would consume the assembly's protected food reserve at home.",
    );
  const id = uid(world, "journey");
  const caravan: Caravan = {
    id,
    from: civ.id,
    to: target.id,
    x: civ.x,
    y: civ.y,
    path,
    offer: { ...offer },
    receive: { material: request?.material ?? "biomass", amount: 0 },
    departedTick: world.tick,
    kind,
    stage: "outbound",
    partyIds: party.map((p) => p.id),
    provisions,
    request: request ? { ...request } : null,
    messageId: null,
    accordId: null,
    result: "Traveling outward",
    returnContact: null,
  };
  civ.stock[offer.material] -= offer.amount;
  civ.stock.biomass -= provisions;
  for (const person of party) {
    person.journeyId = id;
    person.task = {
      kind: "move",
      tile: path.at(-1) ?? tileIndex(world, target.x, target.y),
      path: [],
      progress: 0,
    };
    person.mind.pending = null;
    person.x = civ.x;
    person.y = civ.y;
  }
  world.caravans.push(caravan);
  recordEvent(world, {
    category: kind === "trade" || kind === "delivery" ? "trade" : "diplomacy",
    title: `${party.length} ${party.length === 1 ? "traveler leaves" : "travelers leave"} ${civ.name}`,
    detail: `A ${kind} journey toward ${target.name}, carrying ${provisions.toFixed(1)} kg of provisions. Their work at home must wait.`,
    civId: civ.id,
    x: civ.x,
    y: civ.y,
  });
  return caravan;
}

export function validateGoods(goods: Goods): void {
  if (
    !MATERIALS[goods.material] ||
    !Number.isFinite(goods.amount) ||
    goods.amount < 1 ||
    goods.amount > 80
  )
    throw new RuleError(
      "A material offer must name 1–80 kg of an existing bulk medium.",
    );
}

export function tradeUtility(
  world: World,
  target: Civilization,
  offer: Goods,
  receive: Goods,
): boolean {
  if (target.stock[receive.material] < receive.amount) return false;
  const population = peopleOf(world, target.id).length;
  const need = (m: Goods["material"]) =>
    m === "biomass" ? Math.max(population * 2, 10) : m === "wood" ? 60 : 20;
  const benefit =
    need(offer.material) *
    Math.log(1 + offer.amount / Math.max(target.stock[offer.material], 1));
  const loss =
    need(receive.material) *
    Math.log(
      Math.max(target.stock[receive.material], 1) /
        Math.max(target.stock[receive.material] - receive.amount, 0.5),
    );
  return (
    benefit >= loss * 0.85 &&
    (receive.material !== "biomass" ||
      target.stock.biomass - receive.amount >=
        population * target.civics.institution.foodReserveDays)
  );
}

export function sendTrade(
  world: World,
  civ: Civilization,
  targetId: string,
  offer: Goods,
  receive: Goods,
): string {
  const target = knownTarget(world, civ, targetId);
  validateGoods(offer);
  validateGoods(receive);
  if (offer.material === receive.material)
    throw new RuleError("An exchange must involve different materials.");
  const journey = launch(world, civ, target, "trade", offer, receive);
  civ.lastTradeTick = world.tick;
  return journey.id;
}

export function validateTerms(terms: AccordTerm[]): void {
  if (!Array.isArray(terms) || terms.length > 6)
    throw new RuleError(
      "An accord may contain up to six explicit commitments.",
    );
  for (const term of terms) {
    if (
      !["peace", "passage", "transfer"].includes(term.kind) ||
      !Number.isInteger(term.days) ||
      term.days < 1 ||
      term.days > 30
    )
      throw new RuleError(
        "Commitments need a supported physical meaning and a duration of 1–30 days.",
      );
    if (term.kind !== "peace" && !["sender", "recipient"].includes(term.from))
      throw new RuleError("Name the committing party.");
    if (term.kind === "transfer") validateGoods(term.goods);
  }
}

export function sendMessage(
  world: World,
  civ: Civilization,
  targetId: string,
  text: string,
  terms: AccordTerm[] = [],
  stance: DiplomaticMessage["stance"] = null,
  replyTo: string | null = null,
  decision: DiplomaticMessage["decision"] = null,
): string {
  const target = knownTarget(world, civ, targetId);
  if (!text.trim() || text.length > 1200)
    throw new RuleError("A diplomatic letter needs 1–1,200 characters.");
  validateTerms(terms);
  if (world.tick - civ.relations[targetId].lastDiplomacyTick < 24)
    throw new RuleError(
      "Allow six simulated hours between outgoing diplomatic approaches to the same contact.",
    );
  if (
    world.diplomacy.messages.filter((m) => m.status === "traveling").length >=
    128
  )
    throw new RuleError(
      "The current service has reached its in-flight correspondence capacity.",
    );
  const journey = launch(
    world,
    civ,
    target,
    "message",
    { material: "biomass", amount: 0 },
    null,
  );
  const id = uid(world, "message");
  world.diplomacy.messages.push({
    id,
    from: civ.id,
    to: target.id,
    text: text.trim(),
    stance,
    terms: structuredClone(terms),
    replyTo,
    decision,
    sentTick: world.tick,
    deliveredTick: null,
    expiresTick: world.tick + 30 * 96,
    status: "traveling",
    answeredBy: null,
    comprehension: civ.relations[targetId].contact.comprehension,
  });
  journey.messageId = id;
  civ.relations[targetId].lastDiplomacyTick = world.tick;
  recordEvent(world, {
    category: "diplomacy",
    title: `A letter leaves for ${target.name}`,
    detail: text.trim(),
    civId: civ.id,
    referenceId: id,
    relatedId: replyTo ?? undefined,
  });
  return id;
}

export function respondToMessage(
  world: World,
  civ: Civilization,
  messageId: string,
  decision: "accept" | "decline",
  text: string,
): string {
  const original = world.diplomacy.messages.find((m) => m.id === messageId);
  if (
    !original ||
    original.to !== civ.id ||
    original.status !== "delivered" ||
    original.answeredBy ||
    !original.terms.length ||
    original.replyTo ||
    original.expiresTick < world.tick
  )
    throw new RuleError(
      "Choose a delivered, unanswered, unexpired proposal addressed to this community.",
    );
  if (
    decision === "accept" &&
    world.diplomacy.accords.filter((a) => a.status === "active").length >= 64
  )
    throw new RuleError(
      "The current service has reached its active accord capacity.",
    );
  const id = sendMessage(
    world,
    civ,
    original.from,
    text,
    [],
    null,
    original.id,
    decision,
  );
  original.answeredBy = id;
  return id;
}

export function dispatchExpedition(
  world: World,
  civ: Civilization,
  targetId: string,
  people: number,
  material: Goods["material"],
): string {
  const target = knownTarget(world, civ, targetId),
    relation = civ.relations[targetId];
  if (
    !Number.isInteger(people) ||
    people < 1 ||
    people > 3 ||
    !MATERIALS[material]
  )
    throw new RuleError(
      "An expedition needs one to three willing adults and a represented resource objective.",
    );
  if (world.tick - relation.lastRaidTick < 96 * 7)
    throw new RuleError(
      "This community needs a week between hostile expeditions toward the same destination.",
    );
  const journey = launch(
    world,
    civ,
    target,
    "raid",
    { material: "biomass", amount: 0 },
    { material, amount: people * 20 },
    people,
  );
  relation.lastRaidTick = world.tick;
  return journey.id;
}

function ratify(world: World, message: DiplomaticMessage): void {
  const original = world.diplomacy.messages.find(
    (m) => m.id === message.replyTo,
  );
  if (
    !original ||
    message.decision !== "accept" ||
    original.expiresTick < world.tick ||
    original.from !== message.to ||
    original.to !== message.from ||
    original.answeredBy !== message.id
  )
    return;
  const accord: Accord = {
    id: uid(world, "accord"),
    messageId: original.id,
    from: original.from,
    to: original.to,
    terms: structuredClone(original.terms),
    ratifiedTick: world.tick,
    expiresTick:
      world.tick + Math.max(...original.terms.map((t) => t.days)) * 96,
    status: "active",
    obligations: [],
  };
  for (const term of original.terms)
    if (term.kind === "transfer") {
      const from = term.from === "sender" ? original.from : original.to;
      accord.obligations.push({
        from,
        to: from === original.from ? original.to : original.from,
        goods: { ...term.goods },
        delivered: 0,
        deadlineTick: world.tick + term.days * 96,
        inTransit: null,
      });
    }
  world.diplomacy.accords.push(accord);
  recordEvent(world, {
    category: "diplomacy",
    title: "A promise has two consenting communities",
    detail:
      "The reply arrived. Its explicit commitments now have a shared start and deadline; delivery and enforcement still require real actions.",
    civId: original.from,
    referenceId: accord.id,
    relatedId: original.id,
  });
}

function breach(
  world: World,
  accord: Accord,
  responsible: string,
  detail: string,
): void {
  if (accord.status !== "active") return;
  accord.status = "breached";
  const injured = world.civilizations.find(
    (c) => c.id === (responsible === accord.from ? accord.to : accord.from),
  )!;
  const relation = injured.relations[responsible];
  if (relation) {
    relation.broken++;
    relation.affinity = clamp(relation.affinity - 18, -100, 100);
  }
  recordEvent(world, {
    category: "diplomacy",
    title: "A commitment was broken",
    detail,
    civId: injured.id,
    referenceId: accord.id,
  });
}

function deliverLetter(
  world: World,
  caravan: Caravan,
  target: Civilization,
): void {
  const message = world.diplomacy.messages.find(
    (m) => m.id === caravan.messageId,
  );
  if (!message) return;
  message.status = "delivered";
  message.deliveredTick = world.tick;
  message.comprehension =
    target.relations[caravan.from]?.contact.comprehension ??
    message.comprehension;
  const relation = target.relations[caravan.from];
  // A declaration changes the recipient's impression only after it arrives, and cannot compel friendship.
  if (relation && message.stance)
    relation.affinity = clamp(
      relation.affinity +
        (message.stance === "rivalry"
          ? -12
          : message.stance === "friendship"
            ? 2 * message.comprehension
            : 0),
      -100,
      100,
    );
  if (message.replyTo) ratify(world, message);
  caravan.result = "Letter delivered";
  recordEvent(world, {
    category: "diplomacy",
    title: `A letter reaches ${target.name}`,
    detail: message.text,
    civId: target.id,
    x: target.x,
    y: target.y,
    referenceId: message.id,
    relatedId: message.replyTo ?? undefined,
  });
}

function raid(
  world: World,
  caravan: Caravan,
  from: Civilization,
  target: Civilization,
  party: Citizen[],
): void {
  const defenders = peopleOf(world, target.id).filter(
    (p) => p.age >= 14 && p.health > 30 && distance(p, caravan) < 3,
  );
  const strength = (people: Citizen[]) =>
    people.reduce(
      (sum, p) =>
        sum +
        (p.health / 100) * (0.4 + p.energy / 100) * (0.5 + p.traits.resilience),
      0,
    );
  const attack = strength(party),
    defense = strength(defenders);
  const success = random(world) < attack / Math.max(0.1, attack + defense);
  for (const person of party) {
    person.health = clamp(
      person.health -
        ((35 * defense) / Math.max(0.1, attack)) * (0.5 + random(world)),
    );
    person.energy = clamp(person.energy - 15);
    person.mind.stress = 1;
  }
  for (const person of defenders) {
    person.health = clamp(
      person.health -
        ((28 * attack) / Math.max(0.1, defense)) * (0.5 + random(world)),
    );
    person.energy = clamp(person.energy - 12);
    person.mind.stress = 1;
  }
  if (success && party.some((p) => p.health > 0)) {
    const material = caravan.request!.material;
    const capacity = Math.max(
      0,
      party.filter((p) => p.health > 0).length * 30 - caravan.provisions,
    );
    const taken = Math.min(
      target.stock[material],
      caravan.request!.amount,
      capacity,
    );
    target.stock[material] -= taken;
    caravan.receive = { material, amount: taken };
  }
  for (const [a, b] of [
    [from, target],
    [target, from],
  ]) {
    const relation = relationTo(world, a, b);
    relation.affinity = clamp(relation.affinity - 35, -100, 100);
  }
  for (const accord of world.diplomacy.accords)
    if (
      accord.status === "active" &&
      ((accord.from === from.id && accord.to === target.id) ||
        (accord.from === target.id && accord.to === from.id)) &&
      accord.terms.some(
        (t) =>
          t.kind === "peace" && world.tick < accord.ratifiedTick + t.days * 96,
      )
    )
      breach(
        world,
        accord,
        from.id,
        `${from.name}'s expedition attacked despite a current peace commitment.`,
      );
  caravan.result = success
    ? "The expedition took goods; the survivors must bring them home"
    : "The expedition was repelled";
  recordEvent(world, {
    category: "diplomacy",
    title: `Violence reaches ${target.name}`,
    detail: `${caravan.result}. Injuries, time away, damaged relations and spent provisions remain part of the world.`,
    civId: target.id,
    x: target.x,
    y: target.y,
  });
}

function abandon(world: World, caravan: Caravan): void {
  const tile = getTile(world, caravan.x, caravan.y)!;
  returnMaterial(world, tile, caravan.offer.material, caravan.offer.amount);
  returnMaterial(world, tile, caravan.receive.material, caravan.receive.amount);
  returnMaterial(world, tile, "biomass", caravan.provisions);
  const message = world.diplomacy.messages.find(
    (m) => m.id === caravan.messageId,
  );
  if (message?.status === "traveling") message.status = "lost";
  for (const person of world.citizens.filter(
    (p) => p.journeyId === caravan.id,
  )) {
    person.journeyId = null;
    person.task = null;
  }
}

export function updateJourneys(world: World): void {
  const finished = new Set<string>();
  for (const caravan of world.caravans) {
    const from = world.civilizations.find((c) => c.id === caravan.from)!,
      target = world.civilizations.find((c) => c.id === caravan.to)!;
    const party = world.citizens.filter(
      (p) => caravan.partyIds.includes(p.id) && p.health > 0,
    );
    if (caravan.stage !== "legacy" && !party.length) {
      abandon(world, caravan);
      finished.add(caravan.id);
      continue;
    }
    const night =
      astronomy(world.tick, caravan.x, caravan.y).solarAltitude < -6;
    if (caravan.stage !== "legacy") {
      const rest = night || party.some((p) => p.energy < 20);
      for (const person of party) {
        person.task = {
          kind: rest ? "rest" : "move",
          tile: tileIndex(world, person.x, person.y),
          path: [],
          progress: 0,
        };
        if (rest) person.energy = clamp(person.energy + 1.25);
      }
      if (rest) continue;
      // A loss of carriers reduces capacity. Excess material stays in the landscape.
      let excess = Math.max(
        0,
        caravan.offer.amount +
          caravan.receive.amount +
          caravan.provisions -
          party.length * 30,
      );
      for (const goods of [caravan.offer, caravan.receive]) {
        const drop = Math.min(excess, goods.amount);
        goods.amount -= drop;
        excess -= drop;
        returnMaterial(
          world,
          getTile(world, caravan.x, caravan.y)!,
          goods.material,
          drop,
        );
      }
      const dropFood = Math.min(excess, caravan.provisions);
      caravan.provisions -= dropFood;
      returnMaterial(
        world,
        getTile(world, caravan.x, caravan.y)!,
        "biomass",
        dropFood,
      );
    }
    const next = world.tiles[caravan.path[0]];
    if (next) {
      if (next.terrain === "water") {
        abandon(world, caravan);
        finished.add(caravan.id);
        continue;
      }
      const length = distance(caravan, next),
        pace =
          0.32 *
          (world.weather === "storm" ? 0.7 : 1) *
          (caravan.stage === "legacy"
            ? 1
            : Math.max(0.3, Math.min(...party.map((p) => p.energy / 100)))) *
          (next.terrain === "hill" ? 0.7 : 1);
      if (length <= pace) {
        caravan.x = next.x;
        caravan.y = next.y;
        caravan.path.shift();
      } else {
        caravan.x += ((next.x - caravan.x) / length) * pace;
        caravan.y += ((next.y - caravan.y) / length) * pace;
      }
      for (const person of party) {
        person.x = caravan.x;
        person.y = caravan.y;
      }
      continue;
    }
    if (caravan.stage === "legacy") {
      from.stock[caravan.receive.material] += caravan.receive.amount;
      target.stock[caravan.offer.material] += caravan.offer.amount;
      from.trades++;
      target.trades++;
      encounter(world, from, target, true);
      from.relations[target.id].tradeCount++;
      target.relations[from.id].tradeCount++;
      finished.add(caravan.id);
      continue;
    }
    if (caravan.stage === "returning") {
      for (const goods of [caravan.offer, caravan.receive])
        from.stock[goods.material] += goods.amount;
      from.stock.biomass += caravan.provisions;
      for (const person of party) {
        person.journeyId = null;
        person.task = null;
      }
      if (caravan.returnContact)
        from.relations[target.id].contact = caravan.returnContact;
      if (caravan.kind === "trade" && caravan.result === "Exchange accepted") {
        from.trades++;
        from.relations[target.id].tradeCount++;
        from.relations[target.id].affinity = clamp(
          from.relations[target.id].affinity + 5,
          -100,
          100,
        );
      }
      recordEvent(world, {
        category: caravan.kind === "trade" ? "trade" : "diplomacy",
        title: `Travelers return to ${from.name}`,
        detail: caravan.result,
        civId: from.id,
        x: from.x,
        y: from.y,
      });
      finished.add(caravan.id);
      continue;
    }
    const rememberedContact = structuredClone(
      from.relations[target.id].contact,
    );
    encounter(world, from, target, caravan.kind === "trade");
    caravan.returnContact = structuredClone(from.relations[target.id].contact);
    from.relations[target.id].contact = rememberedContact;
    if (caravan.kind === "message") deliverLetter(world, caravan, target);
    if (caravan.kind === "trade") {
      const receive = caravan.request!;
      if (
        receive.amount + caravan.provisions <= party.length * 30 &&
        target.relations[from.id].affinity >= -20 &&
        tradeUtility(world, target, caravan.offer, receive)
      ) {
        target.stock[caravan.offer.material] += caravan.offer.amount;
        caravan.offer.amount = 0;
        target.stock[receive.material] -= receive.amount;
        caravan.receive = { ...receive };
        target.trades++;
        target.relations[from.id].tradeCount++;
        target.relations[from.id].affinity = clamp(
          target.relations[from.id].affinity + 5,
          -100,
          100,
        );
        caravan.result = "Exchange accepted";
        const teacher = peopleOf(world, target.id).find(
          (p) => !p.mind.sleeping && distance(p, caravan) < 3,
        );
        const idea =
          teacher && target.observations.find((o) => knows(teacher, o.id));
        if (idea && party[0]) {
          if (!from.observations.some((o) => o.id === idea.id))
            from.observations.push(structuredClone(idea));
          learnObservation(world, party[0], idea, "teaching", teacher!.id);
        }
      } else
        caravan.result =
          "The recipient declined the offered exchange; the outward goods are returning";
    }
    if (caravan.kind === "delivery") {
      const accord = world.diplomacy.accords.find(
        (a) => a.id === caravan.accordId,
      );
      const obligation = accord?.obligations.find(
        (o) => o.inTransit === caravan.id,
      );
      if (
        accord?.status === "active" &&
        obligation &&
        world.tick <= obligation.deadlineTick
      ) {
        target.stock[caravan.offer.material] += caravan.offer.amount;
        obligation.delivered += caravan.offer.amount;
        obligation.inTransit = null;
        caravan.offer.amount = 0;
        caravan.result = "Promised goods delivered";
      } else
        caravan.result =
          "The commitment expired; undelivered goods are returning";
    }
    if (caravan.kind === "raid") raid(world, caravan, from, target, party);
    const path = findPath(
      world,
      caravan,
      from,
      Math.min(world.tiles.length, 12000),
    );
    if (!path) {
      abandon(world, caravan);
      finished.add(caravan.id);
      continue;
    }
    caravan.path = path;
    caravan.stage = "returning";
  }
  world.caravans = world.caravans.filter((c) => !finished.has(c.id));
}

export function updateAccords(world: World): void {
  for (const accord of world.diplomacy.accords) {
    if (accord.status !== "active") continue;
    for (const obligation of accord.obligations) {
      if (obligation.delivered + 1e-8 >= obligation.goods.amount) continue;
      if (world.tick > obligation.deadlineTick) {
        breach(
          world,
          accord,
          obligation.from,
          "Promised goods did not arrive before the agreed deadline.",
        );
        break;
      }
      if (
        obligation.inTransit &&
        !world.caravans.some((c) => c.id === obligation.inTransit)
      )
        obligation.inTransit = null;
      if (!obligation.inTransit && world.tick % 24 === 0) {
        const from = world.civilizations.find((c) => c.id === obligation.from)!,
          to = world.civilizations.find((c) => c.id === obligation.to)!;
        try {
          const journey = launch(
            world,
            from,
            to,
            "delivery",
            {
              material: obligation.goods.material,
              amount: obligation.goods.amount - obligation.delivered,
            },
            null,
          );
          journey.accordId = accord.id;
          obligation.inTransit = journey.id;
        } catch (error) {
          if (!(error instanceof RuleError)) throw error;
        }
      }
    }
    if (accord.status !== "active") continue;
    const transfersDone = accord.obligations.every(
      (o) => o.delivered + 1e-8 >= o.goods.amount,
    );
    const continuingTerms = accord.terms.some(
      (t) =>
        t.kind !== "transfer" && world.tick < accord.ratifiedTick + t.days * 96,
    );
    if (transfersDone && !continuingTerms) {
      accord.status = "fulfilled";
      for (const [a, b] of [
        [accord.from, accord.to],
        [accord.to, accord.from],
      ]) {
        const relation = world.civilizations.find((c) => c.id === a)!.relations[
          b
        ];
        relation.kept++;
        relation.affinity = clamp(relation.affinity + 6, -100, 100);
      }
      recordEvent(world, {
        category: "diplomacy",
        title: "A commitment was kept",
        detail:
          "All promised deliveries arrived and continuing terms completed without an observed breach.",
        civId: accord.from,
        referenceId: accord.id,
      });
    }
  }
  if (world.tick % 96 === 0) {
    const retained = new Set(
      world.diplomacy.messages
        .filter(
          (m) =>
            m.status === "traveling" ||
            m.expiresTick >= world.tick ||
            world.diplomacy.accords.some(
              (a) => a.status === "active" && a.messageId === m.id,
            ),
        )
        .map((m) => m.id),
    );
    for (const message of world.diplomacy.messages.slice(-128))
      retained.add(message.id);
    world.diplomacy.messages = world.diplomacy.messages.filter((m) =>
      retained.has(m.id),
    );
    world.diplomacy.accords = world.diplomacy.accords.filter(
      (a, i, all) => a.status === "active" || i >= all.length - 128,
    );
  }
}
