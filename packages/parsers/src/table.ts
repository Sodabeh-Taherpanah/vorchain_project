/**
 * The shape every reader produces (`readCsv`, `readXlsx`): a header row and data rows, before any
 * column mapping or typing (backlog P1-07, P1-10).
 */
import type { Bytes, TextEncoding } from './decode.ts';
import type { Delimiter } from './sniff.ts';

/** A file as the Web Worker (or a Node service) hands it to the parsers: never a DOM `File`. */
export interface SourceFile {
  /** File name as chosen by the user; used in errors and for table detection. */
  readonly name: string;
  readonly bytes: Bytes;
}

/**
 * One cell: text (stripped like Python `str.strip()`), or a number from an XLSX number cell.
 * XLSX date cells arrive as `YYYY-MM-DD` text.
 */
export type RawCell = string | number;

/** One non-blank data record. */
export interface RawRow {
  /** Physical line (CSV) or sheet row (XLSX) of the record; the header is usually row 1. */
  readonly rowNumber: number;
  /** Rows may be shorter or longer than the header. */
  readonly cells: readonly RawCell[];
}

/**
 * Excel's day-number epoch: `1900` (Windows default; serial 1 = 1900-01-01, with Lotus's
 * phantom 29 February 1900) or `1904` (old Mac default; serial 0 = 1904-01-01).
 */
export type DateSystem = 1900 | 1904;

interface TableBase {
  readonly fileName: string;
  /** Cells of the first non-blank record, as text. */
  readonly headers: readonly string[];
  /** Non-blank records after the header, in file order. */
  readonly rows: readonly RawRow[];
}

/** A CSV file split into records. */
export interface CsvTable extends TableBase {
  readonly format: 'csv';
  /** How the bytes were decoded (shown in the demo's map check). */
  readonly encoding: TextEncoding;
  /** The sniffed field delimiter. */
  readonly delimiter: Delimiter;
}

/** The first worksheet of an XLSX workbook. */
export interface XlsxTable extends TableBase {
  readonly format: 'xlsx';
  readonly sheetName: string;
  /** Needed to read plain day numbers in date columns. */
  readonly dateSystem: DateSystem;
}

/** A read file of either format. */
export type RawTable = CsvTable | XlsxTable;
