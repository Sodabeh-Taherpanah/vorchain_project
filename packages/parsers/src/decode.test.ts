import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { decodeText, detectNonText } from './decode.ts';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const BOM = [0xef, 0xbb, 0xbf];

/** Windows-1252 byte -> character, straight from the platform decoder (single-byte, bijective). */
const CP1252_CHARS = Array.from({ length: 256 }, (_, byte) =>
  new TextDecoder('windows-1252').decode(bytes(byte)),
);
const CP1252_BYTE = new Map(CP1252_CHARS.map((char, byte) => [char, byte]));

function encodeCp1252(text: string): number[] {
  return Array.from(text, (char) => {
    const byte = CP1252_BYTE.get(char);
    if (byte === undefined)
      throw new Error(`not in Windows-1252: U+${String(char.codePointAt(0))}`);
    return byte;
  });
}

describe('decodeText', () => {
  it.each([
    { name: 'ASCII', input: utf8('a;b\n1;2'), text: 'a;b\n1;2', encoding: 'utf-8' },
    { name: 'UTF-8 umlauts', input: utf8('Größe;Müller'), text: 'Größe;Müller', encoding: 'utf-8' },
    {
      name: 'UTF-8 with BOM (BOM stripped)',
      input: bytes(...BOM, ...utf8('Größe')),
      text: 'Größe',
      encoding: 'utf-8',
    },
    {
      name: 'only the first BOM is stripped, like Python utf-8-sig',
      input: bytes(...BOM, ...BOM, 0x61),
      text: '\ufeffa',
      encoding: 'utf-8',
    },
    { name: 'BOM only', input: bytes(...BOM), text: '', encoding: 'utf-8' },
    { name: 'empty', input: bytes(), text: '', encoding: 'utf-8' },
    {
      name: 'Windows-1252 umlauts and sharp s',
      input: bytes(...encodeCp1252('Krüger;Größe;Straße')),
      text: 'Krüger;Größe;Straße',
      encoding: 'windows-1252',
    },
    {
      name: 'Windows-1252 euro sign and typographic quotes (0x80-0x9F range)',
      input: bytes(0x80, 0x20, 0x84, 0x93),
      text: '€ „“',
      encoding: 'windows-1252',
    },
    {
      name: 'truncated UTF-8 sequence falls back to Windows-1252',
      input: bytes(0x61, 0xc3),
      text: 'aÃ',
      encoding: 'windows-1252',
    },
    {
      name: 'BOM followed by invalid UTF-8: BOM stripped, rest as Windows-1252',
      input: bytes(...BOM, 0xfc),
      text: 'ü',
      encoding: 'windows-1252',
    },
    {
      name: 'byte undefined in Python cp1252 (0x81) maps to U+0081 (WHATWG)',
      input: bytes(0x81),
      text: '\u0081',
      encoding: 'windows-1252',
    },
  ])('$name', ({ input, text, encoding }) => {
    expect(decodeText(input)).toEqual({ text, encoding });
  });

  it('accepts an ArrayBuffer as well as a Uint8Array', () => {
    const view = utf8('Größe');
    const buffer = new ArrayBuffer(view.byteLength);
    new Uint8Array(buffer).set(view);
    expect(decodeText(buffer)).toEqual({ text: 'Größe', encoding: 'utf-8' });
  });

  it('decodes only the viewed range of a Uint8Array', () => {
    const whole = utf8('xxGrößexx');
    expect(decodeText(whole.subarray(2, whole.length - 2)).text).toBe('Größe');
  });

  it('never throws on arbitrary bytes and is lossless (re-encodes to the input)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 256 }), (input) => {
        const { text, encoding } = decodeText(input);
        const body = hasBom(input) ? input.subarray(3) : input;
        const reEncoded = encoding === 'utf-8' ? utf8(text) : bytes(...encodeCp1252(text));
        expect(reEncoded).toEqual(body);
      }),
    );
  });

  it('decodes every valid UTF-8 text unchanged', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 64 }), (text) => {
        fc.pre(!text.startsWith('\ufeff'));
        expect(decodeText(utf8(text))).toEqual({ text, encoding: 'utf-8' });
      }),
    );
  });
});

function hasBom(input: Uint8Array): boolean {
  return input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf;
}

describe('detectNonText', () => {
  it.each([
    { name: 'plain text', input: utf8('a;b\n1;2'), expected: null },
    { name: 'empty', input: bytes(), expected: null },
    { name: 'Windows-1252 text', input: bytes(0x4b, 0x72, 0xfc, 0x67), expected: null },
    {
      name: 'ZIP container such as .xlsx',
      input: bytes(0x50, 0x4b, 0x03, 0x04, 0x14),
      expected: 'zip',
    },
    { name: 'UTF-16 LE with BOM', input: bytes(0xff, 0xfe, 0x61, 0x00), expected: 'utf-16' },
    { name: 'UTF-16 BE with BOM', input: bytes(0xfe, 0xff, 0x00, 0x61), expected: 'utf-16' },
    { name: 'UTF-16 LE without BOM', input: bytes(0x61, 0x00, 0x3b, 0x00), expected: 'utf-16' },
    { name: 'UTF-16 BE without BOM', input: bytes(0x00, 0x61, 0x00, 0x3b), expected: 'utf-16' },
    {
      name: 'NUL byte in the middle',
      input: bytes(0x25, 0x50, 0x44, 0x46, 0x00, 0x01),
      expected: 'binary',
    },
  ])('$name -> $expected', ({ input, expected }) => {
    expect(detectNonText(input)).toBe(expected);
  });
});
