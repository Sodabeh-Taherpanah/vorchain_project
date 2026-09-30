/** Test workbooks written by SheetJS itself (backlog P1-10 test plan). */
import { utils, write, type CellObject, type WorkBook } from 'xlsx';

export type Cell = CellObject | string | number | boolean | Date | null;

/**
 * Writes one sheet per entry, in order. `Date` cells are taken as UTC calendar days; entries are
 * stored uncompressed (SheetJS's default).
 */
export function workbookBytes(
  sheets: Readonly<Record<string, Cell[][]>>,
  options: { readonly date1904?: boolean; readonly bookType?: 'xlsx' | 'ods' | 'xls' } = {},
): Uint8Array {
  const book: WorkBook = utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    utils.book_append_sheet(book, utils.aoa_to_sheet(rows, { UTC: true }), name);
  }
  if (options.date1904 === true) book.Workbook = { WBProps: { date1904: true } };
  const written: unknown = write(book, { type: 'array', bookType: options.bookType ?? 'xlsx' });
  if (!(written instanceof ArrayBuffer)) throw new Error('SheetJS did not return an ArrayBuffer');
  return new Uint8Array(written);
}
