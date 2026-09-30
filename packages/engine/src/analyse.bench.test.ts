import { beforeAll, describe, expect, it } from 'vitest';

import { syntheticInput } from './__fixtures__/synthetic-input.ts';
import { analyse } from './analyse.ts';
import { parseIsoDate, type IsoDate } from './dates.ts';
import type { AnalysisInput } from './types.ts';

/**
 * Wall-clock backstop at the spec's budget (spec §3.3: 20k materials and 100k demand rows in under
 * 3 s) for anything catastrophic, e.g. quadratic behaviour. Runs with `pnpm bench` (Vitest project
 * `bench`), alone and without coverage instrumentation, so the budget measures `analyse` itself.
 * The engine lint rules forbid reading the clock, in tests too, so it uses Vitest's own test
 * timeout, which also fails a synchronous test that finishes late. The dataset is built in
 * `beforeAll` (with its own timeout), so only `analyse` counts. The deterministic guard for the
 * known slow path is in `analyse.perf.test.ts`.
 */
const BUDGET_MS = 3000;
const HORIZON_DAYS = 90;

function isoDate(input: string): IsoDate {
  const result = parseIsoDate(input);
  if (!result.ok) throw new Error(`invalid test date ${input}`);
  return result.value;
}

const asOf = isoDate('2026-10-05');

describe('analyse at spec scale', () => {
  let input: AnalysisInput;
  beforeAll(() => {
    input = syntheticInput({
      seed: 20261005,
      asOf,
      horizonDays: HORIZON_DAYS,
      materials: 20_000,
      demandRows: 100_000,
      purchaseOrders: 30_000,
      suppliers: 60,
      deliveriesPerSupplier: 25,
    });
  }, 30_000);

  it(
    `analyses 20k materials, 100k demand rows and 30k POs over 90 days within ${String(BUDGET_MS)} ms`,
    { timeout: BUDGET_MS },
    () => {
      const report = analyse(input, { asOf, horizonDays: HORIZON_DAYS });
      // The dataset is seeded, so the result is fixed; a changed count means changed behaviour.
      expect(report.exceptions).toHaveLength(6127);
    },
  );
});
