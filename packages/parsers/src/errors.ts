import type { CanonicalColumn, TableName } from './columns.ts';
import type { NonTextKind } from './decode.ts';

/**
 * Every error code the parsers can return. The web app keeps one `de` and one `en` message per
 * code and a test checks it against this list (backlog P1-16), so add new codes here first.
 */
export const DATA_ERROR_CODES = [
  'EMPTY_FILE',
  'NOT_TEXT',
  'UNCLOSED_QUOTE',
  'MALFORMED_QUOTE',
  'INVALID_NUMBER',
  'INVALID_DATE',
  'UNKNOWN_TABLE',
  'AMBIGUOUS_TABLE',
  'MISSING_COLUMNS',
  'MISSING_VALUE',
  'TOO_MANY_ERRORS',
  'DUPLICATE_TABLE',
  'MISSING_TABLE',
  'UNSUPPORTED_FILE_TYPE',
  'PASSWORD_PROTECTED',
  'CORRUPT_FILE',
  'FILE_TOO_LARGE',
] as const;

/** Every warning code; like {@link DATA_ERROR_CODES}, the web app keeps one message per code. */
export const DATA_WARNING_CODES = ['DUPLICATE_MATERIAL'] as const;

/** Machine-readable reason a file could not be read; the UI turns it into a localized fix hint. */
export type DataErrorCode = (typeof DATA_ERROR_CODES)[number];

/** Parameters for codes whose message needs nothing beyond file, row and column. */
export type NoParams = Readonly<Record<string, never>>;

interface DataErrorOf<Code extends DataErrorCode | DataWarningCode, Params> {
  readonly code: Code;
  /** Name of the uploaded file, as the user chose it. */
  readonly fileName?: string;
  /** Physical line number in the file (the header is line 1). */
  readonly row?: number;
  /** Column header as found in the file. */
  readonly column?: string;
  /**
   * Values for the message placeholders. Holds at most the one offending cell (`value`), so the
   * message can show what to fix; never whole rows.
   */
  readonly params: Params;
}

/**
 * Expected data problem, as codes and parameters only (no display text, AGENTS.md §5). Only file
 * names, line numbers, column headers and the one offending cell appear here, never whole rows (privacy, AGENTS.md §2).
 */
export type DataError =
  /** The file has no bytes, or only a BOM, whitespace and blank lines. */
  | DataErrorOf<'EMPTY_FILE', NoParams>
  /** The bytes are not a UTF-8 or Windows-1252 text file (e.g. `.xlsx` renamed to `.csv`). */
  | DataErrorOf<'NOT_TEXT', { readonly detected: NonTextKind }>
  /** A quoted field starting on `row` is never closed, so the rest of the file would be one cell. */
  | DataErrorOf<'UNCLOSED_QUOTE', NoParams>
  /** A quoted field starting on `row` has text after its closing quote (e.g. `"12" Zoll"`). */
  | DataErrorOf<'MALFORMED_QUOTE', NoParams>
  /** A number cell is not a number in German or English notation (`value` is the raw cell). */
  | DataErrorOf<'INVALID_NUMBER', { readonly value: string }>
  /** A date cell has an unknown format or is not a real calendar day (`value` is the raw cell). */
  | DataErrorOf<'INVALID_DATE', { readonly value: string }>
  /** Neither the file name nor the headers identify a table (`found`: the file's headers). */
  | DataErrorOf<'UNKNOWN_TABLE', { readonly found: readonly string[] }>
  /** The headers fit several tables equally well (`candidates`), and the file name does not decide. */
  | DataErrorOf<'AMBIGUOUS_TABLE', { readonly candidates: readonly TableName[] }>
  /** Required columns of `table` have no matching header; `found` lists the file's headers. */
  | DataErrorOf<
      'MISSING_COLUMNS',
      {
        readonly table: TableName;
        readonly missing: readonly CanonicalColumn[];
        readonly found: readonly string[];
      }
    >
  /** A cell that must not be empty (an ID, or the date of a PO or demand line) is empty. */
  | DataErrorOf<'MISSING_VALUE', NoParams>
  /** The file has more than `limit` row errors; only the first `limit` are reported. */
  | DataErrorOf<'TOO_MANY_ERRORS', { readonly limit: number }>
  /** Two files hold the same table (`fileName` is the second one, `other` the first). */
  | DataErrorOf<'DUPLICATE_TABLE', { readonly table: TableName; readonly other: string }>
  /** A required table has no file. */
  | DataErrorOf<'MISSING_TABLE', { readonly table: TableName }>
  /**
   * Not a CSV or XLSX file, e.g. `.xls`, `.xlsb`, `.ods`, `.numbers` or `.pdf` (`extension`: the
   * file name's extension, lower case, without the dot; `''` if there is none). Fix: save as
   * CSV or XLSX.
   */
  | DataErrorOf<'UNSUPPORTED_FILE_TYPE', { readonly extension: string }>
  /** An encrypted (password-protected) Excel workbook. Fix: save a copy without a password. */
  | DataErrorOf<'PASSWORD_PROTECTED', NoParams>
  /** An XLSX file that cannot be opened (truncated or damaged). */
  | DataErrorOf<'CORRUPT_FILE', NoParams>
  /**
   * The file exceeds a safety limit (`limit` in `unit`): its size, its unpacked size (XLSX, a
   * guard against ZIP bombs) or its number of sheet rows.
   */
  | DataErrorOf<
      'FILE_TOO_LARGE',
      { readonly limit: number; readonly unit: 'bytes' | 'unpackedBytes' | 'rows' }
    >;

/** Machine-readable reason to double-check the data; analysis still runs. */
export type DataWarningCode = (typeof DATA_WARNING_CODES)[number];

/**
 * A data oddity that does not stop the analysis. Same privacy rule as {@link DataError}.
 * `DUPLICATE_MATERIAL`: the material number (`value`) appears again on `row`, first on
 * `firstRow`; both rows are analysed, as in the prototype.
 */
export type DataWarning = DataErrorOf<
  'DUPLICATE_MATERIAL',
  { readonly value: string; readonly firstRow: number }
>;
