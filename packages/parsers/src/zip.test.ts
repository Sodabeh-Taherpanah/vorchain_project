import { describe, expect, it } from 'vitest';

import { workbookBytes } from '../test/support/workbook.ts';
import { fixtureBytes, patchEntry } from '../test/support/zip.ts';
import { checkZipData, readZipContents } from './zip.ts';

/** A ZIP made of a central directory only: one entry per `[name, unpackedSize]`. */
function directoryOnly(entries: readonly (readonly [string, number])[], signature = 0x02014b50) {
  const parts = entries.map(([name, size]) => {
    const encoded = new TextEncoder().encode(name);
    const entry = new DataView(new ArrayBuffer(46 + encoded.length));
    entry.setUint32(0, signature, true);
    entry.setUint32(24, size, true);
    entry.setUint16(28, encoded.length, true);
    new Uint8Array(entry.buffer).set(encoded, 46);
    return new Uint8Array(entry.buffer);
  });
  const directoryLength = parts.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(16, 0, true);
  const bytes = new Uint8Array(directoryLength + 22);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  bytes.set(new Uint8Array(end.buffer), offset);
  return bytes;
}

describe('readZipContents', () => {
  it('lists the parts of an XLSX package and their unpacked size', () => {
    const contents = readZipContents(workbookBytes({ S: [['a']] }));
    expect(contents?.names).toContain('xl/workbook.xml');
    expect(contents?.unpackedBytes).toBeGreaterThan(1000);
  });

  it('sums declared sizes and counts a ZIP64 size as infinite', () => {
    expect(
      readZipContents(
        directoryOnly([
          ['a', 5],
          ['b', 7],
        ]),
      ),
    ).toMatchObject({
      names: ['a', 'b'],
      unpackedBytes: 12,
    });
    expect(readZipContents(directoryOnly([['big', 0xffffffff]]))?.unpackedBytes).toBe(Infinity);
  });

  it.each([
    { name: 'too short', bytes: new Uint8Array(10) },
    { name: 'without an end record', bytes: new Uint8Array(100) },
    { name: 'with a broken entry', bytes: directoryOnly([['a', 1]], 0x12345678) },
    { name: 'with a directory past the end', bytes: directoryOnly([['a', 1]]).subarray(20) },
  ])('returns null for a file $name', ({ bytes }) => {
    expect(readZipContents(bytes)).toBeNull();
  });
});

describe('checkZipData', () => {
  const sheet = 'xl/worksheets/sheet1.xml';

  async function check(bytes: Uint8Array, limit = 1e9) {
    const contents = readZipContents(bytes);
    if (contents === null) throw new Error('expected a ZIP');
    return checkZipData(bytes, contents, limit);
  }

  it('accepts deflated (openpyxl) and stored (SheetJS) packages', async () => {
    expect(await check(fixtureBytes('materials.xlsx'))).toBe('ok');
    expect(await check(workbookBytes({ S: [['a']] }))).toBe('ok');
  });

  it.each([
    { name: 'a deflate stream SheetJS loops on', at: 10 },
    { name: 'a deflate stream SheetJS misreads', at: 100 },
  ])('rejects $name as corrupt', async ({ at }) => {
    const bytes = patchEntry(fixtureBytes('materials.xlsx'), sheet, (entry) => {
      entry.data.fill(0xff, at, at + 40);
    });
    expect(await check(bytes)).toBe('corrupt');
  });

  it('rejects a damaged stored entry, and an unknown compression method', async () => {
    const stored = workbookBytes({ S: [['a']] });
    const damaged = patchEntry(stored, sheet, (entry) => {
      entry.data.fill(0x20, 0, 5);
    });
    expect(await check(damaged)).toBe('corrupt');
    const method = stored.slice();
    method[8] = 12; // bzip2, in the first local header
    expect(await check(method)).toBe('corrupt');
  });

  it('stops unpacking at the limit, whatever the entries declare', async () => {
    const bytes = fixtureBytes('materials.xlsx');
    const total = readZipContents(bytes)?.unpackedBytes ?? 0;
    expect(await check(bytes, total)).toBe('ok');
    expect(await check(bytes, total - 1)).toBe('too-large');
    expect(await check(workbookBytes({ S: [['a']] }), 10)).toBe('too-large');
  });

  it('rejects a directory that points outside the file or at no local header', async () => {
    const bytes = fixtureBytes('materials.xlsx');
    const contents = readZipContents(bytes);
    if (contents === null) throw new Error('expected a ZIP');
    const [first] = contents.entries;
    if (first === undefined) throw new Error('expected an entry');
    const moved = (change: Partial<typeof first>) => ({
      ...contents,
      entries: [{ ...first, ...change }],
    });
    expect(await checkZipData(bytes, moved({ localHeaderOffset: bytes.length }), 1e9)).toBe(
      'corrupt',
    );
    expect(await checkZipData(bytes, moved({ localHeaderOffset: 1 }), 1e9)).toBe('corrupt');
    expect(await checkZipData(bytes, moved({ compressedSize: bytes.length }), 1e9)).toBe('corrupt');
  });
});
