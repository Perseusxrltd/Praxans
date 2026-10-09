import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import {
  decodeRegion,
  encodeRegion,
  type EncodedRegion,
} from "../../src/server/region-codec";

const hash = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

test("region storage preserves exact Unicode, floating point and record order across frame sizes", () => {
  for (const count of [0, 1, 32, 4096, 32768]) {
    const json = JSON.stringify(
      Array.from({ length: count }, (_, i) => ({
        x: i,
        name: "🌱 forêt — 水",
        temperature: -7.13456234345,
        carbon: 1.345465676e-8,
        soil: { Fe: 12.67, Si: 0.00432 },
      })),
    );
    const packed = encodeRegion(json);
    assert.equal(decodeRegion(packed, hash(json)), json);
    if (count >= 32) {
      assert.equal(packed.encoding, "zstd-frame-1");
      assert.ok(packed.payload.length < Buffer.byteLength(json));
    }
  }
});

test("small and incompressible content remains lossless without expanding its payload", () => {
  for (const json of [
    "",
    "[]",
    JSON.stringify(randomBytes(16).toString("hex")),
  ]) {
    const packed = encodeRegion(json);
    assert.equal(packed.encoding, "json");
    assert.equal(packed.payload, json);
    assert.equal(packed.payloadChecksum, null);
    assert.equal(decodeRegion(packed, hash(json)), json);
  }
});

test("region decoding rejects corruption and inconsistent length or encoding", () => {
  const json = JSON.stringify(
    Array(5000).fill({ temperature: 3.678, water: 90 }),
  );
  const packed = encodeRegion(json);
  assert.equal(packed.encoding, "zstd-frame-1");
  const damaged = Buffer.from(packed.payload as Uint8Array);
  damaged[damaged.length - 1] ^= 1;
  assert.throws(
    () => decodeRegion({ ...packed, payload: damaged }, hash(json)),
    /checksum/,
  );
  assert.throws(
    () =>
      decodeRegion({ ...packed, rawBytes: packed.rawBytes - 1 }, hash(json)),
    /size/,
  );
  assert.throws(() => decodeRegion(packed, "wrong"), /checksum/);
  assert.throws(
    () => decodeRegion({ ...packed, rawBytes: Infinity }, hash(json)),
    /length/,
  );
  assert.throws(
    () =>
      decodeRegion(
        { ...packed, encoding: "unknown" } as unknown as EncodedRegion,
        hash(json),
      ),
    /Unsupported/,
  );
});

test("a native-decodable truncated trailer or extra frame cannot become a valid region", () => {
  const json = JSON.stringify(
    Array(5000).fill({ carbon: 0.007, lineage: "oak" }),
  );
  const packed = encodeRegion(json);
  const bytes = Buffer.from(packed.payload as Uint8Array);
  const truncated = bytes.subarray(0, bytes.length - 1);
  // Some Node 22 native decoders return complete content despite this missing
  // trailer byte. Reject it regardless of a future native decoder correction.
  for (const payload of [
    truncated,
    Buffer.concat([bytes, bytes]),
    Buffer.concat([bytes, Buffer.from("extra")]),
  ]) {
    assert.throws(
      () =>
        decodeRegion(
          { ...packed, payload, payloadChecksum: hash(payload) },
          hash(json),
        ),
      /truncated|trailing/,
    );
  }
});
