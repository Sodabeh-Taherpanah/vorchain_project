import { describe, expect, it } from 'vitest';

import { MAX_FILE_BYTES, parseFile } from './file.ts';
import { workbookBytes } from '../test/support/workbook.ts';

const csv = new TextEncoder().encode('Artikel;Menge\nM1;5\n');
const xlsx = workbookBytes({
  Artikel: [
    ['Artikel', 'Menge'],
    ['M1', 5],
  ],
});

describe('parseFile', () => {
  it.each([
    { name: 'artikel.csv', bytes: csv, format: 'csv' },
    { name: 'artikel.xlsx', bytes: xlsx, format: 'xlsx' },
    { name: 'artikel.csv', bytes: xlsx, format: 'xlsx' },
    { name: 'artikel.xlsx', bytes: csv, format: 'csv' },
    { name: 'ARTIKEL.TXT', bytes: csv, format: 'csv' },
  ])('reads $name holding $format content by its content', ({ name, bytes, format }) => {
    const result = parseFile({ name, bytes: bytes.buffer as ArrayBuffer });
    expect(result.ok && result.value).toMatchObject({ format, headers: ['Artikel', 'Menge'] });
  });

  it.each(['xls', 'XLSB', 'ods', 'numbers', 'pdf'])(
    'rejects .%s as UNSUPPORTED_FILE_TYPE with the extension',
    (extension) => {
      expect(parseFile({ name: `bestand.${extension}`, bytes: xlsx })).toEqual({
        ok: false,
        error: {
          code: 'UNSUPPORTED_FILE_TYPE',
          fileName: `bestand.${extension}`,
          params: { extension: extension.toLowerCase() },
        },
      });
    },
  );

  it('rejects a legacy XLS workbook even when named .xlsx', () => {
    const xls = workbookBytes({ S: [['a']] }, { bookType: 'xls' });
    expect(parseFile({ name: 'bestand.xlsx', bytes: xls })).toMatchObject({
      error: { code: 'UNSUPPORTED_FILE_TYPE', params: { extension: 'xlsx' } },
    });
  });

  it('rejects files above MAX_FILE_BYTES before reading them', () => {
    const bytes = new Uint8Array(MAX_FILE_BYTES + 1);
    expect(parseFile({ name: 'riesig.csv', bytes })).toEqual({
      ok: false,
      error: {
        code: 'FILE_TOO_LARGE',
        fileName: 'riesig.csv',
        params: { limit: MAX_FILE_BYTES, unit: 'bytes' },
      },
    });
  });
});
