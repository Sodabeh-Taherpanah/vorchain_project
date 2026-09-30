/**
 * Byte-level edits of real ZIP entries, for tests of damaged XLSX files. Walks the ZIP on its
 * own (not with `src/zip.ts`), so a bug there cannot hide in the fixture.
 */
import { readFileSync } from 'node:fs';

/** An openpyxl-written workbook from `test/fixtures/xlsx/sample_data/` (every part deflated). */
export function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(new URL(`../fixtures/xlsx/sample_data/${name}`, import.meta.url)),
  );
}

export interface EntryPatch {
  /** The entry's stored (compressed) bytes; writes change the returned copy. */
  readonly data: Uint8Array;
  readonly crc32: number;
  readonly size: number;
  /** Sets the CRC-32 in the local header and the central directory. */
  setCrc32(value: number): void;
  /** Sets the unpacked size in the local header and the central directory. */
  setSize(value: number): void;
}

/** A copy of `bytes` with the entry `name` changed by `patch`. */
export function patchEntry(
  bytes: Uint8Array,
  name: string,
  patch: (entry: EntryPatch) => void,
): Uint8Array {
  const copy = bytes.slice();
  const view = new DataView(copy.buffer);
  const decoder = new TextDecoder();
  let end = copy.length - 22;
  while (view.getUint32(end, true) !== 0x06054b50) end -= 1;
  let directory = view.getUint32(end + 16, true);
  for (let index = 0; index < view.getUint16(end + 10, true); index += 1) {
    const nameLength = view.getUint16(directory + 28, true);
    const entryName = decoder.decode(copy.subarray(directory + 46, directory + 46 + nameLength));
    if (entryName === name) {
      const local = view.getUint32(directory + 42, true);
      const start =
        local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const at = directory;
      patch({
        data: copy.subarray(start, start + view.getUint32(at + 20, true)),
        crc32: view.getUint32(at + 16, true),
        size: view.getUint32(at + 24, true),
        setCrc32(value) {
          view.setUint32(local + 14, value >>> 0, true);
          view.setUint32(at + 16, value >>> 0, true);
        },
        setSize(value) {
          view.setUint32(local + 22, value, true);
          view.setUint32(at + 24, value, true);
        },
      });
      return copy;
    }
    directory +=
      46 + nameLength + view.getUint16(directory + 30, true) + view.getUint16(directory + 32, true);
  }
  throw new Error(`no entry ${name}`);
}
