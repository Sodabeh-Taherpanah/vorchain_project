import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadTables } from './assemble.ts';
import { chunkSourceFromBytes } from './csv-stream.ts';
import { parseFile } from './file.ts';
import { loadSources } from './load-sources.ts';
import type { RawTable } from './table.ts';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const FILES: Record<string, string> = {
  'artikel.csv':
    'Artikelnummer;Bezeichnung;Lagerbestand;Sicherheitsbestand;Lieferant\nM1;Schraube;10;2;L1\nM2;Mutter;abc;2;L1\n',
  'bedarf.csv': 'Artikelnummer;Datum;Menge\nM1;05.10.2026;3\nM1;06.10.2026;4\n',
  'bestellungen.csv': 'Artikelnummer;Liefertermin;Menge;Lieferant\nM1;07.10.2026;5;L1\n',
  'lieferhistorie.csv': 'Lieferant;Artikelnummer;Zugesagt;Geliefert\nL1;M1;01.09.2026;03.09.2026\n',
};

/** The two-step path every caller used before streaming. */
async function viaParseFile(entries: [string, Uint8Array][]) {
  const tables: RawTable[] = [];
  const fileErrors = [];
  for (const [name, bytes] of entries) {
    const r = await parseFile({ name, bytes });
    if (r.ok) tables.push(r.value);
    else fileErrors.push(r.error);
  }
  const loaded = loadTables(tables);
  return fileErrors.length === 0
    ? loaded
    : { ...loaded, errors: [...fileErrors, ...loaded.errors], input: null };
}

describe('loadSources equals parseFile + loadTables', () => {
  const cases: Record<string, [string, Uint8Array][]> = {
    'rows with errors': Object.entries(FILES).map(([n, t]) => [n, utf8(t)]),
    'a file with a broken quote': [
      ...Object.entries(FILES).map(([n, t]): [string, Uint8Array] => [n, utf8(t)]),
      ['extra.csv', utf8('a;b\n"x;1\n')],
    ],
    'unsupported and empty files': [
      ['x.xls', utf8('whatever')],
      ['leer.csv', utf8('')],
    ],
    'unrecognised header': [['zufall.csv', utf8('foo;bar\n1;2\n')]],
  };
  for (const [label, entries] of Object.entries(cases)) {
    for (const size of [1, 17, 65_536]) {
      it(`${label} at chunk size ${String(size)}`, async () => {
        const streamed = await loadSources(
          entries.map(([name, bytes]) => chunkSourceFromBytes(name, bytes, size)),
        );
        expect(streamed).toEqual(await viaParseFile(entries));
      });
    }
  }

  it('stops reading nothing: rows after the error cap still get quote-checked', async () => {
    const bad = `Artikelnummer;Lagerbestand\n${'M;abc\n'.repeat(50)}"unclosed;1\n`;
    const entries: [string, Uint8Array][] = [['artikel.csv', utf8(bad)]];
    const streamed = await loadSources(entries.map(([n, b]) => chunkSourceFromBytes(n, b, 20)));
    expect(streamed).toEqual(await viaParseFile(entries));
    expect(streamed.errors.some((e) => e.code === 'UNCLOSED_QUOTE')).toBe(true);
  });

  it('rejects an oversized source before reading a byte', async () => {
    let opened = false;
    const source = {
      name: 'gross.csv',
      size: 60 * 1024 * 1024,
      // eslint-disable-next-line @typescript-eslint/require-await -- generator contract
      async *open() {
        opened = true;
        yield new Uint8Array(0);
      },
    };
    const result = await loadSources([source]);
    expect(result.errors[0]?.code).toBe('FILE_TOO_LARGE');
    expect(opened).toBe(false);
  });
});

describe('loadSources with workbooks', () => {
  const dir = join(import.meta.dirname, '../test/fixtures/xlsx/sample_data');
  const entries: [string, Uint8Array][] = readdirSync(dir)
    .filter((f) => f.endsWith('.xlsx'))
    .map((f) => [f, new Uint8Array(readFileSync(join(dir, f)))]);

  it('reads a full XLSX set exactly like parseFile + loadTables', async () => {
    const streamed = await loadSources(entries.map(([n, b]) => chunkSourceFromBytes(n, b, 1000)));
    expect(streamed.input).not.toBeNull();
    expect(streamed).toEqual(await viaParseFile(entries));
  });

  it('reports a broken workbook as a file error', async () => {
    const broken: [string, Uint8Array][] = [
      ['kaputt.xlsx', new Uint8Array([0x50, 0x4b, 3, 4, 9, 9])],
    ];
    const streamed = await loadSources(broken.map(([n, b]) => chunkSourceFromBytes(n, b, 2)));
    expect(streamed).toEqual(await viaParseFile(broken));
    expect(streamed.errors.length).toBeGreaterThan(0);
  });
});

describe('loadSources progress', () => {
  const csv = (rows: number): Uint8Array =>
    utf8(
      ['Artikelnummer;Datum;Menge', ...Array.from({ length: rows }, () => 'M1;05.10.2026;3')].join(
        '\n',
      ),
    );

  it('reports growing byte counts that end at the total size', async () => {
    const bytes = csv(400);
    const seen: [number, number][] = [];
    await loadSources([chunkSourceFromBytes('bedarf.csv', bytes, 500)], {
      onProgress: (read, total) => void seen.push([read, total]),
    });
    expect(seen.length).toBeGreaterThan(3);
    expect(seen.every(([, total]) => total === bytes.byteLength)).toBe(true);
    expect(seen.map(([read]) => read)).toEqual(
      [...seen.map(([read]) => read)].sort((a, b) => a - b),
    );
    expect(seen.at(-1)?.[0]).toBe(bytes.byteLength);
  });

  it('counts across files', async () => {
    const a = csv(50);
    const b = csv(50);
    const last: number[] = [];
    await loadSources(
      [chunkSourceFromBytes('bedarf.csv', a, 100), chunkSourceFromBytes('x.csv', b, 100)],
      { onProgress: (read) => void last.push(read) },
    );
    expect(last.at(-1)).toBe(a.byteLength + b.byteLength);
  });

  it('stops when the progress hook throws', async () => {
    let calls = 0;
    const run = loadSources([chunkSourceFromBytes('bedarf.csv', csv(400), 500)], {
      onProgress: () => {
        calls += 1;
        if (calls === 2) throw new Error('stop');
      },
    });
    await expect(run).rejects.toThrow('stop');
    expect(calls).toBe(2);
  });

  it('reports a workbook once, at its full size', async () => {
    const dir = join(import.meta.dirname, '../test/fixtures/xlsx/sample_data');
    const name = 'materials.xlsx';
    const bytes = new Uint8Array(readFileSync(join(dir, name)));
    const seen: number[] = [];
    await loadSources([chunkSourceFromBytes(name, bytes, 100)], {
      onProgress: (read) => void seen.push(read),
    });
    expect(seen).toEqual([bytes.byteLength]);
  });
});
