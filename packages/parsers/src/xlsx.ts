/**
 * XLSX workbooks -> `RawTable` with SheetJS (backlog P1-10), mirroring the prototype's
 * `_read_xlsx_rows` (openpyxl, `data_only=True`): first worksheet, cached formula values, blank
 * rows skipped. SheetJS only ever sees the bytes it is given (`type: 'array'`): no file system,
 * no network.
 *
 * Known limit: SheetJS's pure-JS inflater does not bounds-check, so some damaged *compressed*
 * entries make `read` loop forever instead of throwing. The caller must run this in a Worker it
 * can terminate after a time limit (P1-15).
 */
import { err, isoDateFromParts, ok, type Result } from '@vorchain/engine';
import {
  read,
  utils,
  type CellObject,
  type ParsingOptions,
  type WorkBook,
  type WorkSheet,
} from 'xlsx';

import { startsWith, toUint8Array, ZIP_SIGNATURE } from './decode.ts';
import type { DataError } from './errors.ts';
import { stripPython } from './strip.ts';
import type { DateSystem, RawCell, RawRow, SourceFile, XlsxTable } from './table.ts';
import { readZipContents } from './zip.ts';

/** Safety limits against ZIP bombs and sheets too large for the browser tab. */
export interface XlsxLimits {
  /** Sum of the declared unpacked sizes of all ZIP entries. */
  readonly unpackedBytes: number;
  /** Rows of the first worksheet, counted up to its last used row. */
  readonly rows: number;
}

/** 256 MiB of XML holds far more than the 100 000 demand rows the demo is sized for (spec §4.2). */
export const XLSX_LIMITS: XlsxLimits = { unpackedBytes: 256 * 1024 * 1024, rows: 500_000 };

/** OLE2 compound file: legacy `.xls`, or an encrypted (password-protected) `.xlsx`. */
const COMPOUND_FILE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;
/** Stream name every encrypted OOXML package has, as UTF-16LE in the compound file directory. */
const ENCRYPTION_INFO = Array.from('EncryptionInfo', (char) => [char.charCodeAt(0), 0]).flat();
const WORKBOOK_PART = 'xl/workbook.xml';

/** File name extension, lower case, without the dot (`''` if there is none). */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Whether the bytes are a ZIP or OLE2 container, i.e. a workbook rather than a text file. */
export function isWorkbookContainer(bytes: Uint8Array): boolean {
  return startsWith(bytes, ZIP_SIGNATURE) || startsWith(bytes, COMPOUND_FILE_SIGNATURE);
}

function containsSequence(bytes: Uint8Array, sequence: readonly number[]): boolean {
  const [first] = sequence;
  for (let at = bytes.indexOf(first ?? 0); at !== -1; at = bytes.indexOf(first ?? 0, at + 1)) {
    if (sequence.every((value, offset) => bytes[at + offset] === value)) return true;
  }
  return false;
}

/** Container checks before SheetJS runs: right format, not encrypted, not a ZIP bomb. */
function containerError(bytes: Uint8Array, name: string, limits: XlsxLimits): DataError | null {
  const unsupported: DataError = {
    code: 'UNSUPPORTED_FILE_TYPE',
    params: { extension: extensionOf(name) },
  };
  if (startsWith(bytes, COMPOUND_FILE_SIGNATURE)) {
    return containsSequence(bytes, ENCRYPTION_INFO)
      ? { code: 'PASSWORD_PROTECTED', params: {} }
      : unsupported;
  }
  if (!startsWith(bytes, ZIP_SIGNATURE)) return unsupported;
  const contents = readZipContents(bytes);
  if (contents === null) return { code: 'CORRUPT_FILE', params: {} };
  // `.ods`, `.numbers`, `.docx` and `.xlsb` are ZIPs too, but without this part.
  if (!contents.names.includes(WORKBOOK_PART)) return unsupported;
  if (contents.unpackedBytes > limits.unpackedBytes) {
    return {
      code: 'FILE_TOO_LARGE',
      params: { limit: limits.unpackedBytes, unit: 'unpackedBytes' },
    };
  }
  return null;
}

function parsingOptions(limits: XlsxLimits): ParsingOptions {
  return {
    type: 'array',
    sheets: 0,
    // One row more than allowed, so an oversized sheet is detected without reading all of it.
    sheetRows: limits.rows + 1,
    dense: true,
    // SheetJS 0.20 builds date cells whose UTC fields hold the calendar day shown in Excel, in
    // every time zone (pinned by `test/xlsx-time-zones.test.ts`).
    cellDates: true,
    cellFormula: false,
    cellHTML: false,
    cellText: false,
    cellStyles: false,
    bookVBA: false,
  };
}

function lastRowNumber(sheet: WorkSheet): number {
  // SheetJS sets `!fullref` (typed `any`) when `sheetRows` cut the sheet short.
  const full: unknown = sheet['!fullref'];
  const range = typeof full === 'string' ? full : sheet['!ref'];
  return range === undefined ? 0 : utils.decode_range(range).e.r + 1;
}

/** The calendar day of a SheetJS date cell, as `YYYY-MM-DD` text like a CSV date. */
function dayOf(date: Date): string {
  const day = isoDateFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  return day.ok ? day.value : String(date);
}

function cellValue(cell: CellObject | undefined): RawCell {
  const value = cell?.v;
  if (value instanceof Date) return dayOf(value);
  // Error cells (`#N/A`) as Excel shows them, like openpyxl's `data_only` text.
  if (cell?.t === 'e') return utils.format_cell(cell);
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return typeof value === 'string' ? stripPython(value) : '';
}

function numberedRows(sheet: WorkSheet): RawRow[] {
  const data: readonly (readonly (CellObject | undefined)[] | undefined)[] = sheet['!data'] ?? [];
  const rows: RawRow[] = [];
  data.forEach((row, index) => {
    // `Array.from` visits the holes of SheetJS's sparse dense-mode rows as `undefined`.
    const cells = Array.from(row ?? [], cellValue);
    if (cells.some((cell) => cell !== '')) rows.push({ rowNumber: index + 1, cells });
  });
  return rows;
}

/**
 * Reads the first worksheet of an XLSX (or XLSM) workbook into a `RawTable`. Text cells are
 * stripped; number cells stay numbers; date cells become `YYYY-MM-DD` text, independent of the
 * machine's time zone; formulas give their cached values. Row numbers are the sheet's own.
 *
 * @returns `UNSUPPORTED_FILE_TYPE` for anything but an XLSX package (`.xls`, `.ods`, text …),
 *   `PASSWORD_PROTECTED`, `CORRUPT_FILE`, `FILE_TOO_LARGE` beyond `limits`, `EMPTY_FILE` for a
 *   sheet without a non-blank row.
 */
export function readXlsx(
  file: SourceFile,
  limits: XlsxLimits = XLSX_LIMITS,
): Result<XlsxTable, DataError> {
  const fileName = file.name;
  const bytes = toUint8Array(file.bytes);
  const rejected = containerError(bytes, fileName, limits);
  if (rejected !== null) return err({ ...rejected, fileName });
  let workbook: WorkBook;
  try {
    workbook = read(bytes, parsingOptions(limits));
  } catch {
    // SheetJS throws plain errors with English text; the user only needs to know it is damaged.
    return err({ code: 'CORRUPT_FILE', fileName, params: {} });
  }
  const sheetName = workbook.SheetNames[0] ?? '';
  const sheet = workbook.Sheets[sheetName];
  if (sheet === undefined) return err({ code: 'EMPTY_FILE', fileName, params: {} });
  if (lastRowNumber(sheet) > limits.rows) {
    return err({ code: 'FILE_TOO_LARGE', fileName, params: { limit: limits.rows, unit: 'rows' } });
  }
  const dateSystem: DateSystem = workbook.Workbook?.WBProps?.date1904 === true ? 1904 : 1900;
  const [header, ...rows] = numberedRows(sheet);
  if (header === undefined) return err({ code: 'EMPTY_FILE', fileName, params: {} });
  const headers = header.cells.map(String);
  return ok({ format: 'xlsx', fileName, headers, rows, sheetName, dateSystem });
}
