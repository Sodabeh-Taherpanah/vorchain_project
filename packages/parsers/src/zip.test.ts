import { describe, expect, it } from 'vitest';

import { workbookBytes } from '../test/support/workbook.ts';
import { readZipContents } from './zip.ts';

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
    ).toEqual({
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
