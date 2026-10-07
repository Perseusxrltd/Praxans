import React, { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  FlaskConical,
  Heart,
  Leaf,
  Link2,
  Mountain,
  Sprout,
} from "lucide-react";
import type { WorldEvent, WorldSnapshot } from "../simulation/types";
import { worldClock } from "../simulation/chronology";

export const ago = (tick: number, now: number) => {
  const hours = Math.max(0, (now - tick) / 4);
  return hours < 1
    ? "Just now"
    : hours < 24
      ? `${Math.floor(hours)}h ago`
      : `${Math.floor(hours / 24)}d ago`;
};

export function EventIcon({ event }: { event: WorldEvent }) {
  const Icon =
    event.category === "life"
      ? Heart
      : event.category === "nature"
        ? Leaf
        : event.category === "discovery"
          ? FlaskConical
          : event.category === "trade"
            ? ArrowDownLeft
            : event.category === "agent"
              ? Link2
              : event.category === "building"
                ? Mountain
                : Sprout;
  return <Icon size={15} />;
}

type JournalProps = {
  world: WorldSnapshot;
  onEvent: (event: WorldEvent) => void;
};
export function Journal({
  events,
  world,
  onEvent,
  limit = 100,
}: JournalProps & { events: WorldEvent[]; limit?: number }) {
  return (
    <div className="journal">
      {events
        .slice(-limit)
        .reverse()
        .map((event) => (
          <button
            className="journal-entry"
            key={event.id}
            onClick={() => onEvent(event)}
          >
            <span className={`event-icon event-${event.category}`}>
              <EventIcon event={event} />
            </span>
            <span>
              <strong>{event.title}</strong>
              <p>{event.detail}</p>
              <small>
                {ago(event.tick, world.tick)}
                {event.civId
                  ? ` · ${world.civilizations.find((c) => c.id === event.civId)?.name ?? "A former community"}`
                  : " · The commons"}
              </small>
            </span>
          </button>
        ))}
    </div>
  );
}

type JournalPage = {
  events: (WorldEvent & { sequence: number })[];
  next: number | null;
};
export function ArchivedJournal({
  world,
  onEvent,
  filter,
}: JournalProps & { filter: string }) {
  const [archive, setArchive] = useState<WorldEvent[]>([]);
  const [cursor, setCursor] = useState<number | null | undefined>();
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const accept = (page: JournalPage) => {
    setArchive((current) => [...[...page.events].reverse(), ...current]);
    setCursor(page.events.length < 60 ? null : page.next);
  };
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/journal", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("The archive is temporarily unavailable.");
        return response.json() as Promise<JournalPage>;
      })
      .then(accept)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  const loadOlder = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/journal${cursor ? `?before=${cursor}` : ""}`,
      );
      if (!response.ok)
        throw new Error("The archive is temporarily unavailable.");
      accept(await response.json());
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not read the archive.",
      );
    } finally {
      setLoading(false);
    }
  };
  const newestArchivedTick = archive.reduce(
    (tick, event) => Math.max(tick, event.tick),
    -1,
  );
  const live = archive.length
    ? world.events.filter((event) => event.tick >= newestArchivedTick)
    : world.events.slice(-60);
  const entries = [
    ...new Map(
      [...archive, ...live].map((event) => [event.id, event]),
    ).values(),
  ]
    .filter((event) => event.tick <= world.tick)
    .sort((a, b) => a.tick - b.tick);
  const filtered = entries.filter(
    (event) => filter === "all" || event.category === filter,
  );
  return (
    <>
      <Journal
        events={filtered}
        world={world}
        onEvent={onEvent}
        limit={filtered.length || 1}
      />
      {!filtered.length && (
        <p className="quiet-note">
          No matching notes in these pages. Earlier chapters may hold more.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {cursor !== null && (
        <button
          className="button secondary wide archive-older"
          disabled={loading}
          onClick={loadOlder}
        >
          {loading
            ? "Reading the archive…"
            : error
              ? "Try the archive again"
              : "Read earlier chapters"}
        </button>
      )}
      {cursor === null && (
        <p className="quiet-note">
          You have reached the first recorded chapter. The world keeps its
          history as it grows.
        </p>
      )}
    </>
  );
}

type Intervention = {
  id: string;
  tick: number;
  description: string;
  createdAt: number;
};
export function WorldChanges() {
  const [open, setOpen] = useState(false),
    [changes, setChanges] = useState<Intervention[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError("");
    fetch("/api/interventions", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "The record is temporarily unavailable. Reopen it to try again.",
          );
        return response.json() as Promise<{ interventions: Intervention[] }>;
      })
      .then((result) => setChanges(result.interventions))
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [open]);
  return (
    <details
      className="model-details"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Interventions in this world</summary>
      <p className="quiet-note">
        Updates become part of the world's history. Its people, matter, and
        clock continue through them.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!changes && !error && <p className="quiet-note">Reading the record…</p>}
      <ol className="intervention-list">
        {changes?.map((change) => {
          const clock = worldClock(change.tick);
          return (
            <li key={change.id}>
              <small>
                Year {clock.year} · Day {clock.dayOfYear} ·{" "}
                {clock.universalTime}
              </small>
              <p>{change.description}</p>
            </li>
          );
        })}
      </ol>
      {changes?.length === 0 && (
        <p className="quiet-note">No interventions have been recorded.</p>
      )}
    </details>
  );
}
