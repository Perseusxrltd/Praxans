import test from "node:test";
import assert from "node:assert/strict";
import { SseRecords } from "../../src/server/sse";

test("observer framing survives every byte boundary, UTF-8 and incomplete disconnects", () => {
  const frames = [
    'event: snapshot\ndata: {"name":"Forêt","tick":4}\n\n',
    ": heartbeat\n\n",
    'event: delta\ndata: {"tick":8}\n\n',
  ];
  const bytes = Buffer.from(frames.join("") + "event: incomplete\ndata:");
  for (const chunkSize of [1, 2, 3, 7, 1000]) {
    const seen: string[] = [],
      parser = new SseRecords((record) => seen.push(record.toString("utf8")));
    for (let index = 0; index < bytes.length; index += chunkSize)
      parser.push(bytes.subarray(index, index + chunkSize));
    assert.deepEqual(seen, frames);
  }
  const limited = new SseRecords(() => {}, 4);
  assert.throws(() => limited.push(Buffer.from("oversized")), /permitted size/);
});
