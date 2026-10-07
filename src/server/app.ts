import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import compression from "compression";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { applyAgentActions } from "../simulation/actions";
import { FOCUSES, MATERIALS } from "../simulation/content";
import { stepWorld } from "../simulation/engine";
import { evaluateDesign, LAWS } from "../simulation/laws";
import {
  settleFrontier,
  getTile,
  housing,
  peopleOf,
  summarizeWorld,
} from "../simulation/world";
import {
  CHUNK_SIZE,
  TICK_MS,
  type Tile,
  type World,
  type WorldFrame,
  type WorldSnapshot,
} from "../simulation/types";
import { agentSchema, batchSchema, claimSchema, designSchema } from "./schema";
import { digest, Store, type Agent, type Session } from "./store";
import { nearbyTiles } from "../simulation/terrain";
import { NATURAL_MODEL } from "../simulation/model";
import {
  ELEMENTS,
  ELEMENT_BY_SYMBOL,
  elementPhase,
} from "../simulation/elements";
import { elementLedger } from "../simulation/chemistry";
import { astronomy, celestialState } from "../simulation/planet";
import { planetAtlas, ATLAS_WIDTH, ATLAS_HEIGHT } from "./atlas";
import { worldClock } from "../simulation/chronology";

export interface AppOptions {
  database: string;
  seed?: number;
  autoTick?: boolean;
  testControls?: boolean;
  publicOrigin?: string;
  serverOrigin?: string;
  trustProxy?: boolean;
  release?: string;
  releaseNotes?: string;
  requireExistingWorld?: boolean;
}
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function createGameServer(options: AppOptions) {
  const store = new Store(options.database);
  let world: World;
  try {
    store.acquireLease();
    world = store.load(options.seed ?? 1847, options.requireExistingWorld);
    if (options.autoTick !== false) store.resumeClock(world.tick);
  } catch (error) {
    store.close();
    throw error;
  }
  if (options.release)
    store.recordRelease(
      world,
      options.release,
      options.releaseNotes ??
        "A compatible service update. Existing world state and natural laws are preserved.",
    );
  const app = express(),
    streams = new Map<Response, { x: number; y: number }>();
  let fault: string | null = null,
    stopped = false,
    frameCount = 0;
  let atlas: Uint8Array | undefined;
  if (options.trustProxy) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  const allowedHosts = new Set([
    "localhost",
    "127.0.0.1",
    "[::1]",
    ...(options.publicOrigin ? [new URL(options.publicOrigin).hostname] : []),
    ...(options.serverOrigin ? [new URL(options.serverOrigin).hostname] : []),
  ]);
  app.use((req, res, next) => {
    const railwayHealthcheck =
      req.path === "/api/health" && req.hostname === "healthcheck.railway.app";
    if (!allowedHosts.has(req.hostname) && !railwayHealthcheck)
      return res.status(403).json({
        error:
          "This hostname is not configured. Set PUBLIC_ORIGIN to the public site origin.",
      });
    const origin = req.get("origin");
    const localOrigin = `${req.protocol}://${req.get("host")}`;
    if (origin && origin !== options.publicOrigin && origin !== localOrigin)
      return res
        .status(403)
        .json({ error: "Cross-origin requests are not allowed." });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    if (req.path.startsWith("/api") || req.path === "/mcp")
      res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "64kb" }));
  app.use(compression({ level: 4, threshold: 1024 }));
  app.use((req, _res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD" && store.lagMs() > 10000)
      return next(
        new HttpError(
          503,
          "The world is catching up after an interruption. Observe while its clock recovers; new decisions will resume shortly.",
        ),
      );
    next();
  });
  const limits = new Map<string, { count: number; until: number }>();
  const rateLimit = (req: Request, _res: Response, next: NextFunction) => {
    const key = req.get("authorization")
      ? digest(req.get("authorization")!)
      : (req.ip ?? "local");
    const now = Date.now();
    let entry = limits.get(key);
    if (!entry || entry.until < now) {
      entry = { count: 0, until: now + 60000 };
      limits.set(key, entry);
    }
    if (++entry.count > 120)
      return next(
        new HttpError(
          429,
          "Please wait before sending more requests. Limit: 120 per minute.",
        ),
      );
    if (limits.size > 10000)
      for (const [id, item] of limits) if (item.until < now) limits.delete(id);
    next();
  };
  app.use("/api", rateLimit);
  app.use("/mcp", rateLimit);
  const sessionFor = (req: Request, res: Response): Session => {
    const token = req
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("praxans_session="))
      ?.slice(16);
    const result = store.session(token);
    if (result.token)
      res.cookie("praxans_session", result.token, {
        httpOnly: true,
        sameSite: "strict",
        secure: options.publicOrigin?.startsWith("https://") ?? false,
        maxAge: 1000 * 60 * 60 * 24 * 180,
        path: "/",
      });
    return result.session;
  };
  const ownerFor = (req: Request, res: Response) => {
    if (req.get("X-Praxans-Client") !== "browser")
      throw new HttpError(
        403,
        "Browser mutations require the Praxans client header.",
      );
    const session = sessionFor(req, res);
    if (!session.civId)
      throw new HttpError(
        403,
        "Adopt a community before managing its agent connections.",
      );
    return session;
  };
  const agentFor = (req: Request): Agent => {
    const bearer = req.get("authorization") ?? "";
    const agent = bearer.startsWith("Bearer ")
      ? store.authenticate(bearer.slice(7))
      : null;
    if (!agent)
      throw new HttpError(401, "Use an active civilization-scoped bearer key.");
    return agent;
  };
  const publicTile = (tile: Tile): Tile => {
    const rounded = structuredClone(tile);
    for (const key of [
      "water",
      "mineral",
      "rock",
      "temperature",
      "moisture",
      "fertility",
      "trees",
      "forage",
      "road",
    ] as const)
      rounded[key] = Math.round(rounded[key] * 100) / 100;
    rounded.detritus.carbon = Math.round(rounded.detritus.carbon * 100) / 100;
    rounded.detritus.mineral = Math.round(rounded.detritus.mineral * 100) / 100;
    if (rounded.plant) {
      rounded.plant.carbon = Math.round(rounded.plant.carbon * 100) / 100;
      rounded.plant.mineral = Math.round(rounded.plant.mineral * 100) / 100;
    }
    if (rounded.groundcover) {
      rounded.groundcover.carbon =
        Math.round(rounded.groundcover.carbon * 100) / 100;
      rounded.groundcover.mineral =
        Math.round(rounded.groundcover.mineral * 100) / 100;
    }
    for (const plant of [rounded.plant, rounded.groundcover])
      if (plant)
        for (const key of Object.keys(
          plant.genome,
        ) as (keyof typeof plant.genome)[])
          plant.genome[key] = Math.round(plant.genome[key] * 10000) / 10000;
    for (const key of Object.keys(rounded.air) as (keyof typeof rounded.air)[])
      rounded.air[key] = Math.round(rounded.air[key] * 1000000) / 1000000;
    for (const symbol of Object.keys(rounded.nutrients))
      rounded.nutrients[symbol] =
        Math.round(rounded.nutrients[symbol] * 1000000) / 1000000;
    return rounded;
  };
  const within = (
    tile: { x: number; y: number },
    origin: { x: number; y: number },
  ) =>
    tile.x >= origin.x &&
    tile.y >= origin.y &&
    tile.x < origin.x + CHUNK_SIZE * 3 &&
    tile.y < origin.y + CHUNK_SIZE * 3;
  const originFor = (civId?: string) => {
    const civ = world.civilizations.find((c) => c.id === civId);
    return civId &&
      civ &&
      (civ.x < 0 || civ.y < 0 || civ.x >= 96 || civ.y >= 96)
      ? {
          x: (Math.floor(civ.x / CHUNK_SIZE) - 1) * CHUNK_SIZE,
          y: (Math.floor(civ.y / CHUNK_SIZE) - 1) * CHUNK_SIZE,
        }
      : { x: 0, y: 0 };
  };
  const frame = (
    includeTerrain = false,
    origin = { x: 0, y: 0 },
  ): WorldFrame => ({
    tick: world.tick,
    summary: summarizeWorld(
      world,
      world.civilizations.find((c) => within(c, origin)) ?? {
        x: origin.x + 48,
        y: origin.y + 48,
      },
    ),
    civilizations: world.civilizations,
    citizens: world.citizens,
    animals: world.animals,
    structures: world.structures,
    caravans: world.caravans,
    events: world.events.slice(-100),
    history: world.history,
    agents: store.agents(),
    tileChanges: includeTerrain
      ? [...new Set(world.changedTiles)]
          .map((i) => world.tiles[i])
          .filter((t) => within(t, origin))
          .map(publicTile)
      : [],
  });
  const snapshot = (civId?: string): WorldSnapshot => {
    const origin = originFor(civId),
      width = CHUNK_SIZE * 3,
      height = CHUNK_SIZE * 3;
    const tiles: Tile[] = [];
    for (let y = origin.y; y < origin.y + height; y++)
      for (let x = origin.x; x < origin.x + width; x++) {
        const tile = getTile(world, x, y);
        // Unknown edge cells remain a visual frontier; viewing them does not mutate the universe.
        tiles.push(
          tile
            ? publicTile(tile)
            : {
                x,
                y,
                terrain: "unknown",
                biome: "Unobserved",
                elevation: 0,
                variation: 0,
                road: 0,
                owner: null,
                water: 0,
                mineral: 0,
                rock: 0,
                nutrients: {},
                air: {
                  vapor: 0,
                  cloud: 0,
                  snow: 0,
                  pressure: 0,
                  windX: 0,
                  windY: 0,
                  rain: 0,
                  humidity: 0,
                  sunlight: 0,
                  dust: 0,
                  tide: 0,
                },
                detritus: { carbon: 0, mineral: 0 },
                plant: null,
                groundcover: null,
                pollination: 0,
                dissolvedOxygen: 0,
                temperature: 0,
                moisture: 0,
                fertility: 0,
                trees: 0,
                forage: 0,
              },
        );
      }
    return {
      ...frame(false, origin),
      id: world.id,
      name: world.name,
      seed: world.seed,
      lawsVersion: world.lawsVersion,
      width,
      height,
      originX: origin.x,
      originY: origin.y,
      tiles,
    };
  };
  const broadcast = () => {
    if (!streams.size) {
      world.changedTiles = [];
      return;
    }
    const includeTerrain = ++frameCount % 4 === 0;
    const messages = new Map<string, string>();
    for (const [res, origin] of streams) {
      const key = `${origin.x},${origin.y}`;
      if (!messages.has(key))
        messages.set(
          key,
          `event: frame\ndata: ${JSON.stringify(frame(includeTerrain, origin))}\n\n`,
        );
      if (res.writableLength > 4 * 1024 * 1024) {
        res.end();
        streams.delete(res);
      } else {
        res.write(messages.get(key)!);
        res.flush();
      }
    }
    if (includeTerrain) world.changedTiles = [];
  };
  const observation = (agent: Agent) => {
    const civ = world.civilizations.find((c) => c.id === agent.civId)!;
    return {
      protocol: "praxans/1",
      tick: world.tick,
      lawsVersion: LAWS.version,
      world: { name: world.name, ...summarizeWorld(world, civ) },
      civilization: civ,
      people: peopleOf(world, civ.id),
      structures: world.structures.filter((s) => s.civId === civ.id),
      shelterCapacity: housing(world, civ.id),
      neighbors: world.civilizations
        .filter((c) => c !== civ)
        .map((c) => ({
          id: c.id,
          name: c.name,
          population: peopleOf(world, c.id).length,
          stock: c.stock,
          relationship: civ.relations[c.id],
        })),
      environment: nearbyTiles(world, civ, 7).map(publicTile),
      wildlife: world.animals.filter(
        (a) => Math.hypot(a.x - civ.x, a.y - civ.y) < 16,
      ),
      events: world.events
        .filter(
          (e) =>
            !e.civId ||
            e.civId === civ.id ||
            e.category === "trade" ||
            e.category === "diplomacy",
        )
        .slice(-20),
      guidance:
        "Observe before acting. People remain autonomous. Actions may change priorities, propose material geometry, or negotiate exchanges. Every action obeys the same fixed laws and consumes existing resources where applicable. Poll no faster than every 5 seconds; let effects develop between decisions.",
    };
  };
  const act = (agent: Agent, input: unknown) => {
    if (fault)
      throw new HttpError(503, "The world is paused after an internal error.");
    const batch = batchSchema.parse(input),
      payloadHash = digest(JSON.stringify(batch.actions));
    const previous = store.receipt(agent.id, batch.requestId);
    if (previous) {
      if (previous.payload_hash !== payloadHash)
        throw new HttpError(
          409,
          "This requestId was already used for different actions.",
        );
      return { ...JSON.parse(previous.response), replayed: true };
    }
    let result: ReturnType<typeof applyAgentActions>;
    try {
      result = applyAgentActions(world, agent.civId, batch.actions, agent.name);
    } catch (error) {
      throw new HttpError(
        422,
        error instanceof Error
          ? error.message
          : "The world rejected this action.",
      );
    }
    const response = {
      requestId: batch.requestId,
      tick: result.world.tick,
      outcomes: result.outcomes,
      replayed: false,
    };
    store.commitAction(
      result.world,
      agent,
      batch.requestId,
      payloadHash,
      response,
      batch.actions.length,
    );
    world = result.world;
    broadcast();
    return response;
  };

  app.get("/api/health", (_req, res) =>
    res.status(fault ? 503 : 200).json({
      ok: !fault,
      tick: world.tick,
      lawsVersion: LAWS.version,
      persistent: true,
      lagSeconds: Math.floor(store.lagMs() / 1000),
      simulation: fault
        ? "halted"
        : options.autoTick === false
          ? "manual"
          : store.lagMs() > 10000
            ? "catching-up"
            : "running",
    }),
  );
  app.get("/api/world", (req, res) =>
    res.json(
      snapshot(
        typeof req.query.civilization === "string"
          ? req.query.civilization
          : undefined,
      ),
    ),
  );
  app.get("/api/laws", (_req, res) =>
    res.json({
      ...NATURAL_MODEL,
      focuses: FOCUSES,
      actionSchema: z.toJSONSchema(batchSchema),
    }),
  );
  app.get("/api/planet", (_req, res) =>
    res.json({
      ...NATURAL_MODEL.universe,
      tick: world.tick,
      generationVersion: world.generationVersion,
      state: celestialState(world.tick),
    }),
  );
  app.get("/api/clock", (_req, res) =>
    res.json({ clock: worldClock(world.tick), entropy: world.entropy }),
  );
  app.get("/api/planet/atlas", (_req, res) => {
    atlas ??= planetAtlas(world);
    res.set({
      "Content-Type": "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
      "X-Atlas-Width": String(ATLAS_WIDTH),
      "X-Atlas-Height": String(ATLAS_HEIGHT),
    });
    res.send(Buffer.from(atlas));
  });
  app.get("/api/journal", (req, res) => {
    const before =
      req.query.before === undefined ? undefined : Number(req.query.before);
    if (before !== undefined && (!Number.isSafeInteger(before) || before < 1))
      throw new HttpError(400, "Journal cursor must be a positive integer.");
    res.json(store.journal(before));
  });
  app.get("/api/interventions", (_req, res) =>
    res.json({ interventions: store.interventions() }),
  );
  app.get("/api/elements", (_req, res) =>
    res.json({
      elements: ELEMENTS,
      inventory: elementLedger(world),
      referenceTemperatureUnit: "K",
      massUnit: "kg",
      attribution:
        "Bowserinator / Periodic-Table-JSON contributors, CC BY-SA 3.0",
    }),
  );
  app.get("/api/session", (req, res) => {
    const session = sessionFor(req, res);
    res.json({
      civilizationId: session.civId,
      testControls: !!options.testControls,
    });
  });
  app.post("/api/claim", (req, res) => {
    if (req.get("X-Praxans-Client") !== "browser")
      throw new HttpError(403, "Use the Praxans browser client.");
    const session = sessionFor(req, res);
    if (session.civId)
      throw new HttpError(409, "This browser already stewards a community.");
    const data = claimSchema.parse(req.body),
      next = structuredClone(world);
    let civ;
    if (data.civilizationId) {
      civ = next.civilizations.find((c) => c.id === data.civilizationId);
      if (!civ || civ.claimed)
        throw new HttpError(
          409,
          "This community has already been adopted or does not exist.",
        );
      civ.claimed = true;
    } else {
      try {
        civ = settleFrontier(next, data.name!);
      } catch (error) {
        throw new HttpError(422, (error as Error).message);
      }
    }
    store.claim(session, civ.id, next);
    world = next;
    broadcast();
    res.json({ civilizationId: civ.id });
  });
  app.post("/api/agents", (req, res) => {
    const owner = ownerFor(req, res),
      data = agentSchema.parse(req.body);
    try {
      const result = store.createAgent(owner.civId!, data.name, data.provider);
      res.status(201).json(result);
      broadcast();
    } catch (error) {
      throw new HttpError(409, (error as Error).message);
    }
  });
  app.delete("/api/agents/:id", (req, res) => {
    const owner = ownerFor(req, res);
    if (!store.revoke(owner.civId!, String(req.params.id)))
      throw new HttpError(404, "No owned agent connection has that ID.");
    broadcast();
    res.json({ revoked: true });
  });
  app.get("/api/agent/observe", (req, res) =>
    res.json(observation(agentFor(req))),
  );
  app.post("/api/agent/actions", (req, res) =>
    res.json(act(agentFor(req), req.body)),
  );
  app.post("/api/agent/evaluate", (req, res) => {
    agentFor(req);
    res.json(evaluateDesign(designSchema.parse(req.body)));
  });
  app.get("/api/stream", (req, res) => {
    if (streams.size >= 100)
      throw new HttpError(
        503,
        "This server is at its current observer capacity.",
      );
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const civId =
      typeof req.query.civilization === "string"
        ? req.query.civilization
        : undefined;
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot(civId))}\n\n`);
    res.flush();
    streams.set(res, originFor(civId));
    req.on("close", () => streams.delete(res));
  });
  if (options.testControls)
    app.post("/api/dev/advance", (req, res) => {
      const { ticks } = z
        .object({ ticks: z.number().int().min(0).max(3000) })
        .strict()
        .parse(req.body);
      stepWorld(world, ticks);
      store.save(world);
      broadcast();
      res.json(
        snapshot(
          typeof req.query.civilization === "string"
            ? req.query.civilization
            : undefined,
        ),
      );
    });
  app.post("/mcp", async (req, res, next) => {
    let server: McpServer | undefined,
      transport: StreamableHTTPServerTransport | undefined;
    try {
      const agent = agentFor(req);
      server = new McpServer({ name: "praxans-world", version: "1.0.0" });
      const result = (value: unknown) => ({
        content: [{ type: "text" as const, text: JSON.stringify(value) }],
      });
      server.registerTool(
        "observe_world",
        {
          description:
            "Read your community, people, nearby ecology, neighbors, history, and resource constraints.",
          inputSchema: {},
          annotations: { readOnlyHint: true },
        },
        async () => result(observation(agent)),
      );
      server.registerTool(
        "read_natural_laws",
        {
          description:
            "Read the immutable laws, material properties, and units that constrain all communities.",
          inputSchema: {},
          annotations: { readOnlyHint: true },
        },
        async () => result(NATURAL_MODEL),
      );
      server.registerTool(
        "inspect_sky",
        {
          description:
            "Inspect the star, planet, moon, and the sunlight, season, and tidal forcing at your community.",
          inputSchema: {},
          annotations: { readOnlyHint: true },
        },
        async () => {
          const civ = world.civilizations.find((c) => c.id === agent.civId)!;
          return result({
            ...NATURAL_MODEL.universe,
            state: celestialState(world.tick),
            local: astronomy(world.tick, civ.x, civ.y),
          });
        },
      );
      server.registerTool(
        "inspect_element",
        {
          description:
            "Read an element's reference properties and conserved mass. Phase is a one-atmosphere reference; this does not change the world.",
          inputSchema: {
            symbol: z.string().min(1).max(2),
            temperatureK: z.number().min(0).max(10000).default(293.15),
          },
          annotations: { readOnlyHint: true },
        },
        async ({ symbol, temperatureK }) => {
          const element = ELEMENT_BY_SYMBOL[symbol];
          return element
            ? result({
                element,
                massKg: elementLedger(world)[symbol] ?? 0,
                referencePhase: elementPhase(symbol, temperatureK),
                chemistry: NATURAL_MODEL.chemistry.coverage,
              })
            : {
                ...result({ error: "Unknown chemical symbol." }),
                isError: true,
              };
        },
      );
      server.registerTool(
        "evaluate_assembly",
        {
          description:
            "Estimate a proposed geometry using the world’s static load model. This does not build it or consume materials.",
          inputSchema: designSchema,
          annotations: { readOnlyHint: true },
        },
        async (data) => {
          try {
            return result(evaluateDesign(data));
          } catch (error) {
            return {
              ...result({ error: (error as Error).message }),
              isError: true,
            };
          }
        },
      );
      server.registerTool(
        "steward_civilization",
        {
          description:
            "Submit one to six bounded decisions for your own community. Supply a unique requestId and reasons. The batch is atomic and repeated IDs are idempotent.",
          inputSchema: batchSchema,
          annotations: { destructiveHint: false, idempotentHint: true },
        },
        async (data) => {
          try {
            return result(act(agent, data));
          } catch (error) {
            return {
              ...result({ error: (error as Error).message }),
              isError: true,
            };
          }
        },
      );
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => {
        void transport?.close();
        void server?.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) next(error);
      else res.end();
      await transport?.close();
      await server?.close();
    }
  });
  app.all("/mcp", (_req, res) =>
    res
      .status(405)
      .json({ error: "This stateless MCP endpoint supports POST requests." }),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "No such API endpoint." }),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (res.headersSent) return res.end();
      if (error instanceof z.ZodError)
        return res.status(400).json({
          error: "Invalid request.",
          issues: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
      const status =
        error instanceof HttpError
          ? error.status
          : ((error as { status?: number })?.status ?? 500);
      if (status >= 500) console.error(error);
      res.status(status).json({
        error:
          status >= 500
            ? "An internal error occurred. Your saved world has been preserved."
            : (error as Error).message,
      });
    },
  );
  let lastBroadcastTick = world.tick,
    lastSavedTick = world.tick;
  const ticker =
    options.autoTick === false
      ? null
      : setInterval(() => {
          if (fault || stopped) return;
          try {
            store.heartbeat();
            const started = performance.now();
            let due = Math.min(128, store.dueTicks());
            while (due-- > 0) {
              stepWorld(world);
              store.advanceClock(world.tick);
              if (performance.now() - started > 50) break;
            }
            if (world.tick - lastBroadcastTick >= 4) {
              broadcast();
              lastBroadcastTick = world.tick;
            }
            if (world.tick - lastSavedTick >= 32) {
              store.save(world);
              lastSavedTick = world.tick;
            }
          } catch (error) {
            fault = (error as Error).message;
            console.error("Simulation halted:", error);
            for (const res of streams.keys())
              res.write(
                'event: fault\ndata: {"error":"The simulation halted after an internal error."}\n\n',
              );
            for (const res of streams.keys()) res.flush();
          }
        }, TICK_MS);
  return {
    app,
    store,
    getWorld: () => world,
    snapshot,
    observation,
    act,
    close: () => {
      if (stopped) return;
      stopped = true;
      if (ticker) clearInterval(ticker);
      if (!fault) store.save(world);
      for (const res of streams.keys()) res.end();
      streams.clear();
      store.close();
    },
  };
}
