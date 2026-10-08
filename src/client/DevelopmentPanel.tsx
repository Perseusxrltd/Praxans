import type {
  Citizen,
  Civilization,
  SuccessAxis,
  WorldSnapshot,
} from "../simulation/types";
import { ago } from "./Archive";

const axes: [SuccessAxis, string][] = [
  ["wellbeing", "Wellbeing"],
  ["resilience", "Resilience"],
  ["knowledge", "Knowledge"],
  ["ecology", "Living surroundings"],
  ["connection", "Connections"],
  ["reach", "Reach"],
];
const percent = (n: number) => Math.round(n * 100);

export function SocietyPanel({
  civ,
  world,
}: {
  civ: Civilization;
  world: WorldSnapshot;
}) {
  // A browser deployment can precede the corresponding world intervention.
  if (!civ.civics) return null;
  const people = world.citizens.filter((p) => p.civId === civ.id);
  const trust =
    people.reduce((n, p) => n + (p.mind?.adviceTrust ?? 0), 0) /
    Math.max(1, people.length);
  const state = civ.civics,
    progress = state.progress;
  const contacts = Object.entries(civ.relations);
  const letters =
    world.diplomacy?.messages
      .filter(
        (m) =>
          m.from === civ.id || (m.to === civ.id && m.status === "delivered"),
      )
      .slice(-4)
      .reverse() ?? [];
  const accords =
    world.diplomacy?.accords
      .filter((a) => a.from === civ.id || a.to === civ.id)
      .slice(-4)
      .reverse() ?? [];
  const name = (id: string) =>
    world.civilizations.find((c) => c.id === id)?.name ?? "A distant community";
  return (
    <div className="development-panel" data-depth="society">
      <h3>What they are becoming</h3>
      <p className="body-copy ambition">{state.aspiration.statement}</p>
      <div className="outcome-grid" aria-label="Civilization outcomes">
        {axes.map(([axis, label]) => (
          <div className="outcome" key={axis}>
            <div>
              <span>{label}</span>
              <strong>
                {Math.round(progress.current[axis])}
                <small>/100</small>
              </strong>
            </div>
            <div
              className="outcome-track"
              role="meter"
              aria-label={label}
              aria-valuenow={Math.round(progress.current[axis])}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i
                style={{
                  width: `${Math.max(0, Math.min(100, progress.current[axis]))}%`,
                }}
              />
            </div>
            <small
              className={
                progress.delta[axis] < -0.05 ? "outcome-loss" : "muted"
              }
            >
              {Math.abs(progress.delta[axis]) < 0.05
                ? "Holding steady"
                : `${progress.delta[axis] > 0 ? "+" : ""}${progress.delta[axis].toFixed(1)} since yesterday`}
            </small>
          </div>
        ))}
      </div>
      <p className="quiet-note">
        Six ways to flourish. The community chooses what matters most; every
        gain has a context.
      </p>
      {progress.achievements.length > 0 && (
        <div className="traditions" aria-label="Historical milestones">
          {progress.achievements.slice(-3).map((a) => (
            <span key={`${a.axis}-${a.threshold}`}>
              {axes.find(([axis]) => axis === a.axis)?.[1]} crossed{" "}
              {a.threshold} · {ago(a.tick, world.tick)}
            </span>
          ))}
        </div>
      )}
      <details className="development-detail" open>
        <summary>A voice in their future</summary>
        <p className="body-copy">
          Advice earns influence through experience. People decide what to
          accept.
        </p>
        <div className="civic-facts">
          <span>
            <strong>{percent(trust)}%</strong> trust in advice
          </span>
          <span>
            <strong>{percent(state.institution.consent)}%</strong> consent
            needed
          </span>
        </div>
        {state.proposals.length === 0 ? (
          <p className="quiet-note">
            No advice is awaiting a decision. Daily life continues on its own.
          </p>
        ) : (
          <div className="civic-records">
            {state.proposals
              .slice(-3)
              .reverse()
              .map((p) => (
                <article key={p.id}>
                  <div>
                    <strong>{p.action.type}</strong>
                    <span className={`decision-status ${p.status}`}>
                      {p.status === "pending" ? "Being considered" : p.status}
                    </span>
                  </div>
                  <p>{p.action.reason}</p>
                  <small>
                    {p.outcome} · {p.ballots.filter((b) => b.support).length}/
                    {p.ballots.length} voices in support
                  </small>
                </article>
              ))}
          </div>
        )}
      </details>
      <details className="development-detail">
        <summary>
          Beyond their home{" "}
          <span>
            {contacts.length} {contacts.length === 1 ? "contact" : "contacts"}
          </span>
        </summary>
        {!contacts.length && (
          <p className="quiet-note">
            They have not met another community. The wider world is still
            unknown to them.
          </p>
        )}
        <div className="civic-records">
          {contacts.map(([id, relation]) => (
            <article key={id}>
              <div>
                <strong>{relation.contact?.report.name ?? name(id)}</strong>
                <span>
                  {relation.affinity < 0
                    ? "Uneasy"
                    : relation.affinity > 35
                      ? "Warm"
                      : "Tentative"}
                </span>
              </div>
              {relation.contact && (
                <small>
                  {percent(relation.contact.comprehension)}% mutual
                  understanding · last account{" "}
                  {ago(relation.contact.report.tick, world.tick)}
                </small>
              )}
              <small>
                {relation.tradeCount} exchanges · {relation.kept ?? 0}{" "}
                commitments kept · {relation.broken ?? 0} broken
              </small>
            </article>
          ))}
        </div>
        {letters.length > 0 && <h4>Letters and replies</h4>}
        <div className="civic-records">
          {letters.map((m) => (
            <article key={m.id}>
              <div>
                <strong>
                  {m.from === civ.id
                    ? `To ${name(m.to)}`
                    : `From ${name(m.from)}`}
                </strong>
                <span>
                  {m.status === "traveling" ? "On the road" : m.status}
                </span>
              </div>
              <p className="letter-text">{m.text}</p>
              <small>
                {m.terms.length
                  ? `${m.terms.length} proposed commitments · `
                  : ""}
                {ago(m.sentTick, world.tick)}
              </small>
            </article>
          ))}
        </div>
        {accords.length > 0 && <h4>Shared commitments</h4>}
        <div className="civic-records">
          {accords.map((a) => (
            <article key={a.id}>
              <div>
                <strong>{name(a.from === civ.id ? a.to : a.from)}</strong>
                <span>{a.status}</span>
              </div>
              <small>
                {a.terms
                  .map((t) =>
                    t.kind === "transfer"
                      ? `${t.goods.amount} kg ${t.goods.material}`
                      : t.kind,
                  )
                  .join(" · ")}
              </small>
            </article>
          ))}
        </div>
        <p className="quiet-note">
          Letters and goods travel with people. Their accounts can grow old
          while the world changes.
        </p>
      </details>
    </div>
  );
}

export function MindPanel({
  person,
  civ,
}: {
  person: Citizen;
  civ: Civilization;
}) {
  const mind = person.mind;
  if (!mind) return null;
  return (
    <div className="development-panel" data-depth="mind">
      <h3>A mind at work</h3>
      <p className="body-copy">
        {mind.sleeping
          ? "Asleep, making fragile experiences more lasting."
          : "Awake, responding to a body and a changing world."}
      </p>
      <div className="civic-facts">
        <span>
          <strong>{percent(mind.attention)}%</strong> attention
        </span>
        <span>
          <strong>{percent(mind.sleepPressure)}%</strong> need for sleep
        </span>
        <span>
          <strong>{percent(mind.stress)}%</strong> stress
        </span>
        <span>
          <strong>{mind.knowledge.length}</strong> remembered ideas
        </span>
      </div>
      <p className="quiet-note">
        {mind.places.length} remembered places · {mind.taught} shared lessons ·{" "}
        {mind.forgotten} faded ideas
      </p>
      {mind.knowledge.length > 0 && (
        <div className="civic-records">
          {mind.knowledge
            .slice(-3)
            .reverse()
            .map((trace) => {
              const observation = civ.observations.find(
                (o) => o.id === trace.id,
              );
              return (
                <article key={trace.id}>
                  <strong>
                    {observation?.design.name ??
                      "An account from an earlier home"}
                  </strong>
                  <small>
                    {trace.source === "teaching"
                      ? "Learned from someone"
                      : trace.source === "inherited-record"
                        ? "An inherited account"
                        : "Learned by experience"}{" "}
                    · {percent(trace.retention)}% retained
                  </small>
                  {observation && <p>{observation.statement}</p>}
                </article>
              );
            })}
        </div>
      )}
    </div>
  );
}
