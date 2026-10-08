import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bytesHash,
  installArtifact,
  readArtifact,
  durableJson,
} from "../../src/server/artifact";
import { WorldGateway } from "../../src/server/gateway";

test("hotfix artifacts verify bytes, dependencies, and immutable release identities", async () => {
  const directory = await mkdtemp(join(tmpdir(), "praxans-artifact-"));
  try {
    const source = join(directory, "source"),
      root = join(directory, "runtime"),
      dependencies = "a".repeat(64);
    await mkdir(source);
    const code = "// immutable runtime\n";
    const manifest = {
      protocol: 1,
      release: "test-release",
      notes: "A test artifact.",
      sha256: bytesHash(code),
      dependencies,
      nodeMajor: Number(process.versions.node.split(".")[0]),
    };
    await writeFile(join(source, "runtime.mjs"), code);
    await durableJson(join(source, "manifest.json"), manifest);
    await assert.rejects(
      installArtifact(source, root, "b".repeat(64)),
      /dependencies differ/,
    );
    const installed = await installArtifact(source, root, dependencies);
    assert.equal(
      (await readArtifact(installed.directory)).sha256,
      manifest.sha256,
    );
    await writeFile(join(source, "runtime.mjs"), code + "// changed\n");
    await assert.rejects(readArtifact(source), /checksum/);
    manifest.sha256 = bytesHash(code + "// changed\n");
    await durableJson(join(source, "manifest.json"), manifest);
    await assert.rejects(
      installArtifact(source, root, dependencies),
      /already uses this release/,
    );
    assert.equal(
      (await readArtifact(installed.directory)).sha256,
      bytesHash(code),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a missing persisted runtime never silently selects a previous binary or creates a world", async () => {
  const directory = await mkdtemp(join(tmpdir(), "praxans-pointer-"));
  const database = join(directory, "world.sqlite"),
    root = join(directory, "runtime");
  const gateway = new WorldGateway(database, "must-not-start.mjs");
  try {
    await mkdir(root);
    await durableJson(join(root, "current.json"), {
      directory: join(root, "releases", "missing"),
    });
    await assert.rejects(gateway.start(), /Cannot use persisted runtime/);
    await assert.rejects(stat(database), { code: "ENOENT" });
    assert.equal(gateway.status().managedProcesses, 0);
  } finally {
    await gateway.close();
    await rm(directory, { recursive: true, force: true });
  }
});
