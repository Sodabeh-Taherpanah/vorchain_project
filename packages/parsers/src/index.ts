/**
 * Public API of the Vorchain parsers: uploaded file bytes -> validated engine input. Runs inside
 * the demo's Web Worker, so everything here is pure: no network, no storage, no logging of file
 * contents (AGENTS.md §2, ADR-0003). Since P1-07: byte decoding, delimiter sniffing and CSV
 * reading into a `RawTable`; since P1-08: German/English number and date cells; since P1-09: table
 * detection, header aliases, zod row validation and `AnalysisInput` assembly. XLSX (P1-10) follows.
 */
export const PARSERS_PACKAGE_NAME = '@vorchain/parsers';

export { assembleInput, loadTables, REQUIRED_TABLES } from './assemble.ts';
export type { LoadResult, RecognisedTable } from './assemble.ts';
export {
  COLUMN_ALIASES,
  mapHeaders,
  normaliseHeader,
  OPTIONAL,
  REQUIRED,
  TABLE_FILE_STEMS,
  TABLE_NAMES,
} from './columns.ts';
export type { CanonicalColumn, ColumnMapping, TableName } from './columns.ts';
export { detectTable } from './detect.ts';
export { MAX_ROW_ERRORS, validateRows } from './rows.ts';
export type { MappedTable, NumberedRecord, TableRecords, ValidatedTable } from './rows.ts';
export { readCsv } from './csv.ts';
export type { CsvFile, RawRow, RawTable } from './csv.ts';
export { decodeText, detectNonText } from './decode.ts';
export type { Bytes, DecodedText, NonTextKind, TextEncoding } from './decode.ts';
export { DATA_ERROR_CODES, DATA_WARNING_CODES } from './errors.ts';
export type { DataError, DataErrorCode, DataWarning, DataWarningCode, NoParams } from './errors.ts';
export { sniffDelimiter, SNIFF_SAMPLE_LENGTH } from './sniff.ts';
export type { Delimiter } from './sniff.ts';
export { stripPython } from './strip.ts';
export { parseDate, parseNumber } from './values.ts';
