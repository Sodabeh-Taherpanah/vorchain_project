import { beforeAll, describe, expect, it, vi } from 'vitest';

import { syntheticInput, type SyntheticInputOptions } from './__fixtures__/synthetic-input.ts';
import { analyse } from './analyse.ts';
import { parseIsoDate, type IsoDate } from './dates.ts';
import { projectionSeries, projectionWindow, projectStock } from './projection.ts';
import type { AnalysisInput } from './types.ts';

/**
 * Performance guards for the spec's scale (spec §3.3: 20k materials and 100k demand rows in under
 * 3 s, parsing included).
 *
 * 1. A deterministic guard: `analyse` builds the projection window once and never falls back to
 *    the per-call helpers. Rebuilding the window per projection made a 20k-material run take
 *    about 3.6 s instead of about 0.35 s, which a wall-clock test alone cannot reliably catch:
 *    coverage instrumentation and parallel test workers slow a healthy run by 2-3x on their own.
 * 2. A wall-clock backstop at the spec's 3 s budget for anything catastrophic (e.g. quadratic).
 *    The engine lint rules forbid reading the clock, in tests too, so it uses Vitest's own test
 *    timeout, which also fails a synchronous test that finishes late. The dataset is built in
 *    `beforeAll` (with its own timeout), so only `analyse` counts.
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

const BUDGET_MS = 3000;
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

  describe('at spec scale', () => {
    let input: AnalysisInput;
    beforeAll(() => {
      input = syntheticInput(specScale);
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
});
