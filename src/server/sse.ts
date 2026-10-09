/** Buffer complete SSE records in linear time, including delimiters split by TCP. */
export class SseRecords {
  private parts: Buffer[] = [];
  private size = 0;
  private last = -1;
  constructor(
    private readonly emit: (record: Buffer) => void,
    private readonly limit = 32 * 1024 * 1024,
  ) {}

  push(chunk: Buffer) {
    let start = 0;
    if (this.last === 10 && chunk[0] === 10) {
      this.append(chunk.subarray(0, 1));
      this.flush();
      start = 1;
    }
    for (;;) {
      const end = chunk.indexOf("\n\n", start);
      if (end < 0) break;
      this.append(chunk.subarray(start, end + 2));
      this.flush();
      start = end + 2;
    }
    if (start < chunk.length) this.append(chunk.subarray(start));
  }

  private append(part: Buffer) {
    if (!part.length) return;
    this.size += part.length;
    if (this.size > this.limit)
      throw new Error("Observer record exceeds the permitted size.");
    this.parts.push(part);
    this.last = part[part.length - 1];
  }

  private flush() {
    const record =
      this.parts.length === 1
        ? this.parts[0]
        : Buffer.concat(this.parts, this.size);
    this.parts = [];
    this.size = 0;
    this.last = -1;
    this.emit(record);
  }
}
