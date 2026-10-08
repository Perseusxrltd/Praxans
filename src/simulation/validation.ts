import { MATERIALS } from "./content";
import { COGNITIVE_ACTIVITIES, MEMORY_LIMIT } from "./cognition";
import { SUCCESS_AXES } from "./progress";
import type { World } from "./types";

/** Additional saved-state contracts introduced in format 8. */
export function validateDepth(
  world: World,
  fail: (message: string) => never,
): void {
  const finite = (n: number) => Number.isFinite(n);
  const positive = (n: number) => finite(n) && n >= -1e-8;
  const unit = (n: number) => finite(n) && n >= 0 && n <= 1;
  const tick = (n: number) =>
    Number.isSafeInteger(n) && n >= 0 && n <= world.tick;
  const vector = (v: Record<string, number>) =>
    v && SUCCESS_AXES.every((axis) => finite(v[axis]));
  const stocks = (v: Record<string, number>) =>
    v && Object.keys(MATERIALS).every((m) => positive(v[m]));
  if (
    !world.evolution ||
    !tick(world.evolution.sinceTick) ||
    !Object.values(world.evolution).every(positive)
  )
    fail("landscape measurement epoch");
  for (const tile of world.tiles)
    if (!positive(tile.sediment) || !finite(tile.surfaceChange))
      fail("sediment or surface change");
  for (const person of world.citizens) {
    const mind = person.mind;
    if (
      !mind ||
      !tick(mind.sinceTick) ||
      typeof mind.sleeping !== "boolean" ||
      ![
        mind.sleepPressure,
        mind.stress,
        mind.attention,
        mind.socialNeed,
        mind.adviceTrust,
      ].every(unit) ||
      ![mind.reward, mind.predictionError].every(finite)
    )
      fail("cognitive state");
    if (
      !mind.synapses ||
      COGNITIVE_ACTIVITIES.some(
        (a) =>
          mind.synapses[a]?.length !== 8 ||
          !mind.synapses[a]!.every((n) => finite(n) && Math.abs(n) <= 4),
      )
    )
      fail("adaptive network");
    if (
      !Object.values(mind.activations).every(unit) ||
      ![mind.learned, mind.taught, mind.forgotten].every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      )
    )
      fail("learning record");
    if (
      mind.pending &&
      (!COGNITIVE_ACTIVITIES.includes(mind.pending.activity) ||
        mind.pending.inputs.length !== 8 ||
        !mind.pending.inputs.every(finite) ||
        !unit(mind.pending.prediction) ||
        !tick(mind.pending.tick))
    )
      fail("pending learning experience");
    if (
      !Array.isArray(mind.places) ||
      mind.places.length > 48 ||
      mind.places.some(
        (p) =>
          !tick(p.tick) ||
          ![p.x, p.y].every(finite) ||
          ![p.food, p.wood, p.fiber, p.stone, p.clay].every(positive),
      )
    )
      fail("sensory memory");
    if (
      !Array.isArray(mind.knowledge) ||
      mind.knowledge.length > MEMORY_LIMIT ||
      new Set(mind.knowledge.map((k) => k.id)).size !== mind.knowledge.length ||
      mind.knowledge.some(
        (k) =>
          !tick(k.learnedTick) ||
          !tick(k.lastRecalledTick) ||
          !unit(k.retention) ||
          !unit(k.consolidation) ||
          !["experience", "teaching", "inherited-record"].includes(k.source),
      )
    )
      fail("personal knowledge");
    if (
      person.journeyId !== null &&
      !world.caravans.some(
        (c) =>
          c.id === person.journeyId &&
          c.partyIds.includes(person.id) &&
          c.from === person.civId,
      )
    )
      fail("traveler ownership");
  }
  for (const s of world.structures) {
    if (
      typeof s.collapsed !== "boolean" ||
      typeof s.maintenance !== "boolean" ||
      !s.fabric ||
      s.fabric.parts.length !== s.design.components.length ||
      s.fabric.parts.some((p) => !positive(p.mass) || !unit(p.damage)) ||
      !finite(s.fabric.previousTemperature) ||
      ![s.fabric.exposureHours, s.fabric.lostMass, s.fabric.repairedMass].every(
        positive,
      ) ||
      !finite(s.condition) ||
      s.condition < 0 ||
      s.condition > 100
    )
      fail("construction fabric");
    for (const material of Object.keys(MATERIALS)) {
      const amount = s.fabric.parts.reduce(
        (sum, p, i) =>
          sum + (s.design.components[i].material === material ? p.mass : 0),
        0,
      );
      if (
        Math.abs(
          amount - s.properties.cost[material as keyof typeof MATERIALS],
        ) > 1e-6
      )
        fail("fabric inventory");
    }
    if (
      ![
        s.properties.mass,
        s.properties.workSurface,
        s.properties.storageVolume,
      ].every(positive)
    )
      fail("physical affordance");
    if (
      s.collapsed &&
      (s.properties.capacity > 0 ||
        s.properties.workSurface > 0 ||
        s.properties.storageVolume > 0 ||
        s.properties.coveredArea > 0)
    )
      fail("a ruin cannot grant standing affordances");
  }
  const civIds = new Set(world.civilizations.map((c) => c.id));
  const records = new Set<string>();
  const identity = (id: string) => {
    if (!id || records.has(id)) fail("duplicate social record");
    records.add(id);
  };
  for (const civ of world.civilizations) {
    const state = civ.civics,
      p = state?.progress;
    if (
      !state ||
      !tick(state.sinceTick) ||
      ![state.institution.quorum, state.institution.consent].every(
        (n) => unit(n) && n >= 0.5,
      ) ||
      !finite(state.institution.foodReserveDays) ||
      state.institution.foodReserveDays < 0.5 ||
      state.institution.foodReserveDays > 7
    )
      fail("civic institution");
    if (
      !vector(state.aspiration.weights) ||
      SUCCESS_AXES.some(
        (a) =>
          state.aspiration.weights[a] < 0 || state.aspiration.weights[a] > 10,
      ) ||
      !SUCCESS_AXES.some((a) => state.aspiration.weights[a] > 0)
    )
      fail("aspiration priorities");
    if (
      !p ||
      !tick(p.sinceTick) ||
      !tick(p.lastSampleTick) ||
      !positive(p.ecologicalReference) ||
      ![p.current, p.delta, p.peak].every(vector) ||
      (p.baseline && !vector(p.baseline)) ||
      !Number.isSafeInteger(p.samples) ||
      p.samples < 0
    )
      fail("civilization outcomes");
    if (
      p.achievements.some(
        (a) =>
          !SUCCESS_AXES.includes(a.axis) ||
          !tick(a.tick) ||
          ![20, 40, 60, 80, 100].includes(a.threshold),
      ) ||
      new Set(p.achievements.map((a) => `${a.axis}:${a.threshold}`)).size !==
        p.achievements.length
    )
      fail("repeated or invalid achievement");
    if (state.proposals.filter((x) => x.status === "pending").length > 6)
      fail("deliberation capacity");
    for (const proposal of state.proposals) {
      identity(proposal.id);
      if (
        !tick(proposal.submittedTick) ||
        !Number.isSafeInteger(proposal.dueTick) ||
        proposal.dueTick < proposal.submittedTick ||
        !Number.isSafeInteger(proposal.expiresTick) ||
        proposal.expiresTick < proposal.dueTick ||
        !["pending", "accepted", "refused", "expired", "failed"].includes(
          proposal.status,
        ) ||
        !["agent", "inhabitants"].includes(proposal.source) ||
        (proposal.decidedTick !== null && !tick(proposal.decidedTick)) ||
        new Set(proposal.ballots.map((b) => b.citizenId)).size !==
          proposal.ballots.length
      )
        fail("proposal record");
      if (
        proposal.review &&
        (!vector(proposal.review.baseline) ||
          (proposal.review.result && !vector(proposal.review.result)) ||
          (proposal.review.tick !== null && !tick(proposal.review.tick)))
      )
        fail("advice outcome review");
    }
    for (const observation of civ.observations) {
      if (
        !observation.research ||
        !stocks(observation.research.samples) ||
        !unit(observation.research.confidence) ||
        !positive(observation.research.surprise) ||
        !["material-trial", "construction", "inherited-record"].includes(
          observation.research.method,
        ) ||
        ![
          observation.properties.workSurface,
          observation.properties.storageVolume,
        ].every(positive)
      )
        fail("research provenance");
    }
    for (const [id, relation] of Object.entries(civ.relations)) {
      const c = relation.contact;
      if (
        !civIds.has(id) ||
        id === civ.id ||
        !finite(relation.affinity) ||
        Math.abs(relation.affinity) > 100 ||
        ![relation.tradeCount, relation.kept, relation.broken].every(
          positive,
        ) ||
        !c ||
        !tick(c.sinceTick) ||
        !tick(c.lastSeenTick) ||
        !positive(c.encounters) ||
        !unit(c.comprehension) ||
        !tick(c.report.tick) ||
        ![c.report.x, c.report.y].every(finite) ||
        !positive(c.report.population) ||
        !unit(c.report.confidence) ||
        !Object.values(c.report.stock).every(positive)
      )
        fail("dated contact record");
    }
  }
  if (
    !world.diplomacy ||
    !Array.isArray(world.diplomacy.messages) ||
    !Array.isArray(world.diplomacy.accords)
  )
    fail("diplomacy state");
  for (const message of world.diplomacy.messages) {
    identity(message.id);
    if (
      !civIds.has(message.from) ||
      !civIds.has(message.to) ||
      message.from === message.to ||
      !tick(message.sentTick) ||
      (message.deliveredTick !== null && !tick(message.deliveredTick)) ||
      !["traveling", "delivered", "lost"].includes(message.status) ||
      !unit(message.comprehension) ||
      message.text.length > 1200 ||
      message.terms.length > 6
    )
      fail("correspondence");
  }
  for (const accord of world.diplomacy.accords) {
    identity(accord.id);
    if (
      !civIds.has(accord.from) ||
      !civIds.has(accord.to) ||
      !tick(accord.ratifiedTick) ||
      !["active", "fulfilled", "expired", "breached"].includes(accord.status) ||
      accord.obligations.some(
        (o) =>
          !civIds.has(o.from) ||
          !civIds.has(o.to) ||
          !MATERIALS[o.goods.material] ||
          !positive(o.goods.amount) ||
          !positive(o.delivered) ||
          o.delivered > o.goods.amount + 1e-6,
      )
    )
      fail("accord obligations");
  }
  const traveling = new Set<string>();
  for (const journey of world.caravans) {
    if (
      !civIds.has(journey.from) ||
      !civIds.has(journey.to) ||
      !["trade", "message", "raid", "delivery"].includes(journey.kind) ||
      !["outbound", "returning", "legacy"].includes(journey.stage) ||
      !positive(journey.provisions) ||
      ![journey.offer, journey.receive].every(
        (g) => MATERIALS[g.material] && positive(g.amount),
      ) ||
      journey.path.some((i) => !Number.isSafeInteger(i) || !world.tiles[i])
    )
      fail("journey state or inventory");
    for (const id of journey.partyIds) {
      if (traveling.has(id)) fail("a person cannot occupy two parties");
      traveling.add(id);
    }
  }
}
