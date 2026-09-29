import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { parseIsoDate, type IsoDate } from './dates.ts';
import type { StockProjection } from './projection.ts';
import { detectShortage, rankByScore, shortageScore, type ScoreFactors } from './ranking.ts';

function d(input: string): IsoDate {
  const result = parseIsoDate(input);
  if (!result.ok) throw new Error(`invalid test date ${input}`);
  return result.value;
}

function view(
  firstStockOut: string | null,
  firstBelowSafety: string | null,
  minStock = 0,
): StockProjection {
  return {
    firstStockOut: firstStockOut === null ? null : d(firstStockOut),
    firstBelowSafety: firstBelowSafety === null ? null : d(firstBelowSafety),
    minStock,
  };
}

describe('detectShortage', () => {
  it.each([
    {
      name: 'no realistic problem: no exception, whatever the ERP view shows',
      erp: view('2026-10-06', '2026-10-06'),
      realistic: view(null, null),
      expected: null,
    },
    {
      name: 'realistic stock-out: CRITICAL on the stock-out day, ERP stock-out as erpViewDate',
      erp: view('2026-10-07', '2026-10-06'),
      realistic: view('2026-10-07', '2026-10-06'),
      expected: {
        severity: 'CRITICAL',
        criticalDate: '2026-10-07',
        erpViewDate: '2026-10-07',
        hidden: false,
      },
    },
    {
      name: 'CRITICAL compares stock-out with stock-out, not with the ERP below-safety day',
      erp: view(null, '2026-10-06'),
      realistic: view('2026-10-12', '2026-10-06'),
      expected: {
        severity: 'CRITICAL',
        criticalDate: '2026-10-12',
        erpViewDate: null,
        hidden: true,
      },
    },
    {
      name: 'CRITICAL, ERP stock-out later: hidden',
      erp: view('2026-10-16', '2026-10-16'),
      realistic: view('2026-10-12', '2026-10-12'),
      expected: {
        severity: 'CRITICAL',
        criticalDate: '2026-10-12',
        erpViewDate: '2026-10-16',
        hidden: true,
      },
    },
    {
      name: 'only below safety: WARNING on the below-safety day, same date in ERP: not hidden',
      erp: view(null, '2026-10-07'),
      realistic: view(null, '2026-10-07'),
      expected: {
        severity: 'WARNING',
        criticalDate: '2026-10-07',
        erpViewDate: '2026-10-07',
        hidden: false,
      },
    },
    {
      name: 'WARNING, ERP below safety later: hidden',
      erp: view(null, '2026-10-13'),
      realistic: view(null, '2026-10-08'),
      expected: {
        severity: 'WARNING',
        criticalDate: '2026-10-08',
        erpViewDate: '2026-10-13',
        hidden: true,
      },
    },
    {
      name: 'WARNING, ERP view fine: hidden with erpViewDate null',
      erp: view(null, null),
      realistic: view(null, '2026-10-08'),
      expected: {
        severity: 'WARNING',
        criticalDate: '2026-10-08',
        erpViewDate: null,
        hidden: true,
      },
    },
    {
      name: 'WARNING uses the ERP below-safety day even when the ERP view has a stock-out',
      erp: view('2026-10-09', '2026-10-06'),
      realistic: view(null, '2026-10-06'),
      expected: {
        severity: 'WARNING',
        criticalDate: '2026-10-06',
        erpViewDate: '2026-10-06',
        hidden: false,
      },
    },
    {
      name: 'ERP date earlier than the realistic one (overdue PO arrives late): not hidden',
      erp: view('2026-10-05', '2026-10-05'),
      realistic: view('2026-10-06', '2026-10-06'),
      expected: {
        severity: 'CRITICAL',
        criticalDate: '2026-10-06',
        erpViewDate: '2026-10-05',
        hidden: false,
      },
    },
  ])('$name', ({ erp, realistic, expected }) => {
    expect(detectShortage(erp, realistic)).toEqual(expected);
  });
});

describe('shortageScore', () => {
  const base: ScoreFactors = {
    horizonDays: 28,
    daysUntil: 27,
    safetyStock: 0,
    minStock: 0,
    hidden: false,
    severity: 'WARNING',
  };

  // Every expected value was computed by the prototype's score expression with python3.
  it.each([
    { name: 'urgency: (28 - 0) * 3', factors: { daysUntil: 0 }, expected: 84 },
    { name: 'urgency only: (28 - 27) * 3', factors: {}, expected: 3 },
    {
      name: 'gap: half the safety stock is 5',
      factors: { safetyStock: 100, minStock: 50 },
      expected: 8,
    },
    { name: 'gap is capped at 30', factors: { safetyStock: 100, minStock: -500 }, expected: 33 },
    { name: 'safety 0 divides by 1: gap 2 is 20', factors: { minStock: -2 }, expected: 23 },
    {
      name: 'safety below 1 divides by 1',
      factors: { safetyStock: 0.5, minStock: -0.1 },
      expected: 9,
    },
    {
      name: 'stock above safety adds no gap',
      factors: { safetyStock: 100, minStock: 150 },
      expected: 3,
    },
    { name: 'hidden adds 15', factors: { hidden: true }, expected: 18 },
    { name: 'CRITICAL adds 25', factors: { severity: 'CRITICAL' as const }, expected: 28 },
    {
      name: 'the Python scenario: 9 + 30 + 15 + 25',
      factors: {
        horizonDays: 10,
        daysUntil: 7,
        minStock: -40,
        hidden: true,
        severity: 'CRITICAL' as const,
      },
      expected: 79,
    },
    {
      name: 'rounds to 1 decimal: 3 + 0.015 is 3.0',
      factors: { safetyStock: 30, minStock: 29.955 },
      expected: 3,
    },
    {
      name: 'rounds to 1 decimal: 3 + 1.43 is 4.4',
      factors: { safetyStock: 7, minStock: 6 },
      expected: 4.4,
    },
    {
      name: 'rounds to 1 decimal: 3 + 1.76 is 4.8',
      factors: { safetyStock: 12.5, minStock: 10.3 },
      expected: 4.8,
    },
  ])('$name', ({ factors, expected }) => {
    expect(shortageScore({ ...base, ...factors })).toBe(expected);
  });

  it('uses the unrounded minimum stock', () => {
    // pyRound(-0.4) would be 0 and give 3; the unrounded -0.4 gives 3 + 4 = 7.
    expect(shortageScore({ ...base, minStock: -0.4 })).toBe(7);
  });
});

describe('rankByScore', () => {
  it('sorts by score descending and keeps input order for equal scores', () => {
    const items = [
      { id: 'a', score: 10 },
      { id: 'b', score: 79 },
      { id: 'c', score: 10 },
      { id: 'd', score: 79 },
      { id: 'e', score: 85 },
    ];
    expect(rankByScore(items).map((i) => i.id)).toEqual(['e', 'b', 'd', 'a', 'c']);
  });

  it('does not reorder its input', () => {
    const items = Object.freeze([
      { id: 'a', score: 1 },
      { id: 'b', score: 2 },
    ]);
    expect(rankByScore(items).map((i) => i.id)).toEqual(['b', 'a']);
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('is a stable sort by score descending (property)', () => {
    const scores = fc.array(
      fc.integer({ min: 0, max: 6 }).map((n) => n / 2),
      { maxLength: 40 },
    );
    fc.assert(
      fc.property(scores, (values) => {
        const ranked = rankByScore(values.map((score, index) => ({ score, index })));
        for (let i = 1; i < ranked.length; i += 1) {
          const [prev, next] = [ranked[i - 1], ranked[i]];
          if (prev === undefined || next === undefined) throw new Error('unreachable');
          expect(prev.score).toBeGreaterThanOrEqual(next.score);
          if (prev.score === next.score) expect(prev.index).toBeLessThan(next.index);
        }
      }),
    );
  });
});
