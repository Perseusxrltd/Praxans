import { fork, type ChildProcess } from "node:child_process";
import {
  createServer,
  request,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  chmod,
  mkdir,
  readFile,
  rm,
  symlink,
  readlink,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { createGzip, constants as zlibConstants, type Gzip } from "node:zlib";
import {
  dependencyHash,
  durableJson,
  installArtifact,
  readArtifact,
  type RuntimeArtifact,
} from "./artifact";
import { SseRecords } from "./sse";

interface Target {
  file: string;
  manifest?: RuntimeArtifact;
}
interface Worker {
  child: ChildProcess;
  port: number;
  tick: number;
  id: string;
  seed: number;
  target: Target;
}
interface CandidateReport {
  type: "preflight";
  id: string;
  seed: number;
  sourceTick: number;
  tick: number;
  format: number;
  laws: string;
}
const noFile = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";
export const controlSocket = (database: string) =>
  join(dirname(resolve(database)), "runtime", "control.sock");
const reply = (res: ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
};
async function body(
  req: IncomingMessage,
  maximum = 64 * 1024,
): Promise<Buffer> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > maximum)
      throw new Error("Request body exceeds the permitted size.");
    parts.push(part);
  }
  return Buffer.concat(parts);
}

/** Stable transport; exactly one child owns the world's SQLite lease and clock. */
export class WorldGateway {
  readonly server = createServer((req, res) => {
    void this.handle(req, res);
  });
  private readonly control = createServer((req, res) => {
    void this.admin(req, res);
  });
  private readonly root: string;
  private worker?: Worker;
  private target: Target;
  private dependencies = "";
  private stopping = false;
  private activating = false;
  private handover?: Promise<void>;
  private resume?: () => void;
  private flights = 0;
  private waiting = 0;
  private streams = new Set<ServerResponse>();
  private restarting = false;
  private children = new Set<ChildProcess>();
  private closing?: Promise<void>;
  private phase:
    "starting" | "running" | "preparing" | "handover" | "unavailable" =
    "starting";
  private lastError: string | null = null;

  constructor(
    readonly database: string,
    builtin: string,
  ) {
    this.database = resolve(database);
    this.root = dirname(controlSocket(this.database));
    this.target = { file: resolve(builtin) };
    this.server.keepAliveTimeout = 65000;
    this.server.headersTimeout = 70000;
  }

  status() {
    return {
      phase: this.phase,
      release: this.target.manifest?.release ?? process.env.PRAXANS_RELEASE,
      pendingRequests: this.waiting,
      activeRequests: this.flights,
      observers: this.streams.size,
      runtimePid: this.worker?.child.pid ?? null,
      managedProcesses: this.children.size,
      error: this.lastError,
    };
  }

  async start() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    this.dependencies = await dependencyHash();
    const modules = resolve("node_modules"),
      link = join(this.root, "node_modules");
    try {
      await symlink(modules, link, "dir");
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "EEXIST" ||
        (await readlink(link)) !== modules
      )
        throw error;
    }
    // A prepared activation wins over the old pointer after an interrupted handover.
    for (const name of ["pending.json", "current.json"]) {
      let raw: string;
      try {
        raw = await readFile(join(this.root, name), "utf8");
      } catch (error) {
        if (noFile(error)) continue;
        throw error;
      }
      // Only a missing pointer permits fallback. A referenced but missing
      // artifact must never select an older binary against migrated data.
      try {
        const pointer = JSON.parse(raw);
        const directory = resolve(pointer.directory);
        if (!directory.startsWith(`${join(this.root, "releases")}/`))
          throw new Error("Invalid runtime pointer.");
        const manifest = await readArtifact(directory);
        if (manifest.dependencies !== this.dependencies)
          throw new Error(
            "Persisted runtime dependencies are incompatible with this container.",
          );
        this.target = { file: join(directory, "runtime.mjs"), manifest };
        break;
      } catch (error) {
        throw new Error(
          `Cannot use persisted runtime ${name}. The world was preserved.`,
          { cause: error },
        );
      }
    }
    this.worker = await this.launch(this.target);
    await this.commitPointer();
    this.phase = "running";
    const socket = controlSocket(this.database);
    // Check before removing an old socket: never steal an active operator endpoint.
    const active = await new Promise<boolean>((done) => {
      const probe = request(
        { socketPath: socket, path: "/status", timeout: 1000 },
        (res) => {
          res.resume();
          done(true);
        },
      );
      probe.on("error", () => done(false));
      probe.on("timeout", () => {
        probe.destroy();
        done(true);
      });
      probe.end();
    });
    if (active) {
      await this.stopWorker(this.worker);
      throw new Error("Another world gateway owns this control socket.");
    }
    await rm(socket, { force: true });
    await new Promise<void>((done, reject) => {
      this.control.once("error", reject);
      this.control.listen(socket, done);
    });
    await chmod(socket, 0o600);
  }

  private child(target: Target, preflight = false) {
    if (this.stopping) throw new Error("The world gateway is stopping.");
    const child = fork(target.file, preflight ? ["--preflight"] : [], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PRAXANS_DB: this.database,
        ...(target.manifest
          ? {
              PRAXANS_RELEASE: target.manifest.release,
              PRAXANS_RELEASE_NOTES: target.manifest.notes,
              PRAXANS_REQUIRE_EXISTING_WORLD: "1",
            }
          : {}),
      },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    this.children.add(child);
    child.once("exit", () => this.children.delete(child));
    return child;
  }

  private async launch(target: Target): Promise<Worker> {
    const child = this.child(target);
    const worker = await new Promise<Worker>((done, reject) => {
      const timer = setTimeout(() => {
        void this.terminate(child, false);
        reject(new Error("Runtime startup timed out."));
      }, 90000);
      const failed = (code: number | null) => {
        clearTimeout(timer);
        reject(new Error(`Runtime exited before readiness (${code}).`));
      };
      child.once("exit", failed);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("message", (message) => {
        const value = message as {
          type: string;
          port: number;
          tick: number;
          id: string;
          seed: number;
        };
        if (value.type !== "ready") return;
        if (
          !Number.isInteger(value.port) ||
          value.port < 1 ||
          value.port > 65535 ||
          !Number.isSafeInteger(value.tick)
        )
          return;
        clearTimeout(timer);
        child.off("exit", failed);
        done({ child, target, ...value });
      });
    });
    if (this.stopping) {
      await this.terminate(child, true);
      throw new Error("The world gateway is stopping.");
    }
    child.once("exit", () => {
      if (this.worker === worker) this.worker = undefined;
      if (!this.stopping && !this.activating) void this.recover();
    });
    return worker;
  }

  private async recover() {
    if (this.restarting || this.stopping) return;
    this.restarting = true;
    this.phase = "unavailable";
    try {
      this.worker = await this.launch(this.target);
      this.phase = "running";
      this.lastError = null;
    } catch (error) {
      this.lastError = (error as Error).message;
    } finally {
      this.restarting = false;
    }
  }

  private async preflight(target: Target): Promise<CandidateReport> {
    const child = this.child(target, true);
    return new Promise((done, reject) => {
      let report: CandidateReport | undefined;
      const timer = setTimeout(() => {
        void this.terminate(child, false);
        reject(
          new Error(
            "Candidate validation timed out; current world remains active.",
          ),
        );
      }, 90000);
      child.on("message", (value) => {
        if ((value as CandidateReport)?.type === "preflight")
          report = value as CandidateReport;
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        if (code === 0 && report) done(report);
        else
          reject(
            new Error(
              "Candidate validation failed; current world remains active.",
            ),
          );
      });
    });
  }

  private async stopWorker(worker: Worker) {
    await this.terminate(worker.child, true);
  }

  private async terminate(child: ChildProcess, drain: boolean) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    if (drain && child.connected) child.send({ type: "drain" }, () => {});
    else child.kill("SIGTERM");
    const soft = setTimeout(() => child.kill("SIGTERM"), drain ? 10000 : 1000);
    const hard = setTimeout(() => child.kill("SIGKILL"), drain ? 15000 : 5000);
    try {
      await exited;
    } finally {
      clearTimeout(soft);
      clearTimeout(hard);
    }
  }

  private checkpoint() {
    const db = new DatabaseSync(this.database, { readOnly: true });
    try {
      return (
        db.prepare("SELECT checksum FROM world WHERE id=1").get() as {
          checksum: string;
        }
      ).checksum;
    } finally {
      db.close();
    }
  }

  private async commitPointer() {
    if (this.target.manifest) {
      await durableJson(join(this.root, "current.json"), {
        directory: dirname(this.target.file),
      });
      await rm(join(this.root, "pending.json"), { force: true });
    }
  }

  async activate(source: string) {
    if (this.stopping) throw new Error("The world gateway is stopping.");
    if (this.activating || this.restarting)
      throw new Error("A runtime transition is already in progress.");
    this.activating = true;
    this.phase = "preparing";
    const previous = this.target;
    let checkpoint: string | undefined;
    try {
      const installed = await installArtifact(
        source,
        this.root,
        this.dependencies,
      );
      const candidate = {
        file: join(installed.directory, "runtime.mjs"),
        manifest: installed.manifest,
      };
      if (
        this.target.manifest?.sha256 === candidate.manifest.sha256 &&
        this.target.manifest.release === candidate.manifest.release
      )
        return { unchanged: true, ...this.status() };
      if (
        candidate.manifest.release ===
        (this.target.manifest?.release ?? process.env.PRAXANS_RELEASE)
      )
        throw new Error(
          "Every changed runtime needs a unique release identifier.",
        );
      const report = await this.preflight(candidate);
      if (this.stopping) throw new Error("The world gateway is stopping.");
      this.phase = "handover";
      this.handover = new Promise<void>((done) => {
        this.resume = done;
      });
      const deadline = Date.now() + 15000;
      while (this.flights) {
        if (this.stopping) throw new Error("The world gateway is stopping.");
        if (Date.now() > deadline)
          throw new Error(
            "In-flight requests did not drain; the old runtime remains active.",
          );
        await sleep(10);
      }
      await durableJson(join(this.root, "pending.json"), {
        directory: installed.directory,
      });
      if (this.worker) await this.stopWorker(this.worker);
      this.worker = undefined;
      checkpoint = this.checkpoint();
      this.target = candidate;
      const next = await this.launch(candidate);
      if (
        next.id !== report.id ||
        next.seed !== report.seed ||
        next.tick < report.sourceTick
      ) {
        await this.stopWorker(next);
        throw new Error(
          "Candidate did not retain the existing world identity and clock.",
        );
      }
      this.worker = next;
      await this.commitPointer();
      this.lastError = null;
      return {
        release: candidate.manifest.release,
        ...report,
        resumedTick: next.tick,
      };
    } catch (error) {
      this.lastError = (error as Error).message;
      // Only an untouched checkpoint allows automatic recovery with the preceding binary.
      // Never roll an actual migrated world back to incompatible code or earlier data.
      if (
        !this.stopping &&
        !this.worker &&
        checkpoint &&
        this.checkpoint() === checkpoint
      ) {
        this.target = previous;
        this.worker = await this.launch(previous);
        await rm(join(this.root, "pending.json"), { force: true });
      }
      throw error;
    } finally {
      this.activating = false;
      this.phase = this.worker ? "running" : "unavailable";
      this.resume?.();
      this.resume = undefined;
      this.handover = undefined;
    }
  }

  private async available(res: ServerResponse): Promise<Worker | undefined> {
    const deadline = Date.now() + 90000;
    while (
      !this.stopping &&
      !res.destroyed &&
      (this.handover || !this.worker)
    ) {
      if (Date.now() > deadline) return undefined;
      if (this.handover) await Promise.race([this.handover, sleep(200)]);
      else await sleep(200);
    }
    return !res.destroyed && !this.stopping ? this.worker : undefined;
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    if (this.waiting >= 128)
      return reply(res, 503, {
        error: "The world gateway is at capacity. Retry shortly.",
      });
    this.waiting++;
    try {
      if (
        req.method === "GET" &&
        new URL(req.url ?? "/", "http://localhost").pathname === "/api/stream"
      ) {
        if (this.streams.size >= 100)
          return reply(res, 503, { error: "Observer capacity reached." });
        await this.stream(req, res);
        return;
      }
      const data = await body(req);
      const worker = await this.available(res);
      if (!worker) {
        if (!res.destroyed)
          reply(res, 503, {
            error:
              "The world runtime is recovering. Your request was not submitted.",
          });
        return;
      }
      this.flights++;
      try {
        await new Promise<void>((done) => {
          const upstream = request(
            {
              hostname: "127.0.0.1",
              port: worker.port,
              method: req.method,
              path: req.url,
              headers: req.headers,
              timeout: 60000,
            },
            (response) => {
              res.writeHead(response.statusCode ?? 502, response.headers);
              response.pipe(res);
              response.once("end", done);
              response.once("error", () => {
                res.destroy();
                done();
              });
            },
          );
          upstream.once("error", () => {
            if (!res.headersSent)
              reply(res, 503, {
                error:
                  "The runtime connection was interrupted. Retry with the same request ID.",
              });
            else res.destroy();
            done();
          });
          upstream.once("timeout", () =>
            upstream.destroy(new Error("Runtime request timed out.")),
          );
          res.once("close", () => {
            upstream.destroy();
            done();
          });
          upstream.end(data);
        });
      } finally {
        this.flights--;
      }
    } catch (error) {
      if (!res.headersSent)
        reply(res, 400, { error: (error as Error).message });
      else res.destroy();
    } finally {
      this.waiting--;
    }
  }

  private async stream(req: IncomingMessage, res: ServerResponse) {
    this.streams.add(res);
    let encoder: Gzip | undefined;
    const compressed = (req.headers["accept-encoding"] ?? "")
      .split(",")
      .some((entry) => {
        const [name, ...parameters] = entry.trim().split(";");
        const quality = parameters.find((value) =>
          value.trim().startsWith("q="),
        );
        return (
          name === "gzip" && (!quality || Number(quality.trim().slice(2)) > 0)
        );
      });
    res.once("close", () => encoder?.destroy());
    // The observer socket stays open during runtime changes. Only complete SSE
    // records are forwarded, so a truncated old frame cannot corrupt the new one.
    const heartbeat = setInterval(() => {
      if (res.headersSent && !res.destroyed)
        (encoder ?? res).write(": world gateway\n\n");
    }, 15000);
    try {
      while (!this.stopping && !res.destroyed) {
        const worker = await this.available(res);
        if (!worker) break;
        let retry = true;
        await new Promise<void>((done) => {
          const upstream = request(
            {
              hostname: "127.0.0.1",
              port: worker.port,
              method: "GET",
              path: req.url,
              headers: { ...req.headers, "accept-encoding": "identity" },
            },
            (response) => {
              if (response.statusCode !== 200) {
                retry = false;
                if (!res.headersSent)
                  res.writeHead(response.statusCode ?? 502, response.headers);
                response.pipe(res);
                response.once("end", done);
                return;
              }
              if (!res.headersSent) {
                res.writeHead(200, {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  "X-Accel-Buffering": "no",
                  Vary: "Accept-Encoding",
                  ...(compressed ? { "Content-Encoding": "gzip" } : {}),
                });
                res.flushHeaders();
                if (compressed) {
                  encoder = createGzip({
                    level: 4,
                    flush: zlibConstants.Z_SYNC_FLUSH,
                  });
                  encoder.on("error", () => res.destroy());
                  encoder.pipe(res);
                }
              }
              const records = new SseRecords((record) => {
                const writer = encoder ?? res;
                if (!writer.write(record)) {
                  response.pause();
                  writer.once("drain", () => response.resume());
                }
                if (
                  res.writableLength + (encoder?.writableLength ?? 0) >
                  32 * 1024 * 1024
                )
                  res.destroy();
              });
              response.on("data", (chunk: Buffer) => {
                try {
                  records.push(chunk);
                } catch {
                  upstream.destroy();
                  res.destroy();
                }
              });
              response.once("end", done);
              response.once("error", done);
            },
          );
          const closed = () => {
            upstream.destroy();
            done();
          };
          res.once("close", closed);
          upstream.once("close", () => {
            res.off("close", closed);
            done();
          });
          upstream.once("error", done);
          upstream.end();
        });
        if (!retry) break;
        await sleep(100);
      }
    } finally {
      clearInterval(heartbeat);
      this.streams.delete(res);
      if (encoder && !res.destroyed && !res.writableEnded) encoder.end();
      else {
        encoder?.destroy();
        if (!res.destroyed) res.end();
      }
    }
  }

  private async admin(req: IncomingMessage, res: ServerResponse) {
    try {
      if (req.method === "GET" && req.url === "/status")
        return reply(res, 200, this.status());
      if (req.method !== "POST" || req.url !== "/activate")
        return reply(res, 404, { error: "Unknown local operation." });
      const data = JSON.parse((await body(req, 8192)).toString("utf8"));
      if (typeof data.directory !== "string" || !data.directory)
        throw new Error("An artifact directory is required.");
      reply(res, 200, await this.activate(resolve(data.directory)));
    } catch (error) {
      reply(res, 409, { error: (error as Error).message });
    }
  }

  close() {
    return (this.closing ??= this.shutdown());
  }

  private async shutdown() {
    this.stopping = true;
    this.resume?.();
    for (const stream of this.streams) stream.end();
    await Promise.allSettled(
      [...this.children].map((child) =>
        this.terminate(child, child === this.worker?.child),
      ),
    );
    this.control.closeAllConnections();
    this.control.close();
    this.server.closeAllConnections();
    this.server.close();
    await rm(controlSocket(this.database), { force: true });
  }
}
