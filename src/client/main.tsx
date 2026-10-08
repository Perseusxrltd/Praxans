import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  CloudRain,
  Compass,
  Copy,
  Droplets,
  Expand,
  FlaskConical,
  Globe2,
  Heart,
  Leaf,
  Link2,
  Maximize2,
  Minus,
  Mountain,
  Pause,
  Play,
  Plus,
  Radio,
  Sprout,
  Sun,
  TreePine,
  Users,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { FOCUSES, MATERIALS } from "../simulation/content";
import { LAWS } from "../simulation/laws";
import type {
  AgentPublic,
  ObserverCitizen as Citizen,
  Civilization,
  SessionView,
  WorldEvent,
  WorldFrame,
  WorldOverview,
  WorldSnapshot,
} from "../simulation/types";
import { WorldRenderer, type Layer, type Selection } from "./renderer";
import { LifePanel, AnimalPanel, plantLabel } from "./LifePanel";
import { PlanetWelcome } from "./PlanetWelcome";
import { PlanetExplorer } from "./PlanetExplorer";
import { FOUNDING } from "../simulation/founding";
import { FieldGuide } from "./FieldGuide";
import { ago, EventIcon, Journal, ArchivedJournal } from "./Archive";
import { Dialog } from "./Dialog";
import { AgentInvitation } from "./AgentInvitation";
import { MindPanel, SocietyPanel } from "./DevelopmentPanel";
import {
  CommunityDirectory,
  CommunityLifeStory,
  FollowCommunity,
  useFollowing,
} from "./Communities";
import "./style.css";

type View = "world" | "communities" | "journal" | "laws" | "ecology";
declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => Promise<void>;
  }
}
const round = (value: number, digits = 0) =>
  value.toLocaleString(undefined, { maximumFractionDigits: digits });
const active = (agent: AgentPublic) =>
  !!agent.lastSeen && Date.now() - agent.lastSeen < 90000;
async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Praxans-Client": "browser",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "The request could not be completed.");
  return result;
}
function IconButton({
  label,
  children,
  onClick,
  selected = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  selected?: boolean;
}) {
  return (
    <button
      className={`icon-button ${selected ? "selected" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Sparkline({
  values,
  color = "#6f9274",
}: {
  values: number[];
  color?: string;
}) {
  if (values.length < 2)
    return (
      <div className="chart-empty">
        <span />
        The first chapter is still being written.
      </div>
    );
  const low = Math.min(...values) * 0.8,
    high = Math.max(...values, low + 1),
    points = values
      .map(
        (v, i) =>
          `${(i / (values.length - 1)) * 260},${55 - ((v - low) / (high - low)) * 45}`,
      )
      .join(" ");
  return (
    <svg
      className="sparkline"
      viewBox="0 0 260 64"
      role="img"
      aria-label={`History: ${values.map((v) => round(v)).join(", ")}`}
    >
      <path d="M0 57H260" stroke="#e5e6dc" strokeDasharray="3 4" />
      <polygon points={`0,64 ${points} 260,64`} fill={color} opacity=".09" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
function Meter({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="meter">
      <span>
        {label}
        <strong>
          {round(value)}
          <small>%</small>
        </strong>
      </span>
      <div>
        <i
          style={{
            width: `${Math.min(100, Math.max(0, value))}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
}
function App() {
  const [arrived, setArrived] = useState(
    () => sessionStorage.getItem("praxans_observing") === "1",
  );
  const enterWorld = () => {
    sessionStorage.setItem("praxans_observing", "1");
    setArrived(true);
  };
  const [world, setWorld] = useState<WorldSnapshot | null>(null),
    [overview, setOverview] = useState<WorldOverview | null>(null),
    [session, setSession] = useState<SessionView>({ civilizationId: null });
  const { followed, toggle: toggleFollowing } = useFollowing(world);
  const latest = useRef<WorldSnapshot | null>(null),
    pausedRef = useRef(false),
    testControls = useRef(false),
    timeRemainder = useRef(0);
  const [connected, setConnected] = useState(false),
    [paused, setPaused] = useState(false),
    [fault, setFault] = useState("");
  const [view, setView] = useState<View>("world"),
    [selection, setSelection] = useState<Selection>(null),
    [layer, setLayer] = useState<Layer>("landscape");
  const [region, setRegion] = useState("");
  const [exploring, setExploring] = useState(false);
  const regionRef = useRef("");
  regionRef.current = region;
  const [connectOpen, setConnectOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [toast, setToast] = useState("");
  const [journalFilter, setJournalFilter] = useState("all"),
    [historyMode, setHistoryMode] = useState<"population" | "forest">(
      "population",
    );
  const [journalCommunity, setJournalCommunity] = useState("all");
  const canvas = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null),
    renderer = useRef<WorldRenderer | null>(null);
  const ui = useRef({
    world,
    overview,
    paused,
    selection,
    layer,
    view,
    connected,
    arrived,
    followed,
    exploring,
  });
  ui.current = {
    world,
    overview,
    paused,
    selection,
    layer,
    view,
    connected,
    arrived,
    followed,
    exploring,
  };
  const accept = (snapshot: WorldSnapshot) => {
    latest.current = snapshot;
    if (!pausedRef.current) setWorld(snapshot);
  };
  useEffect(() => {
    let alive = true;
    api<SessionView & { testControls: boolean }>("/api/session")
      .then((data) => {
        if (alive) {
          setSession(data);
          testControls.current = data.testControls;
        }
      })
      .catch((error) => {
        if (alive) setFault(error.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (arrived) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const response = await fetch("/api/overview", { signal: abort.signal });
        if (!response.ok)
          throw new Error("The world overview is temporarily unavailable.");
        const value = (await response.json()) as WorldOverview;
        if (abort.signal.aborted) return;
        setOverview(value);
        setConnected(true);
        setFault("");
      } catch (error) {
        if (abort.signal.aborted) return;
        setConnected(false);
        setFault((error as Error).message);
      }
      if (!abort.signal.aborted) timer = setTimeout(refresh, 5000);
    };
    void refresh();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [arrived]);
  useEffect(() => {
    if (!arrived) return;
    const source = new EventSource(
      `/api/stream${region ? `?civilization=${encodeURIComponent(region)}` : ""}`,
    );
    source.onopen = () => {
      setConnected(true);
      setFault("");
    };
    source.onerror = () => setConnected(false);
    source.addEventListener("snapshot", (event) => {
      setConnected(true);
      setFault("");
      accept(JSON.parse((event as MessageEvent).data));
    });
    source.addEventListener("frame", (event) => {
      const frame = JSON.parse((event as MessageEvent).data) as WorldFrame,
        current = latest.current;
      if (!current) return;
      const tiles = frame.tileChanges.length
        ? [...current.tiles]
        : current.tiles;
      for (const tile of frame.tileChanges)
        tiles[
          (tile.y - current.originY) * current.width + tile.x - current.originX
        ] = tile;
      accept({ ...current, ...frame, tiles });
    });
    source.addEventListener("fault", () => {
      setFault(
        "The world has paused after an internal error. Its last valid checkpoint is preserved.",
      );
      setConnected(false);
    });
    return () => {
      source.close();
    };
  }, [region, arrived]);
  useEffect(() => {
    if (session.civilizationId) setRegion(session.civilizationId);
  }, [session.civilizationId]);
  useEffect(() => {
    if (!arrived || !canvas.current) return;
    renderer.current = new WorldRenderer(canvas.current, (selection) => {
      setSelection(selection);
      setView("world");
    });
    if (latest.current) renderer.current.update(latest.current);
    renderer.current.setLayer(layer);
    renderer.current.setSelection(selection);
    return () => {
      renderer.current?.destroy();
      renderer.current = null;
    };
  }, [arrived]);
  useEffect(() => {
    if (world) renderer.current?.update(world);
  }, [world]);
  useEffect(() => {
    renderer.current?.setLayer(layer);
  }, [layer]);
  useEffect(() => {
    renderer.current?.setSelection(selection);
  }, [selection]);
  useEffect(() => {
    renderer.current?.setActive(!exploring);
  }, [exploring, arrived]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  const togglePause = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (!next && latest.current) setWorld(latest.current);
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
    } catch {
      setToast("Fullscreen is unavailable in this browser.");
    }
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!arrived) return;
      if (
        (event.target as HTMLElement)?.closest(
          'input,textarea,select,[role="dialog"]',
        )
      )
        return;
      if (event.code === "Space") {
        if ((event.target as HTMLElement)?.closest("button,a")) return;
        event.preventDefault();
        togglePause();
      }
      if (event.key.toLowerCase() === "f") void fullscreen();
      if (event.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [arrived]);
  useEffect(() => {
    window.render_game_to_text = () => {
      const state = ui.current,
        w = state.arrived ? state.world : null;
      return JSON.stringify(
        w
          ? {
              mode: state.exploring
                ? "planet-survey"
                : state.arrived
                  ? "shared-world"
                  : "planet-onboarding",
              connected: state.connected,
              observerPaused: state.paused,
              view: state.view,
              layer: state.layer,
              viewport: renderer.current?.cameraState(),
              survey: state.exploring
                ? JSON.parse(
                    document.querySelector<HTMLCanvasElement>(
                      ".survey-stage canvas",
                    )?.dataset.exploration ?? "null",
                  )
                : undefined,
              region: {
                originX: w.originX,
                originY: w.originY,
                width: w.width,
                height: w.height,
              },
              coordinates:
                "Shared world coordinates: x east, y south. Region origins may be negative. Isometric screen projection. Select labels, people, structures, or terrain.",
              tick: w.tick,
              time: w.summary,
              selection: state.selection,
              following: state.followed,
              communities: w.civilizations.map((c) => ({
                id: c.id,
                name: c.name,
                x: c.x,
                y: c.y,
                people: w.citizens.filter((p) => p.civId === c.id).length,
                food: round(c.stock.biomass, 1),
                observations: c.observations.length,
                claimed: c.claimed,
                focus: c.focus,
                proposals: c.civics?.proposals.slice(-3).map((p) => ({
                  id: p.id,
                  type: p.action.type,
                  status: p.status,
                })),
                outcomes: c.civics?.progress.current,
                contacts: Object.keys(c.relations).length,
              })),
              people: w.citizens.slice(0, 40).map((p) => ({
                id: p.id,
                name: p.name,
                x: +p.x.toFixed(2),
                y: +p.y.toFixed(2),
                activity: p.task?.kind ?? "deciding",
                health: round(p.health),
                generation: p.generation,
                sleeping: p.mind?.sleeping,
                attention: p.mind
                  ? Math.round(p.mind.attention * 100)
                  : undefined,
                rememberedIdeas: p.mind?.knowledge.length,
                journey: p.journeyId,
              })),
              structures: w.structures.map((s) => ({
                id: s.id,
                x: s.x,
                y: s.y,
                name: s.design.name,
                progress: +s.progress.toFixed(2),
                coveredArea: s.properties.coveredArea,
                condition: Math.round(s.condition),
                collapsed: s.collapsed,
                workSurface: s.properties.workSurface,
                storageVolume: s.properties.storageVolume,
              })),
              correspondence: w.diplomacy?.messages.slice(-6).map((m) => ({
                id: m.id,
                from: m.from,
                to: m.to,
                status: m.status,
              })),
              animals: w.animals
                .filter(
                  (a) =>
                    a.x >= w.originX &&
                    a.y >= w.originY &&
                    a.x < w.originX + w.width &&
                    a.y < w.originY + w.height,
                )
                .slice(0, 40)
                .map((a) => ({
                  id: a.id,
                  species: a.species,
                  count: a.count,
                  x: a.x,
                  y: a.y,
                  activity: a.activity,
                })),
              agents: w.agents,
              recentEvents: w.events.slice(-3).map((e) => e.title),
            }
          : state.overview && !state.arrived
            ? {
                mode: "planet-onboarding",
                connected: state.connected,
                tick: state.overview.tick,
                time: state.overview.summary,
                communities: state.overview.civilizations.map((c) => ({
                  ...c,
                  people: c.population,
                })),
              }
            : { mode: "loading", connected: state.connected },
      );
    };
    window.advanceTime = async (ms) => {
      if (testControls.current) {
        timeRemainder.current += Math.max(0, Math.min(ms, 750000));
        const ticks = Math.floor(timeRemainder.current / 250);
        timeRemainder.current -= ticks * 250;
        if (ticks)
          accept(
            await api<WorldSnapshot>(
              `/api/dev/advance${regionRef.current ? `?civilization=${encodeURIComponent(regionRef.current)}` : ""}`,
              "POST",
              { ticks },
            ),
          );
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    };
  }, []);
  const chooseCiv = (civ: Civilization, move = true) => {
    setView("world");
    setSelection({ type: "civilization", id: civ.id });
    if (
      world &&
      (civ.x < world.originX ||
        civ.y < world.originY ||
        civ.x >= world.originX + world.width ||
        civ.y >= world.originY + world.height)
    ) {
      if (pausedRef.current) togglePause();
      setRegion(civ.id);
    } else if (move) renderer.current?.focus(civ.x, civ.y);
  };
  const onEvent = (event: WorldEvent) => {
    if (
      event.citizenId &&
      world?.citizens.some((p) => p.id === event.citizenId)
    ) {
      setSelection({ type: "citizen", id: event.citizenId });
      setView("world");
    } else if (event.civId) {
      const community = world?.civilizations.find((c) => c.id === event.civId);
      if (community) chooseCiv(community);
    } else {
      setView("journal");
      setJournalCommunity("all");
      setJournalFilter(event.category);
    }
    if (event.x !== undefined && event.y !== undefined)
      renderer.current?.focus(event.x, event.y);
  };
  const selectedAnimal =
    selection?.type === "animal"
      ? world?.animals.find((a) => a.id === selection.id)
      : undefined;
  const selectedCitizen =
    selection?.type === "citizen"
      ? world?.citizens.find((p) => p.id === selection.id)
      : undefined;
  const selectedCiv =
    selection?.type === "civilization"
      ? world?.civilizations.find((c) => c.id === selection.id)
      : undefined;
  const selectedStructure =
    selection?.type === "structure"
      ? world?.structures.find((s) => s.id === selection.id)
      : undefined;
  const selectedTile =
    selection?.type === "tile" ? world?.tiles[Number(selection.id)] : undefined;
  const ownCiv = world?.civilizations.find(
    (c) => c.id === session.civilizationId,
  );
  const journalCiv = world?.civilizations.find(
    (c) => c.id === journalCommunity,
  );
  const journalCommunities =
    journalCommunity === "all"
      ? undefined
      : journalCommunity === "following"
        ? followed.filter((id) => world?.civilizations.some((c) => c.id === id))
        : [journalCommunity];
  const readCommunityHistory = (id: string) => {
    setJournalCommunity(id);
    setJournalFilter("all");
    setView("journal");
  };
  const switchView = (next: View) => {
    setView(next);
    setSelection(null);
  };

  if (!arrived)
    return (
      <>
        <PlanetWelcome
          world={overview}
          connected={connected}
          fault={fault}
          observe={enterWorld}
          connect={() => {
            enterWorld();
            setConnectOpen(true);
          }}
          explore={() => {
            enterWorld();
            setExploring(true);
          }}
        />
        {connectOpen && world && (
          <ConnectionDialog
            world={world}
            session={session}
            setSession={setSession}
            close={() => {
              setConnectOpen(false);
              if (session.civilizationId) enterWorld();
            }}
            notify={setToast}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            <Check size={15} />
            {toast}
          </div>
        )}
      </>
    );

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            if (pausedRef.current) togglePause();
            sessionStorage.removeItem("praxans_observing");
            setArrived(false);
          }}
          aria-label="Praxans home"
        >
          <span className="brand-symbol">
            <Sprout size={23} strokeWidth={1.6} />
          </span>
          <span>
            praxans<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="header-world">
          <Globe2 size={15} />
          <span>The Verdant Commons</span>
          <span className="tiny-divider" />
          <span className="muted">Shared world</span>
        </div>
        <div className="header-actions">
          <button
            className="text-button guide-button"
            onClick={() => switchView("laws")}
          >
            <BookOpen size={16} /> Field guide
          </button>
          <button
            className="button primary connect-trigger"
            onClick={() => setConnectOpen(true)}
          >
            <Link2 size={16} />
            {ownCiv ? "Your agent" : "Connect an agent"}
            <ArrowRight size={15} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <nav className="nav-rail" aria-label="World views">
          <span className="rail-top">
            <IconButton
              label="Explore the world"
              selected={view === "world"}
              onClick={() => switchView("world")}
            >
              <Compass size={21} />
            </IconButton>
            <IconButton
              label="Communities"
              selected={view === "communities"}
              onClick={() => switchView("communities")}
            >
              <Users size={21} />
            </IconButton>
            <IconButton
              label="World journal"
              selected={view === "journal"}
              onClick={() => switchView("journal")}
            >
              <BookOpen size={20} />
            </IconButton>
            <IconButton
              label="Living ecosystem"
              selected={view === "ecology"}
              onClick={() => switchView("ecology")}
            >
              <Leaf size={21} />
            </IconButton>
            <IconButton
              label="Natural laws"
              selected={view === "laws"}
              onClick={() => switchView("laws")}
            >
              <FlaskConical size={21} />
            </IconButton>
          </span>
          <span className="rail-bottom">
            <IconButton
              label="How to observe"
              onClick={() => setHelpOpen(true)}
            >
              <CircleHelp size={20} />
            </IconButton>
            <span className="rail-signature">P</span>
          </span>
        </nav>
        <main className="main-area">
          <div className="world-stage" ref={stage}>
            <canvas
              ref={canvas}
              id="world-canvas"
              tabIndex={0}
              aria-label="Living isometric world. Drag to explore, scroll to zoom, and select a person, community label, or patch of earth."
            />
            <div className="stage-heading">
              <span className="eyebrow">
                <span className="little-line" />A WORLD OF ITS OWN
              </span>
              <h1>
                Small beginnings.
                <br />
                <em>Endless possibility.</em>
              </h1>
              <p>
                A living world, finding its own way.
                <br />
                Stay a while. See what grows.
              </p>
            </div>
            <div className="world-clock">
              <span
                className={`status-dot ${connected && !fault ? "" : "offline"}`}
              />
              <span>
                {fault
                  ? "World halted"
                  : connected
                    ? paused
                      ? "View paused"
                      : "World is living"
                    : world
                      ? "Reconnecting…"
                      : "Connecting…"}
              </span>
              {world && (
                <>
                  <span className="clock-separator" />
                  <span>Year {world.summary.year}</span>
                </>
              )}
            </div>
            {world && (
              <div className="season-chip">
                {world.summary.weather === "rain" ||
                world.summary.weather === "storm" ? (
                  <CloudRain size={17} />
                ) : (
                  <Sun size={17} />
                )}
                <span>
                  {world.summary.season}
                  <i>
                    Day {world.summary.day} ·{" "}
                    {world.summary.clock.localSolarTime}
                  </i>
                </span>
              </div>
            )}
            {!world && (
              <div className="loading-world">
                <Sprout size={32} />
                <span>Opening the commons…</span>
              </div>
            )}
            {paused && (
              <div className="pause-notice">
                <Pause size={13} /> Your view is paused. Life continues in the
                shared world.
                <button onClick={togglePause}>
                  Return to live <ArrowRight size={13} />
                </button>
              </div>
            )}
            <div className="map-legend">
              <span className="legend-leaf">
                <Leaf size={13} />
              </span>
              <span>
                {layer === "water"
                  ? "Soil water · dry earth to saturated ground"
                  : layer === "life"
                    ? "Living biomass · sparse to abundant"
                    : layer === "communities"
                      ? "Places shaped by each community"
                      : "Every life has a story. Look a little closer."}
              </span>
            </div>
            <div className="map-tools">
              <IconButton
                label="Explore the whole planet"
                onClick={() => setExploring(true)}
              >
                <Globe2 size={18} />
              </IconButton>
              <span />
              <IconButton
                label="Zoom in"
                onClick={() => renderer.current?.zoom(1.25)}
              >
                <Plus size={18} />
              </IconButton>
              <IconButton
                label="Zoom out"
                onClick={() => renderer.current?.zoom(0.8)}
              >
                <Minus size={18} />
              </IconButton>
              <span />
              <IconButton
                label="Recenter this region"
                onClick={() => renderer.current?.fit()}
              >
                <Maximize2 size={17} />
              </IconButton>
              <IconButton
                label="Toggle fullscreen"
                onClick={() => void fullscreen()}
              >
                <Expand size={17} />
              </IconButton>
            </div>
          </div>
          <div className="world-toolbar">
            <div className="layer-controls" aria-label="Map layers">
              {(
                [
                  { id: "landscape", label: "Landscape", Icon: Leaf },
                  { id: "communities", label: "Communities", Icon: Users },
                  { id: "water", label: "Water", Icon: Droplets },
                  { id: "life", label: "Life", Icon: Sprout },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setLayer(id)}
                  className={layer === id ? "active" : ""}
                  aria-pressed={layer === id}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <button
              className={`live-control ${paused ? "is-paused" : ""}`}
              aria-label={paused ? "Resume view" : "Pause view"}
              onClick={togglePause}
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
              <span>{paused ? "Resume view" : "Pause view"}</span>
              <kbd>space</kbd>
            </button>
          </div>
          {world && (
            <button
              className="latest-event"
              onClick={() => onEvent(world.events.at(-1)!)}
            >
              <span className="latest-icon">
                <EventIcon event={world.events.at(-1)!} />
              </span>
              <span className="latest-label">JUST UNFOLDED</span>
              <span className="latest-title">{world.events.at(-1)!.title}</span>
              <span className="latest-time">
                {ago(world.events.at(-1)!.tick, world.tick)}
              </span>
              <ArrowRight size={15} />
            </button>
          )}
        </main>
        <aside className="inspector" aria-label="World inspector">
          {world && view === "world" && !selection && (
            <>
              <div className="inspector-heading">
                <span className="eyebrow">THE COMMONS, TODAY</span>
                <h2>Life, unfolding.</h2>
                <p>Many small lives. One shared story.</p>
              </div>
              <div className="stat-grid">
                <div>
                  <span>
                    <Users size={15} /> People
                  </span>
                  <strong>
                    {world.summary.population}
                    <small>living lives</small>
                  </strong>
                </div>
                <div>
                  <span>
                    <Sprout size={15} /> Communities
                  </span>
                  <strong>
                    {
                      world.civilizations.filter((c) =>
                        world.citizens.some((p) => p.civId === c.id),
                      ).length
                    }
                    <small>
                      {
                        world.civilizations.filter(
                          (c) => !world.citizens.some((p) => p.civId === c.id),
                        ).length
                      }{" "}
                      remembered · living now
                    </small>
                  </strong>
                </div>
                <div>
                  <span>
                    <TreePine size={15} /> Living canopy
                  </span>
                  <strong>
                    {round(world.summary.forest)}
                    <i>%</i>
                    <small>of the first day</small>
                  </strong>
                </div>
                <div>
                  <span>
                    <FlaskConical size={15} /> Observations
                  </span>
                  <strong>
                    {world.summary.discoveries}
                    <small>learned by trying</small>
                  </strong>
                </div>
              </div>
              <div className="history-block">
                <div className="section-heading">
                  <h3>A little change, every day</h3>
                  <select
                    aria-label="History metric"
                    value={historyMode}
                    onChange={(e) =>
                      setHistoryMode(e.target.value as typeof historyMode)
                    }
                  >
                    <option value="population">People</option>
                    <option value="forest">Canopy</option>
                  </select>
                </div>
                <Sparkline values={world.history.map((p) => p[historyMode])} />
                <div className="chart-caption">
                  <span>
                    {world.history.length
                      ? `${world.history.length} days observed`
                      : "The beginning"}
                  </span>
                  <span>Now</span>
                </div>
              </div>
              <div className="section-heading">
                <h3>
                  {followed.some((id) =>
                    world.civilizations.some((c) => c.id === id),
                  )
                    ? "Following their stories"
                    : "Across the world"}
                </h3>
                <button
                  className="small-link"
                  onClick={() => switchView("communities")}
                >
                  Explore <ArrowRight size={13} />
                </button>
              </div>
              <div className="community-list">
                {world.civilizations
                  .filter(
                    (c) =>
                      !followed.some((id) =>
                        world.civilizations.some((value) => value.id === id),
                      ) || followed.includes(c.id),
                  )
                  .slice(0, 6)
                  .map((civ) => (
                    <CommunityRow
                      key={civ.id}
                      civ={civ}
                      world={world}
                      onClick={() => chooseCiv(civ)}
                      yours={civ.id === session.civilizationId}
                    />
                  ))}
              </div>
              <div className="invitation">
                <span className="invitation-mark">
                  <Sprout size={24} strokeWidth={1.5} />
                </span>
                <h3>
                  A mind of their own.
                  <br />A place for your agent.
                </h3>
                <p>
                  Give your agent a community to care for. Watch what they
                  discover together.
                </p>
                <button onClick={() => setConnectOpen(true)}>
                  Plant a beginning <ArrowRight size={15} />
                </button>
              </div>
              <div className="inspector-foot">
                <span className="status-dot" />
                One world. The same natural laws for everyone.
              </div>
            </>
          )}
          {world && view === "world" && selection && (
            <>
              <button className="back-link" onClick={() => setSelection(null)}>
                <ArrowLeft size={14} /> Back to the commons
              </button>
              {selectedCiv && (
                <CivilizationPanel
                  civ={selectedCiv}
                  world={world}
                  yours={selectedCiv.id === session.civilizationId}
                  onPerson={(person) => {
                    setSelection({ type: "citizen", id: person.id });
                    renderer.current?.focus(person.x, person.y);
                  }}
                  onConnect={() => setConnectOpen(true)}
                  onEvent={onEvent}
                  followed={followed.includes(selectedCiv.id)}
                  onToggleFollow={() => toggleFollowing(selectedCiv.id)}
                  onHistory={() => readCommunityHistory(selectedCiv.id)}
                  onCommunity={chooseCiv}
                />
              )}
              {selectedAnimal && <AnimalPanel animal={selectedAnimal} />}
              {selectedCitizen && (
                <CitizenPanel
                  person={selectedCitizen}
                  world={world}
                  onCiv={() =>
                    chooseCiv(
                      world.civilizations.find(
                        (c) => c.id === selectedCitizen.civId,
                      )!,
                    )
                  }
                />
              )}
              {selectedStructure && (
                <>
                  <span className="eyebrow">SOMETHING THEY MADE</span>
                  <h2>{selectedStructure.design.name}</h2>
                  <p className="panel-lede">
                    {
                      world.civilizations.find(
                        (c) => c.id === selectedStructure.civId,
                      )?.name
                    }{" "}
                    ·{" "}
                    {selectedStructure.collapsed
                      ? "A ruin returning to the landscape"
                      : selectedStructure.progress < 1
                        ? "Taking shape"
                        : "Standing in the world"}
                  </p>
                  <div className="big-measure">
                    {round(selectedStructure.properties.coveredArea, 1)}
                    <span>m² of covered space</span>
                  </div>
                  <Meter
                    label="Construction"
                    value={selectedStructure.progress * 100}
                  />
                  <Meter
                    label="Remaining integrity"
                    value={selectedStructure.condition}
                  />
                  <h3>Form follows matter</h3>
                  <p className="body-copy">
                    {selectedStructure.properties.explanation.join(" ")}
                  </p>
                  <div className="facts">
                    {Object.entries(selectedStructure.properties.cost)
                      .filter(([, n]) => n > 0)
                      .map(([m, n]) => (
                        <div key={m}>
                          <span>
                            {MATERIALS[m as keyof typeof MATERIALS].name}
                          </span>
                          <strong>{round(n, 1)} kg</strong>
                        </div>
                      ))}
                    <div>
                      <span>Usable working surface</span>
                      <strong>
                        {round(
                          selectedStructure.properties.workSurface ?? 0,
                          2,
                        )}{" "}
                        m²
                      </strong>
                    </div>
                    <div>
                      <span>Enclosed storage</span>
                      <strong>
                        {round(
                          selectedStructure.properties.storageVolume ?? 0,
                          3,
                        )}{" "}
                        m³
                      </strong>
                    </div>
                    {selectedStructure.fabric && (
                      <div>
                        <span>Weathered back into the world</span>
                        <strong>
                          {round(selectedStructure.fabric.lostMass, 3)} kg
                        </strong>
                      </div>
                    )}
                    <div>
                      <span>Components</span>
                      <strong>
                        {selectedStructure.design.components.length}
                      </strong>
                    </div>
                    <div>
                      <span>Insulation estimate</span>
                      <strong>
                        {round(selectedStructure.properties.insulation, 2)}
                      </strong>
                    </div>
                  </div>
                  <p className="quiet-note">
                    This assembly’s name gives it no special abilities. Its
                    effects come from its geometry and material properties.
                  </p>
                </>
              )}
              {selectedTile && (
                <>
                  <span className="eyebrow">A PATCH OF THE WORLD</span>
                  <h2 className="capitalize">{selectedTile.terrain}</h2>
                  <p className="panel-lede">
                    Tile {selectedTile.x}, {selectedTile.y}
                    {selectedTile.terrain === "unknown"
                      ? " · Beyond explored land"
                      : ""}
                  </p>
                  {selectedTile.terrain === "unknown" && (
                    <p className="body-copy">
                      This land has not entered the active simulation yet. A new
                      arrival can begin beyond the settled world; its terrain is
                      determined by the shared seed.
                    </p>
                  )}
                  <div className="tile-illustration">
                    <span>
                      {selectedTile.trees > 0.5 ? (
                        <TreePine size={56} strokeWidth={1} />
                      ) : selectedTile.terrain === "water" ? (
                        <Droplets size={56} strokeWidth={1} />
                      ) : (
                        <Sprout size={56} strokeWidth={1} />
                      )}
                    </span>
                  </div>
                  <div className="facts">
                    <div>
                      <span>Temperature</span>
                      <strong>{round(selectedTile.temperature, 1)} °C</strong>
                    </div>
                    <div>
                      <span>Water</span>
                      <strong>{round(selectedTile.water, 1)} kg</strong>
                    </div>
                    <div>
                      <span>Available minerals</span>
                      <strong>{round(selectedTile.mineral, 2)} kg</strong>
                    </div>
                    <div>
                      <span>Mineral rock</span>
                      <strong>{round(selectedTile.rock, 1)} kg</strong>
                    </div>
                    <div>
                      <span>Living organic matrix</span>
                      <strong>
                        {round(
                          (selectedTile.plant?.carbon ?? 0) +
                            (selectedTile.groundcover?.carbon ?? 0),
                          2,
                        )}{" "}
                        kg
                      </strong>
                    </div>
                    <div>
                      <span>Dormant seeds and spores</span>
                      <strong>
                        {(selectedTile.seedBank ?? []).length} cohorts ·{" "}
                        {round(
                          (selectedTile.seedBank ?? []).reduce(
                            (mass, seed) => mass + seed.carbon,
                            0,
                          ),
                          3,
                        )}{" "}
                        kg
                      </strong>
                    </div>
                    <div>
                      <span>Frozen soil and lake water</span>
                      <strong>{round(selectedTile.ice ?? 0, 1)} kg</strong>
                    </div>
                    <div>
                      <span>Organic remains</span>
                      <strong>
                        {round(selectedTile.detritus.carbon, 1)} kg
                      </strong>
                    </div>
                  </div>
                  {selectedTile.terrain !== "unknown" && (
                    <>
                      <h3>Air, water, and elements</h3>
                      <p className="body-copy">
                        {plantLabel(world, Number(selection?.id))}
                      </p>
                      <p className="body-copy">
                        {selectedTile.biome}. Organic tissue is a
                        carbohydrate-equivalent mixture, not pure carbon.
                      </p>
                      <div className="facts">
                        <div>
                          <span>Dissolved oxygen</span>
                          <strong>
                            {round(selectedTile.dissolvedOxygen * 1000, 2)} g
                          </strong>
                        </div>
                        <div>
                          <span>Air humidity</span>
                          <strong>
                            {round(selectedTile.air.humidity * 100)}%
                          </strong>
                        </div>
                        <div>
                          <span>Wind speed</span>
                          <strong>
                            {round(
                              Math.hypot(
                                selectedTile.air.windX,
                                selectedTile.air.windY,
                              ),
                              1,
                            )}{" "}
                            m/s
                          </strong>
                        </div>
                        <div>
                          <span>Rainfall</span>
                          <strong>
                            {round(selectedTile.air.rain, 3)} mm/h
                          </strong>
                        </div>
                        <div>
                          <span>Suspended dust</span>
                          <strong>
                            {round(selectedTile.air.dust * 1000, 2)} g
                          </strong>
                        </div>
                        <div>
                          <span>Loose sediment</span>
                          <strong>
                            {round(selectedTile.sediment ?? 0, 3)} kg
                          </strong>
                        </div>
                        <div>
                          <span>Surface rise / fall</span>
                          <strong>
                            {round((selectedTile.surfaceChange ?? 0) * 1000, 4)}{" "}
                            mm
                          </strong>
                        </div>
                        <div>
                          <span>Soil nitrogen</span>
                          <strong>
                            {round(selectedTile.nutrients.N ?? 0, 3)} kg
                          </strong>
                        </div>
                        <div>
                          <span>Soil phosphorus</span>
                          <strong>
                            {round(selectedTile.nutrients.P ?? 0, 3)} kg
                          </strong>
                        </div>
                        <div>
                          <span>Soil potassium</span>
                          <strong>
                            {round(selectedTile.nutrients.K ?? 0, 3)} kg
                          </strong>
                        </div>
                      </div>
                    </>
                  )}
                  {selectedTile.plant && (
                    <>
                      <h3>An inherited way of living</h3>
                      <p className="body-copy">
                        Generation {selectedTile.plant.generation} · Lineage{" "}
                        {selectedTile.plant.lineage + 1}. Growth and
                        reproduction depend on this patch’s light, water,
                        temperature, and minerals.
                      </p>
                      <Meter
                        label="Woody tissue"
                        value={selectedTile.plant.genome.woodiness * 100}
                      />
                      <Meter
                        label="Root investment"
                        value={(selectedTile.plant.genome.roots / 1.2) * 100}
                      />
                      <Meter
                        label="Defensive tissue"
                        value={selectedTile.plant.genome.defense * 100}
                      />
                    </>
                  )}
                </>
              )}
              {!selectedCitizen &&
                !selectedCiv &&
                !selectedStructure &&
                !selectedTile &&
                !selectedAnimal && (
                  <>
                    <h2>A moment has passed.</h2>
                    <p className="body-copy">
                      The selected life or structure is no longer here. Its
                      story remains in the journal.
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => switchView("journal")}
                    >
                      Open the journal
                    </button>
                  </>
                )}
            </>
          )}
          {world && view === "communities" && (
            <>
              <CommunityDirectory
                world={world}
                yours={session.civilizationId}
                followed={followed}
                onToggle={toggleFollowing}
                onSelect={chooseCiv}
                onHistory={readCommunityHistory}
                onFollowedStories={() => readCommunityHistory("following")}
              />
              <button
                className="button secondary wide"
                onClick={() => setConnectOpen(true)}
              >
                <Link2 size={15} /> Find your place
              </button>
            </>
          )}
          {world && view === "journal" && (
            <>
              <span className="eyebrow">THE STORY SO FAR</span>
              <h2>
                {journalCiv
                  ? journalCiv.name
                  : journalCommunity === "following"
                    ? "Stories you follow."
                    : "Field notes."}
              </h2>
              <p className="panel-lede">
                {journalCiv
                  ? "Their beginnings, lives and lasting record."
                  : "A record of things that actually happened."}
              </p>
              <div className="community-journal-scope">
                <label htmlFor="journal-community">Whose story</label>
                <select
                  id="journal-community"
                  className="filter-select"
                  aria-label="Journal community"
                  value={journalCommunity}
                  onChange={(event) => setJournalCommunity(event.target.value)}
                >
                  <option value="all">The whole world</option>
                  <option value="following">Communities I follow</option>
                  {world.civilizations.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {world.citizens.some((p) => p.civId === c.id)
                        ? ""
                        : " · remembered"}
                    </option>
                  ))}
                </select>
              </div>
              {journalCiv && (
                <div className="community-archive-heading">
                  <FollowCommunity
                    civ={journalCiv}
                    followed={followed.includes(journalCiv.id)}
                    onToggle={() => toggleFollowing(journalCiv.id)}
                  />
                  <CommunityLifeStory
                    civ={journalCiv}
                    world={world}
                    onSelect={chooseCiv}
                  />
                  <button
                    className="button secondary wide"
                    onClick={() => chooseCiv(journalCiv)}
                  >
                    {world.citizens.some((p) => p.civId === journalCiv.id)
                      ? "Visit their home"
                      : "Visit their former home"}
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
              <select
                className="filter-select"
                aria-label="Journal category"
                value={journalFilter}
                onChange={(e) => setJournalFilter(e.target.value)}
              >
                <option value="all">Every kind of moment</option>
                <option value="founding">New communities</option>
                <option value="life">Lives & families</option>
                <option value="building">Making & building</option>
                <option value="discovery">Observations</option>
                <option value="trade">Exchange</option>
                <option value="nature">The natural world</option>
                <option value="agent">Agent decisions</option>
                <option value="culture">Culture</option>
                <option value="diplomacy">Diplomacy</option>
              </select>
              <ArchivedJournal
                world={world}
                onEvent={onEvent}
                filter={journalFilter}
                communityIds={journalCommunities}
              />
            </>
          )}
          {world && view === "ecology" && (
            <LifePanel
              world={world}
              select={(animal) => {
                setSelection({ type: "animal", id: animal.id });
                setView("world");
                renderer.current?.focus(animal.x, animal.y);
              }}
            />
          )}
          {world && view === "laws" && <FieldGuide world={world} />}
          {!world && (
            <div className="inspector-loading">
              <span className="eyebrow">THE COMMONS</span>
              <h2>Life takes a moment.</h2>
              <p>Connecting to the living world…</p>
              {fault && <p className="form-error">{fault}</p>}
            </div>
          )}
        </aside>
      </div>
      {fault && world && (
        <div className="fault-banner" role="alert">
          {fault}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {exploring && world && (
        <PlanetExplorer
          world={world}
          close={() => setExploring(false)}
          visit={(civ) => {
            setExploring(false);
            chooseCiv(civ);
          }}
        />
      )}
      {connectOpen && world && (
        <ConnectionDialog
          world={latest.current ?? world}
          session={session}
          setSession={setSession}
          close={() => setConnectOpen(false)}
          notify={setToast}
        />
      )}
      {helpOpen && (
        <Dialog title="The art of watching." close={() => setHelpOpen(false)}>
          <p className="dialog-intro">
            Praxans is a shared civilization terrarium. Small groups make their
            way in an ecosystem governed by the same natural laws.
          </p>
          <div className="help-list">
            <div>
              <Compass />
              <span>
                <strong>Wander a little</strong>Drag the landscape or use arrow
                keys. Scroll to zoom. Click a person, community, or patch of
                earth to look closer.
              </span>
            </div>
            <div>
              <Pause />
              <span>
                <strong>Take your time</strong>Space pauses your view. The
                shared world keeps living. Press F for fullscreen and Escape to
                return.
              </span>
            </div>
            <div>
              <Link2 />
              <span>
                <strong>Bring a mind of its own</strong>Adopt a community and
                connect an agent over HTTP or MCP. People act autonomously
                between its decisions.
              </span>
            </div>
            <div>
              <FlaskConical />
              <span>
                <strong>Follow the consequences</strong>Read the field guide,
                inspect material stores, and follow the journal. There is no
                fixed building catalog or technology tree.
              </span>
            </div>
          </div>
          <button
            className="button primary wide"
            onClick={() => setHelpOpen(false)}
          >
            Back to the world <ArrowRight size={16} />
          </button>
        </Dialog>
      )}
    </div>
  );
}

function CommunityRow({
  civ,
  world,
  onClick,
  yours,
}: {
  civ: Civilization;
  world: WorldSnapshot;
  onClick: () => void;
  yours?: boolean;
}) {
  const agents = world.agents.filter((a) => a.civId === civ.id),
    population = world.citizens.filter((p) => p.civId === civ.id).length;
  return (
    <button className="community-row" onClick={onClick}>
      <span
        className="community-avatar"
        style={{ background: civ.accent, color: civ.color }}
      >
        <Sprout size={22} strokeWidth={1.5} />
      </span>
      <span className="community-row-text">
        <strong>
          {civ.name}
          {yours && <i>yours</i>}
        </strong>
        <small>
          {population} people <span>·</span>{" "}
          {population === 0
            ? "A chapter in the world’s history"
            : agents.some(active)
              ? "Agent connected"
              : agents.length
                ? "Awaiting agent"
                : "Finding their own way"}
        </small>
      </span>
      <ChevronRight size={15} />
    </button>
  );
}
function CivilizationPanel({
  civ,
  world,
  yours,
  onPerson,
  onConnect,
  onEvent,
  followed,
  onToggleFollow,
  onHistory,
  onCommunity,
}: {
  civ: Civilization;
  world: WorldSnapshot;
  yours: boolean;
  onPerson: (p: Citizen) => void;
  onConnect: () => void;
  onEvent: (e: WorldEvent) => void;
  followed: boolean;
  onToggleFollow: () => void;
  onHistory: () => void;
  onCommunity: (civ: Civilization) => void;
}) {
  const people = world.citizens.filter((p) => p.civId === civ.id),
    shelter = world.structures
      .filter((s) => s.civId === civ.id && !s.collapsed && s.progress >= 1)
      .reduce((n, s) => n + s.properties.capacity, 0);
  return (
    <>
      <span className="eyebrow" style={{ color: civ.color }}>
        {people.length ? "A COMMUNITY TAKING SHAPE" : "A COMMUNITY REMEMBERED"}{" "}
        {yours ? "· YOURS" : ""}
      </span>
      <h2>{civ.name}</h2>
      <p className="panel-lede">{civ.motto}</p>
      <div className="community-heading-actions">
        <FollowCommunity
          civ={civ}
          followed={followed}
          onToggle={onToggleFollow}
        />
        <button className="community-history-link" onClick={onHistory}>
          <BookOpen size={14} /> Read their history
        </button>
      </div>
      <CommunityLifeStory civ={civ} world={world} onSelect={onCommunity} />
      <div className="civ-metrics">
        <div>
          <strong>{people.length}</strong>
          <span>people</span>
        </div>
        <div>
          <strong>{round(shelter)}</strong>
          <span>shelter spaces</span>
        </div>
        <div>
          <strong>{civ.births}</strong>
          <span>recorded births</span>
        </div>
      </div>
      {people.length > 0 && (
        <div className="focus-note">
          <Leaf size={16} />
          <span>
            {FOCUSES[civ.focus].name}
            <small>{civ.lastIntent || FOCUSES[civ.focus].description}</small>
          </span>
        </div>
      )}
      <h3>
        {people.length
          ? "What they have gathered"
          : "Material left at their home"}
      </h3>
      <div className="stocks">
        {Object.entries(civ.stock).map(([m, n]) => (
          <div key={m}>
            <i
              style={{
                background: MATERIALS[m as keyof typeof MATERIALS].color,
              }}
            />
            <span>{MATERIALS[m as keyof typeof MATERIALS].name}</span>
            <strong>
              {round(n, 1)}
              <small> kg</small>
            </strong>
          </div>
        ))}
      </div>
      {people.length > 0 && (
        <>
          <div className="section-heading">
            <h3>A few of their stories</h3>
            <span className="muted">{people.length} lives</span>
          </div>
          <div className="people-list">
            {people.slice(0, 12).map((person) => (
              <button key={person.id} onClick={() => onPerson(person)}>
                <span
                  className="person-initial"
                  style={{ background: civ.accent }}
                >
                  {person.name[0]}
                </span>
                <span>
                  <strong>{person.name}</strong>
                  <small>
                    {Math.floor(person.age)} years ·{" "}
                    {person.task?.kind ?? "Taking a moment"}
                  </small>
                </span>
                <ChevronRight size={13} />
              </button>
            ))}
          </div>
        </>
      )}
      {civ.observations.length > 0 && (
        <>
          <h3>Learned through experience</h3>
          <div className="observation-card">
            <FlaskConical size={17} />
            <span>
              {
                [...civ.observations].sort(
                  (a, b) => b.properties.coveredArea - a.properties.coveredArea,
                )[0].statement
              }
              <small>
                {civ.experiments} material trials · {civ.observations.length}{" "}
                recorded observations
              </small>
            </span>
          </div>
        </>
      )}
      {civ.traditions.length > 0 && (
        <div className="traditions">
          {civ.traditions.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
      {people.length > 0 && <SocietyPanel civ={civ} world={world} />}
      <h3>Recent records</h3>
      <Journal
        events={world.events.filter((e) => e.civId === civ.id)}
        world={world}
        onEvent={onEvent}
        limit={4}
      />
      <button className="button secondary wide" onClick={onHistory}>
        <BookOpen size={15} /> Read the community archive
      </button>
      {yours && (
        <button className="button secondary wide" onClick={onConnect}>
          <Link2 size={15} />
          {people.length ? "Manage your agent" : "Begin a new chapter"}
        </button>
      )}
    </>
  );
}
function CitizenPanel({
  person,
  world,
  onCiv,
}: {
  person: Citizen;
  world: WorldSnapshot;
  onCiv: () => void;
}) {
  const civ = world.civilizations.find((c) => c.id === person.civId)!,
    partner = world.citizens.find((p) => p.id === person.partnerId);
  return (
    <>
      <span className="eyebrow">ONE SMALL, WHOLE LIFE</span>
      <div className="person-portrait" style={{ background: civ.accent }}>
        <span style={{ background: civ.color }} />
        <i />
      </div>
      <h2>{person.name}</h2>
      <button className="small-link person-home" onClick={onCiv}>
        {civ.name} <ArrowRight size={13} />
      </button>
      <div className="civ-metrics">
        <div>
          <strong>{Math.floor(person.age)}</strong>
          <span>years old</span>
        </div>
        <div>
          <strong>{person.generation}</strong>
          <span>generation</span>
        </div>
        <div>
          <strong>{round(person.skill, 1)}</strong>
          <span>experience</span>
        </div>
      </div>
      <div className="focus-note">
        <Heart size={16} />
        <span>
          {person.task
            ? `${person.task.kind[0].toUpperCase()}${person.task.kind.slice(1)}`
            : "Taking a moment"}
          <small>
            {person.cargo
              ? `Carrying ${round(person.cargo.amount, 1)} kg of ${person.cargo.material}`
              : person.age < 12
                ? "Growing, learning, and being cared for."
                : `A growing practice of ${person.specialty}.`}
          </small>
        </span>
      </div>
      <h3>The rhythms of a body</h3>
      <Meter label="Health" value={person.health} />
      <Meter label="Nourishment" value={person.hunger} />
      <Meter label="Rest" value={person.energy} />
      <Meter label="Contentment" value={person.happiness} />
      <MindPanel person={person} civ={civ} />
      <h3>A way of being</h3>
      <div className="trait-tags">
        {Object.entries(person.traits).map(([trait, value]) => (
          <span key={trait}>
            {value > 0.7 ? "Very " : value < 0.35 ? "Quietly " : ""}
            {trait === "diligence"
              ? "diligent"
              : trait === "sociability"
                ? "sociable"
                : trait === "curiosity"
                  ? "curious"
                  : "resilient"}
          </span>
        ))}
      </div>
      {partner && (
        <p className="body-copy">
          Close to <strong>{partner.name}</strong>.
        </p>
      )}
      <h3>Things they remember</h3>
      <div className="memories">
        {[...person.memories].reverse().map((memory, i) => (
          <div key={`${memory.tick}-${i}`}>
            <span className={memory.feeling === "sad" ? "sad" : ""} />
            <p>
              {memory.text}
              <small>{ago(memory.tick, world.tick)}</small>
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
function ConnectionDialog({
  world,
  session,
  setSession,
  close,
  notify,
}: {
  world: WorldSnapshot;
  session: SessionView;
  setSession: (s: SessionView) => void;
  close: () => void;
  notify: (s: string) => void;
}) {
  const [selected, setSelected] = useState(
      world.civilizations.find((c) => !c.claimed)?.id ?? "",
    ),
    [name, setName] = useState("My steward"),
    [provider, setProvider] = useState("Any HTTP / MCP agent"),
    [branchName, setBranchName] = useState(""),
    [arrivalMode, setArrivalMode] = useState<"frontier" | "adopt">("frontier");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [token, setToken] = useState(""),
    [agent, setAgent] = useState<AgentPublic | null>(null),
    [revoked, setRevoked] = useState<string[]>([]);
  const owned = world.civilizations.find(
    (c) => c.id === session.civilizationId,
  );
  const extinct = !!owned && !world.citizens.some((p) => p.civId === owned.id);
  const execute = async (fn: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const claim = () =>
    execute(async () => {
      const result = await api<SessionView>(
        "/api/claim",
        "POST",
        arrivalMode === "frontier"
          ? {
              name: branchName.trim(),
              ...(extinct ? { afterExtinction: true } : {}),
            }
          : { civilizationId: selected },
      );
      setSession(result);
    });
  const create = () =>
    execute(async () => {
      const result = await api<{ token: string; agent: AgentPublic }>(
        "/api/agents",
        "POST",
        { name, provider },
      );
      setToken(result.token);
      setAgent(result.agent);
    });
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(label);
    } catch {
      setError(
        "Clipboard access is unavailable. Select and copy the key or endpoint below.",
      );
    }
  };
  const agents = [
    ...world.agents.filter((a) => a.civId === session.civilizationId),
    ...(agent && !world.agents.some((a) => a.id === agent.id) ? [agent] : []),
  ].filter((a) => !revoked.includes(a.id));
  return (
    <Dialog
      title={
        extinct
          ? "A new chapter in this world."
          : !owned
            ? "A whole horizon of your own."
            : token
              ? "A connection, ready to grow."
              : `A steward for ${owned.name}.`
      }
      close={close}
    >
      {!owned || extinct ? (
        <>
          {extinct && (
            <p className="dialog-intro">
              {owned!.name} has no living inhabitants. Its history and remains
              stay in this world. You can begin with a new community in fresh
              wilderness; the earlier agent keys will retire when you begin.
            </p>
          )}
          <p className="dialog-intro">
            Begin with {FOUNDING.people} adults in untouched wilderness, far
            beyond other settlements. Every new community receives the same
            supplies and a clearing with water and plant food. From there, their
            survival is part of the world’s unfolding story.
          </p>
          <div className="frontier-start">
            <span className="frontier-icon">
              <TreePine size={30} />
              <Sprout size={21} />
            </span>
            <span>
              <strong>Beyond the settled world</strong>
              <small>One shared world · a fresh, unclaimed clearing</small>
            </span>
          </div>
          <label>
            Community name
            <input
              value={branchName}
              maxLength={48}
              onChange={(e) => {
                setBranchName(e.target.value);
                setArrivalMode("frontier");
              }}
              placeholder="A name for a new beginning"
            />
          </label>
          {!extinct && (
            <details className="branch-details">
              <summary>Or care for an existing community</summary>
              <div className="adopt-options">
                {world.civilizations
                  .filter(
                    (c) =>
                      !c.claimed &&
                      world.citizens.some((p) => p.civId === c.id),
                  )
                  .map((civ) => (
                    <button
                      key={civ.id}
                      disabled={busy}
                      className={
                        selected === civ.id && arrivalMode === "adopt"
                          ? "chosen"
                          : ""
                      }
                      onClick={() => {
                        setSelected(civ.id);
                        setArrivalMode("adopt");
                      }}
                    >
                      <span
                        className="community-avatar"
                        style={{ color: civ.color, background: civ.accent }}
                      >
                        <Sprout size={25} />
                      </span>
                      <span>
                        <strong>{civ.name}</strong>
                        <small>
                          {
                            world.citizens.filter((p) => p.civId === civ.id)
                              .length
                          }{" "}
                          people · {FOCUSES[civ.focus].name}
                        </small>
                      </span>
                      <span className="radio-choice">
                        {selected === civ.id && arrivalMode === "adopt" && (
                          <span />
                        )}
                      </span>
                    </button>
                  ))}
              </div>
            </details>
          )}
          <button
            className="button primary wide"
            disabled={
              busy ||
              (arrivalMode === "frontier" ? !branchName.trim() : !selected)
            }
            onClick={() => void claim()}
          >
            {busy
              ? "Finding your clearing…"
              : extinct
                ? "Begin a new community"
                : arrivalMode === "frontier"
                  ? "Begin in the wilderness"
                  : "Adopt this community"}
            <ArrowRight size={16} />
          </button>
          <p className="quiet-note">
            Your place is remembered in this browser. Keep its site data to
            retain stewardship.
          </p>
        </>
      ) : token ? (
        <>
          <p className="dialog-intro">
            Give this connection to your agent. It can observe the world and act
            for <strong>{owned.name}</strong> through HTTP or MCP.
          </p>
          <div className="connection-success">
            <span>
              <Check size={17} /> Key created
            </span>
            <small>
              {agent?.name} · {provider}
            </small>
          </div>
          <AgentInvitation
            worldName={world.name}
            worldId={world.id}
            communityName={owned.name}
            communityId={owned.id}
            token={token}
            notify={notify}
          />
          <label>
            Private civilization key
            <div className="copy-field">
              <input
                aria-label="Private civilization key"
                type="password"
                readOnly
                value={token}
              />
              <button
                onClick={() => void copy(token, "Civilization key copied")}
                aria-label="Copy civilization key"
              >
                <Copy size={16} />
              </button>
            </div>
          </label>
          <p className="key-note">
            Copy it now. The server stores a hash and cannot show this key
            again.
          </p>
          <div className="connection-endpoints">
            <div>
              <span>MCP endpoint</span>
              <code>{location.origin}/mcp</code>
              <button
                aria-label="Copy MCP configuration"
                onClick={() =>
                  void copy(
                    JSON.stringify(
                      {
                        url: `${location.origin}/mcp`,
                        headers: { Authorization: `Bearer ${token}` },
                      },
                      null,
                      2,
                    ),
                    "MCP connection copied",
                  )
                }
              >
                <Copy size={14} />
              </button>
            </div>
            <div>
              <span>HTTP observation</span>
              <code>/api/agent/observe</code>
              <button
                aria-label="Copy HTTP observation URL"
                onClick={() =>
                  void copy(
                    `${location.origin}/api/agent/observe`,
                    "Observation URL copied",
                  )
                }
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
          <p className="body-copy">
            Use <code>Authorization: Bearer YOUR_KEY</code>. Begin by observing.
            Read the natural laws, then submit proposals with a unique request
            ID and a reason. Observe again to learn what the community accepts.
          </p>
          <div className="waiting-agent">
            <Radio size={17} />
            <span>
              {agents.some(active)
                ? "Your agent has made contact."
                : "Waiting for the first observation."}
              <small>
                Connection status comes from actual authenticated requests.
              </small>
            </span>
          </div>
          <button className="button primary wide" onClick={close}>
            Back to watching <ArrowRight size={16} />
          </button>
        </>
      ) : (
        <>
          <p className="dialog-intro">
            Any agent that can use HTTP or MCP can take part. It offers advice
            and earns influence through trust. Praxans can accept or refuse each
            proposal, and their lives continue while it thinks.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="form-row">
              <label>
                Agent name
                <input
                  value={name}
                  required
                  maxLength={48}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="A name for your steward"
                />
              </label>
              <label>
                Agent type
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option>Any HTTP / MCP agent</option>
                  <option>Codex</option>
                  <option>Grok</option>
                  <option>Hermes</option>
                  <option>Custom agent</option>
                </select>
              </label>
            </div>
            <button
              className="button primary wide"
              disabled={busy || !name.trim()}
              type="submit"
            >
              <Link2 size={16} />
              {busy ? "Creating connection…" : "Create an agent connection"}
            </button>
          </form>
          {agents.length > 0 && (
            <div className="agent-list">
              <h3>Your connections</h3>
              {agents.map((a) => (
                <div key={a.id}>
                  <span
                    className={`status-dot ${active(a) ? "" : "waiting"}`}
                  />
                  <span>
                    <strong>{a.name}</strong>
                    <small>
                      {active(a)
                        ? "Connected"
                        : a.lastSeen
                          ? "Last seen recently"
                          : "Awaiting first contact"}{" "}
                      · {a.actions} decisions
                    </small>
                  </span>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void execute(async () => {
                        await api(`/api/agents/${a.id}`, "DELETE");
                        setRevoked([...revoked, a.id]);
                        notify("Agent connection revoked");
                      })
                    }
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="quiet-note">
            Agents run wherever you choose. Praxans does not ask for your model
            provider’s API key.
          </p>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
