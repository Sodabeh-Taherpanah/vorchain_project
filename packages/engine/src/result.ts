/** Successful outcome of an operation that can fail in an expected way. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Expected failure, carrying a typed, locale-free error (never display text). */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Outcome of an operation with an expected failure mode (AGENTS.md §5). Narrow it with
 * `if (result.ok)`. Programmer errors still throw; only data problems travel as `Err`.
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Wraps a successful value.
 *
 * @example `ok(parsedDate)`
 */
export function ok<T>(value: T): Ok<T> {
  return Object.freeze({ ok: true, value });
}

/**
 * Wraps an expected failure.
 *
 * @example `err({ code: 'INVALID_FORMAT', input })`
 */
export function err<E>(error: E): Err<E> {
  return Object.freeze({ ok: false, error });
}
