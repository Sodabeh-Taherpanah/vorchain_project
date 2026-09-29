/**
 * Ordering helpers that match the prototype's Python semantics. JavaScript compares strings by
 * UTF-16 code unit, Python by code point; the two disagree only when one string has a character
 * above U+FFFF (stored as a surrogate pair) where the other has one in U+E000..U+FFFF.
 */

const SURROGATE_START = 0xd800;
const PRIVATE_USE_START = 0xe000;
/** Moves U+E000..U+FFFF down below the surrogates while keeping their relative order. */
const BMP_TAIL_SHIFT = 0x800;
/** Moves the surrogates (which only start characters above U+FFFF) above U+FFFF's slot. */
const SURROGATE_SHIFT = 0x2000;

/**
 * Comparator that orders strings by Unicode code point, like Python's `sorted()` on `str`.
 * Use it wherever an order must equal Python's, e.g. to match the golden files' sorted suppliers.
 * Assumes well-formed UTF-16 (no lone surrogates), which the parsers' decoders guarantee.
 *
 * @returns a negative number if `a` sorts first, a positive number if `b` does, `0` if equal.
 */
export function compareCodePoints(a: string, b: string): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i += 1) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x !== y) return codePointRank(x) - codePointRank(y);
  }
  return a.length - b.length;
}

/**
 * Maps a UTF-16 code unit to a rank that sorts in code point order: at the first differing unit
 * a surrogate always starts a character above U+FFFF, so it must outrank U+E000..U+FFFF.
 */
function codePointRank(unit: number): number {
  if (unit < SURROGATE_START) return unit;
  return unit < PRIVATE_USE_START ? unit + SURROGATE_SHIFT : unit - BMP_TAIL_SHIFT;
}
