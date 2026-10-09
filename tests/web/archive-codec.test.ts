import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import {
  ARCHIVE_BLOCK_BYTES,
  encodeDigitArchiveBlock,
  decodeArchiveBlock,
} from "../../src/server/archive-codec";

test("digit streams preserve exact bytes, lexical numbers, zero escapes and maximum run boundaries", () => {
  const cases = [
    Buffer.from(
      '{ "zero": -0, "exp": 1e+0003, "note": "水 🌿 00123456789" }\n',
    ),
    Buffer.alloc(ARCHIVE_BLOCK_BYTES),
    Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 256)),
    ...[3, 4, 127, 128, 16383, 16384, ARCHIVE_BLOCK_BYTES].map((n) =>
      Buffer.from("9".repeat(n)),
    ),
  ];
  for (const raw of cases) {
    const packed = encodeDigitArchiveBlock(raw);
    assert.deepEqual(decodeArchiveBlock(packed, raw.length, true), raw);
    assert.throws(() => decodeArchiveBlock(packed, raw.length, false));
  }
  for (const n of [0, ARCHIVE_BLOCK_BYTES + 1])
    assert.throws(() => encodeDigitArchiveBlock(Buffer.alloc(n)), /length/);
});

function framed(literal: Buffer, digits: Buffer, expected: number) {
  const a = deflateSync(literal),
    b = deflateSync(digits);
  const header = Buffer.alloc(20);
  header.write("NDS1");
  header.writeUInt32LE(expected, 4);
  header.writeUInt32LE(literal.length, 8);
  header.writeUInt32LE(digits.length, 12);
  header.writeUInt32LE(a.length, 16);
  return Buffer.concat([header, a, b]);
}

test("digit decoding bounds both streams and rejects truncated, trailing, missing or inconsistent content", () => {
  const raw = Buffer.from("river 1234567890123456 🌿".repeat(200));
  const packed = encodeDigitArchiveBlock(raw);
  for (const length of [0, 4, 19, 20, packed.length - 1])
    assert.throws(() =>
      decodeArchiveBlock(packed.subarray(0, length), raw.length, true),
    );
  for (const field of [4, 8, 12, 16]) {
    const bad = Buffer.from(packed);
    bad.writeUInt32LE(0xffffffff, field);
    assert.throws(() => decodeArchiveBlock(bad, raw.length, true));
  }
  for (const tail of [Buffer.from([0]), packed])
    assert.throws(() =>
      decodeArchiveBlock(Buffer.concat([packed, tail]), raw.length, true),
    );
  for (const [literal, digits, expected] of [
    [Buffer.from([0]), Buffer.alloc(0), 4],
    [Buffer.from([0, 128, 128, 128, 0]), Buffer.alloc(0), 4],
    [Buffer.from([0, 3]), Buffer.from("123"), 4],
    [Buffer.from([0, 4]), Buffer.from("123a"), 4],
    [Buffer.from([0, 4]), Buffer.from("123"), 4],
    [Buffer.from([0, 4]), Buffer.from("1234"), 3],
    [Buffer.from("text"), Buffer.from("1234"), 4],
    [Buffer.from("abcde"), Buffer.alloc(0), 4],
    [Buffer.from("abc"), Buffer.alloc(0), 4],
  ] as const)
    assert.throws(() =>
      decodeArchiveBlock(framed(literal, digits, expected), expected, true),
    );
});

test("new readers preserve legacy Deflate bytes and reject additional compressed members", () => {
  const raw = Buffer.from("retain old precision 1.234567890123456789\n");
  const packed = deflateSync(raw);
  for (const allowDigits of [false, true]) {
    assert.deepEqual(decodeArchiveBlock(packed, raw.length, allowDigits), raw);
    assert.throws(() =>
      decodeArchiveBlock(
        Buffer.concat([packed, packed]),
        raw.length,
        allowDigits,
      ),
    );
    assert.throws(() =>
      decodeArchiveBlock(packed.subarray(0, -1), raw.length, allowDigits),
    );
  }
  assert.throws(
    () => decodeArchiveBlock(packed, ARCHIVE_BLOCK_BYTES + 1, true),
    /length/,
  );
  assert.throws(
    () => decodeArchiveBlock(Buffer.alloc(ARCHIVE_BLOCK_BYTES + 1025), 1, true),
    /bound/,
  );
});
