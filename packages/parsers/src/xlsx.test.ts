import { describe, expect, it } from 'vitest';
import type { CellObject } from 'xlsx';

import { fixtureBytes, patchEntry } from '../test/support/zip.ts';
import { workbookBytes } from '../test/support/workbook.ts';
import type { DataError } from './errors.ts';
import type { XlsxTable } from './table.ts';
import { readXlsx } from './xlsx.ts';
import { readZipContents } from './zip.ts';

async function table(
  bytes: Uint8Array,
  limits?: { unpackedBytes: number; rows: number },
): Promise<XlsxTable> {
  const result = await readXlsx({ name: 'bestellungen.xlsx', bytes }, limits);
  if (!result.ok) throw new Error(`expected a table, got ${result.error.code}`);
  return result.value;
}

async function failure(bytes: Uint8Array, name = 'bestellungen.xlsx'): Promise<DataError> {
  const result = await readXlsx({ name, bytes });
  if (result.ok) throw new Error('expected an error');
  return result.error;
}

/**
 * Breaks the XML of `xl/workbook.xml` (SheetJS stores entries uncompressed by default), leaving
 * the ZIP directory intact. The CRC-32 check catches it before SheetJS reads it.
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
  it('reads the first sheet with typed cells, skipping blank rows and keeping sheet rows', async () => {
    const bytes = workbookBytes({
      Bestellungen: [
        ['Bestellnr', ' Menge ', 'Liefertermin', 2026, 'Aktiv'],
        [' PO1 ', 1234.5, new Date(Date.UTC(2026, 9, 5)), null, true],
        [null, '', null],
        ['PO2', '12,5', '05.10.2026', { t: 'e', v: 0x2a }, false],
      ],
      Notizen: [['ignored']],
    });
    expect(await table(bytes)).toEqual({
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
  ])('reads a $name', async ({ cell, expected }) => {
    expect((await table(workbookBytes({ S: [['Datum'], [cell]] }))).rows[0]?.cells).toEqual([
      expected,
    ]);
  });

  it('reads date cells of the 1904 date system and reports it', async () => {
    const result = await table(
      workbookBytes({ S: [['Datum'], [dateCell(44838)]] }, { date1904: true }),
    );
    expect(result.dateSystem).toBe(1904);
    expect(result.rows[0]?.cells).toEqual(['2026-10-05']);
  });

  it('returns EMPTY_FILE for a sheet without data', async () => {
    expect(await failure(workbookBytes({ Leer: [] }))).toMatchObject({ code: 'EMPTY_FILE' });
  });

  it('returns FILE_TOO_LARGE beyond the row and unpacked-size limits', async () => {
    const bytes = workbookBytes({ S: [['a'], [1], [2], [3]] });
    const rows = await readXlsx({ name: 'x.xlsx', bytes }, { unpackedBytes: 1e9, rows: 3 });
    expect(rows).toMatchObject({ error: { code: 'FILE_TOO_LARGE', params: { unit: 'rows' } } });
    expect((await table(bytes, { unpackedBytes: 1e9, rows: 4 })).rows).toHaveLength(3);
    const unpacked = await readXlsx({ name: 'x.xlsx', bytes }, { unpackedBytes: 100, rows: 10 });
    expect(unpacked).toMatchObject({
      error: { code: 'FILE_TOO_LARGE', params: { limit: 100, unit: 'unpackedBytes' } },
    });
  });

  it.each([
    { name: 'an ODS spreadsheet', bookType: 'ods', file: 'artikel.ods', extension: 'ods' },
    { name: 'a legacy XLS workbook', bookType: 'xls', file: 'artikel.xls', extension: 'xls' },
  ] as const)('rejects $name as UNSUPPORTED_FILE_TYPE', async ({ bookType, file, extension }) => {
    const bytes = workbookBytes({ S: [['a'], [1]] }, { bookType });
    expect(await failure(bytes, file)).toEqual({
      code: 'UNSUPPORTED_FILE_TYPE',
      fileName: file,
      params: { extension },
    });
  });

  it('rejects text as UNSUPPORTED_FILE_TYPE', async () => {
    const csv = new TextEncoder().encode('Artikel;Menge\nM1;5\n');
    expect(await failure(csv)).toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });

  it('recognises a password-protected workbook', async () => {
    const header = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    const stream = Array.from('EncryptionInfo', (char) => [char.charCodeAt(0), 0]).flat();
    const bytes = new Uint8Array([...header, ...new Array<number>(504).fill(0), ...stream]);
    expect(await failure(bytes)).toEqual({
      code: 'PASSWORD_PROTECTED',
      fileName: 'bestellungen.xlsx',
      params: {},
    });
  });

  it.each([
    { name: 'a truncated file', cut: (b: Uint8Array) => b.subarray(0, b.length - 30) },
    { name: 'a bare ZIP signature', cut: () => new Uint8Array([0x50, 0x4b, 0x03, 0x04]) },
    { name: 'a damaged workbook part', cut: damageWorkbookPart },
  ])('returns CORRUPT_FILE for $name', async ({ cut }) => {
    const bytes = cut(workbookBytes({ S: [['a'], [1]] }));
    expect(await failure(bytes)).toEqual({
      code: 'CORRUPT_FILE',
      fileName: 'bestellungen.xlsx',
      params: {},
    });
  });

  describe('with damaged compressed data (openpyxl deflates every part)', () => {
    const sheet = 'xl/worksheets/sheet1.xml';

    // Regression: SheetJS's own inflater loops forever on these bytes; the platform's zlib
    // rejects them first. A vitest timeout cannot stop a synchronous loop, so if this regresses
    // the run hangs until the CI job's time limit; `zip.test.ts` pins the check itself.
    it('returns CORRUPT_FILE instead of hanging', async () => {
      const bytes = patchEntry(fixtureBytes('materials.xlsx'), sheet, (entry) => {
        entry.data.fill(0xff, 10, 50);
      });
      expect(await failure(bytes)).toEqual({
        code: 'CORRUPT_FILE',
        fileName: 'bestellungen.xlsx',
        params: {},
      });
    });

    it('returns CORRUPT_FILE for data SheetJS would read silently wrong', async () => {
      const bytes = patchEntry(fixtureBytes('materials.xlsx'), sheet, (entry) => {
        entry.data.fill(0xff, 100, 140);
      });
      expect(await failure(bytes)).toMatchObject({ code: 'CORRUPT_FILE' });
    });

    it('returns CORRUPT_FILE when the checksum or size does not match the directory', async () => {
      const crc = patchEntry(fixtureBytes('materials.xlsx'), sheet, (entry) => {
        entry.setCrc32(entry.crc32 ^ 1);
      });
      expect(await failure(crc)).toMatchObject({ code: 'CORRUPT_FILE' });
      const size = patchEntry(fixtureBytes('materials.xlsx'), sheet, (entry) => {
        entry.setSize(entry.size - 1);
      });
      expect(await failure(size)).toMatchObject({ code: 'CORRUPT_FILE' });
    });

    it('returns FILE_TOO_LARGE when the data unpacks to more than declared and allowed', async () => {
      const bytes = patchEntry(fixtureBytes('materials.xlsx'), sheet, (entry) => {
        entry.setSize(1);
      });
      const declared = readZipContents(bytes)?.unpackedBytes ?? 0;
      const result = await readXlsx(
        { name: 'x.xlsx', bytes },
        { unpackedBytes: declared, rows: 10 },
      );
      expect(result).toMatchObject({
        error: { code: 'FILE_TOO_LARGE', params: { limit: declared, unit: 'unpackedBytes' } },
      });
    });
  });
});
