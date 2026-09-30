import { describe, expect, it } from 'vitest';
import type { CellObject } from 'xlsx';

import { workbookBytes } from '../test/support/workbook.ts';
import type { DataError } from './errors.ts';
import type { XlsxTable } from './table.ts';
import { readXlsx } from './xlsx.ts';

function table(bytes: Uint8Array, limits?: { unpackedBytes: number; rows: number }): XlsxTable {
  const result = readXlsx({ name: 'bestellungen.xlsx', bytes }, limits);
  if (!result.ok) throw new Error(`expected a table, got ${result.error.code}`);
  return result.value;
}

function failure(bytes: Uint8Array, name = 'bestellungen.xlsx'): DataError {
  const result = readXlsx({ name, bytes });
  if (result.ok) throw new Error('expected an error');
  return result.error;
}

/**
 * Breaks the XML of `xl/workbook.xml` (SheetJS stores entries uncompressed by default), leaving
 * the ZIP directory intact. Damaged *compressed* data is not tested: SheetJS's inflater can loop
 * forever on it, which the Worker's time limit has to catch (P1-15).
 */
function damageWorkbookPart(bytes: Uint8Array): Uint8Array {
  const tag = new TextEncoder().encode('<workbook');
  const at = bytes.findIndex((_, i) => tag.every((byte, j) => bytes[i + j] === byte));
  const damaged = bytes.slice();
  damaged.fill('<'.charCodeAt(0), at, at + tag.length);
  return damaged;
}

const dateCell = (serial: number, z = 'dd.mm.yyyy'): CellObject => ({ t: 'n', v: serial, z });

describe('readXlsx', () => {
  it('reads the first sheet with typed cells, skipping blank rows and keeping sheet rows', () => {
    const bytes = workbookBytes({
      Bestellungen: [
        ['Bestellnr', ' Menge ', 'Liefertermin', 2026, 'Aktiv'],
        [' PO1 ', 1234.5, new Date(Date.UTC(2026, 9, 5)), null, true],
        [null, '', null],
        ['PO2', '12,5', '05.10.2026', { t: 'e', v: 0x2a }, false],
      ],
      Notizen: [['ignored']],
    });
    expect(table(bytes)).toEqual({
      format: 'xlsx',
      fileName: 'bestellungen.xlsx',
      sheetName: 'Bestellungen',
      dateSystem: 1900,
      headers: ['Bestellnr', 'Menge', 'Liefertermin', '2026', 'Aktiv'],
      rows: [
        { rowNumber: 2, cells: ['PO1', 1234.5, '2026-10-05', '', 'TRUE'] },
        { rowNumber: 4, cells: ['PO2', '12,5', '05.10.2026', '#N/A', 'FALSE'] },
      ],
    });
  });

  it.each([
    { name: 'date-formatted serial', cell: dateCell(46300), expected: '2026-10-05' },
    { name: 'date and time', cell: dateCell(46300.99, 'yyyy-mm-dd hh:mm'), expected: '2026-10-05' },
    { name: 'ISO format', cell: dateCell(45292, 'yyyy-mm-dd'), expected: '2024-01-01' },
    { name: 'plain serial', cell: { t: 'n' as const, v: 46300 }, expected: 46300 },
  ])('reads a $name', ({ cell, expected }) => {
    expect(table(workbookBytes({ S: [['Datum'], [cell]] })).rows[0]?.cells).toEqual([expected]);
  });

  it('reads date cells of the 1904 date system and reports it', () => {
    const result = table(workbookBytes({ S: [['Datum'], [dateCell(44838)]] }, { date1904: true }));
    expect(result.dateSystem).toBe(1904);
    expect(result.rows[0]?.cells).toEqual(['2026-10-05']);
  });

  it('returns EMPTY_FILE for a sheet without data', () => {
    expect(failure(workbookBytes({ Leer: [] }))).toMatchObject({ code: 'EMPTY_FILE' });
  });

  it('returns FILE_TOO_LARGE beyond the row and unpacked-size limits', () => {
    const bytes = workbookBytes({ S: [['a'], [1], [2], [3]] });
    const rows = readXlsx({ name: 'x.xlsx', bytes }, { unpackedBytes: 1e9, rows: 3 });
    expect(rows).toMatchObject({ error: { code: 'FILE_TOO_LARGE', params: { unit: 'rows' } } });
    expect(table(bytes, { unpackedBytes: 1e9, rows: 4 }).rows).toHaveLength(3);
    const unpacked = readXlsx({ name: 'x.xlsx', bytes }, { unpackedBytes: 100, rows: 10 });
    expect(unpacked).toMatchObject({
      error: { code: 'FILE_TOO_LARGE', params: { limit: 100, unit: 'unpackedBytes' } },
    });
  });

  it.each([
    { name: 'an ODS spreadsheet', bookType: 'ods', file: 'artikel.ods', extension: 'ods' },
    { name: 'a legacy XLS workbook', bookType: 'xls', file: 'artikel.xls', extension: 'xls' },
  ] as const)('rejects $name as UNSUPPORTED_FILE_TYPE', ({ bookType, file, extension }) => {
    const bytes = workbookBytes({ S: [['a'], [1]] }, { bookType });
    expect(failure(bytes, file)).toEqual({
      code: 'UNSUPPORTED_FILE_TYPE',
      fileName: file,
      params: { extension },
    });
  });

  it('rejects text as UNSUPPORTED_FILE_TYPE', () => {
    const csv = new TextEncoder().encode('Artikel;Menge\nM1;5\n');
    expect(failure(csv)).toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });

  it('recognises a password-protected workbook', () => {
    const header = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    const stream = Array.from('EncryptionInfo', (char) => [char.charCodeAt(0), 0]).flat();
    const bytes = new Uint8Array([...header, ...new Array<number>(504).fill(0), ...stream]);
    expect(failure(bytes)).toEqual({
      code: 'PASSWORD_PROTECTED',
      fileName: 'bestellungen.xlsx',
      params: {},
    });
  });

  it.each([
    { name: 'a truncated file', cut: (b: Uint8Array) => b.subarray(0, b.length - 30) },
    { name: 'a bare ZIP signature', cut: () => new Uint8Array([0x50, 0x4b, 0x03, 0x04]) },
    { name: 'a damaged workbook part', cut: damageWorkbookPart },
  ])('returns CORRUPT_FILE for $name', ({ cut }) => {
    const bytes = cut(workbookBytes({ S: [['a'], [1]] }));
    expect(failure(bytes)).toEqual({
      code: 'CORRUPT_FILE',
      fileName: 'bestellungen.xlsx',
      params: {},
    });
  });
});
