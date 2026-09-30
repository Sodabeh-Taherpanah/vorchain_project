import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { readCsv, type RawTable } from './csv.ts';
import type { DataError } from './errors.ts';
import type { Delimiter } from './sniff.ts';
import { stripPython } from './strip.ts';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

function table(name: string, text: string | Uint8Array): RawTable {
  const result = readCsv({ name, bytes: typeof text === 'string' ? utf8(text) : text });
  if (!result.ok) throw new Error(`expected a table, got ${result.error.code}`);
  return result.value;
}

function failure(name: string, bytes: Uint8Array): DataError {
  const result = readCsv({ name, bytes });
  if (result.ok) throw new Error('expected an error');
  return result.error;
}

describe('readCsv', () => {
  it('reads a German semicolon export with decimal commas', () => {
    expect(table('artikel.csv', 'Artikelnummer;Lagerbestand\nM0001;1.234,5\nM0002;15,0\n')).toEqual(
      {
        fileName: 'artikel.csv',
        headers: ['Artikelnummer', 'Lagerbestand'],
        rows: [
          { rowNumber: 2, cells: ['M0001', '1.234,5'] },
          { rowNumber: 3, cells: ['M0002', '15,0'] },
        ],
        encoding: 'utf-8',
        delimiter: ';',
      },
    );
  });

  it.each([
    { name: 'comma', text: 'a,b\n1,2', delimiter: ',' },
    { name: 'tab', text: 'a\tb\n1\t2', delimiter: '\t' },
    { name: 'semicolon', text: 'a;b\n1;2', delimiter: ';' },
  ])('reads $name-separated files', ({ text, delimiter }) => {
    const result = table('x.csv', text);
    expect(result.delimiter).toBe(delimiter);
    expect(result.headers).toEqual(['a', 'b']);
    expect(result.rows).toEqual([{ rowNumber: 2, cells: ['1', '2'] }]);
  });

  it('decodes Windows-1252 umlauts', () => {
    // "Lieferant;Name\nS01;Krüger Größe" in Windows-1252 (ü = 0xFC, ö = 0xF6, ß = 0xDF).
    const bytes = Uint8Array.from([
      ...utf8('Lieferant;Name\nS01;Kr'),
      0xfc,
      ...utf8('ger Gr'),
      0xf6,
      0xdf,
      0x65,
    ]);
    const result = table('lieferanten.csv', bytes);
    expect(result.encoding).toBe('windows-1252');
    expect(result.rows).toEqual([{ rowNumber: 2, cells: ['S01', 'Krüger Größe'] }]);
  });

  it('strips a UTF-8 BOM from the first header', () => {
    const result = table(
      'x.csv',
      Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8('Artikel;Menge\nM1;1')]),
    );
    expect(result.headers).toEqual(['Artikel', 'Menge']);
  });

  it('accepts CRLF, CR and mixed line endings', () => {
    expect(table('x.csv', 'a;b\r\n1;2\r3;4\n5;6\r\n').rows).toEqual([
      { rowNumber: 2, cells: ['1', '2'] },
      { rowNumber: 3, cells: ['3', '4'] },
      { rowNumber: 4, cells: ['5', '6'] },
    ]);
  });

  it('skips blank and whitespace-only lines but keeps physical line numbers', () => {
    const result = table('x.csv', 'a;b\n\n1;2\n  ;\t\n;\n3;4\n\n\n');
    expect(result.rows).toEqual([
      { rowNumber: 3, cells: ['1', '2'] },
      { rowNumber: 6, cells: ['3', '4'] },
    ]);
  });

  it('takes the first non-blank line as header', () => {
    const result = table('x.csv', '\n\na;b\n1;2');
    expect(result.headers).toEqual(['a', 'b']);
    expect(result.rows).toEqual([{ rowNumber: 4, cells: ['1', '2'] }]);
  });

  it('strips cells and headers like Python str.strip()', () => {
    const result = table('x.csv', ' a ;\u00a0b\n 1 ;\t2 ');
    expect(result.headers).toEqual(['a', 'b']);
    expect(result.rows[0]?.cells).toEqual(['1', '2']);
  });

  it('keeps delimiters, escaped quotes and line breaks inside quoted fields', () => {
    const text =
      'id;name;note\n1;"Weber, Elektronik";"12"" Rohr; verzinkt"\n2;"zwei\nZeilen";x\n3;y;z';
    const result = table('x.csv', text);
    expect(result.rows).toEqual([
      { rowNumber: 2, cells: ['1', 'Weber, Elektronik', '12" Rohr; verzinkt'] },
      { rowNumber: 3, cells: ['2', 'zwei\nZeilen', 'x'] },
      { rowNumber: 5, cells: ['3', 'y', 'z'] },
    ]);
  });

  it('keeps an empty trailing cell for a trailing delimiter', () => {
    const result = table('x.csv', 'a;b;\n1;2;\n');
    expect(result.headers).toEqual(['a', 'b', '']);
    expect(result.rows).toEqual([{ rowNumber: 2, cells: ['1', '2', ''] }]);
  });

  it('keeps ragged rows as they are (column mapping decides later)', () => {
    const result = table('x.csv', 'a;b;c\n1;2\n1;2;3;4\n');
    expect(result.rows.map((row) => row.cells)).toEqual([
      ['1', '2'],
      ['1', '2', '3', '4'],
    ]);
  });

  it('returns a table with zero rows for a header-only file', () => {
    expect(table('x.csv', 'a;b;c\n')).toMatchObject({ headers: ['a', 'b', 'c'], rows: [] });
  });

  it.each([
    { name: 'no bytes', bytes: new Uint8Array() },
    { name: 'BOM only', bytes: Uint8Array.from([0xef, 0xbb, 0xbf]) },
    { name: 'blank lines only', bytes: utf8('\r\n\n  \n') },
    { name: 'delimiters only', bytes: utf8(';;\n;\n') },
  ])('returns EMPTY_FILE for $name', ({ bytes }) => {
    expect(failure('leer.csv', bytes)).toEqual({
      code: 'EMPTY_FILE',
      fileName: 'leer.csv',
      params: {},
    });
  });

  it.each([
    {
      name: 'an .xlsx renamed to .csv',
      bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14]),
      detected: 'zip',
    },
    {
      name: 'UTF-16 (Excel "Unicode Text")',
      bytes: Uint8Array.from([0xff, 0xfe, 0x61, 0x00]),
      detected: 'utf-16',
    },
    { name: 'a PDF', bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x00]), detected: 'binary' },
  ])('returns NOT_TEXT for $name', ({ bytes, detected }) => {
    expect(failure('x.csv', bytes)).toEqual({
      code: 'NOT_TEXT',
      fileName: 'x.csv',
      params: { detected },
    });
  });

  it('returns UNCLOSED_QUOTE with the line the quoted field starts on', () => {
    expect(failure('x.csv', utf8('a;b\n1;2\n"offen;3\n4;5\n'))).toEqual({
      code: 'UNCLOSED_QUOTE',
      fileName: 'x.csv',
      row: 3,
      params: {},
    });
  });

  it('returns MALFORMED_QUOTE with the line of text after a closing quote', () => {
    // Papa would silently merge this record with the next one; the prototype would keep `12 Zoll"`.
    expect(failure('x.csv', utf8('a;b\n1;2\n\n"12" Zoll";3\n4;5\n'))).toEqual({
      code: 'MALFORMED_QUOTE',
      fileName: 'x.csv',
      row: 4,
      params: {},
    });
  });

  it('never puts cell contents into an error', () => {
    const secret = 'Geheim GmbH';
    const error = failure('x.csv', utf8(`a;b\n1;"${secret}" x;2\n`));
    expect(JSON.stringify(error)).not.toContain(secret);
  });

  it('accepts an ArrayBuffer', () => {
    const bytes = utf8('a;b\n1;2');
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    expect(readCsv({ name: 'x.csv', bytes: buffer }).ok).toBe(true);
  });
});

/** Cell text without delimiters, quotes, line breaks or edge whitespace (as a user types it). */
const plainCell = fc
  .stringMatching(/^[A-Za-z0-9ÄÖÜäöüß.\-/ ]{1,12}$/)
  .map((cell) => cell.trim())
  .filter((cell) => cell !== '');
/** Any printable cell content, including delimiters, quotes and line breaks. */
const anyCell = fc
  .string({ unit: 'grapheme', minLength: 1, maxLength: 12 })
  .map((cell) => stripPython(cell.replaceAll('\u0000', '').replace(/\r\n?/g, '\n')))
  .filter((cell) => cell !== '');

const delimiters: fc.Arbitrary<Delimiter> = fc.constantFrom(';', ',', '\t');
const lineBreaks = fc.constantFrom('\n', '\r\n');

function rectangularTable(cell: fc.Arbitrary<string>): fc.Arbitrary<string[][]> {
  return fc.integer({ min: 2, max: 6 }).chain((columns) =>
    fc.array(fc.array(cell, { minLength: columns, maxLength: columns }), {
      minLength: 1,
      maxLength: 20,
    }),
  );
}

describe('readCsv properties', () => {
  it('reads back any table of plain cells written with any delimiter and line break', () => {
    fc.assert(
      fc.property(rectangularTable(plainCell), delimiters, lineBreaks, (rows, delimiter, eol) => {
        const text = rows.map((cells) => cells.join(delimiter)).join(eol) + eol;
        const result = table('x.csv', text);
        expect(result.delimiter).toBe(delimiter);
        expect([result.headers, ...result.rows.map((row) => row.cells)]).toEqual(rows);
        expect(result.rows.map((row) => row.rowNumber)).toEqual(rows.slice(1).map((_, i) => i + 2));
      }),
    );
  });

  it('reads back any fully quoted table, numbering rows by physical line', () => {
    const quote = (cell: string): string => `"${cell.replaceAll('"', '""')}"`;
    fc.assert(
      fc.property(rectangularTable(anyCell), delimiters, (rows, delimiter) => {
        const lines = rows.map((cells) => cells.map(quote).join(delimiter));
        const result = table('x.csv', lines.join('\n'));
        expect(result.delimiter).toBe(delimiter);
        expect([result.headers, ...result.rows.map((row) => row.cells)]).toEqual(rows);
        const starts = lines.map((_, i) =>
          lines.slice(0, i).reduce((line, text) => line + text.split('\n').length, 1),
        );
        expect(result.rows.map((row) => row.rowNumber)).toEqual(starts.slice(1));
      }),
    );
  });

  it('never throws on arbitrary bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
        const result = readCsv({ name: 'x.csv', bytes });
        expect(typeof result.ok).toBe('boolean');
      }),
    );
  });
});
