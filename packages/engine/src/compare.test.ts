import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { compareCodePoints } from './compare.ts';

describe('compareCodePoints', () => {
  it.each([
    ['S01', 'S02', -1],
    ['S02', 'S01', 1],
    ['S01', 'S01', 0],
    ['S1', 'S10', -1],
    ['S10', 'S9', -1],
    ['B', 'a', -1],
    ['', 'S01', -1],
    ['Ä', 'Z', 1],
  ])('orders %j before/after %j like Python str comparison (sign %i)', (a, b, sign) => {
    expect(Math.sign(compareCodePoints(a, b))).toBe(sign);
  });

  it('orders astral characters after U+FFFF, as Python does (UTF-16 order would not)', () => {
    const astral = '\u{1F600}';
    const lastBmp = '￿';
    expect(compareCodePoints(lastBmp, astral)).toBeLessThan(0);
    expect(compareCodePoints(astral, lastBmp)).toBeGreaterThan(0);
    expect([astral, lastBmp, 'S01'].sort(compareCodePoints)).toEqual(['S01', lastBmp, astral]);
  });

  it('agrees with comparing arrays of code points', () => {
    const codePoints = (s: string) => Array.from(s, (c) => c.codePointAt(0));
    const reference = (a: string, b: string): number => {
      const [x, y] = [codePoints(a), codePoints(b)];
      for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
        if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0);
      }
      return x.length - y.length;
    };
    const text = fc.string({ unit: 'binary', maxLength: 6 });
    fc.assert(
      fc.property(text, text, (a, b) => {
        expect(Math.sign(compareCodePoints(a, b))).toBe(Math.sign(reference(a, b)));
      }),
    );
  });
});
