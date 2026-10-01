import type { Action, IsoDate, Reason, Severity, ShortageException } from '@vorchain/engine';
import type { Locale } from 'next-intl';

import { distinctReasons } from './exception-table.tsx';

/** A cell: text is guarded against formulas, numbers are written in the locale's format. */
export type CsvCell = string | number;

/** Excel's CSV default: `;` where the decimal separator is a comma (de), `,` otherwise (en). */
export function csvSeparator(locale: Locale): ';' | ',' {
  return locale === 'de' ? ';' : ',';
}

// `\t` and `\r` are on the list too: spreadsheet apps strip leading whitespace before they look
// for a formula (OWASP "CSV Injection").
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Text from the user's files (material IDs, descriptions, supplier names) must not run as a formula
 * when the export is opened in a spreadsheet: a leading apostrophe makes the cell plain text.
 */
export function guardFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** RFC 4180: quote a field with the separator, a quote or a line break; double inner quotes. */
function quote(value: string, separator: string): string {
  return value.includes(separator) || /["\r\n]/.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

/**
 * Numbers come from the engine, never from text, so they are not guarded: a negative stock stays a
 * number in the spreadsheet. No grouping, so `1.234` cannot be read as a decimal.
 */
function formatCell(cell: CsvCell, locale: Locale): string {
  return typeof cell === 'number'
    ? new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 }).format(cell)
    : guardFormula(cell);
}

/** Byte order mark: tells Excel the file is UTF-8 (umlauts in headers and names). */
const BOM = String.fromCharCode(0xfeff);

/** CSV text with a UTF-8 BOM (so Excel detects the encoding) and CRLF line endings. */
export function toCsv(rows: readonly (readonly CsvCell[])[], locale: Locale): string {
  const separator = csvSeparator(locale);
  const lines = rows.map((row) =>
    row.map((cell) => quote(formatCell(cell, locale), separator)).join(separator),
  );
  return `${BOM}${lines.map((line) => `${line}\r\n`).join('')}`;
}

/** Named after the analysis date, not the clock, so the same analysis gives the same file. */
export function csvFileName(asOf: IsoDate): string {
  return `vorchain-engpaesse-${asOf}.csv`;
}

/** Localized text for the export; the component builds it from the report's messages. */
export interface ExceptionCsvText {
  readonly headers: readonly string[];
  readonly severity: (severity: Severity) => string;
  readonly date: (date: IsoDate) => string;
  readonly hidden: (hidden: boolean) => string;
  readonly reason: (reason: Reason) => string;
  readonly action: (action: Action) => string;
}

/** The header row plus one row per exception, in ranking order, with the sentences as text. */
export function exceptionCsvRows(
  exceptions: readonly ShortageException[],
  text: ExceptionCsvText,
): CsvCell[][] {
  return [
    [...text.headers],
    ...exceptions.map((exception) => [
      text.severity(exception.severity),
      exception.materialId,
      exception.description,
      text.date(exception.criticalDate),
      exception.daysUntil,
      exception.minProjectedStock,
      text.hidden(exception.hidden),
      distinctReasons(exception.reasons)
        .map(({ reason }) => text.reason(reason))
        .join('\n'),
      exception.actions.map((action) => text.action(action)).join('\n'),
    ]),
  ];
}

/**
 * Saves text as a file entirely in the browser: a Blob behind a temporary object URL, so the
 * content never leaves the device (AGENTS.md §2.1).
 */
export function downloadFile(content: string, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking in the same task can cancel the download in some browsers.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
