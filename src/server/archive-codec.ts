import { deflateSync, inflateSync } from "node:zlib";

export const ARCHIVE_BLOCK_BYTES = 256 * 1024;
export const DIGIT_ARCHIVE_ENCODING = "digit-deflate-parts-1";
const magic = Buffer.from("NDS1");
const headerBytes = 20;

function rawLength(length: number): void {
  if (
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > ARCHIVE_BLOCK_BYTES
  )
    throw new Error("Archive block length is invalid.");
}

/** Reorder bytes only: decimal text, Unicode and historical formatting stay exact. */
export function encodeDigitArchiveBlock(raw: Uint8Array): Buffer {
  rawLength(raw.length);
  const source = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  const literal = Buffer.allocUnsafe(raw.length * 2);
  const digits = Buffer.allocUnsafe(raw.length);
  let literalBytes = 0;
  let digitBytes = 0;
  for (let start = 0; start < source.length;) {
    const byte = source[start];
    if (byte >= 48 && byte <= 57) {
      let end = start + 1;
      while (end < source.length && source[end] >= 48 && source[end] <= 57)
        end++;
      let length = end - start;
      if (length >= 4) {
        literal[literalBytes++] = 0;
        do {
          const part = length % 128;
          length = Math.floor(length / 128);
          literal[literalBytes++] = part + (length ? 128 : 0);
        } while (length);
        source.copy(digits, digitBytes, start, end);
        digitBytes += end - start;
      } else {
        source.copy(literal, literalBytes, start, end);
        literalBytes += length;
      }
      start = end;
    } else {
      literal[literalBytes++] = byte;
      if (byte === 0) literal[literalBytes++] = 0;
      start++;
    }
  }
  const literalFrame = deflateSync(literal.subarray(0, literalBytes), {
    level: 6,
  });
  const digitFrame = deflateSync(digits.subarray(0, digitBytes), { level: 6 });
  const header = Buffer.alloc(headerBytes);
  magic.copy(header);
  header.writeUInt32LE(raw.length, 4);
  header.writeUInt32LE(literalBytes, 8);
  header.writeUInt32LE(digitBytes, 12);
  header.writeUInt32LE(literalFrame.length, 16);
  return Buffer.concat([header, literalFrame, digitFrame]);
}

function inflateComplete(packed: Uint8Array, expected: number): Buffer {
  // Node returns this result with info:true; the current types retain Buffer.
  const result = inflateSync(packed, {
    maxOutputLength: Math.max(1, expected),
    info: true,
  }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
  if (
    result.buffer.length !== expected ||
    result.engine.bytesWritten !== packed.length
  )
    throw new Error(
      "Archive block has an inconsistent or trailing compressed stream.",
    );
  return result.buffer;
}

/** The new representation may retain smaller original Deflate blocks verbatim. */
export function decodeArchiveBlock(
  payload: Uint8Array,
  expected: number,
  allowDigits: boolean,
): Buffer {
  rawLength(expected);
  if (payload.length > ARCHIVE_BLOCK_BYTES + 1024)
    throw new Error("Archive block payload exceeds its bound.");
  const packed = Buffer.from(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  if (!allowDigits || !packed.subarray(0, magic.length).equals(magic))
    return inflateComplete(packed, expected);
  if (packed.length < headerBytes || packed.readUInt32LE(4) !== expected)
    throw new Error("Digit archive block header is inconsistent.");
  const literalBytes = packed.readUInt32LE(8);
  const digitBytes = packed.readUInt32LE(12);
  const split = packed.readUInt32LE(16);
  if (
    literalBytes > expected * 2 ||
    digitBytes > expected ||
    split > packed.length - headerBytes
  )
    throw new Error("Digit archive block streams exceed their bounds.");
  const literal = inflateComplete(
    packed.subarray(headerBytes, headerBytes + split),
    literalBytes,
  );
  const digits = inflateComplete(
    packed.subarray(headerBytes + split),
    digitBytes,
  );
  const raw = Buffer.allocUnsafe(expected);
  let written = 0;
  let consumedDigits = 0;
  for (let offset = 0; offset < literal.length;) {
    const byte = literal[offset++];
    if (byte !== 0) {
      if (written === expected)
        throw new Error("Digit archive block output is too long.");
      raw[written++] = byte;
      continue;
    }
    let length = 0;
    let scale = 1;
    for (let count = 0; ; count++) {
      if (offset === literal.length || count === 3)
        throw new Error("Digit archive block has an invalid run length.");
      const part = literal[offset++];
      length += (part & 127) * scale;
      scale *= 128;
      if (!(part & 128)) break;
    }
    if (length === 0) {
      if (written === expected)
        throw new Error("Digit archive block output is too long.");
      raw[written++] = 0;
    } else {
      if (
        length < 4 ||
        consumedDigits + length > digitBytes ||
        written + length > expected
      )
        throw new Error("Digit archive block has an inconsistent run.");
      for (let index = consumedDigits; index < consumedDigits + length; index++)
        if (digits[index] < 48 || digits[index] > 57)
          throw new Error("Digit archive block contains a non-digit run.");
      digits.copy(raw, written, consumedDigits, consumedDigits + length);
      written += length;
      consumedDigits += length;
    }
  }
  if (written !== expected || consumedDigits !== digitBytes)
    throw new Error("Digit archive block leaves missing or unused content.");
  return raw;
}
