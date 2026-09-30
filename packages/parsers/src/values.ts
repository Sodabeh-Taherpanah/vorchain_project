/**
 * Cell values in German or English notation -> numbers and {@link IsoDate}s, ports of
 * `loaders.py` `parse_number` and `parse_date` (spec §5.1). Parity with the prototype is checked
 * on recorded vectors in `test/python-values.test.ts`.
 *
 * Deliberate deviations from the prototype (each pinned by a test):
 *  - `NaN`, `inf`, `Infinity` and overflowing values such as `1e400` are rejected with
 *    `INVALID_NUMBER`; Python `float()` accepts them and they would poison every sum downstream.
 *  - Only ASCII digits are accepted. Python also accepts other Unicode digits (`١٢`, `１２`),
 *    which no ERP export we target produces.
 */
import { err, isoDateFromParts, ok, type IsoDate, type Result } from '@vorchain/engine';

import type { DataError } from './errors.ts';
import { PYTHON_WHITESPACE, stripPython } from './strip.ts';

/**
 * Python `float()` syntax for finite decimals (ASCII digits only): optional sign, digits with
 * single `_` between them, optional fraction and exponent. The special words are left out on
 * purpose (see the module comment).
 */
const DIGITS = String.raw`\d(?:_?\d)*`;
const PYTHON_FLOAT = new RegExp(
  String.raw`^[+-]?(?:${DIGITS}(?:\.(?:${DIGITS})?)?|\.${DIGITS})(?:[eE][+-]?${DIGITS})?$`,
  'u',
);

/**
 * Parses a number cell like the prototype: empty -> 0; spaces and no-break spaces are removed;
 * if both `,` and `.` occur, the one further right is the decimal separator (`1.234,5` and
 * `1,234.5` -> 1234.5); a lone `,` is a decimal comma (`12,5` -> 12.5).
 *
 * Known quirk kept for parity (open question Q3): a lone separator is always decimal, so `1.234`
 * and `1,234` parse as 1.234, not 1234.
 *
 * Finite numbers (e.g. XLSX cells) pass through unchanged.
 */
export function parseNumber(value: string | number): Result<number, DataError> {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? ok(value) : invalidNumber(String(value));
  }
  if (value === '') return ok(0);
  // `float()` strips again after the separators are normalised, so strip twice like Python does.
  const text = stripPython(normaliseSeparators(stripPython(value).replace(/[ \u00a0]/gu, '')));
  if (!PYTHON_FLOAT.test(text)) return invalidNumber(value);
  const number = Number(text.replaceAll('_', ''));
  return Number.isFinite(number) ? ok(number) : invalidNumber(value);
}

function normaliseSeparators(text: string): string {
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma === -1) return text;
  if (lastDot === -1) return text.replaceAll(',', '.');
  return lastComma > lastDot
    ? text.replaceAll('.', '').replaceAll(',', '.')
    : text.replaceAll(',', '');
}

function invalidNumber(value: string): Result<never, DataError> {
  return err({ code: 'INVALID_NUMBER', params: { value } });
}

/**
 * CPython 3.12 `_strptime` field patterns (`TimeRE`), restricted to ASCII digits. The order of the
 * alternatives matters: like Python, the first alternative that lets the pattern match wins, and
 * the match must then cover the whole text.
 */
const FIELD = {
  d: '(?<d>3[01]|[12]\\d|0[1-9]|[1-9]| [1-9])',
  m: '(?<m>1[0-2]|0[1-9]|[1-9])',
  Y: '(?<Y>\\d{4})',
  y: '(?<y>\\d\\d)',
  H: '(?<H>2[0-3]|[01]\\d|\\d)',
  M: '(?<M>[0-5]\\d|\\d)',
  S: '(?<S>6[01]|[0-5]\\d|\\d)',
} as const;

/** `strptime` turns each whitespace run in a format into `\s+`. */
const GAP = `[${PYTHON_WHITESPACE}]+`;
const { d, m, Y, y, H, M, S } = FIELD;

/** The prototype's formats, in its order. */
const DATE_FORMATS: readonly RegExp[] = [
  `${Y}-${m}-${d}`, // %Y-%m-%d
  `${d}\\.${m}\\.${Y}`, // %d.%m.%Y
  `${d}\\.${m}\\.${y}`, // %d.%m.%y
  `${d}/${m}/${Y}`, // %d/%m/%Y
  `${Y}-${m}-${d}${GAP}${H}:${M}:${S}`, // %Y-%m-%d %H:%M:%S
  `${d}\\.${m}\\.${Y}${GAP}${H}:${M}`, // %d.%m.%Y %H:%M
].map((pattern) => new RegExp(`^${pattern}`, 'u'));

/**
 * Parses a date cell like the prototype: empty -> `null`; otherwise the first of `YYYY-MM-DD`,
 * `DD.MM.YYYY`, `DD.MM.YY`, `DD/MM/YYYY`, `YYYY-MM-DD HH:MM:SS`, `DD.MM.YYYY HH:MM` that fits
 * (surrounding whitespace ignored, the time of day dropped). Two-digit years use Python's pivot:
 * 69..99 -> 19xx, 00..68 -> 20xx. Impossible days (`31.02.2026`) fail with `INVALID_DATE`.
 *
 * @example `parseDate('05.10.2026')` -> `ok('2026-10-05')`
 */
export function parseDate(value: string): Result<IsoDate | null, DataError> {
  if (value === '') return ok(null);
  const text = stripPython(value);
  for (const format of DATE_FORMATS) {
    const date = dateFromMatch(format.exec(text), text.length);
    if (date !== undefined) return ok(date);
  }
  return err({ code: 'INVALID_DATE', params: { value } });
}

/** Mirrors `strptime` + `datetime(...)`: whole-text match, then a real calendar day and time. */
function dateFromMatch(match: RegExpExecArray | null, length: number): IsoDate | undefined {
  const fields = match?.groups;
  if (match === null || fields === undefined || match[0].length !== length) return undefined;
  // `datetime` rejects the leap seconds 60 and 61 that the `%S` pattern lets through.
  if (fields.S !== undefined && Number(fields.S) > 59) return undefined;
  const date = isoDateFromParts(yearOf(fields), Number(fields.m), Number(fields.d));
  return date.ok ? date.value : undefined;
}

function yearOf(fields: Readonly<Record<string, string | undefined>>): number {
  if (fields.Y !== undefined) return Number(fields.Y);
  const short = Number(fields.y);
  return short <= 68 ? 2000 + short : 1900 + short;
}
