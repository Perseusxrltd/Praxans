import { createHash } from "node:crypto";
import {
  readFile,
  mkdir,
  writeFile,
  rename,
  open,
  realpath,
  readdir,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface RuntimeArtifact {
  protocol: 1;
  release: string;
  notes: string;
  sha256: string;
  dependencies: string;
  nodeMajor: number;
}
export const bytesHash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

export async function dependencyHash(lockfile = resolve("package-lock.json")) {
  const lock = JSON.parse(await readFile(lockfile, "utf8"));
  // Project version/metadata can change without changing installed dependencies.
  return bytesHash(
    JSON.stringify(
      Object.entries(lock.packages)
        .filter(([key]) => key !== "")
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
}

export async function readArtifact(
  directory: string,
): Promise<RuntimeArtifact> {
  const value = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  );
  if (
    value.protocol !== 1 ||
    !/^[a-z0-9][a-z0-9._-]{0,95}$/.test(value.release) ||
    typeof value.notes !== "string" ||
    !value.notes.trim() ||
    value.notes.length > 2000 ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    !/^[a-f0-9]{64}$/.test(value.dependencies) ||
    value.nodeMajor !== Number(process.versions.node.split(".")[0])
  )
    throw new Error("Invalid or incompatible runtime manifest.");
  const code = await readFile(join(directory, "runtime.mjs"));
  if (code.length > 16 * 1024 * 1024 || bytesHash(code) !== value.sha256)
    throw new Error(
      "Runtime artifact checksum mismatch or size limit exceeded.",
    );
  return value;
}

/** Immutable, locally installed artifact. It cannot overwrite an active release. */
export async function installArtifact(
  source: string,
  root: string,
  dependencies: string,
) {
  const manifest = await readArtifact(source);
  if (manifest.dependencies !== dependencies)
    throw new Error(
      "Installed dependencies differ. This change needs a prepared container upgrade.",
    );
  const directory = join(
    root,
    "releases",
    `${manifest.release}-${manifest.sha256.slice(0, 16)}`,
  );
  await mkdir(join(root, "releases"), { recursive: true, mode: 0o700 });
  for (const name of await readdir(join(root, "releases")))
    if (
      name.startsWith(`${manifest.release}-`) &&
      name !== directory.split("/").at(-1)
    )
      throw new Error(
        "A previous artifact already uses this release identifier.",
      );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const name of ["runtime.mjs", "manifest.json"]) {
    const bytes = await readFile(join(source, name));
    try {
      await writeFile(join(directory, name), bytes, {
        flag: "wx",
        mode: 0o600,
        flush: true,
      });
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "EEXIST" ||
        bytesHash(await readFile(join(directory, name))) !== bytesHash(bytes)
      )
        throw error;
    }
  }
  await readArtifact(directory);
  await syncDirectory(directory);
  await syncDirectory(dirname(directory));
  return { directory: await realpath(directory), manifest };
}

/** Persist an activation pointer before handover so a crash cannot choose an older binary. */
export async function durableJson(path: string, value: unknown) {
  const temporary = `${path}.tmp`;
  const file = await open(temporary, "w", 0o600);
  try {
    await file.writeFile(JSON.stringify(value));
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporary, path);
  await syncDirectory(dirname(path));
}

async function syncDirectory(path: string) {
  const directory = await open(path, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
