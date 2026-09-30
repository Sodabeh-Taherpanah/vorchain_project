/**
 * Delimiter sniffing for CSV exports (spec §5.1), ported from the prototype: `loaders.py` calls
 * `csv.Sniffer().sniff(text[:4096], delimiters=";,\t")` and, when that fails, falls back to `;` if
 * the sample has more `;` than `,`, else `,`.
 *
 * `consistentDelimiter` ports CPython's `Sniffer._guess_delimiter` (Lib/csv.py) for our three
 * candidates, quirks included, so the TS parser picks the same delimiter as the prototype. The
 * Python vector test (`test/python-sniff.test.ts`) checks this on random samples. Deliberate
 * differences, all for files the prototype misreads or reads by luck:
 * - Delimiters inside quoted fields are not counted (a quoted `"Weber, Elektronik"` is one field).
 *   CPython instead tries a regex over quotes first (`_guess_quote_and_delimiter`).
 * - A record cut off by the 4096-character limit is ignored, so wide tab-separated exports are not
 *   misread as `,`.
 * - `\r\n` and `\r` end a line like `\n`, so blank CRLF lines are ignored like blank LF lines.
 */

/** Field delimiters the parsers accept. */
export type Delimiter = ';' | ',' | '\t';

/** Number of characters inspected, as in the prototype (`text[:4096]`). */
export const SNIFF_SAMPLE_LENGTH = 4096;

/** `csv.Sniffer.preferred` restricted to our candidates: breaks ties between consistent ones. */
const PREFERRED: readonly Delimiter[] = [',', '\t', ';'];
/** CPython analyses lines in chunks of ten and stops at the first chunk with a unique winner. */
const CHUNK_LINES = 10;
/** CPython lowers the required consistency from 100 % in steps of 1 % down to 90 %. */
const CONSISTENCY_THRESHOLD = 0.9;
const CONSISTENCY_STEP = 0.01;

type DelimiterCounts = Record<Delimiter, number>;

const noCounts = (): DelimiterCounts => ({ ';': 0, ',': 0, '\t': 0 });

function isDelimiter(char: string): char is Delimiter {
  return char === ';' || char === ',' || char === '\t';
}

interface ScannedRecord {
  readonly counts: DelimiterCounts;
  readonly isEmpty: boolean;
}

/**
 * Splits `sample` into records and counts the delimiters outside quoted fields. A quote opens a
 * quoted field only at the start of a field (after a line break or any candidate delimiter), as in
 * CSV; `""` inside a quoted field is an escaped quote.
 */
function scanRecords(sample: string): ScannedRecord[] {
  const records: ScannedRecord[] = [];
  let counts = noCounts();
  let length = 0;
  let inQuotes = false;
  let atFieldStart = true;
  for (let index = 0; index < sample.length; index += 1) {
    const char = sample.charAt(index);
    if (inQuotes) {
      length += 1;
      if (char !== '"') continue;
      if (sample.charAt(index + 1) === '"') index += 1;
      else inQuotes = false;
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && sample.charAt(index + 1) === '\n') index += 1;
      records.push({ counts, isEmpty: length === 0 });
      counts = noCounts();
      length = 0;
      atFieldStart = true;
      continue;
    }
    length += 1;
    if (char === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
    } else if (isDelimiter(char)) {
      counts[char] += 1;
      atFieldStart = true;
    } else {
      atFieldStart = false;
    }
  }
  records.push({ counts, isEmpty: length === 0 });
  return records;
}

/** Delimiter counts of the non-empty, complete records in the first 4096 characters. */
function sampleLines(text: string): DelimiterCounts[] {
  const records = scanRecords(text.slice(0, SNIFF_SAMPLE_LENGTH));
  // The piece after the last line break is cut off when the text goes on (keep a lone record).
  if (text.length > SNIFF_SAMPLE_LENGTH && records.length > 1) records.pop();
  return records.filter((record) => !record.isEmpty).map((record) => record.counts);
}

/**
 * CPython's "mode" of a frequency table (count -> number of lines), including its quirk: the
 * mode's line number minus the line numbers of all other counts. Ties go to the count seen first.
 */
function adjustedMode(table: ReadonlyMap<number, number>): { count: number; lines: number } | null {
  let mode: { count: number; lines: number } | null = null;
  let totalLines = 0;
  for (const [count, lines] of table) {
    totalLines += lines;
    if (mode === null || lines > mode.lines) mode = { count, lines };
  }
  if (mode === null || (table.size === 1 && mode.count === 0)) return null;
  return { count: mode.count, lines: mode.lines - (totalLines - mode.lines) };
}

/** Candidates whose mode is present in at least `consistency` of `total` lines (adjusted). */
function consistentCandidates(
  tables: ReadonlyMap<Delimiter, ReadonlyMap<number, number>>,
  total: number,
): Set<Delimiter> {
  const found = new Set<Delimiter>();
  // Float steps exactly as CPython (`consistency -= 0.01`), so borderline samples agree.
  for (
    let consistency = 1;
    found.size === 0 && consistency >= CONSISTENCY_THRESHOLD;
    consistency -= CONSISTENCY_STEP
  ) {
    for (const [delimiter, table] of tables) {
      const mode = adjustedMode(table);
      if (mode !== null && mode.count > 0 && mode.lines > 0 && mode.lines / total >= consistency) {
        found.add(delimiter);
      }
    }
  }
  return found;
}

/** Port of `csv.Sniffer._guess_delimiter`; `null` when no candidate is consistent. */
function consistentDelimiter(lines: readonly DelimiterCounts[]): Delimiter | null {
  const chunkLength = Math.min(CHUNK_LINES, lines.length);
  const tables = new Map<Delimiter, Map<number, number>>(
    PREFERRED.map((delimiter) => [delimiter, new Map()]),
  );
  let found = new Set<Delimiter>();
  for (let start = 0, iteration = 1; start < lines.length; start += chunkLength, iteration += 1) {
    for (const line of lines.slice(start, start + chunkLength)) {
      for (const [delimiter, table] of tables) {
        table.set(line[delimiter], (table.get(line[delimiter]) ?? 0) + 1);
      }
    }
    // CPython only searches again while nothing was found; two or more candidates stay final.
    if (found.size === 0) {
      found = consistentCandidates(tables, Math.min(chunkLength * iteration, lines.length));
    }
    if (found.size === 1) return [...found][0] ?? null;
  }
  return PREFERRED.find((delimiter) => found.has(delimiter)) ?? null;
}

/** The prototype's fallback: `;` if the sample has more `;` than `,`, else `,`. */
function fallbackDelimiter(lines: readonly DelimiterCounts[]): Delimiter {
  const total = (delimiter: Delimiter): number =>
    lines.reduce((sum, line) => sum + line[delimiter], 0);
  return total(';') > total(',') ? ';' : ',';
}

/**
 * Picks the field delimiter (`;`, `,` or tab) of a CSV text from its first 4096 characters, like
 * the prototype. Always returns a delimiter: a single-column file falls back to `,`.
 *
 * @example `sniffDelimiter('Artikel;Bestand\nM1;15,0')` -> `';'`
 */
export function sniffDelimiter(text: string): Delimiter {
  const lines = sampleLines(text);
  return consistentDelimiter(lines) ?? fallbackDelimiter(lines);
}
