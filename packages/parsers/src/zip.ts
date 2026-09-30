/**
 * A look at a ZIP container's table of contents without unpacking anything (backlog P1-10): which
 * entries it has (is it an XLSX, an ODS, a DOCX?) and how large they claim to be once unpacked
 * (ZIP bomb guard before SheetJS inflates them).
 */

/** Entry names and the sum of their declared unpacked sizes. */
export interface ZipContents {
  readonly names: readonly string[];
  /** `Infinity` if an entry defers its size to a ZIP64 record (never needed for a sane sheet). */
  readonly unpackedBytes: number;
}

const END_OF_DIRECTORY = 0x06_05_4b_50;
const DIRECTORY_ENTRY = 0x02_01_4b_50;
const END_RECORD_LENGTH = 22;
const MAX_COMMENT_LENGTH = 0xff_ff;
const ENTRY_HEADER_LENGTH = 46;
const ZIP64_MARKER = 0xff_ff_ff_ff;

/** Offset of the end-of-central-directory record, searched backwards past a trailing comment. */
function endRecordOffset(view: DataView): number | null {
  const last = view.byteLength - END_RECORD_LENGTH;
  const first = Math.max(0, last - MAX_COMMENT_LENGTH);
  for (let offset = last; offset >= first; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_DIRECTORY) return offset;
  }
  return null;
}

/**
 * Reads the central directory of a ZIP file.
 *
 * @returns `null` if `bytes` is no readable ZIP (no end record, or a directory that points outside
 *   the file): the caller reports a corrupt file.
 */
export function readZipContents(bytes: Uint8Array): ZipContents | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < END_RECORD_LENGTH) return null;
  const end = endRecordOffset(view);
  if (end === null) return null;
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const names: string[] = [];
  let unpackedBytes = 0;
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index += 1) {
    if (offset + ENTRY_HEADER_LENGTH > view.byteLength) return null;
    if (view.getUint32(offset, true) !== DIRECTORY_ENTRY) return null;
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + ENTRY_HEADER_LENGTH;
    if (nameStart + nameLength > view.byteLength) return null;
    names.push(decoder.decode(bytes.subarray(nameStart, nameStart + nameLength)));
    unpackedBytes += size === ZIP64_MARKER ? Infinity : size;
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return { names, unpackedBytes };
}
