/**
 * Exactly the characters Python's `str.isspace()` accepts (checked against CPython 3 over all code
 * points). `String.prototype.trim` differs: it also strips U+FEFF but not U+001C..U+001F or U+0085,
 * so it would not match the prototype's `value.strip()`.
 */
export const PYTHON_WHITESPACE =
  '\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const LEADING_OR_TRAILING = new RegExp(`^[${PYTHON_WHITESPACE}]+|[${PYTHON_WHITESPACE}]+$`, 'gu');

/**
 * Python `str.strip()` without arguments: removes leading and trailing whitespace as the prototype
 * does for every cell (`loaders.py` `load_table`), including no-break spaces (U+00A0).
 *
 * @example `stripPython(' 15,0 \t')` -> `'15,0'`
 */
export function stripPython(value: string): string {
  return value.replace(LEADING_OR_TRAILING, '');
}
