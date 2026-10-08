import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { Worker } from "node:worker_threads";
import { backupDatabase } from "../../src/server/backup";

function fixture(directory: string, name: string, rows = 128) {
  const path = join(directory, name + ".sqlite");
  const writer = new DatabaseSync(path);
  writer.exec(
    "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=64; PRAGMA journal_size_limit=1048576; " +
      "CREATE TABLE clock(id INTEGER PRIMARY KEY, revision INTEGER); INSERT INTO clock VALUES(1,0); " +
      "CREATE TABLE payload(id INTEGER PRIMARY KEY, revision INTEGER, value BLOB)",
  );
  const insert = writer.prepare("INSERT INTO payload VALUES(?,0,?)");
  const bytes = Buffer.alloc(64 * 1024);
  writer.exec("BEGIN");
  for (let id = 1; id <= rows; id++) insert.run(id, bytes);
  writer.exec("COMMIT");
  writer.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
  let revision = 0;
  const mutate = () => {
    revision++;
    writer.exec("BEGIN IMMEDIATE");
    writer
      .prepare("UPDATE payload SET revision=?,value=? WHERE id<=32")
      .run(revision, Buffer.alloc(bytes.length, revision % 256));
    writer.prepare("UPDATE clock SET revision=? WHERE id=1").run(revision);
    writer.exec("COMMIT");
    return writer.prepare("PRAGMA wal_checkpoint(PASSIVE)").get() as {
      log: number;
      checkpointed: number;
    };
  };
  return { path, writer, mutate, revision: () => revision };
}

function stagingFiles(directory: string) {
  return readdirSync(directory).filter((name) =>
    name.startsWith(".praxans-backup-"),
  );
}

test("incremental backups release read history while complete transactions continue", async () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-backup-locks-"));
  const results: number[] = [];
  try {
    for (const heldReader of [true, false]) {
      const source = fixture(directory, heldReader ? "held" : "batched");
      const reader = new DatabaseSync(source.path, { readOnly: true });
      let maximumWal = 0;
      const write = () => {
        const checkpoint = source.mutate();
        maximumWal = Math.max(maximumWal, statSync(source.path + "-wal").size);
        assert.equal(checkpoint.checkpointed === checkpoint.log, !heldReader);
      };
      try {
        if (heldReader) {
          reader.exec("BEGIN");
          reader.prepare("SELECT revision FROM clock").get();
          for (let n = 0; n < 6; n++) write();
          assert.equal(
            reader.prepare("SELECT revision FROM clock").get()!.revision,
            0,
          );
          reader.exec("ROLLBACK");
        } else {
          const destination = join(directory, "completed.sqlite");
          let callbacks = 0;
          const pages = await backupDatabase(reader, destination, {
            progress: () => {
              callbacks++;
              assert.equal(existsSync(destination), false);
              if (source.revision() < 6) write();
            },
          });
          assert.ok(callbacks >= 6);
          assert.ok(pages > 128);
          assert.deepEqual(stagingFiles(directory), []);
          const copy = new DatabaseSync(destination, { readOnly: true });
          try {
            assert.equal(
              copy.prepare("PRAGMA integrity_check").get()!.integrity_check,
              "ok",
            );
            assert.equal(
              copy.prepare("SELECT revision FROM clock").get()!.revision,
              6,
            );
            assert.equal(
              copy
                .prepare(
                  "SELECT count(*) n FROM payload WHERE id<=32 AND revision=6 AND hex(substr(value,1,1))='06'",
                )
                .get()!.n,
              32,
            );
            assert.equal(
              copy
                .prepare(
                  "SELECT count(*) n FROM payload WHERE id>32 AND revision=0",
                )
                .get()!.n,
              96,
            );
          } finally {
            copy.close();
          }
          if (process.platform !== "win32")
            assert.equal(statSync(destination).mode & 0o777, 0o600);
        }
        results.push(maximumWal);
      } finally {
        reader.close();
        source.writer.close();
      }
    }
    assert.ok(results[0] > 5 * results[1]);
    assert.ok(results[1] < 4 * 1024 ** 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an independently scheduled writer can commit and checkpoint during a consistent backup", async () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-backup-concurrent-"));
  const source = fixture(directory, "source", 1024);
  source.writer.close();
  const reader = new DatabaseSync(source.path, { readOnly: true });
  const worker = new Worker(
    `const { parentPort, workerData } = require('node:worker_threads');
     const { DatabaseSync } = require('node:sqlite');
     const { statSync } = require('node:fs');
     const db = new DatabaseSync(workerData);
     db.exec('PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=64; PRAGMA journal_size_limit=1048576; PRAGMA busy_timeout=5000');
     parentPort.once('message', async () => {
       try {
         for (let revision=1; revision<=12; revision++) {
           db.exec('BEGIN IMMEDIATE');
           db.prepare('UPDATE payload SET revision=?,value=? WHERE id<=32').run(revision, Buffer.alloc(65536,revision));
           db.prepare('UPDATE clock SET revision=? WHERE id=1').run(revision);
           db.exec('COMMIT');
           const checkpoint=db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get();
           parentPort.postMessage({kind:'commit',revision,checkpoint,walBytes:statSync(workerData+'-wal').size});
           await new Promise(done=>setTimeout(done,2));
         }
         db.close();
         parentPort.postMessage({kind:'done'});
       } finally { parentPort.close(); }
     });
     parentPort.postMessage({kind:'ready'});`,
    { eval: true, workerData: source.path },
  );
  const commits: {
    revision: number;
    checkpoint: { log: number; checkpointed: number };
    walBytes: number;
    duringCopy: boolean;
  }[] = [];
  let copying = false;
  const done = new Promise<void>((resolve, reject) => {
    worker.on("message", (message) => {
      if (message.kind === "commit")
        commits.push({ ...message, duringCopy: copying });
      if (message.kind === "done") resolve();
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`Concurrent writer exited (${code}).`));
    });
  });
  // Attach a handler immediately, including when backup itself fails first.
  void done.catch(() => undefined);
  try {
    await once(worker, "message");
    copying = true;
    let started = false;
    const destination = join(directory, "completed.sqlite");
    await backupDatabase(reader, destination, {
      progress: () => {
        if (!started) {
          started = true;
          worker.postMessage("start");
        }
      },
    });
    copying = false;
    await done;
    const overlap = commits.filter((commit) => commit.duringCopy);
    assert.ok(overlap.length >= 2, "writes must overlap the native copy");
    assert.ok(
      overlap.some(
        ({ checkpoint }) => checkpoint.log === checkpoint.checkpointed,
      ),
      "the independent writer must reclaim history before copying ends",
    );
    assert.equal(commits.length, 12);
    const copy = new DatabaseSync(destination, { readOnly: true });
    try {
      assert.equal(
        copy.prepare("PRAGMA integrity_check").get()!.integrity_check,
        "ok",
      );
      const revision = Number(
        copy.prepare("SELECT revision FROM clock").get()!.revision,
      );
      assert.ok(revision >= 1 && revision <= 12);
      assert.equal(
        copy
          .prepare(
            "SELECT count(*) n FROM payload WHERE id<=32 AND revision=? AND value=?",
          )
          .get(revision, Buffer.alloc(65536, revision))!.n,
        32,
      );
      assert.equal(
        copy
          .prepare("SELECT count(*) n FROM payload WHERE id>32 AND revision=0")
          .get()!.n,
        992,
      );
    } finally {
      copy.close();
    }
    assert.deepEqual(stagingFiles(directory), []);
  } finally {
    await worker.terminate();
    reader.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("existing backups and names created during copying cannot be overwritten", async () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-backup-exclusive-"));
  const source = fixture(directory, "source");
  const destination = join(directory, "retained.sqlite");
  const retained = Buffer.from("A previous backup must not be replaced.");
  try {
    writeFileSync(destination, retained);
    await assert.rejects(
      backupDatabase(source.writer, destination),
      /already exists/,
    );
    assert.deepEqual(readFileSync(destination), retained);
    rmSync(destination);
    let created = false;
    await assert.rejects(
      backupDatabase(source.writer, destination, {
        progress: () => {
          if (!created) {
            writeFileSync(destination, retained, { flag: "wx" });
            created = true;
          }
        },
      }),
      { code: "EEXIST" },
    );
    assert.equal(created, true);
    assert.deepEqual(readFileSync(destination), retained);
    assert.deepEqual(stagingFiles(directory), []);
    assert.equal(
      source.writer.prepare("SELECT revision FROM clock").get()!.revision,
      0,
    );
  } finally {
    source.writer.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cancelling a partial native backup cleans its files and releases the source", async () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-backup-cancel-"));
  const source = fixture(directory, "source");
  const destination = join(directory, "cancelled.sqlite");
  const cancellation = new AbortController();
  try {
    let began = false;
    await assert.rejects(
      backupDatabase(source.writer, destination, {
        signal: cancellation.signal,
        progress: () => {
          began = true;
          cancellation.abort(new Error("Stop this disposable backup."));
        },
      }),
      /Stop this disposable backup/,
    );
    assert.equal(began, true);
    assert.equal(existsSync(destination), false);
    assert.deepEqual(stagingFiles(directory), []);
    const checkpoint = source.mutate();
    assert.equal(checkpoint.log, checkpoint.checkpointed);
    assert.equal(source.revision(), 1);
  } finally {
    source.writer.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a constantly changing source reaches the backup deadline without publishing a partial copy", async () => {
  const directory = mkdtempSync(join(tmpdir(), "praxans-backup-deadline-"));
  const source = fixture(directory, "source");
  const reader = new DatabaseSync(source.path, { readOnly: true });
  const destination = join(directory, "unfinished.sqlite");
  try {
    await assert.rejects(
      backupDatabase(reader, destination, {
        timeoutMs: 250,
        progress: () => {
          source.mutate();
        },
      }),
      /timed out/,
    );
    assert.equal(existsSync(destination), false);
    assert.deepEqual(stagingFiles(directory), []);
    reader.close();
    assert.equal(
      source.writer.prepare("PRAGMA integrity_check").get()!.integrity_check,
      "ok",
    );
    assert.equal(
      source.writer.prepare("SELECT revision FROM clock").get()!.revision,
      source.revision(),
    );
  } finally {
    if (reader.isOpen) reader.close();
    source.writer.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
