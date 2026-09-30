import { describe, expect, it, vi } from 'vitest';

import { syntheticInput, type SyntheticInputOptions } from './__fixtures__/synthetic-input.ts';
import { analyse } from './analyse.ts';
import { parseIsoDate, type IsoDate } from './dates.ts';
import { projectionSeries, projectionWindow, projectStock } from './projection.ts';

/**
 * Deterministic performance guard for the spec's scale (spec §3.3: 20k materials and 100k demand
 * rows in under 3 s, parsing included): `analyse` builds the projection window once and never
 * falls back to the per-call helpers. Rebuilding the window per projection made a 20k-material run
 * take about 3.6 s instead of about 0.35 s, which a wall-clock test alone cannot reliably catch.
 * The wall-clock check at spec scale lives in `analyse.bench.test.ts` and runs with `pnpm bench`,
 * alone and without coverage instrumentation, which slows a healthy run by 2-3x (it timed out at
 * 3.3 s in CI when it shared the coverage run with other packages' tests).
 */
vi.mock(import('./projection.ts'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    projectionWindow: vi.fn(actual.projectionWindow),
    projectStock: vi.fn(actual.projectStock),
    projectionSeries: vi.fn(actual.projectionSeries),
  };
});

const HORIZON_DAYS = 90;

function isoDate(input: string): IsoDate {
  const result = parseIsoDate(input);
  if (!result.ok) throw new Error(`invalid test date ${input}`);
  return result.value;
}

const asOf = isoDate('2026-10-05');
const specScale: SyntheticInputOptions = {
  seed: 20261005,
  asOf,
  horizonDays: HORIZON_DAYS,
  materials: 20_000,
  demandRows: 100_000,
  purchaseOrders: 30_000,
  suppliers: 60,
  deliveriesPerSupplier: 25,
};

describe('analyse performance', () => {
  it('builds the projection window once per run and never uses the per-call helpers', () => {
    const input = syntheticInput({
      ...specScale,
      materials: 200,
      demandRows: 1000,
      purchaseOrders: 300,
    });
    vi.mocked(projectionWindow).mockClear();
    const report = analyse(input, { asOf, horizonDays: HORIZON_DAYS });
    expect(report.exceptions.length).toBeGreaterThan(0);
    expect(projectionWindow).toHaveBeenCalledTimes(1);
    expect(projectStock).not.toHaveBeenCalled();
    expect(projectionSeries).not.toHaveBeenCalled();
  });
});
