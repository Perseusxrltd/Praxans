import { mkdirSync, chownSync } from "node:fs";
import { spawn } from "node:child_process";

if (process.getuid?.() === 0) {
  mkdirSync("/data", { recursive: true });
  chownSync("/data", 1000, 1000);
  process.setgroups([]);
  process.setgid(1000);
  process.setuid(1000);
}
const [command, ...args] = process.argv.slice(2);
const child = spawn(command, args, { stdio: "inherit", env: process.env });
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
