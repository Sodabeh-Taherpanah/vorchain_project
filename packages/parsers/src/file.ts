/**
 * The single entry point for an uploaded file (backlog P1-10): the demo's Web Worker (P1-15)
 * calls `parseFile` for each file and hands the tables to `loadTables`.
 */
import { err, type Result } from '@vorchain/engine';

import { readCsv } from './csv.ts';
import { toUint8Array } from './decode.ts';
import type { DataError } from './errors.ts';
import type { RawTable, SourceFile } from './table.ts';
import { extensionOf, isWorkbookContainer, readXlsx } from './xlsx.ts';

/** Largest file accepted, CSV or XLSX; far above the demo's sizing (spec §4.2). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Spreadsheet and document formats users are likely to pick by mistake. */
const UNSUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set([
  'xls',
  'xlsb',
  'ods',
  'numbers',
  'pdf',
]);

/**
 * Reads an uploaded file into a `RawTable`. The content decides, not the name: ZIP and OLE2
 * containers go to {@link readXlsx}, anything else to {@link readCsv}, so an `.xlsx` renamed to
 * `.csv` (or a CSV named `.xlsx`) still works. Known non-CSV/XLSX extensions are rejected first.
 *
 * @returns `FILE_TOO_LARGE` above {@link MAX_FILE_BYTES}, `UNSUPPORTED_FILE_TYPE` for `.xls`,
 *   `.xlsb`, `.ods`, `.numbers`, `.pdf`, otherwise whatever the reader returns.
 */
export function parseFile(file: SourceFile): Result<RawTable, DataError> {
  const { name } = file;
  const bytes = toUint8Array(file.bytes);
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return err({
      code: 'FILE_TOO_LARGE',
      fileName: name,
      params: { limit: MAX_FILE_BYTES, unit: 'bytes' },
    });
  }
  const extension = extensionOf(name);
  if (UNSUPPORTED_EXTENSIONS.has(extension)) {
    return err({ code: 'UNSUPPORTED_FILE_TYPE', fileName: name, params: { extension } });
  }
  return isWorkbookContainer(bytes) ? readXlsx({ name, bytes }) : readCsv({ name, bytes });
}
