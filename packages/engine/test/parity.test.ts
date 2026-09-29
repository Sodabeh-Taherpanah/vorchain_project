/**
 * Parity test (P1-06, ADR-0005, AGENTS.md §6): the engine's public `analyse` on the prototype's
 * sample data must reproduce `reference/python-prototype/golden/*.json` exactly.
 *
 * What the golden files hold, and so what this compares:
 * - every exception, in ranked order: material ID, severity, critical date, days until, min
 *   projected stock, hidden flag, ERP view date and score (exact numbers, `Object.is`);
 * - every supplier's `mean` and `on_time_rate` (both rounded to 4 decimals by the export, so the
 *   engine's unrounded values go through the same `round(x, 4)`), `p80` and `n`.
 *
 * What it skips on purpose, because the prototype has no counterpart:
 * - `Report.overduePurchaseOrders`, `summary.overduePurchaseOrders` and `PO_OVERDUE` reasons
 *   (ADR-0005 item 5, option B). The comparison only reads the golden columns above.
 * - `why` / `next_action` text is not in the golden files; `src/python-vectors.test.ts` compares it
 *   for the same sample data (rendered with the prototype's templates in
 *   `src/__fixtures__/prototype-text.ts`).
 *
 * To regenerate the golden files, see `packages/engine/README.md` ("Parity process").
 */
import { describe, expect, it } from 'vitest';

import { compareCodePoints } from '../src/compare.ts';
import {
  analyse,
  parseIsoDate,
  pyRound,
  type IsoDate,
  type Report,
  type SupplierStats,
} from '../src/index.ts';
import { readGolden, type GoldenException, type GoldenSupplier } from './support/golden.ts';
import { loadPrototypeSample, PROTOTYPE_DIR } from './support/prototype-sample.ts';

const SAMPLE_DIR = `${PROTOTYPE_DIR}sample_data`;
const GOLDEN_EN = `${PROTOTYPE_DIR}golden/sample_data.json`;
const GOLDEN_DE = `${PROTOTYPE_DIR}golden/sample_data_de.json`;

function isoDate(input: string): IsoDate {
  const result = parseIsoDate(input);
  if (!result.ok) throw new Error(`golden holds an invalid date: ${input}`);
  return result.value;
}

/** The engine's exception, reduced to exactly the columns `export_golden.py` writes. */
function toGoldenException(e: Report['exceptions'][number]): GoldenException {
  return {
    materialId: e.materialId,
    severity: e.severity,
    criticalDate: e.criticalDate,
    daysUntil: e.daysUntil,
    minProjectedStock: e.minProjectedStock,
    hidden: e.hidden,
    erpViewDate: e.erpViewDate,
    score: e.score,
  };
}

/** The engine's supplier stats as `export_golden.py` writes them: `round(x, 4)` on the floats. */
function toGoldenSupplier(s: SupplierStats): GoldenSupplier {
  return {
    supplierId: s.supplierId,
    mean: pyRound(s.meanDelayDays, 4),
    p80: s.p80DelayDays,
    onTimeRate: pyRound(s.onTimeRate, 4),
    n: s.deliveries,
  };
}

/**
 * The first row where the two lists differ, with its rank, or `null`. Asserting on this first
 * makes a failure show the first mismatching material instead of a diff of the whole report.
 */
function firstMismatch<T extends { readonly materialId: string } | { readonly supplierId: string }>(
  actual: readonly T[],
  expected: readonly T[],
): { rank: number; actual: T | undefined; expected: T | undefined } | null {
  const length = Math.max(actual.length, expected.length);
  for (let rank = 0; rank < length; rank += 1) {
    const a = actual[rank];
    const e = expected[rank];
    if (a === undefined || e === undefined || !sameRow(a, e))
      return { rank, actual: a, expected: e };
  }
  return null;
}

/** Field-by-field `Object.is`, so `-0` vs `0` or `128` vs `128.05` never pass unnoticed. */
function sameRow(a: object, b: object): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) =>
      Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    )
  );
}

describe('parity with the Python prototype (golden files)', () => {
  const golden = readGolden(GOLDEN_EN);
  const input = loadPrototypeSample(SAMPLE_DIR);
  const report = analyse(input, { asOf: isoDate(golden.asOf), horizonDays: golden.horizon });

  it('runs with the golden parameters (as-of 2026-10-05, horizon 28) on a non-trivial sample', () => {
    expect([golden.asOf, golden.horizon]).toEqual(['2026-10-05', 28]);
    expect([report.asOf, report.horizonDays]).toEqual([golden.asOf, golden.horizon]);
    // Guards against a loader that silently drops rows and makes the comparison vacuous.
    expect(input.materials).toHaveLength(30);
    expect(input.openPurchaseOrders).toHaveLength(32);
    expect(input.demand).toHaveLength(600);
    expect(input.supplierHistory).toHaveLength(150);
    expect(golden.exceptions.length).toBeGreaterThan(10);
    expect(golden.exceptions.some((e) => e.hidden)).toBe(true);
    expect(golden.exceptions.some((e) => e.severity === 'WARNING')).toBe(true);
    expect(golden.exceptions.some((e) => e.erpViewDate === null)).toBe(true);
  });

  it('gives the same exceptions with the same numbers, flags and dates, in the same order', () => {
    const actual = report.exceptions.map(toGoldenException);
    expect(firstMismatch(actual, golden.exceptions)).toBeNull();
    expect(actual).toEqual(golden.exceptions);
  });

  it('gives the same summary counts', () => {
    // summary.overduePurchaseOrders is ADR-0005 option B and has no golden counterpart.
    const { critical, warning, hidden } = report.summary;
    expect({ critical, warning, hidden }).toEqual({
      critical: golden.exceptions.filter((e) => e.severity === 'CRITICAL').length,
      warning: golden.exceptions.filter((e) => e.severity === 'WARNING').length,
      hidden: golden.exceptions.filter((e) => e.hidden).length,
    });
  });

  it('gives the same supplier statistics', () => {
    // Report.supplierStats is in first-appearance order (the prototype's dict order, kept by
    // design); the golden files write `sorted(sstats.items())`. Sort by supplier ID in code-point
    // order, as Python sorts `str`, before comparing.
    const actual = [...report.supplierStats]
      .sort((a, b) => compareCodePoints(a.supplierId, b.supplierId))
      .map(toGoldenSupplier);
    const goldenIds = golden.suppliers.map((s) => s.supplierId);
    expect(goldenIds).toEqual([...goldenIds].sort(compareCodePoints));
    expect(firstMismatch(actual, golden.suppliers)).toBeNull();
    expect(actual).toEqual(golden.suppliers);
  });

  it('matches the German sample golden file too (same data, German file format)', () => {
    // sample_data_de holds the same tables with German headers, `;`, `15,0` and `05.10.2026`.
    // Reading those is the parsers' job (P1-10 runs parsers -> engine end to end), so here the
    // engine is checked against the German golden file through the identical English input;
    // generate-python-vectors.py additionally asserts both directories load to the same tables.
    const german = readGolden(GOLDEN_DE);
    expect(german).toEqual(golden);
    expect(report.exceptions.map(toGoldenException)).toEqual(german.exceptions);
  });
});
