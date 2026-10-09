import { constants as bufferLimits, isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import { constants, zstdCompressSync, zstdDecompressSync } from "node:zlib";

export interface EncodedRegion {
  encoding: "json" | "zstd-frame-1";
  rawBytes: number;
  payload: string | Uint8Array;
  payloadChecksum: string | null;
}

const hash = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/** Only storage bytes change. Numbers, key order and UTF-8 remain exact. */
export function encodeRegion(json: string): EncodedRegion {
  const raw = Buffer.from(json);
  const packed = zstdCompressSync(raw, {
    pledgedSrcSize: raw.length,
    params: {
      [constants.ZSTD_c_compressionLevel]: 1,
      [constants.ZSTD_c_windowLog]: 19,
      [constants.ZSTD_c_checksumFlag]: 1,
    },
  });
  if (packed.length >= raw.length)
    return {
      encoding: "json",
      rawBytes: raw.length,
      payload: json,
      payloadChecksum: null,
    };
  return {
    encoding: "zstd-frame-1",
    rawBytes: raw.length,
    payload: packed,
    payloadChecksum: hash(packed),
  };
}

/**
 * The native convenience decoder can accept a missing frame trailer or stop
 * after one frame. Require exactly one complete, dictionary-free frame with
 * pledged content size and checksum before invoking it. This codec's encoder
 * always writes that form, with at most a 512 KiB decoding window.
 */
function completeFrame(bytes: Buffer, rawBytes: number): void {
  if (bytes.length < 10 || bytes.readUInt32LE(0) !== 0xfd2fb528)
    throw new Error("Region payload is not a Zstandard frame.");
  const descriptor = bytes[4];
  // No dictionary, reserved/unused bits, or omitted content checksum.
  if ((descriptor & 0x1f) !== 4)
    throw new Error("Region frame header is incompatible.");
  const single = Boolean(descriptor & 0x20);
  let offset = 5;
  if (!single) {
    const window = bytes[offset++];
    const base = 2 ** (10 + (window >>> 3));
    if (base + (base / 8) * (window & 7) > 2 ** 19)
      throw new Error("Region frame exceeds the decoding window.");
  }
  const flag = descriptor >>> 6;
  const sizeBytes = flag === 0 ? (single ? 1 : 0) : 2 ** flag;
  if (!sizeBytes || offset + sizeBytes > bytes.length)
    throw new Error("Region frame omits its content size.");
  const size =
    sizeBytes === 8
      ? Number(bytes.readBigUInt64LE(offset))
      : bytes.readUIntLE(offset, sizeBytes) + (sizeBytes === 2 ? 256 : 0);
  if (size !== rawBytes || (single && size > 2 ** 19))
    throw new Error("Region frame content size is inconsistent.");
  offset += sizeBytes;
  for (;;) {
    if (offset + 3 > bytes.length)
      throw new Error("Region frame has an incomplete block header.");
    const header = bytes.readUIntLE(offset, 3);
    offset += 3;
    const kind = (header >>> 1) & 3;
    const size = header >>> 3;
    if (kind === 3 || size > 128 * 1024)
      throw new Error("Region frame block is incompatible.");
    offset += kind === 1 ? 1 : size;
    if (offset > bytes.length)
      throw new Error("Region frame has an incomplete block.");
    if (header & 1) break;
  }
  if (offset + 4 !== bytes.length)
    throw new Error("Region frame is truncated or has trailing data.");
}

export function decodeRegion(region: EncodedRegion, checksum: string): string {
  if (
    !Number.isSafeInteger(region.rawBytes) ||
    region.rawBytes < 0 ||
    region.rawBytes > bufferLimits.MAX_STRING_LENGTH
  )
    throw new Error("Region content length is invalid.");
  let bytes: Buffer;
  if (region.encoding === "json") {
    if (typeof region.payload !== "string" || region.payloadChecksum !== null)
      throw new Error("Plaintext region encoding is inconsistent.");
    bytes = Buffer.from(region.payload);
  } else if (region.encoding === "zstd-frame-1") {
    if (
      !(region.payload instanceof Uint8Array) ||
      hash(region.payload) !== region.payloadChecksum
    )
      throw new Error("Compressed region payload checksum mismatch.");
    const packed = Buffer.from(
      region.payload.buffer,
      region.payload.byteOffset,
      region.payload.byteLength,
    );
    completeFrame(packed, region.rawBytes);
    bytes = zstdDecompressSync(packed, {
      maxOutputLength: region.rawBytes,
      params: { [constants.ZSTD_d_windowLogMax]: 19 },
    });
  } else {
    throw new Error("Unsupported region encoding; preserve the database.");
  }
  if (bytes.length !== region.rawBytes || hash(bytes) !== checksum)
    throw new Error("Original region checksum or byte length mismatch.");
  if (!isUtf8(bytes)) throw new Error("Region content is not valid UTF-8.");
  return bytes.toString("utf8");
}
