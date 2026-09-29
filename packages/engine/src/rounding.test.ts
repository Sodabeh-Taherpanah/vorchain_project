import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { pyRound } from './rounding.ts';

describe('pyRound(x) without ndigits (CPython returns an int)', () => {
  // Expected values: CPython 3 `round(x)`.
  it.each([
    [2.5, 2],
    [3.5, 4],
    [-2.5, -2],
    [0.5, 0],
    [1.5, 2],
    [-0.5, 0],
    [-1.5, -2],
    [0.49999999999999994, 0], // largest double below 0.5; naive Math.floor(x + 0.5) gives 1
    [-0.4, 0],
    [-0, 0],
    [2.4, 2],
    [-2.6, -3],
    [4503599627370497, 4503599627370497],
    [1.0000000000000002e16, 10000000000000002],
  ])('pyRound(%d) = %d', (x, expected) => {
    expect(pyRound(x)).toBe(expected);
  });

  it('never returns -0, because a Python int has no negative zero', () => {
    expect(Object.is(pyRound(-0), 0)).toBe(true);
    expect(Object.is(pyRound(-0.4), 0)).toBe(true);
    expect(Object.is(pyRound(-0.5), 0)).toBe(true);
  });

  it('throws RangeError for non-finite input, as CPython raises OverflowError/ValueError', () => {
    expect(() => pyRound(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => pyRound(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
    expect(() => pyRound(Number.NaN)).toThrow(RangeError);
  });
});

describe('pyRound(x, ndigits) (CPython returns a float)', () => {
  // Expected values: CPython 3 `round(x, n)`. The first block is ADR-0005 item 1.
  it.each([
    [0.125, 2, 0.12],
    [2.675, 2, 2.67], // the double is 2.67499999…, so no tie
    [1.25, 1, 1.2],
    [1.35, 1, 1.4], // the double is 1.350000…01
    [-1.25, 1, -1.2],
    [2.5, 0, 2],
    [0.05, 1, 0.1],
    [0.15, 1, 0.1],
    [0.25, 1, 0.2],
    [0.35, 1, 0.3],
    [0.45, 1, 0.5],
    [1.005, 2, 1],
    [0.285, 2, 0.28],
    [1.115, 2, 1.11],
    [2.345, 2, 2.35],
    [8.345, 2, 8.35],
    [-2.675, 2, -2.67],
    [0.375, 2, 0.38],
    [-0.375, 2, -0.38],
    [2.5e-5, 5, 3e-5],
    [130, 1, 130],
    [127.95, 1, 128],
    [121.94999999999999, 1, 121.9],
    // Seeded random vectors (Python `random.seed(20261005)`).
    [-27.432, 2, -27.43],
    [4.815, 1, 4.8],
    [-75.133, 1, -75.1],
    [-76.015, 1, -76],
    [87.901, 2, 87.9],
    [67.983, 2, 67.98],
    [53.793, 2, 53.79],
    [-40.405, 1, -40.4],
    [-60.787, 2, -60.79],
    [-12.5, 1, -12.5],
    [-30.75, 0, -31],
    [48.5, 0, 48],
    [47.125, 0, 47],
    [-16.625, 1, -16.6],
    [28.875, 2, 28.88],
    [211.78021114588228, 1, 211.8],
    [-0.9524656022549038, 1, -1],
    [-486.109154265827, 1, -486.1],
    [124.64713406057092, 1, 124.6],
    // Extremes.
    [1e-320, 2, 0],
    [1e300, 2, 1e300],
    [5e-324, 1074, 5e-324],
    [0.1, 400, 0.1],
  ])('pyRound(%d, %d) = %d', (x, ndigits, expected) => {
    expect(pyRound(x, ndigits)).toBe(expected);
  });

  it.each([
    [1234.5, -1, 1230],
    [1250, -2, 1200],
    [1350, -2, 1400],
    [-1250, -2, -1200],
    [123.456, -5, 0],
    [1e300, -400, 0],
  ])('supports negative ndigits: pyRound(%d, %d) = %d', (x, ndigits, expected) => {
    expect(pyRound(x, ndigits)).toBe(expected);
  });

  it('keeps the sign of zero like a Python float', () => {
    expect(Object.is(pyRound(-0.04, 1), -0)).toBe(true);
    expect(Object.is(pyRound(-0, 1), -0)).toBe(true);
    expect(Object.is(pyRound(-0.5, 0), -0)).toBe(true);
    expect(Object.is(pyRound(-123.456, -5), -0)).toBe(true);
    expect(Object.is(pyRound(0.04, 1), 0)).toBe(true);
  });

  it('returns non-finite input unchanged, like CPython', () => {
    expect(pyRound(Number.POSITIVE_INFINITY, 1)).toBe(Number.POSITIVE_INFINITY);
    expect(pyRound(Number.NEGATIVE_INFINITY, 2)).toBe(Number.NEGATIVE_INFINITY);
    expect(pyRound(Number.NaN, 1)).toBeNaN();
  });

  it('throws RangeError when rounding overshoots the double range, as CPython raises OverflowError', () => {
    // CPython: round(1.7976931348623157e308, -308) -> OverflowError: rounded value too large.
    expect(() => pyRound(Number.MAX_VALUE, -308)).toThrow(RangeError);
    expect(() => pyRound(-Number.MAX_VALUE, -308)).toThrow(RangeError);
    expect(() => pyRound(1.5e308, -308)).toThrow(RangeError);
    // One digit less still fits: 1.79769313e308.
    expect(pyRound(Number.MAX_VALUE, -300)).toBe(1.79769313e308);
  });

  it('throws TypeError for a non-integer ndigits, as CPython does', () => {
    expect(() => pyRound(1.5, 1.5)).toThrow(TypeError);
    expect(() => pyRound(1.5, Number.NaN)).toThrow(TypeError);
  });
});

describe('pyRound properties', () => {
  const finite = fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true });
  const digits = fc.integer({ min: 0, max: 6 });

  it('is idempotent', () => {
    fc.assert(
      fc.property(finite, digits, (x, n) => {
        const once = pyRound(x, n);
        expect(pyRound(once, n)).toBe(once);
      }),
    );
  });

  it('stays within half a unit of the last kept digit', () => {
    fc.assert(
      fc.property(finite, digits, (x, n) => {
        const unit = 10 ** -n;
        // Tiny slack for converting the decimal result back to the nearest double.
        expect(Math.abs(pyRound(x, n) - x)).toBeLessThanOrEqual(unit / 2 + Math.abs(x) * 1e-15);
      }),
    );
  });

  it('is odd-symmetric: pyRound(-x, n) === -pyRound(x, n)', () => {
    fc.assert(
      fc.property(finite, digits, (x, n) => {
        expect(pyRound(-x, n)).toBe(-pyRound(x, n));
      }),
    );
  });

  it('rounds i + f (0 <= f < 0.5) down to i', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1e6, max: 1e6 }),
        fc.double({ min: 0, max: 0.49, noNaN: true }),
        (i, f) => {
          expect(pyRound(i + f)).toBe(i);
        },
      ),
    );
  });

  it('rounds exact .5 ties to the even neighbour', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e6, max: 1e6 }), (i) => {
        const rounded = pyRound(i + 0.5);
        expect(rounded % 2 === 0).toBe(true);
        expect(Math.abs(rounded - (i + 0.5))).toBe(0.5);
      }),
    );
  });

  it('matches Number#toFixed (also exact on the binary value) everywhere except exact ties', () => {
    // toFixed rounds ties away from zero, so exact ties are excluded here and covered above.
    // For |x| < 1e9 and n <= 6 a real tie makes x * 10^n exactly k + 0.5, so none slips through.
    const isExactTie = (x: number, n: number): boolean => {
      const scaled = Math.abs(x) * 10 ** n;
      return scaled - Math.floor(scaled) === 0.5;
    };
    fc.assert(
      fc.property(
        finite.filter((x) => x !== 0),
        digits,
        (x, n) => {
          fc.pre(!isExactTie(x, n));
          expect(pyRound(x, n)).toBe(Number(x.toFixed(n)));
        },
      ),
      { numRuns: 1000 },
    );
  });
});
