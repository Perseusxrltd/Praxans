import { DatabaseSync } from "node:sqlite";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { validateWorld } from "../simulation/engine";
import { createWorld } from "../simulation/world";
import type {
  AgentPublic,
  CommunityRecord,
  World,
  WorldEvent,
} from "../simulation/types";
import { CHUNK_SIZE, TICK_MS, WORLD_VERSION } from "../simulation/types";
import { describeMigration, migrateWorld } from "./migrations";
import { backupDatabase } from "./backup";
import {
  initializeArchives,
  checkArchiveStorage,
  writeWorldArchive,
} from "./archives";

export const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export interface Session {
  hash: string;
  civId: string | null;
}
export interface Agent extends AgentPublic {
  hash: string;
}
export class WorldLeaseError extends Error {
  constructor(public readonly expiresAt: number) {
    super(
      "Another server owns this world. Run one simulation replica for this volume; an interrupted owner's lease expires within 30 seconds.",
    );
    this.name = "WorldLeaseError";
  }
}
export class WorldCheckpointBusyError extends Error {
  readonly status = 503;
  readonly code = "WORLD_STORAGE_BUSY";
  constructor() {
    super(
      "The world is waiting to finish saving. Retry the same request after the service is ready.",
    );
    this.name = "WorldCheckpointBusyError";
  }
}
export class Store {
  readonly db: DatabaseSync;
  private inTransaction = false;
  private chunkHashes = new Map<string, string>();
  private afterCommit: (() => void)[] = [];
  private leaseToken: string | undefined;
  private lastHeartbeat = 0;
  private clock: { tick: number; wallMs: number } | undefined;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    // Refuse an unknown storage format before any schema or journal mutation.
    try {
      checkArchiveStorage(this.db);
      this.db
        .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      PRAGMA journal_size_limit=16777216;
      CREATE TABLE IF NOT EXISTS world (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL, checksum TEXT NOT NULL, saved_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, json TEXT NOT NULL, checksum TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, civ_id TEXT, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, civ_id TEXT NOT NULL, name TEXT NOT NULL, provider TEXT NOT NULL, last_seen INTEGER, actions INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS receipts (agent_id TEXT NOT NULL, request_id TEXT NOT NULL, payload_hash TEXT NOT NULL, response TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(agent_id,request_id));
      CREATE TABLE IF NOT EXISTS world_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, tick INTEGER NOT NULL, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS world_events_community ON world_events(json_extract(json,'$.civId'),sequence);
      CREATE INDEX IF NOT EXISTS world_events_related ON world_events(json_extract(json,'$.relatedId'),sequence);
      CREATE TABLE IF NOT EXISTS world_history (tick INTEGER PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS world_backups (id TEXT PRIMARY KEY, json TEXT NOT NULL, checksum TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS interventions (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, tick INTEGER NOT NULL, description TEXT NOT NULL, before_checksum TEXT NOT NULL, after_checksum TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS world_clock (id INTEGER PRIMARY KEY CHECK(id=1), tick INTEGER NOT NULL, wall_ms REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS world_lease (id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL, expires_at INTEGER NOT NULL);`);
      initializeArchives(this.db);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  acquireLease(now = Date.now()): void {
    const token = randomUUID();
    const result = this.db
      .prepare(
        "INSERT INTO world_lease VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE world_lease.expires_at<=?",
      )
      .run(token, now + 30000, now);
    if (!result.changes) {
      const held = this.db
        .prepare("SELECT expires_at FROM world_lease WHERE id=1")
        .get() as { expires_at: number } | undefined;
      throw new WorldLeaseError(held?.expires_at ?? now + 1000);
    }
    this.leaseToken = token;
    this.lastHeartbeat = now;
  }
  heartbeat(now = Date.now()): void {
    if (!this.leaseToken || now - this.lastHeartbeat < 5000) return;
    const result = this.db
      .prepare("UPDATE world_lease SET expires_at=? WHERE id=1 AND token=?")
      .run(now + 30000, this.leaseToken);
    if (!result.changes)
      throw new Error(
        "This process lost ownership of the world clock. The simulation has stopped to prevent competing histories.",
      );
    this.lastHeartbeat = now;
  }
  resumeClock(tick: number, now = Date.now()): void {
    const previous = this.db
      .prepare("SELECT tick,wall_ms FROM world_clock WHERE id=1")
      .get() as { tick: number; wall_ms: number } | undefined;
    if (previous && previous.tick !== tick)
      throw new Error(
        "The world and its wall-clock checkpoint disagree. Preserve the save and restore a consistent backup.",
      );
    this.clock = { tick, wallMs: previous?.wall_ms ?? now };
  }
  advanceClock(tick: number): void {
    if (!this.clock) return;
    if (tick < this.clock.tick)
      throw new Error("The live world clock cannot move backward.");
    this.clock.wallMs += (tick - this.clock.tick) * TICK_MS;
    this.clock.tick = tick;
  }
  lagMs(now = Date.now()): number {
    return this.clock ? Math.max(0, now - this.clock.wallMs) : 0;
  }
  dueTicks(now = Date.now()): number {
    return Math.floor(this.lagMs(now) / TICK_MS);
  }
  transaction<T>(fn: () => T): T {
    if (this.inTransaction)
      throw new Error("Nested world transactions are not supported.");
    // A reader can delay the automatic checkpoint at COMMIT, then leave before
    // the next write. Without an explicit restart, that next large save still
    // appends to the retained WAL and can exhaust the volume before COMMIT.
    // RESTART waits for existing readers; new readers can use the main file.
    // If it remains busy, no transaction/callback has begun and retry is safe.
    const checkpoint = this.db
      .prepare("PRAGMA wal_checkpoint(RESTART)")
      .get() as { busy: number };
    if (checkpoint.busy) throw new WorldCheckpointBusyError();
    this.db.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
    this.afterCommit = [];
    try {
      const result = fn();
      this.db.exec("COMMIT");
      for (const done of this.afterCommit) done();
      return result;
    } catch (error) {
      // SQLITE_FULL and some I/O failures already roll back the transaction.
      // Preserve that original cause instead of hiding it behind "no transaction".
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* already rolled back */
      }
      this.chunkHashes.clear();
      throw error;
    } finally {
      this.inTransaction = false;
      this.afterCommit = [];
    }
  }
  load(seed: number, requireExisting = false): World {
    let row = this.db
      .prepare("SELECT json,checksum FROM world WHERE id=1")
      .get() as { json: string; checksum: string } | undefined;
    if (!row) {
      if (requireExisting)
        throw new Error(
          "The expected living world is missing. New-world creation is disabled for this service; restore its volume or a valid backup.",
        );
      const world = createWorld(seed);
      this.save(world);
      return world;
    }
    const actual = Buffer.from(digest(row.json)),
      stored = Buffer.from(row.checksum);
    if (actual.length !== stored.length || !timingSafeEqual(actual, stored))
      throw new Error(
        "World checkpoint checksum mismatch. Restore a valid backup; the existing save has been preserved.",
      );
    const beforeChecksum = row.checksum;
    const world = JSON.parse(row.json) as World;
    // Only the checksum is needed after parsing. Retaining the old population
    // JSON through a migration's save doubles its largest serialized allocation.
    row = undefined;
    if (!Array.isArray(world.chunks))
      throw new Error(
        "This save needs an explicit migration. The existing world has been preserved; it will not be reset.",
      );
    world.tiles = [];
    for (const chunk of world.chunks) {
      const storedChunk = this.db
        .prepare("SELECT json,checksum FROM chunks WHERE id=?")
        .get(chunk.id) as { json: string; checksum: string } | undefined;
      if (!storedChunk || digest(storedChunk.json) !== storedChunk.checksum)
        throw new Error(
          `Region ${chunk.id} is missing or failed its checksum. The existing save has been preserved.`,
        );
      world.tiles.push(...JSON.parse(storedChunk.json));
      this.chunkHashes.set(chunk.id, storedChunk.checksum);
    }
    if (world.version === WORLD_VERSION) {
      validateWorld(world);
      return world;
    }
    const interventions = describeMigration(world);
    // Archive and transform atomically. A failed migration leaves the old checkpoint intact.
    // This newly loaded object has no external owner: archive its original data
    // before modifying it, avoiding a second complete in-memory world.
    this.transaction(() => {
      const id = interventions.map((i) => i.id).join("+");
      writeWorldArchive(this.db, id, world);
      const upgraded = migrateWorld(world, { inPlace: true });
      this.save(upgraded.world);
      const current = this.db
        .prepare("SELECT checksum FROM world WHERE id=1")
        .get() as { checksum: string };
      for (const intervention of upgraded.interventions)
        this.db
          .prepare(
            "INSERT INTO interventions(id,tick,description,before_checksum,after_checksum,created_at) VALUES(?,?,?,?,?,?)",
          )
          .run(
            intervention.id,
            world.tick,
            intervention.description,
            beforeChecksum,
            current.checksum,
            Date.now(),
          );
    });
    return world;
  }
  save(world: World): void {
    validateWorld(world);
    const write = () => {
      this.heartbeat();
      const { tiles, pendingEvents, ...metadata } = world;
      const json = JSON.stringify({ ...metadata, pendingEvents: [] });
      const archived = new Set(pendingEvents.map((event) => event.id));
      const insertEvent = this.db.prepare(
        "INSERT INTO world_events(id,tick,json) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING",
      );
      for (const event of pendingEvents)
        insertEvent.run(event.id, event.tick, JSON.stringify(event));
      const insertHistory = this.db.prepare(
        "INSERT INTO world_history VALUES(?,?) ON CONFLICT(tick) DO NOTHING",
      );
      for (const point of world.history)
        insertHistory.run(point.tick, JSON.stringify(point));
      this.afterCommit.push(() => {
        world.pendingEvents = world.pendingEvents.filter(
          (event) => !archived.has(event.id),
        );
      });
      for (const chunk of world.chunks) {
        const data = JSON.stringify(
            tiles.slice(chunk.start, chunk.start + CHUNK_SIZE ** 2),
          ),
          checksum = digest(data);
        if (this.chunkHashes.get(chunk.id) !== checksum) {
          this.db
            .prepare(
              "INSERT INTO chunks VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,checksum=excluded.checksum",
            )
            .run(chunk.id, data, checksum);
          this.chunkHashes.set(chunk.id, checksum);
        }
      }
      this.db
        .prepare(
          "INSERT INTO world VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json, checksum=excluded.checksum, saved_at=excluded.saved_at",
        )
        .run(json, digest(json), Date.now());
      if (this.clock) {
        if (this.clock.tick !== world.tick)
          throw new Error(
            "A checkpoint must include the matching world clock.",
          );
        this.db
          .prepare(
            "INSERT INTO world_clock VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET tick=excluded.tick,wall_ms=excluded.wall_ms",
          )
          .run(world.tick, this.clock.wallMs);
      }
    };
    if (this.inTransaction) write();
    else this.transaction(write);
  }
  journal(
    before?: number,
    limit = 60,
    filter: {
      civilizationIds?: string[];
      category?: string;
      throughTick?: number;
    } = {},
  ) {
    const ids = [...new Set(filter.civilizationIds ?? [])];
    const clauses = ["sequence < ?", "tick <= ?"];
    const values: (string | number)[] = [
      before ?? Number.MAX_SAFE_INTEGER,
      filter.throughTick ?? Number.MAX_SAFE_INTEGER,
    ];
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      clauses.push(
        `(json_extract(json,'$.civId') IN (${placeholders}) OR json_extract(json,'$.relatedId') IN (${placeholders}))`,
      );
      values.push(...ids, ...ids);
    }
    if (filter.category && filter.category !== "all") {
      clauses.push("json_extract(json,'$.category') = ?");
      values.push(filter.category);
    }
    const rows = this.db
      .prepare(
        `SELECT sequence,json FROM world_events WHERE ${clauses.join(" AND ")} ORDER BY sequence DESC LIMIT ?`,
      )
      .all(...values, Math.max(1, Math.min(100, limit))) as {
      sequence: number;
      json: string;
    }[];
    return {
      events: rows.map((row) => ({
        sequence: row.sequence,
        ...JSON.parse(row.json),
      })),
      next: rows.at(-1)?.sequence ?? null,
    };
  }
  communityRecord(communityId: string, throughTick: number): CommunityRecord {
    const scope =
      "tick <= ? AND (json_extract(json,'$.civId') = ? OR json_extract(json,'$.relatedId') = ?)";
    const values = [throughTick, communityId, communityId];
    const event = (order: "ASC" | "DESC") => {
      const row = this.db
        .prepare(
          `SELECT json FROM world_events WHERE ${scope} ORDER BY sequence ${order} LIMIT 1`,
        )
        .get(...values) as { json: string } | undefined;
      return row ? (JSON.parse(row.json) as WorldEvent) : null;
    };
    // Older releases already recorded every death with this title. A complete
    // match against the civilization's death counter can date its final loss;
    // missing records must remain an unknown date, not an invented history.
    const deathScope =
      "tick <= ? AND json_extract(json,'$.civId') = ? AND json_extract(json,'$.category') = 'life' AND json_extract(json,'$.citizenId') IS NOT NULL AND json_extract(json,'$.title') LIKE '% is remembered'";
    const deaths = this.db
      .prepare(`SELECT count(*) AS count FROM world_events WHERE ${deathScope}`)
      .get(throughTick, communityId) as { count: number };
    const death = this.db
      .prepare(
        `SELECT json FROM world_events WHERE ${deathScope} ORDER BY sequence DESC LIMIT 1`,
      )
      .get(throughTick, communityId) as { json: string } | undefined;
    const linked = this.db
      .prepare(
        `SELECT json FROM world_events WHERE ${scope} AND json_extract(json,'$.relatedId') IS NOT NULL AND json_extract(json,'$.category') IN ('founding','culture') ORDER BY sequence LIMIT 100`,
      )
      .all(...values) as { json: string }[];
    const connections: CommunityRecord["connections"] = [];
    for (const row of linked) {
      const e = JSON.parse(row.json) as WorldEvent;
      const previous = e.civId === communityId;
      const other = previous ? e.relatedId : e.civId;
      if (!other?.startsWith("civ-")) continue;
      connections.push({
        communityId: other,
        relationship:
          e.category === "founding"
            ? previous
              ? "branched-from"
              : "branch"
            : previous
              ? "earlier-chapter"
              : "later-chapter",
        tick: e.tick,
      });
    }
    return {
      communityId,
      throughTick,
      eventCount: (
        this.db
          .prepare(`SELECT count(*) AS count FROM world_events WHERE ${scope}`)
          .get(...values) as { count: number }
      ).count,
      recordedDeaths: deaths.count,
      lastDeath: death ? (JSON.parse(death.json) as WorldEvent) : null,
      firstEvent: event("ASC"),
      lastEvent: event("DESC"),
      renewals: this.db
        .prepare(
          "SELECT tick,json_extract(json,'$.renewal.arrivals') AS arrivals,json_extract(json,'$.renewal.interventionId') AS interventionId FROM world_events WHERE tick<=? AND json_extract(json,'$.civId')=? AND json_type(json,'$.renewal')='object' ORDER BY sequence",
        )
        .all(throughTick, communityId) as {
        tick: number;
        arrivals: number;
        interventionId: string;
      }[],
      connections,
    };
  }
  interventions() {
    return this.db
      .prepare(
        "SELECT id,tick,description,before_checksum AS beforeChecksum,after_checksum AS afterChecksum,created_at AS createdAt FROM interventions ORDER BY sequence DESC LIMIT 100",
      )
      .all();
  }
  recordRelease(world: World, release: string, description: string): void {
    if (
      this.db
        .prepare("SELECT id FROM interventions WHERE id=?")
        .get(`release:${release}`)
    )
      return;
    this.transaction(() => {
      this.save(world);
      const row = this.db
        .prepare("SELECT checksum FROM world WHERE id=1")
        .get() as { checksum: string };
      this.db
        .prepare(
          "INSERT INTO interventions(id,tick,description,before_checksum,after_checksum,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(
          `release:${release}`,
          world.tick,
          description,
          row.checksum,
          row.checksum,
          Date.now(),
        );
    });
  }
  /** SQLite makes a consistent online copy, including sessions and agent ownership. */
  async backup(path: string): Promise<void> {
    await backupDatabase(this.db, path);
  }
  session(token?: string): { session: Session; token?: string } {
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const hash = digest(token),
        row = this.db
          .prepare("SELECT civ_id FROM sessions WHERE hash=?")
          .get(hash) as { civ_id: string | null } | undefined;
      if (row) return { session: { hash, civId: row.civ_id } };
    }
    const fresh = randomBytes(32).toString("hex"),
      hash = digest(fresh);
    this.db
      .prepare("INSERT INTO sessions VALUES(?,NULL,?)")
      .run(hash, Date.now());
    return { session: { hash, civId: null }, token: fresh };
  }
  claim(session: Session, civId: string, world: World): void {
    this.transaction(() => {
      this.save(world);
      const claimed = this.db
        .prepare("UPDATE sessions SET civ_id=? WHERE hash=? AND civ_id IS ?")
        .run(civId, session.hash, session.civId);
      if (claimed.changes !== 1)
        throw new Error(
          "The browser's stewardship changed. Read its session before trying again.",
        );
      if (session.civId)
        this.db.prepare("DELETE FROM agents WHERE civ_id=?").run(session.civId);
    });
  }
  createAgent(
    civId: string,
    name: string,
    provider: string,
  ): { agent: AgentPublic; token: string } {
    const count = this.db
      .prepare("SELECT COUNT(*) AS count FROM agents WHERE civ_id=?")
      .get(civId) as { count: number };
    if (count.count >= 4)
      throw new Error(
        "This community already has four connections. Revoke one before adding another.",
      );
    const token = `prax_${randomBytes(32).toString("hex")}`,
      id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO agents(id,hash,civ_id,name,provider) VALUES(?,?,?,?,?)",
      )
      .run(id, digest(token), civId, name, provider);
    return {
      agent: { id, civId, name, provider, lastSeen: null, actions: 0 },
      token,
    };
  }
  authenticate(token: string): Agent | null {
    if (!/^prax_[a-f0-9]{64}$/.test(token)) return null;
    const row = this.db
      .prepare(
        "SELECT id,hash,civ_id AS civId,name,provider,last_seen AS lastSeen,actions FROM agents WHERE hash=?",
      )
      .get(digest(token)) as unknown as Agent | undefined;
    if (!row) return null;
    this.db
      .prepare("UPDATE agents SET last_seen=? WHERE id=?")
      .run(Date.now(), row.id);
    return row;
  }
  agents(): AgentPublic[] {
    return this.db
      .prepare(
        "SELECT id,civ_id AS civId,name,provider,last_seen AS lastSeen,actions FROM agents ORDER BY rowid",
      )
      .all() as unknown as AgentPublic[];
  }
  revoke(civId: string, id: string): boolean {
    return (
      this.db
        .prepare("DELETE FROM agents WHERE id=? AND civ_id=?")
        .run(id, civId).changes > 0
    );
  }
  receipt(
    agentId: string,
    requestId: string,
  ): { payload_hash: string; response: string } | undefined {
    return this.db
      .prepare(
        "SELECT payload_hash,response FROM receipts WHERE agent_id=? AND request_id=?",
      )
      .get(agentId, requestId) as
      { payload_hash: string; response: string } | undefined;
  }
  commitAction(
    world: World,
    agent: Agent,
    requestId: string,
    payloadHash: string,
    response: unknown,
    count: number,
  ): void {
    this.transaction(() => {
      this.save(world);
      this.db
        .prepare("INSERT INTO receipts VALUES(?,?,?,?,?)")
        .run(
          agent.id,
          requestId,
          payloadHash,
          JSON.stringify(response),
          Date.now(),
        );
      this.db
        .prepare("UPDATE agents SET actions=actions+? WHERE id=?")
        .run(count, agent.id);
      this.db
        .prepare(
          "DELETE FROM receipts WHERE agent_id=? AND rowid NOT IN (SELECT rowid FROM receipts WHERE agent_id=? ORDER BY rowid DESC LIMIT 1000)",
        )
        .run(agent.id, agent.id);
    });
  }
  close(): void {
    if (this.leaseToken)
      this.db
        .prepare("DELETE FROM world_lease WHERE id=1 AND token=?")
        .run(this.leaseToken);
    this.db.close();
  }
}
