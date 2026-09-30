/**
 * Byte -> text decoding for uploaded CSV files (spec §5.1). German ERP exports arrive as UTF-8,
 * UTF-8 with BOM (Excel "CSV UTF-8") or Windows-1252 (Excel "CSV (Trennzeichen-getrennt)").
 * Runs in the Web Worker: only `TextDecoder`, which browsers, workers and Node all provide.
 */

/** Encoding a file was decoded with. */
export type TextEncoding = 'utf-8' | 'windows-1252';

/** Decoded file content, without the byte order mark. */
export interface DecodedText {
  readonly text: string;
  readonly encoding: TextEncoding;
}

/**
 * Why bytes are not a text file we can read: a ZIP container (e.g. an `.xlsx` renamed to `.csv`),
 * UTF-16 (Excel "Unicode Text"), or other binary data.
 */
export type NonTextKind = 'zip' | 'utf-16' | 'binary';

/** File content as the Worker receives it (`File.arrayBuffer()`) or as Node reads it. */
export type Bytes = Uint8Array | ArrayBuffer;

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04] as const;
const UTF16_LE_BOM = [0xff, 0xfe] as const;
const UTF16_BE_BOM = [0xfe, 0xff] as const;

/** Views `bytes` as a `Uint8Array` without copying. */
export function toUint8Array(bytes: Bytes): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

/**
 * Decodes file bytes like the prototype (`loaders.py` `_read_csv_rows`): strip one UTF-8 BOM, try
 * strict UTF-8, fall back to Windows-1252. Never fails: every byte sequence is valid Windows-1252
 * in the WHATWG Encoding Standard, which maps the five bytes Python's `cp1252` rejects
 * (0x81, 0x8D, 0x8F, 0x90, 0x9D) to C1 control characters instead of raising.
 *
 * Unlike the prototype, the BOM is also stripped when the rest falls back to Windows-1252 (Python
 * would keep it as the three characters `ï»¿` in the first header).
 *
 * @example `decodeText(bytes)` -> `{ text: 'Artikelnummer;Menge\n…', encoding: 'windows-1252' }`
 */
export function decodeText(bytes: Bytes): DecodedText {
  const view = toUint8Array(bytes);
  const body = startsWith(view, UTF8_BOM) ? view.subarray(UTF8_BOM.length) : view;
  try {
    // `ignoreBOM: true` keeps a second BOM as content: Python's utf-8-sig strips exactly one.
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body);
    return { text, encoding: 'utf-8' };
  } catch (error) {
    // A fatal decoder signals malformed input with a TypeError; anything else is a real bug.
    if (!(error instanceof TypeError)) throw error;
    return { text: new TextDecoder('windows-1252').decode(body), encoding: 'windows-1252' };
  }
}

/**
 * Recognises bytes that are not a single-byte or UTF-8 text file, so the user gets a precise hint
 * instead of garbled headers. Text files never contain NUL bytes; UTF-16 text has one in every
 * other byte for ASCII characters.
 *
 * @returns the kind of non-text content, or `null` for (probably) text.
 */
export function detectNonText(bytes: Bytes): NonTextKind | null {
  const view = toUint8Array(bytes);
  if (startsWith(view, ZIP_SIGNATURE)) return 'zip';
  if (startsWith(view, UTF16_LE_BOM) || startsWith(view, UTF16_BE_BOM)) return 'utf-16';
  if (!view.includes(0)) return null;
  const [first, second] = view;
  return (first === 0) !== (second === 0) ? 'utf-16' : 'binary';
}
