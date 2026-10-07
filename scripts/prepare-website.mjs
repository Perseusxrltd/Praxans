import { cp, mkdir, rm, writeFile } from "node:fs/promises";

if (!process.env.WORLD_SERVER_ORIGIN)
  throw new Error(
    "Set WORLD_SERVER_ORIGIN to the persistent Railway world server before building the Vercel website.",
  );
const origin = new URL(process.env.WORLD_SERVER_ORIGIN);
if (
  origin.protocol !== "https:" ||
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash
)
  throw new Error(
    "WORLD_SERVER_ORIGIN must be a plain HTTPS origin, without a path or credentials.",
  );
const output = ".vercel/output";
await rm(output, { recursive: true, force: true });
await mkdir(`${output}/static`, { recursive: true });
await cp("dist/client", `${output}/static`, { recursive: true });
await writeFile(
  `${output}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/api/(.*)", dest: `${origin.origin}/api/$1` },
        { src: "/mcp", dest: `${origin.origin}/mcp` },
        { handle: "filesystem" },
        { src: "/.*", dest: "/index.html" },
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Website prepared. World requests are forwarded to ${origin.origin}; no simulation or database runs in Vercel functions.`,
);
