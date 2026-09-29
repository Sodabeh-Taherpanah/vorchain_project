import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DEFAULT_FC_SEED, resolveFcSeed } from './setup/fast-check.ts';

describe('fast-check seed (test setup)', () => {
  it('is fixed for every property test, overridable via FC_SEED', () => {
    expect(fc.readConfigureGlobal().seed).toBe(resolveFcSeed(process.env.FC_SEED));
  });

  it('defaults to the fixture as-of seed and accepts any 32-bit integer', () => {
    expect(resolveFcSeed(undefined)).toBe(DEFAULT_FC_SEED);
    expect(resolveFcSeed(' ')).toBe(DEFAULT_FC_SEED);
    expect(resolveFcSeed('42')).toBe(42);
    expect(resolveFcSeed('-2147483648')).toBe(-(2 ** 31));
  });

  it('rejects a seed fast-check cannot use, instead of silently running unseeded', () => {
    for (const raw of ['abc', '1.5', '2147483648', 'NaN']) {
      expect(() => resolveFcSeed(raw)).toThrow(/FC_SEED/);
    }
  });
});
