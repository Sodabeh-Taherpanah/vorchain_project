/**
 * A look at a ZIP container before SheetJS opens it (backlog P1-10): which entries it has (is it
 * an XLSX, an ODS, a DOCX?), how large they claim to be once unpacked (ZIP bomb guard), and
 * whether every entry really unpacks to its declared size and checksum. The last check exists
 * because SheetJS's pure-JS inflater does not bounds-check: some damaged deflate streams make it
 * loop forever instead of throwing. The platform's `DecompressionStream` (zlib in browsers,
 * Workers and Node) rejects them, so SheetJS only ever inflates streams known to be valid.
 */

/** One entry of the central directory. */
export interface ZipEntry {
  readonly name: string;
  /** CRC-32 of the unpacked data, as declared. */
  readonly crc32: number;
  readonly compressedSize: number;
  /** Declared unpacked size; `Infinity` for a ZIP64 size. */
  readonly size: number;
  readonly localHeaderOffset: number;
}

/** Entry names and the sum of their declared unpacked sizes. */
export interface ZipContents {
  readonly names: readonly string[];
  /** `Infinity` if an entry defers its size to a ZIP64 record (never needed for a sane sheet). */
  readonly unpackedBytes: number;
  readonly entries: readonly ZipEntry[];
}

const END_OF_DIRECTORY = 0x06_05_4b_50;
const DIRECTORY_ENTRY = 0x02_01_4b_50;
const LOCAL_HEADER = 0x04_03_4b_50;
const LOCAL_HEADER_LENGTH = 30;
const STORED = 0;
const DEFLATED = 8;
const END_RECORD_LENGTH = 22;
const MAX_COMMENT_LENGTH = 0xff_ff;
const ENTRY_HEADER_LENGTH = 46;
const ZIP64_MARKER = 0xff_ff_ff_ff;

/**
 * Offset of the end-of-central-directory record, searched backwards past a trailing comment.
 * Like SheetJS, the last signature wins, so both read the same directory; a record cut short by
 * the end of the file makes the ZIP unreadable.
 */
function endRecordOffset(view: DataView): number | null {
  const last = view.byteLength - 4;
  const first = Math.max(0, last - END_RECORD_LENGTH - MAX_COMMENT_LENGTH);
  for (let offset = last; offset >= first; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_DIRECTORY) {
      return offset + END_RECORD_LENGTH <= view.byteLength ? offset : null;
    }
  }
  return null;
}

/**
 * Reads the central directory of a ZIP file.
 *
 * @returns `null` if `bytes` is no readable ZIP (no end record, or a directory that points outside
 *   the file): the caller reports a corrupt file.
 */
export function readZipContents(bytes: Uint8Array): ZipContents | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < END_RECORD_LENGTH) return null;
  const end = endRecordOffset(view);
  if (end === null) return null;
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  let unpackedBytes = 0;
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index += 1) {
    if (offset + ENTRY_HEADER_LENGTH > view.byteLength) return null;
    if (view.getUint32(offset, true) !== DIRECTORY_ENTRY) return null;
    const crc32 = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const declared = view.getUint32(offset + 24, true);
    const size = declared === ZIP64_MARKER ? Infinity : declared;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + ENTRY_HEADER_LENGTH;
    if (nameStart + nameLength > view.byteLength) return null;
    entries.push({
      name: decoder.decode(bytes.subarray(nameStart, nameStart + nameLength)),
      crc32,
      compressedSize,
      size,
      localHeaderOffset: view.getUint32(offset + 42, true),
    });
    unpackedBytes += size;
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return { names: entries.map((entry) => entry.name), unpackedBytes, entries };
}

/** Outcome of {@link checkZipData}. */
export type ZipDataCheck = 'ok' | 'corrupt' | 'too-large';

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xed_b8_83_20 ^ (crc >>> 1) : crc >>> 1;
  return crc;
});

function updateCrc32(crc: number, chunk: Uint8Array): number {
  let next = crc;
  for (const byte of chunk) next = (CRC_TABLE[(next ^ byte) & 0xff] ?? 0) ^ (next >>> 8);
  return next;
}

/** Unpacked size and CRC-32 of one entry's data, or why it could not be unpacked. */
async function unpack(
  data: Uint8Array<ArrayBuffer>,
  method: number,
  budget: number,
): Promise<{ readonly size: number; readonly crc32: number } | 'corrupt' | 'too-large'> {
  if (method === STORED) {
    if (data.byteLength > budget) return 'too-large';
    return { size: data.byteLength, crc32: (updateCrc32(~0, data) ^ ~0) >>> 0 };
  }
  if (method !== DEFLATED) return 'corrupt';
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  // The readable side reports every error; these promises would only repeat it, unhandled.
  writer.write(data).catch(() => undefined);
  writer.close().catch(() => undefined);
  // Typed `any` chunks in some lib versions; the stream always yields bytes.
  const reader: ReadableStreamDefaultReader<Uint8Array> = stream.readable.getReader();
  let size = 0;
  let crc = ~0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return { size, crc32: (crc ^ ~0) >>> 0 };
      size += chunk.value.byteLength;
      if (size > budget) {
        await reader.cancel();
        return 'too-large';
      }
      crc = updateCrc32(crc, chunk.value);
    }
  } catch {
    // Invalid deflate data, a stream cut short or trailing bytes after its end.
    return 'corrupt';
  }
}

/**
 * Unpacks every entry the way SheetJS finds it (central directory -> local header -> data) and
 * compares it with the declared size and CRC-32, without keeping the unpacked data.
 *
 * @param maxUnpackedBytes Stops unpacking once the entries together exceed it, whatever sizes
 *   they declare.
 * @returns `corrupt` for damaged or truncated data, a size or checksum that differs from the
 *   directory, or an unknown compression method; `too-large` beyond `maxUnpackedBytes`.
 */
export async function checkZipData(
  bytes: Uint8Array,
  contents: ZipContents,
  maxUnpackedBytes: number,
): Promise<ZipDataCheck> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let unpacked = 0;
  for (const entry of contents.entries) {
    const header = entry.localHeaderOffset;
    if (header + LOCAL_HEADER_LENGTH > view.byteLength) return 'corrupt';
    if (view.getUint32(header, true) !== LOCAL_HEADER) return 'corrupt';
    const method = view.getUint16(header + 8, true);
    const start =
      header +
      LOCAL_HEADER_LENGTH +
      view.getUint16(header + 26, true) +
      view.getUint16(header + 28, true);
    const end = start + entry.compressedSize;
    if (end > view.byteLength) return 'corrupt';
    // `slice` copies, so the stream owns a plain `ArrayBuffer`, whatever backs `bytes`.
    const result = await unpack(bytes.slice(start, end), method, maxUnpackedBytes - unpacked);
    if (typeof result === 'string') return result;
    if (result.size !== entry.size || result.crc32 !== entry.crc32) return 'corrupt';
    unpacked += result.size;
  }
  return 'ok';
}
