import { err, ok, type Result } from '@vorchain/engine';
import Papa, { type ParseError } from 'papaparse';

import { decodeText, detectNonText } from './decode.ts';
import type { DataError } from './errors.ts';
import { sniffDelimiter } from './sniff.ts';
import { stripPython } from './strip.ts';
import type { CsvTable, RawRow, SourceFile } from './table.ts';

/** A CSV record: Papa only yields text cells. */
interface TextRow extends RawRow {
  readonly cells: readonly string[];
}

const LINE_BREAK = /\r\n?/g;

/** One line-break style for Papa and for line counting (Python `splitlines` accepts all three). */
function normaliseLineBreaks(text: string): string {
  return text.replace(LINE_BREAK, '\n');
}

function countLineBreaks(text: string): number {
  let count = 0;
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    count += 1;
  }
  return count;
}

/** Line breaks a record spans: its terminator plus those inside quoted cells. */
function linesSpanned(cells: readonly string[]): number {
  return cells.reduce((sum, cell) => sum + countLineBreaks(cell), 1);
}

function isBlank(cells: readonly string[]): boolean {
  return cells.every((cell) => cell === '');
}

/** The first quote problem Papa reports, as a `DataError` pointing at the physical line. */
function quoteError(
  fileName: string,
  text: string,
  errors: readonly ParseError[],
): DataError | null {
  const first = errors.find((error) => error.type === 'Quotes');
  if (first === undefined) return null;
  const row = countLineBreaks(text.slice(0, first.index ?? 0)) + 1;
  const code = first.code === 'MissingQuotes' ? 'UNCLOSED_QUOTE' : 'MALFORMED_QUOTE';
  return { code, fileName, row, params: {} };
}

/** Numbers records by physical line, strips cells and drops blank records. */
function toNumberedRows(records: readonly (readonly string[])[]): TextRow[] {
  const rows: TextRow[] = [];
  let line = 1;
  for (const record of records) {
    const cells = record.map(stripPython);
    if (!isBlank(cells)) rows.push({ rowNumber: line, cells });
    line += linesSpanned(record);
  }
  return rows;
}

/**
 * Reads a CSV export into a `RawTable` (backlog P1-07): decode (UTF-8, UTF-8 BOM, Windows-1252),
 * sniff `;` / `,` / tab like the prototype, split records with papaparse (quoted fields, `""`
 * escapes, line breaks inside quotes), skip blank lines while keeping physical line numbers.
 *
 * Pure and synchronous: no I/O, no logging; errors carry codes, the file name and a line number,
 * never cell contents.
 *
 * @returns `EMPTY_FILE` if there is no non-blank line, `NOT_TEXT` for binary or UTF-16 content,
 *   `UNCLOSED_QUOTE` / `MALFORMED_QUOTE` for broken quoting. A header-only file is a table with
 *   zero rows, not an error.
 */
export function readCsv(file: SourceFile): Result<CsvTable, DataError> {
  const fileName = file.name;
  const nonText = detectNonText(file.bytes);
  if (nonText !== null) return err({ code: 'NOT_TEXT', fileName, params: { detected: nonText } });

  const { text: decoded, encoding } = decodeText(file.bytes);
  const text = normaliseLineBreaks(decoded);
  const delimiter = sniffDelimiter(text);
  const parsed = Papa.parse(text, {
    delimiter,
    newline: '\n',
    quoteChar: '"',
    escapeChar: '"',
    header: false,
    skipEmptyLines: false,
    dynamicTyping: false,
  });
  const broken = quoteError(fileName, text, parsed.errors);
  if (broken !== null) return err(broken);

  const [header, ...rows] = toNumberedRows(parsed.data);
  if (header === undefined) return err({ code: 'EMPTY_FILE', fileName, params: {} });
  return ok({ format: 'csv', fileName, headers: header.cells, rows, encoding, delimiter });
}
