/**
 * Vitest setup file (see `vitest.config.ts`): fixes the fast-check seed for every parser test file,
 * so property tests are deterministic locally and in CI (AGENTS.md §6, ADR-0008). Same convention
 * as the engine: explore other inputs or replay a failure with `FC_SEED=<n> pnpm --filter
 * @vorchain/parsers test`.
 */
import fc from 'fast-check';

const DEFAULT_FC_SEED = 20261005;

function resolveFcSeed(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_FC_SEED;
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed) || seed < -(2 ** 31) || seed >= 2 ** 31) {
    throw new Error(`FC_SEED must be a 32-bit integer, got ${JSON.stringify(raw)}`);
  }
  return seed;
}

fc.configureGlobal({ ...fc.readConfigureGlobal(), seed: resolveFcSeed(process.env.FC_SEED) });
