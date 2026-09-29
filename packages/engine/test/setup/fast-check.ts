/**
 * Vitest setup file (see `vitest.config.ts`): runs before every engine test file and fixes the
 * fast-check seed, so property tests are deterministic locally and in CI (AGENTS.md §6, ADR-0008).
 *
 * Explore other inputs with a different seed, and reproduce a failure with the seed fast-check
 * prints (it also prints a `path` that replays only the failing case):
 *
 *   FC_SEED=12345 pnpm --filter @vorchain/engine test
 *
 * A test that passes its own `seed` to `fc.assert` (e.g. the perf test) keeps that seed.
 */
import fc from 'fast-check';

/** The fixtures' as-of date (2026-10-05), also the seed of the Python vector generator. */
export const DEFAULT_FC_SEED = 20261005;

/** `FC_SEED` if set (a 32-bit signed integer, as fast-check expects), else the default seed. */
export function resolveFcSeed(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_FC_SEED;
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed) || seed < -(2 ** 31) || seed >= 2 ** 31) {
    throw new Error(`FC_SEED must be a 32-bit integer, got ${JSON.stringify(raw)}`);
  }
  return seed;
}

fc.configureGlobal({ ...fc.readConfigureGlobal(), seed: resolveFcSeed(process.env.FC_SEED) });
