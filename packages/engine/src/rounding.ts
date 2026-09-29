/**
 * CPython-compatible rounding (ADR-0005 item 1). Python's `round()` rounds the *exact* binary
 * value of a double to the nearest multiple of `10^-ndigits`, with exact ties going to the even
 * neighbour. `Math.round(x * 10) / 10` is wrong on both counts (it rounds ties up and the
 * multiplication itself rounds), so this module does the arithmetic exactly with `BigInt`.
 */

/**
 * Beyond this many digits every finite double is already exact, so CPython returns `x` unchanged
 * (`NDIGITS_MAX` in `Objects/floatobject.c`: (DBL_MANT_DIG - DBL_MIN_EXP) * 0.30103).
 */
const NDIGITS_MAX = 323;
/** Below this many (negative) digits every finite double rounds to zero (`NDIGITS_MIN`). */
const NDIGITS_MIN = -308;

/**
 * Rounds like CPython's built-in `round()`.
 *
 * - `pyRound(x)` mirrors `round(x)`, which returns an `int`: the result is never `-0`, and a
 *   non-finite `x` throws (CPython raises `OverflowError` / `ValueError`).
 * - `pyRound(x, ndigits)` mirrors `round(x, ndigits)`, which returns a `float`: the sign of zero is
 *   kept (`pyRound(-0.04, 1)` is `-0`), non-finite `x` is returned unchanged, and `ndigits` may be
 *   negative (`pyRound(1250, -2)` is `1200`).
 *
 * The engine uses it for `p80` and `minProjectedStock` (`pyRound(x)`) and `score` (`pyRound(x, 1)`).
 *
 * @example `pyRound(2.5)` is `2`, `pyRound(3.5)` is `4`, `pyRound(2.675, 2)` is `2.67`.
 * @throws RangeError for `pyRound(x)` with non-finite `x`; TypeError if `ndigits` is not an integer.
 */
export function pyRound(x: number, ndigits?: number): number {
  if (ndigits === undefined) {
    if (!Number.isFinite(x)) throw new RangeError(`cannot round ${String(x)} to an integer`);
    // `|| 0` turns -0 into 0: a Python int has no negative zero.
    return roundFinite(x, 0) || 0;
  }
  if (!Number.isInteger(ndigits)) {
    throw new TypeError(`ndigits must be an integer, got ${String(ndigits)}`);
  }
  if (!Number.isFinite(x) || ndigits > NDIGITS_MAX) return x;
  if (ndigits < NDIGITS_MIN) return 0 * x;
  return roundFinite(x, ndigits);
}

/** Correctly rounded, ties-to-even rounding of a finite `x` to `ndigits` decimal digits. */
function roundFinite(x: number, ndigits: number): number {
  const { mantissa, exponent } = toExactBinary(Math.abs(x));
  // |x| = mantissa / 2^exponent and the target unit is 10^-ndigits, so the rounded result in
  // units is numerator / denominator, rounded half to even.
  const powerOfTen = 10n ** BigInt(Math.abs(ndigits));
  const powerOfTwo = 2n ** BigInt(exponent);
  const numerator = ndigits >= 0 ? mantissa * powerOfTen : mantissa;
  const denominator = ndigits >= 0 ? powerOfTwo : powerOfTwo * powerOfTen;
  const units = divideHalfEven(numerator, denominator);
  // The decimal string is parsed with correct rounding, which is how CPython converts back too.
  const magnitude = Number(`${units.toString()}e${String(-ndigits)}`);
  return x < 0 || Object.is(x, -0) ? -magnitude : magnitude;
}

/**
 * Splits a finite, non-negative double into an integer mantissa and a power of two such that
 * `value = mantissa / 2^exponent` exactly. Doubling a double is exact, so the loop never loses
 * precision; it runs at most 1074 times (for the smallest subnormal).
 */
function toExactBinary(value: number): { mantissa: bigint; exponent: number } {
  let scaled = value;
  let exponent = 0;
  while (!Number.isInteger(scaled)) {
    scaled *= 2;
    exponent += 1;
  }
  return { mantissa: BigInt(scaled), exponent };
}

function divideHalfEven(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const twiceRemainder = 2n * (numerator % denominator);
  const roundsUp =
    twiceRemainder > denominator || (twiceRemainder === denominator && quotient % 2n === 1n);
  return roundsUp ? quotient + 1n : quotient;
}
