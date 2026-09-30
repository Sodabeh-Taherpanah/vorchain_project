import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { stripPython } from './strip.ts';

/** Output of `[chr(c) for c in range(0x110000) if chr(c).isspace()]` in CPython 3. */
const PYTHON_SPACES = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001,
  0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f,
  0x205f, 0x3000,
].map((code) => String.fromCodePoint(code));

describe('stripPython', () => {
  it.each([
    { input: '', expected: '' },
    { input: '   ', expected: '' },
    { input: ' a b ', expected: 'a b' },
    { input: '\t15,0\r\n', expected: '15,0' },
    { input: '\u00a0M0001\u3000', expected: 'M0001' },
    { input: '\u0085x\u001f', expected: 'x' },
    // U+FEFF is not whitespace in Python (String.prototype.trim would remove it).
    { input: '\ufeffx', expected: '\ufeffx' },
    { input: 'Größe', expected: 'Größe' },
  ])('strips $input -> $expected', ({ input, expected }) => {
    expect(stripPython(input)).toBe(expected);
  });

  it('removes every Python whitespace character and nothing else at the edges', () => {
    const space = fc.constantFrom(...PYTHON_SPACES);
    // Any code point, lone surrogates included. Built from integers because fast-check's
    // `unit: 'binary'` strings take ~30 ms each to generate, which pushed this test past 5 s.
    const core = fc
      .array(fc.integer({ min: 0, max: 0x10ffff }), { minLength: 1, maxLength: 12 })
      .map((codePoints) => String.fromCodePoint(...codePoints))
      .filter((text) => !PYTHON_SPACES.includes(text.at(0) ?? ' '))
      .filter((text) => !PYTHON_SPACES.includes(text.at(-1) ?? ' '));
    fc.assert(
      fc.property(fc.array(space), core, fc.array(space), (before, text, after) => {
        expect(stripPython(before.join('') + text + after.join(''))).toBe(text);
      }),
    );
  });
});
