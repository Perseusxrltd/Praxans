import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Search,
  Sprout,
  Star,
  Users,
} from "lucide-react";
import type {
  Civilization,
  CommunityRecord,
  WorldSnapshot,
} from "../simulation/types";
import { worldClock } from "../simulation/chronology";
import { ago } from "./Archive";
import "./communities.css";

export const communityDate = (tick: number) => {
  const clock = worldClock(tick);
  return `Year ${clock.year}, day ${clock.dayOfYear}`;
};

function readFollowing(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter(
              (id): id is string =>
                typeof id === "string" && /^civ-[a-z0-9-]+$/i.test(id),
            ),
          ),
        ].slice(0, 64)
      : [];
  } catch {
    return [];
  }
}

export function useFollowing(world: WorldSnapshot | null) {
  const key = world ? `praxans.following.v1:${world.id}:${world.seed}` : "";
  const [saved, setSaved] = useState<{ key: string; ids: string[] }>({
    key: "",
    ids: [],
  });
  useEffect(() => {
    if (!key) return;
    setSaved({ key, ids: readFollowing(key) });
    const sync = (event: StorageEvent) => {
      if (event.key === key || event.key === null)
        setSaved({ key, ids: readFollowing(key) });
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);
  useEffect(() => {
    if (key && saved.key === key) {
      try {
        localStorage.setItem(key, JSON.stringify(saved.ids));
      } catch {
        /* Following still works for this visit. */
      }
    }
  }, [key, saved]);
  const toggle = (id: string) =>
    setSaved((current) => {
      const ids = current.key === key ? current.ids : readFollowing(key);
      return {
        key,
        ids: ids.includes(id)
          ? ids.filter((value) => value !== id)
          : [...ids, id].slice(0, 64),
      };
    });
  return { followed: saved.key === key ? saved.ids : [], toggle };
}

export function FollowCommunity({
  civ,
  followed,
  onToggle,
}: {
  civ: Civilization;
  followed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`follow-community ${followed ? "is-followed" : ""}`}
      aria-pressed={followed}
      aria-label={`${followed ? "Unfollow" : "Follow"} ${civ.name}`}
      onClick={onToggle}
    >
      <Star size={14} fill={followed ? "currentColor" : "none"} />
      {followed ? "Following" : "Follow"}
    </button>
  );
}

type DirectoryProps = {
  world: WorldSnapshot;
  yours: string | null;
  followed: string[];
  onToggle: (id: string) => void;
  onSelect: (civ: Civilization) => void;
  onHistory: (id: string) => void;
  onFollowedStories: () => void;
};
export function CommunityDirectory({
  world,
  yours,
  followed,
  onToggle,
  onSelect,
  onHistory,
  onFollowedStories,
}: DirectoryProps) {
  const [filter, setFilter] = useState<"all" | "following" | "living" | "past">(
    "all",
  );
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState("newest");
  const population = new Map<string, number>();
  for (const person of world.citizens)
    population.set(person.civId, (population.get(person.civId) ?? 0) + 1);
  const living = world.civilizations.filter((c) => population.has(c.id));
  const followedCount = world.civilizations.filter((c) =>
    followed.includes(c.id),
  ).length;
  const visible = world.civilizations
    .filter((c) => {
      if (
        !c.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
      )
        return false;
      return filter === "following"
        ? followed.includes(c.id)
        : filter === "living"
          ? population.has(c.id)
          : filter === "past"
            ? !population.has(c.id)
            : true;
    })
    .sort((a, b) =>
      order === "population"
        ? (population.get(b.id) ?? 0) - (population.get(a.id) ?? 0) ||
          a.name.localeCompare(b.name)
        : order === "name"
          ? a.name.localeCompare(b.name)
          : b.foundedTick - a.foundedTick || a.name.localeCompare(b.name),
    );
  return (
    <div className="community-directory" data-community-directory>
      <span className="eyebrow">ONE WORLD, MANY STORIES</span>
      <h2>Communities.</h2>
      <p className="panel-lede">
        Follow their beginnings, daily lives and the history they leave behind.
      </p>
      <div className="community-totals" aria-label="Community lifecycle totals">
        <span>
          <strong>{living.length}</strong> living
        </span>
        <span>
          <strong>{world.civilizations.length - living.length}</strong>{" "}
          remembered
        </span>
        <span>
          <strong>{followedCount}</strong> following
        </span>
      </div>
      <div className="community-filters" aria-label="Filter communities">
        {(
          [
            ["all", "All"],
            ["following", "Following"],
            ["living", "Living"],
            ["past", "History"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="community-search">
        <Search size={15} />
        <input
          type="search"
          aria-label="Search communities"
          placeholder="Find a community…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <label className="community-sort">
        Show first{" "}
        <select
          aria-label="Sort communities"
          value={order}
          onChange={(event) => setOrder(event.target.value)}
        >
          <option value="newest">Newest beginnings</option>
          <option value="population">Most inhabitants</option>
          <option value="name">By name</option>
        </select>
      </label>
      {followedCount > 0 && (
        <button
          className="followed-stories"
          type="button"
          onClick={onFollowedStories}
        >
          <BookOpen size={15} />
          <span>Stories from the communities you follow</span>
          <ArrowRight size={15} />
        </button>
      )}
      <div className="community-directory-list">
        {visible.map((civ) => {
          const people = population.get(civ.id) ?? 0;
          const newBeginning = world.tick - civ.foundedTick < 96 * 7;
          const endangered = world.citizens.filter(
            (p) => p.civId === civ.id && (p.hunger < 20 || p.health < 35),
          ).length;
          return (
            <article
              className={`community-entry ${people ? "" : "community-past"}`}
              key={civ.id}
              data-community-id={civ.id}
            >
              <div className="community-entry-top">
                <span
                  className={`community-status ${people ? (endangered ? "needs-care" : "living") : "past"}`}
                >
                  {people ? (endangered ? "Needs care" : "Living") : "Extinct"}
                </span>
                {civ.id === yours && (
                  <span className="community-owner">Your community</span>
                )}
                {newBeginning && (
                  <span
                    className="new-beginning"
                    title="Founded within the last seven world days"
                  >
                    New beginning
                  </span>
                )}
              </div>
              <button
                className="community-select"
                type="button"
                onClick={() => onSelect(civ)}
                aria-label={`Visit ${civ.name}`}
              >
                <span
                  className="community-avatar"
                  style={{ background: civ.accent, color: civ.color }}
                >
                  <Sprout size={22} strokeWidth={1.5} />
                </span>
                <span>
                  <strong>{civ.name}</strong>
                  <small>
                    {people
                      ? `${people} ${people === 1 ? "person" : "people"}${endangered ? ` · ${endangered} need care` : ""}`
                      : "No living inhabitants"}
                  </small>
                </span>
                <ArrowRight size={16} />
              </button>
              <p>{civ.motto}</p>
              <small className="community-founded">
                Founded {communityDate(civ.foundedTick)} ·{" "}
                {ago(civ.foundedTick, world.tick)}
              </small>
              <div className="community-entry-actions">
                <FollowCommunity
                  civ={civ}
                  followed={followed.includes(civ.id)}
                  onToggle={() => onToggle(civ.id)}
                />
                <button
                  type="button"
                  className="community-history-link"
                  aria-label={`Read ${civ.name} history`}
                  onClick={() => onHistory(civ.id)}
                >
                  <BookOpen size={14} /> Their history
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!visible.length && (
        <div className="community-empty">
          <Users size={25} />
          <h3>
            {filter === "following"
              ? "Choose a story to stay with."
              : filter === "living" && !living.length
                ? "The old communities are remembered."
                : "No communities match this view."}
          </h3>
          <p>
            {filter === "following"
              ? "Follow any community, including one whose history has ended. Your list stays with this browser."
              : filter === "living" && !living.length
                ? "Their places and records remain. New groups will appear here when they arrive in the continuing world."
                : "Try another name or lifecycle filter."}
          </p>
        </div>
      )}
      <p className="quiet-note">
        Following is saved in this browser. A community remains in your list
        after its last inhabitant dies. Up to 64 can be followed.
      </p>
    </div>
  );
}

export function CommunityLifeStory({
  civ,
  world,
  onSelect,
}: {
  civ: Civilization;
  world: WorldSnapshot;
  onSelect: (civ: Civilization) => void;
}) {
  const [record, setRecord] = useState<CommunityRecord | null>(null);
  const [error, setError] = useState("");
  const day = Math.floor(world.tick / 96);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setRecord((current) => (current?.communityId === civ.id ? current : null));
    fetch(
      `/api/communities/${encodeURIComponent(civ.id)}/record?through=${world.tick}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "The community's older record is temporarily unavailable.",
          );
        return response.json() as Promise<CommunityRecord>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setRecord(data);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not read this history.",
          );
      });
    return () => controller.abort();
  }, [civ.id, civ.deaths, day, world.id]);
  const living = world.citizens.some((p) => p.civId === civ.id);
  const currentRecord = record?.communityId === civ.id ? record : null;
  const endedTick =
    !living &&
    currentRecord?.lastDeath &&
    currentRecord.recordedDeaths === civ.deaths
      ? currentRecord.lastDeath.tick
      : null;
  const remains = world.structures.filter((s) => s.civId === civ.id);
  const ruins = remains.filter((s) => s.collapsed).length;
  return (
    <section
      className={`community-life-story ${living ? "" : "community-memorial"}`}
      aria-label={`${civ.name} lifecycle`}
    >
      <div className="community-lifespan">
        <span>
          <small>Beginning</small>
          <strong>{communityDate(civ.foundedTick)}</strong>
        </span>
        <span>
          <small>{living ? "Still unfolding" : "Final loss"}</small>
          <strong>
            {living
              ? `${Math.floor((world.tick - civ.foundedTick) / 96)} world days`
              : endedTick !== null
                ? communityDate(endedTick)
                : "Date not yet established"}
          </strong>
        </span>
      </div>
      {!living && (
        <p>
          No living inhabitants remain. Their history, knowledge and material
          remains stay in this world.{" "}
          {remains.length > 0
            ? `${remains.length - ruins} structures and ${ruins} ruins remain exposed to weather and decay.`
            : "The landscape around their former home continues to change."}
        </p>
      )}
      <div className="community-record-facts">
        <span>{civ.births} births</span>
        <span>{civ.deaths} remembered lives</span>
        <span>{civ.experiments} material trials</span>
        {currentRecord && (
          <span>{currentRecord.eventCount} archived moments</span>
        )}
      </div>
      {currentRecord?.connections.map((connection) => {
        const other = world.civilizations.find(
          (c) => c.id === connection.communityId,
        );
        if (!other) return null;
        const label = {
          "branched-from": "People came from",
          branch: "People went on to found",
          "earlier-chapter": "An earlier community of this steward",
          "later-chapter": "A later beginning by the same steward",
        }[connection.relationship];
        return (
          <button
            type="button"
            className="community-chapter-link"
            key={`${connection.relationship}:${other.id}:${connection.tick}`}
            onClick={() => onSelect(other)}
          >
            <span>
              <small>{label}</small>
              <strong>{other.name}</strong>
              <small>{communityDate(connection.tick)}</small>
            </span>
            <ArrowRight size={15} />
          </button>
        );
      })}
      {error && (
        <p className="quiet-note" role="status">
          {error} Recent observations are still available below.
        </p>
      )}
    </section>
  );
}
