import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { compareCodePoints } from './compare.ts';
import { addDays, parseIsoDate, workdaysBetween, type IsoDate } from './dates.ts';
import { supplierId } from './ids.ts';
import { pyRound } from './rounding.ts';
import {
  computeSupplierStats,
  DEFAULT_MIN_RELIABLE_DELIVERIES,
  percentile,
  statsBySupplier,
} from './supplier-stats.ts';
import type { DeliveryRecord, SupplierStats } from './types.ts';

function d(input: string): IsoDate {
  const result = parseIsoDate(input);
  if (!result.ok) throw new Error(`invalid test date ${input}`);
  return result.value;
}

function delivery(
  supplier: string,
  promised: string | null,
  actual: string | null,
): DeliveryRecord {
  return {
    supplierId: supplierId(supplier),
    promisedDate: promised === null ? null : d(promised),
    actualDate: actual === null ? null : d(actual),
    poId: null,
  };
}

function stats(supplier: string, values: Omit<SupplierStats, 'supplierId'>): SupplierStats {
  return { supplierId: supplierId(supplier), ...values };
}

describe('percentile', () => {
  // Expected values from reference/python-prototype/shortage_radar.py `percentile`.
  it.each([
    { values: [], p: 0.8, expected: 0 },
    { values: [5], p: 0.8, expected: 5 },
    { values: [0, 1, 2, 3, 10], p: 0.8, expected: 4.400000000000001 },
    { values: [10, 9, 1, 2], p: 0.8, expected: 9.4 },
    { values: [-3, -1, -2], p: 0.8, expected: -1.4 },
    { values: [3, 1, 2], p: 0.5, expected: 2 },
    { values: [1, 2, 3, 4], p: 0.8, expected: 3.4000000000000004 },
    { values: [4, 1, 3], p: 0, expected: 1 },
    { values: [4, 1, 3], p: 1, expected: 4 },
  ])('percentile($values, $p) = $expected', ({ values, p, expected }) => {
    expect(percentile(values, p)).toBe(expected);
  });

  it('sorts numerically, not lexicographically (the JS default)', () => {
    // Lexicographic order would be [10, 2, 9] and give 2.
    expect(percentile([10, 9, 2], 0.5)).toBe(9);
  });

  it('does not reorder the caller’s array', () => {
    const values = [3, 1, 2];
    percentile(values, 0.8);
    expect(values).toEqual([3, 1, 2]);
  });

  it.each([-0.1, 1.1, Number.NaN])('rejects p = %d as a programmer error', (p) => {
    expect(() => percentile([1, 2], p)).toThrow(RangeError);
  });

  it('stays within [min, max] and grows with p', () => {
    const values = fc.array(fc.integer({ min: -50, max: 50 }), { minLength: 1, maxLength: 40 });
    const p = fc.double({ min: 0, max: 1, noNaN: true });
    fc.assert(
      fc.property(values, p, p, (v, p1, p2) => {
        const [low, high] = p1 <= p2 ? [p1, p2] : [p2, p1];
        expect(percentile(v, low)).toBeGreaterThanOrEqual(Math.min(...v));
        expect(percentile(v, high)).toBeLessThanOrEqual(Math.max(...v));
        expect(percentile(v, high)).toBeGreaterThanOrEqual(percentile(v, low));
      }),
    );
  });
});

describe('computeSupplierStats', () => {
  // Expected values confirmed with `supplier_stats` from the Python prototype.
  it('computes mean, p80, on-time rate and deliveries per supplier', () => {
    const history = [
      // Delays 10, 0, 3, 1, 2 working days (from Monday 2026-10-05).
      delivery('LATE', '2026-10-05', '2026-10-19'),
      delivery('LATE', '2026-10-05', '2026-10-05'),
      delivery('LATE', '2026-10-05', '2026-10-08'),
      delivery('LATE', '2026-10-05', '2026-10-06'),
      delivery('LATE', '2026-10-05', '2026-10-07'),
    ];
    expect(computeSupplierStats(history)).toEqual([
      stats('LATE', {
        meanDelayDays: 3.2,
        p80DelayDays: 4,
        onTimeRate: 0.2,
        deliveries: 5,
        reliable: true,
      }),
    ]);
  });

  it('gives p80 0 and on-time rate 1 when every delivery is on time', () => {
    const history = [
      delivery('ON', '2026-10-05', '2026-10-05'),
      delivery('ON', '2026-10-07', '2026-10-06'),
      // Friday promised, Saturday delivered: no working day in between, so on time.
      delivery('ON', '2026-10-09', '2026-10-10'),
    ];
    expect(computeSupplierStats(history)).toEqual([
      stats('ON', {
        meanDelayDays: -1 / 3,
        p80DelayDays: 0,
        onTimeRate: 1,
        deliveries: 3,
        reliable: true,
      }),
    ]);
  });

  it('clamps a negative p80 (early deliveries) to 0 but keeps the negative mean', () => {
    const history = [
      delivery('EARLY', '2026-10-12', '2026-10-05'),
      delivery('EARLY', '2026-10-12', '2026-10-07'),
      delivery('EARLY', '2026-10-12', '2026-10-08'),
    ];
    const [early] = computeSupplierStats(history);
    expect(early).toEqual(
      stats('EARLY', {
        meanDelayDays: -3.3333333333333335,
        p80DelayDays: 0,
        onTimeRate: 1,
        deliveries: 3,
        reliable: true,
      }),
    );
    // Python `max(0, round(-2.4))` is the int 0, never -0.
    expect(Object.is(early?.p80DelayDays, 0)).toBe(true);
  });

  it('flags fewer than 3 deliveries as not reliable; rounds p80 of 1.8 to 2', () => {
    const history = [
      delivery('FEW', '2026-10-09', '2026-10-12'),
      delivery('FEW', '2026-10-10', '2026-10-13'),
    ];
    expect(computeSupplierStats(history)).toEqual([
      stats('FEW', {
        meanDelayDays: 1.5,
        p80DelayDays: 2,
        onTimeRate: 0,
        deliveries: 2,
        reliable: false,
      }),
    ]);
  });

  it('honours a custom minReliableDeliveries (boundary is inclusive)', () => {
    const history = [
      delivery('S1', '2026-10-05', '2026-10-05'),
      delivery('S1', '2026-10-05', '2026-10-05'),
    ];
    expect(DEFAULT_MIN_RELIABLE_DELIVERIES).toBe(3);
    expect(computeSupplierStats(history, { minReliableDeliveries: 2 })[0]?.reliable).toBe(true);
    expect(computeSupplierStats(history, { minReliableDeliveries: 3 })[0]?.reliable).toBe(false);
  });

  it('skips rows with a missing date; a supplier with no complete row gets no stats', () => {
    const history = [
      delivery('GONE', null, '2026-10-05'),
      delivery('GONE', '2026-10-05', null),
      delivery('S1', null, null),
      delivery('S1', '2026-10-05', '2026-10-06'),
    ];
    expect(computeSupplierStats(history)).toEqual([
      stats('S1', {
        meanDelayDays: 1,
        p80DelayDays: 1,
        onTimeRate: 0,
        deliveries: 1,
        reliable: false,
      }),
    ]);
    expect(computeSupplierStats([])).toEqual([]);
  });

  it('orders suppliers by their first complete history row, like the prototype dict', () => {
    const history = [
      delivery('S9', '2026-10-05', '2026-10-05'),
      delivery('S10', '2026-10-05', null),
      delivery('A-7', '2026-10-05', '2026-10-06'),
      delivery('S9', '2026-10-06', '2026-10-06'),
      delivery('S10', '2026-10-05', '2026-10-07'),
      delivery('S01', '2026-10-05', '2026-10-05'),
    ];
    // S10's first row has no actual date, so its first complete row comes after A-7's.
    expect(computeSupplierStats(history).map((s) => s.supplierId)).toEqual([
      'S9',
      'A-7',
      'S10',
      'S01',
    ]);
  });

  it('never meets an exact x.5 p80 with whole-day delays, but would round it to even', () => {
    // k = (n - 1) * 0.8 has a fractional part in {0, .2, .4, .6, .8}, so an interpolation between
    // integers can never land on .5. The tie rule still matters for the percentile helper itself.
    expect(pyRound(percentile([2, 3], 0.5))).toBe(2);
    expect(pyRound(percentile([3, 4], 0.5))).toBe(4);
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -30, max: 60 }), { minLength: 1 }), (delays) => {
        expect(Math.abs(percentile(delays, 0.8) % 1)).not.toBeCloseTo(0.5, 6);
      }),
    );
  });
});

describe('computeSupplierStats properties', () => {
  const day = fc.integer({ min: 0, max: 400 }).map((offset) => addDays(d('2026-01-01'), offset));
  const row = fc.record({
    supplier: fc.constantFrom('S01', 'S02', 'S03', 'S10'),
    promised: fc.option(day, { freq: 8 }),
    actual: fc.option(day, { freq: 8 }),
  });
  const history = fc
    .array(row, { maxLength: 60 })
    .map((rows) => rows.map((r) => delivery(r.supplier, r.promised, r.actual)));

  it('keeps 0 <= onTimeRate <= 1, p80 >= 0 and p80 >= rounded median delay', () => {
    fc.assert(
      fc.property(history, (h) => {
        for (const s of computeSupplierStats(h)) {
          const delays = h
            .filter((r) => r.supplierId === s.supplierId)
            .flatMap((r) =>
              r.promisedDate === null || r.actualDate === null
                ? []
                : [workdaysBetween(r.promisedDate, r.actualDate)],
            );
          expect(s.p80DelayDays).toBeGreaterThanOrEqual(pyRound(percentile(delays, 0.5)));
          expect(s.onTimeRate).toBeGreaterThanOrEqual(0);
          expect(s.onTimeRate).toBeLessThanOrEqual(1);
          expect(s.p80DelayDays).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(s.p80DelayDays)).toBe(true);
          expect(s.deliveries).toBeGreaterThan(0);
          expect(s.reliable).toBe(s.deliveries >= DEFAULT_MIN_RELIABLE_DELIVERIES);
        }
      }),
    );
  });

  it('does not depend on the order of the history rows', () => {
    fc.assert(
      fc.property(
        history.chain((h) =>
          fc.tuple(fc.constant(h), fc.shuffledSubarray(h, { minLength: h.length })),
        ),
        ([h, shuffled]) => {
          // Only the order of suppliers may change; each supplier's values must not.
          const byId = (rows: typeof h) =>
            computeSupplierStats(rows).sort((a, b) =>
              compareCodePoints(a.supplierId, b.supplierId),
            );
          expect(byId(shuffled)).toEqual(byId(h));
        },
      ),
    );
  });

  it('returns each supplier once, in order of its first complete history row', () => {
    fc.assert(
      fc.property(history, (h) => {
        const firstSeen = h
          .filter((r) => r.promisedDate !== null && r.actualDate !== null)
          .map((r) => r.supplierId);
        expect(computeSupplierStats(h).map((s) => s.supplierId)).toEqual([...new Set(firstSeen)]);
      }),
    );
  });
});

describe('statsBySupplier', () => {
  it('indexes stats by supplierId; unknown suppliers are absent', () => {
    const all = computeSupplierStats([
      delivery('S01', '2026-10-05', '2026-10-05'),
      delivery('S02', '2026-10-05', '2026-10-07'),
    ]);
    const index = statsBySupplier(all);
    expect(index.size).toBe(2);
    expect(index.get(supplierId('S02'))?.p80DelayDays).toBe(2);
    expect(index.get(supplierId('S99'))).toBeUndefined();
  });
});
