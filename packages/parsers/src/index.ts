/**
 * Public API of the Vorchain parsers: uploaded file bytes -> validated engine input. Runs inside
 * the demo's Web Worker, so everything here is pure: no network, no storage, no logging of file
 * contents (AGENTS.md §2, ADR-0003). Since P1-07: byte decoding, delimiter sniffing and CSV
 * reading into a `RawTable`; since P1-08: German/English number and date cells. Column mapping
 * (P1-09) and XLSX (P1-10) follow.
 */
export const PARSERS_PACKAGE_NAME = '@vorchain/parsers';

export { readCsv } from './csv.ts';
export type { CsvFile, RawRow, RawTable } from './csv.ts';
export { decodeText, detectNonText } from './decode.ts';
export type { Bytes, DecodedText, NonTextKind, TextEncoding } from './decode.ts';
export { DATA_ERROR_CODES } from './errors.ts';
export type { DataError, DataErrorCode, NoParams } from './errors.ts';
export { sniffDelimiter, SNIFF_SAMPLE_LENGTH } from './sniff.ts';
export type { Delimiter } from './sniff.ts';
export { stripPython } from './strip.ts';
export { parseDate, parseNumber } from './values.ts';
