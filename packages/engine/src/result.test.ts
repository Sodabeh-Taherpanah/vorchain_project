import { describe, expect, it } from 'vitest';

import { err, ok, type Result } from './result.ts';

function half(n: number): Result<number, 'ODD'> {
  return n % 2 === 0 ? ok(n / 2) : err('ODD');
}

describe('Result', () => {
  it('ok() wraps a value that callers read after narrowing on `ok`', () => {
    const result = half(84);
    expect(result).toEqual({ ok: true, value: 42 });
    expect(result.ok ? result.value : null).toBe(42);
  });

  it('err() wraps an error that callers read after narrowing on `ok`', () => {
    const result = half(3);
    expect(result).toEqual({ ok: false, error: 'ODD' });
    expect(result.ok ? null : result.error).toBe('ODD');
  });

  it('returns frozen objects so results cannot be mutated after creation', () => {
    expect(Object.isFrozen(ok(1))).toBe(true);
    expect(Object.isFrozen(err('x'))).toBe(true);
  });
});
