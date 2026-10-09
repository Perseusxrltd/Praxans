import { request } from "node:http";
import { resolve } from "node:path";
import { controlSocket } from "../src/server/gateway";

const directory = process.argv[2];
const socketPath = controlSocket(
  process.env.PRAXANS_DB ?? "data/praxans.sqlite",
);
const operation =
  directory && directory !== "--status" ? "/activate" : "/status";
const data =
  operation === "/activate"
    ? JSON.stringify({ directory: resolve(directory!) })
    : undefined;
const response = await new Promise<{ status: number; text: string }>(
  (done, reject) => {
    const req = request(
      {
        socketPath,
        path: operation,
        method: data ? "POST" : "GET",
        headers: data
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(data),
            }
          : {},
        timeout: 240000,
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (part) => {
          text += part;
        });
        res.on("end", () => done({ status: res.statusCode ?? 500, text }));
      },
    );
    req.once("error", reject);
    req.once("timeout", () =>
      req.destroy(
        new Error(
          "Local hotfix operation timed out. Check --status before retrying.",
        ),
      ),
    );
    req.end(data);
  },
);
console.log(response.text);
if (response.status !== 200) process.exitCode = 1;
