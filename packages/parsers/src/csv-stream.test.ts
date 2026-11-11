import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { readCsv } from './csv.ts';
import { streamCsv, chunkSourceFromBytes, type CsvHead } from './csv-stream.ts';
import type { RawRow } from './table.ts';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** What `readCsv` returns, rebuilt from the stream, so one `toEqual` compares everything. */
async function streamed(name: string, bytes: Uint8Array, chunkSize: number) {
  let head: CsvHead | null = null;
  const rows: RawRow[] = [];
  const result = await streamCsv(chunkSourceFromBytes(name, bytes, chunkSize), {
    onHead: (h) => (head = h),
    onRows: (batch) => void rows.push(...batch),
  });
  if (!result.ok) return result;
  const h = head as CsvHead | null;
  if (h === null) throw new Error('no head');
  return { ok: true as const, value: { format: 'csv' as const, ...h, rows } };
}

async function expectSame(name: string, bytes: Uint8Array, chunkSize: number): Promise<void> {
  const oracle = readCsv({ name, bytes });
  const actual = await streamed(name, bytes, chunkSize);
  expect(actual).toEqual(oracle);
}

const CHUNK_SIZES = [1, 7, 64, 4096, 65_536] as const;

describe('streamCsv equals readCsv', () => {
  const dir = join(import.meta.dirname, '../test/fixtures/csv');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.csv'))) {
    for (const size of CHUNK_SIZES) {
      it(`${file} at chunk size ${String(size)}`, async () => {
        await expectSame(file, new Uint8Array(readFileSync(join(dir, file))), size);
      });
    }
  }

  const cases: Record<string, Uint8Array> = {
    'multi-byte split': utf8('Name;Ort\nMüller;Köln\n€uro;日本語\n'),
    CRLF: utf8('a;b\r\n1;2\r\n3;4\r\n'),
    'lone CR': utf8('a;b\r1;2\r3;4'),
    'quoted newline': utf8('a;b\n"x\ny";2\n3;4\n'),
    'quoted CRLF': utf8('a;b\r\n"x\r\ny";2\r\n'),
    'escaped quote': utf8('a;b\n"he said ""hi""";2\n'),
    'quote in unquoted cell': utf8('a;b\n5" pipe;2\n3;4\n'),
    'unclosed quote': utf8('a;b\n1;2\n"oops;3\n4;5\n'),
    'malformed quote': utf8('a;b\n"x"y;2\n3;4\n'),
    'blank lines': utf8('\n\na;b\n\n1;2\n\n'),
    'only blank lines': utf8('\n\n \n'),
    empty: new Uint8Array(0),
    'BOM only': new Uint8Array([0xef, 0xbb, 0xbf]),
    'BOM plus data': new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('a;b\n1;2\n')]),
    'double BOM': new Uint8Array([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf, ...utf8('a;b\n1;2\n')]),
    'windows-1252': new Uint8Array([
      ...utf8('Name;Ort\nM'),
      0xfc,
      ...utf8('ller;K'),
      0xf6,
      ...utf8('ln\n'),
    ]),
    'late invalid utf-8': new Uint8Array([...utf8('a;b\n'.repeat(500)), ...utf8('x;'), 0xe4, 0x0a]),
    'late NUL': new Uint8Array([...utf8('a;b\n'.repeat(500)), 0, 0x0a]),
    'utf-16 BOM': new Uint8Array([0xff, 0xfe, 0x61, 0]),
    'zip signature': new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]),
    comma: utf8('a,b\n1,2\n'),
    tab: utf8('a\tb\n1\t2\n'),
    'long first line (sniff sample edge)': utf8(`${'x;'.repeat(3000)}y\n1;2\n`),
    'short row': utf8('a;b;c\n1\n1;2;3;4\n'),
  };
  for (const [label, bytes] of Object.entries(cases)) {
    for (const size of [1, 3, 64, 65_536]) {
      it(`${label} at chunk size ${String(size)}`, async () => {
        await expectSame('t.csv', bytes, size);
      });
    }
  }

  it('holds for arbitrary text and chunk sizes', async () => {
    const piece = fc.constantFrom(
      'a',
      'b',
      '1',
      ';',
      ',',
      '\t',
      '"',
      '""',
      '\n',
      '\r\n',
      '\r',
      ' ',
      'ü',
      '€',
    );
    await fc.assert(
      fc.asyncProperty(
        fc.array(piece, { maxLength: 80 }).map((p) => p.join('')),
        fc.integer({ min: 1, max: 12 }),
        async (text, size) => {
          await expectSame('p.csv', utf8(text), size);
        },
      ),
      { numRuns: 600 },
    );
  });

  it('holds for large generated tables with quoted multi-line cells', async () => {
    const line = (i: number) =>
      i % 7 === 0
        ? `M${String(i)};"note\nline ${String(i)}";${String(i)},5`
        : `M${String(i)};plain ü€;${String(i)},5`;
    const text = ['id;note;qty', ...Array.from({ length: 3000 }, (_, i) => line(i))].join('\n');
    for (const size of [1000, 4096, 65_536]) await expectSame('big.csv', utf8(text), size);
  });
});

describe('streamCsv memory shape', () => {
  it('delivers rows in several batches for a multi-chunk file', async () => {
    const text = ['a;b', ...Array.from({ length: 2000 }, (_, i) => `${String(i)};x`)].join('\n');
    const batches: number[] = [];
    await streamCsv(chunkSourceFromBytes('a.csv', utf8(text), 1024), {
      onHead: () => undefined,
      onRows: (rows) => void batches.push(rows.length),
    });
    expect(batches.length).toBeGreaterThan(5);
    expect(batches.reduce((a, b) => a + b, 0)).toBe(2000);
  });

  it('awaits an async sink between batches', async () => {
    const text = ['a;b', ...Array.from({ length: 500 }, (_, i) => `${String(i)};x`)].join('\n');
    let running = 0;
    let overlap = false;
    await streamCsv(chunkSourceFromBytes('a.csv', utf8(text), 256), {
      onHead: () => undefined,
      onRows: async () => {
        running += 1;
        if (running > 1) overlap = true;
        await Promise.resolve();
        running -= 1;
      },
    });
    expect(overlap).toBe(false);
  });
});
