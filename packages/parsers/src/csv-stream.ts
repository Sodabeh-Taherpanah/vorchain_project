/**
 * Streaming twin of `readCsv` (backlog V-13a). It reads a file as a sequence of byte chunks and
 * hands the rows on in batches, so neither the whole text, Papa's record array nor a second copy
 * of the rows is ever held. Result and errors equal `readCsv` at every chunk size; a differential
 * test (`csv-stream.test.ts`) pins that.
 *
 * Pure like the rest of the package: no DOM, no I/O of its own. The caller supplies the bytes as a
 * {@link ChunkSource}; the demo's worker wraps a `File`, tests and Node wrap a `Uint8Array`.
 */
import { err, ok, type Result } from '@vorchain/engine';

import { normaliseLineBreaks, parseRecords, quoteError, toNumberedRows } from './csv.ts';
import { classifyNonText, type TextEncoding } from './decode.ts';
import type { DataError } from './errors.ts';
import { SNIFF_SAMPLE_LENGTH, sniffDelimiter, type Delimiter } from './sniff.ts';
import type { RawRow } from './table.ts';

/**
 * A file as a re-openable sequence of byte chunks. It is opened twice: once to find the encoding
 * (UTF-8 or Windows-1252 is only known after the last byte) and once to parse.
 */
export interface ChunkSource {
  readonly name: string;
  readonly size: number;
  /** A new, independent pass over the bytes from the start. */
  open(): AsyncIterable<Uint8Array>;
}

/** A {@link ChunkSource} over bytes in memory, `chunkSize` bytes at a time. */
export function chunkSourceFromBytes(
  name: string,
  bytes: Uint8Array,
  chunkSize = 64 * 1024,
): ChunkSource {
  return {
    name,
    size: bytes.byteLength,
    // eslint-disable-next-line @typescript-eslint/require-await -- an async generator is the contract.
    async *open() {
      for (let at = 0; at < bytes.byteLength; at += chunkSize) {
        yield bytes.subarray(at, at + chunkSize);
      }
    },
  };
}

/** What is known once the header row has been read. */
export interface CsvHead {
  readonly fileName: string;
  readonly headers: readonly string[];
  readonly encoding: TextEncoding;
  readonly delimiter: Delimiter;
}

/** Receives the table piece by piece. `onRows` may be async: the next chunk waits for it. */
export interface CsvRowSink {
  readonly onHead: (head: CsvHead) => void;
  readonly onRows: (rows: readonly RawRow[]) => void | Promise<void>;
}

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const joined = new Uint8Array(a.byteLength + b.byteLength);
  joined.set(a);
  joined.set(b, a.byteLength);
  return joined;
}

/** Drops one leading UTF-8 byte order mark, even if its bytes arrive in different chunks. */
async function* withoutBom(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  let head: Uint8Array = new Uint8Array(0);
  let decided = false;
  for await (const chunk of chunks) {
    if (decided) {
      if (chunk.byteLength > 0) yield chunk;
      continue;
    }
    head = concat(head, chunk);
    if (head.byteLength < UTF8_BOM.length) continue;
    decided = true;
    const hasBom = UTF8_BOM.every((byte, index) => head[index] === byte);
    const rest = hasBom ? head.subarray(UTF8_BOM.length) : head;
    if (rest.byteLength > 0) yield rest;
  }
  if (!decided && head.byteLength > 0) yield head;
}

/**
 * Pass 1: is this text at all, and is it valid UTF-8? Mirrors `detectNonText` + `decodeText`:
 * the verdict needs the first four bytes, any NUL byte, and one strict decode of everything.
 */
async function inspect(source: ChunkSource): Promise<Result<TextEncoding, DataError>> {
  let head: Uint8Array = new Uint8Array(0);
  let hasNul = false;
  for await (const chunk of source.open()) {
    if (head.byteLength < 4) head = concat(head, chunk.subarray(0, 4 - head.byteLength));
    if (!hasNul && chunk.includes(0)) hasNul = true;
  }
  const detected = classifyNonText(head, hasNul);
  if (detected !== null) {
    return err({ code: 'NOT_TEXT', fileName: source.name, params: { detected } });
  }
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  try {
    for await (const chunk of withoutBom(source.open())) decoder.decode(chunk, { stream: true });
    decoder.decode();
    return ok('utf-8');
  } catch (error) {
    // A fatal decoder signals malformed input with a TypeError; anything else is a real bug.
    if (!(error instanceof TypeError)) throw error;
    return ok('windows-1252');
  }
}

/**
 * Text after the last record end that is still incomplete, and where to resume scanning for it.
 * A record ends at a line break outside quotes; a quote opens a quoted cell only at the start of a
 * cell, as in Papa.
 */
class RecordScanner {
  private position = 0;
  private inQuotes = false;
  private atCellStart = true;
  /** Set when a quoted cell is closed by something odd; see {@link feed}. */
  private unsplittable = false;

  constructor(private readonly delimiter: Delimiter) {}

  /**
   * Index of the last line break in `text` that ends a record, or -1. `final` lets a quote at the
   * very end count as closing. After a malformed quote the scanner stops splitting: Papa's
   * recovery from it is not worth copying, so the rest is parsed in one piece, exactly like
   * `readCsv`, and the error comes out the same.
   */
  lastRecordEnd(text: string, final: boolean): number {
    let boundary = -1;
    let index = this.position;
    while (index < text.length && !this.unsplittable) {
      const char = text.charAt(index);
      if (this.inQuotes) {
        if (char === '"') {
          if (index + 1 >= text.length && !final) break; // `""` or a closing quote: need one more char
          const next = text.charAt(index + 1);
          if (next === '"') {
            index += 2;
            continue;
          }
          this.inQuotes = false;
          this.atCellStart = false;
          const closes = next === '' || next === this.delimiter || next === '\n';
          if (!closes) this.unsplittable = true;
        }
        index += 1;
        continue;
      }
      if (char === '\n') {
        boundary = index;
        this.atCellStart = true;
      } else if (char === this.delimiter) {
        this.atCellStart = true;
      } else if (char === '"' && this.atCellStart) {
        this.inQuotes = true;
        this.atCellStart = false;
      } else {
        this.atCellStart = false;
      }
      index += 1;
    }
    this.position = index;
    return this.unsplittable ? -1 : boundary;
  }

  /** The scanned text shrank by `length` characters at its start. */
  consumed(length: number): void {
    this.position -= length;
  }
}

/**
 * Reads a CSV file from chunks into `sink` (backlog V-13a). Same decisions as `readCsv`: encoding
 * (UTF-8, UTF-8 BOM, Windows-1252), delimiter from the first 4096 characters, one line-break
 * style, physical line numbers, blank records dropped, first non-blank record is the header.
 *
 * `onHead` is called once, then `onRows` once per batch of data rows. On an error some rows may
 * already have been delivered; the caller discards them.
 *
 * @returns the header facts, or `NOT_TEXT`, `EMPTY_FILE`, `UNCLOSED_QUOTE`, `MALFORMED_QUOTE`.
 */
export async function streamCsv(
  source: ChunkSource,
  sink: CsvRowSink,
): Promise<Result<CsvHead, DataError>> {
  const fileName = source.name;
  const inspected = await inspect(source);
  if (!inspected.ok) return inspected;
  const encoding = inspected.value;

  const decoder =
    encoding === 'utf-8'
      ? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
      : new TextDecoder('windows-1252');
  // `decodeText` strips a BOM on both paths (Windows-1252 included), so both are skipped here.
  const chunks = withoutBom(source.open());

  /** Set once the first 4096 characters (or the whole file) decided the delimiter. */
  interface Session {
    readonly delimiter: Delimiter;
    readonly scanner: RecordScanner;
  }
  const state: { head: CsvHead | null; session: Session | null; buffer: string; line: number } = {
    head: null,
    session: null,
    buffer: '',
    line: 1,
  };
  let heldReturn = ''; // a trailing "\r" may be the first half of "\r\n"

  /** Parses complete records, numbering lines from `state.line`; delivers rows or returns an error. */
  const deliver = async (text: string, delimiter: Delimiter): Promise<DataError | null> => {
    // Papa returns no record for '' but a blank line is a record that occupies a line.
    if (text === '') {
      state.line += 1;
      return null;
    }
    const parsed = parseRecords(text, delimiter);
    const broken = quoteError(fileName, text, parsed.errors, state.line);
    if (broken !== null) return broken;
    const numbered = toNumberedRows(parsed.data, state.line);
    state.line = numbered.nextLine;
    let { rows } = numbered;
    if (state.head === null) {
      const [first, ...rest] = rows;
      if (first === undefined) return null;
      state.head = { fileName, headers: first.cells, encoding, delimiter };
      sink.onHead(state.head);
      rows = rest;
    }
    if (rows.length > 0) await sink.onRows(rows);
    return null;
  };

  const drain = async (final: boolean): Promise<DataError | null> => {
    if (state.session === null) {
      if (!final && state.buffer.length <= SNIFF_SAMPLE_LENGTH) return null;
      const delimiter = sniffDelimiter(state.buffer);
      state.session = { delimiter, scanner: new RecordScanner(delimiter) };
    }
    const { delimiter, scanner } = state.session;
    const end = scanner.lastRecordEnd(state.buffer, final);
    if (end !== -1) {
      const complete = state.buffer.slice(0, end);
      state.buffer = state.buffer.slice(end + 1);
      scanner.consumed(end + 1);
      const failed = await deliver(complete, delimiter);
      if (failed !== null) return failed;
    }
    if (final && state.buffer !== '') {
      const rest = state.buffer;
      state.buffer = '';
      return deliver(rest, delimiter);
    }
    return null;
  };

  for await (const chunk of chunks) {
    const text = heldReturn + decoder.decode(chunk, { stream: true });
    const cut = text.endsWith('\r');
    heldReturn = cut ? '\r' : '';
    state.buffer += normaliseLineBreaks(cut ? text.slice(0, -1) : text);
    const failed = await drain(false);
    if (failed !== null) return err(failed);
  }
  state.buffer += normaliseLineBreaks(heldReturn + decoder.decode());
  const failed = await drain(true);
  if (failed !== null) return err(failed);
  return state.head === null ? err({ code: 'EMPTY_FILE', fileName, params: {} }) : ok(state.head);
}
