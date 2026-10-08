import {
  backup as sqliteBackup,
  type BackupProgressInfo,
  type DatabaseSync,
} from "node:sqlite";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  rm,
  statfs,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

interface BackupOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  progress?: (progress: BackupProgressInfo) => void;
}

/**
 * Copy a consistent database in short read batches, allowing the continuing
 * writer to reclaim its WAL between them. Await completion before closing the
 * borrowed source connection. Only a completed copy receives the final name.
 */
export async function backupDatabase(
  source: DatabaseSync,
  destination: string,
  options: BackupOptions = {},
): Promise<number> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error("Backup timeout must be a positive duration.");
  const deadline = performance.now() + timeoutMs;
  const checkCancellation = () => {
    options.signal?.throwIfAborted();
    if (performance.now() >= deadline)
      throw new Error(
        "Backup timed out before completion; no copy was published.",
      );
  };
  checkCancellation();
  const target = resolve(destination),
    parent = dirname(target);
  try {
    await lstat(target);
    throw new Error("Backup destination already exists; use a new filename.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(parent, { recursive: true });
  const pages = Number(source.prepare("PRAGMA page_count").get()!.page_count),
    pageSize = Number(source.prepare("PRAGMA page_size").get()!.page_size),
    space = await statfs(parent);
  // An initial capacity check is not a reservation: other processes and source
  // growth can still consume space while the backup is in progress.
  if (space.bavail * space.bsize < pages * pageSize + 4 * 1024 ** 2)
    throw new Error(
      "Insufficient space for the backup; choose another destination.",
    );
  const temporary = await mkdtemp(join(parent, ".praxans-backup-"));
  try {
    const copy = join(temporary, "world.sqlite");
    checkCancellation();
    const copiedPages = await sqliteBackup(source, copy, {
      rate: 128,
      progress: (progress) => {
        // Throwing here finalizes the native backup before its promise rejects.
        checkCancellation();
        options.progress?.(progress);
        checkCancellation();
      },
    });
    checkCancellation();
    await chmod(copy, 0o600);
    const file = await open(copy, "r");
    try {
      await file.sync();
    } finally {
      await file.close();
    }
    checkCancellation();
    // Staging shares the destination filesystem. A hard link publishes the
    // complete inode atomically and refuses an existing name, including a
    // dangling symlink. Rename would overwrite a backup created meanwhile.
    await link(copy, target);
    const directory = await open(parent, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    return copiedPages;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
