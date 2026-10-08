import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  bytesHash,
  dependencyHash,
  type RuntimeArtifact,
} from "../src/server/artifact";

const [release, notes, destination = "dist/hotfix"] = process.argv.slice(2);
if (!release || !notes || !/^[a-z0-9][a-z0-9._-]{0,95}$/.test(release))
  throw new Error(
    "Usage: npm run hotfix:prepare -- <unique-release-id> <factual-notes> [artifact-directory]. Run npm run build first.",
  );
const code = await readFile("dist/server/runtime.mjs");
const manifest: RuntimeArtifact = {
  protocol: 1,
  release,
  notes,
  sha256: bytesHash(code),
  dependencies: await dependencyHash(),
  nodeMajor: Number(process.versions.node.split(".")[0]),
};
const directory = resolve(destination);
await mkdir(directory, { recursive: true });
await writeFile(join(directory, "runtime.mjs"), code);
await writeFile(
  join(directory, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(JSON.stringify({ directory, ...manifest }, null, 2));
