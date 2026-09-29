import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { addDays, addWorkdays, isWorkday, parseIsoDate, type IsoDate } from './dates.ts';
import type { DailyQuantities } from './daily-quantities.ts';
import { materialId, poId, supplierId } from './ids.ts';
import { demandByMaterial, projectionSeries, projectStock } from './projection.ts';
import { buildReceipts } from './receipts.ts';
import { computeSupplierStats, statsBySupplier } from './supplier-stats.ts';
import type { AnalysisInput, DeliveryRecord, Material } from './types.ts';

function d(input: string): IsoDate {
  const result = parseIsoDate(input);
  if (!result.ok) throw new Error(`invalid test date ${input}`);
  return result.value;
}

function days(entries: Record<string, number>): DailyQuantities {
  return new Map(Object.entries(entries).map(([day, qty]) => [d(day), qty]));
}

const AS_OF = d('2026-10-05'); // a Monday

/** Python `base_dataset`: 20 per weekday for 14 days, starting at `asOf`. */
const weekdayDemand: DailyQuantities = new Map(
  Array.from({ length: 14 }, (_, i) => addDays(AS_OF, i))
    .filter(isWorkday)
    .map((day) => [day, 20]),
);

function material(id: string, onHand: number, safetyStock = 0): Material {
  return {
    materialId: materialId(id),
    description: '',
    mainSupplierId: supplierId('S1'),
    onHand,
    safetyStock,
    unit: null,
  };
}

/** Python `base_dataset(supplier_delay_days=3)`: 5 Mondays in June, each 3 working days late. */
function lateHistory(delay: number): DeliveryRecord[] {
  return Array.from({ length: 5 }, (_, i) => {
    const promised = addDays(d('2026-06-01'), 7 * i);
    return {
      supplierId: supplierId('S1'),
      promisedDate: promised,
      actualDate: addWorkdays(promised, delay),
      poId: poId(`H${String(i)}`),
    };
  });
}

function scenarioInput(delay: number): AnalysisInput {
  return {
    materials: [material('M1', 100)],
    openPurchaseOrders: [
      {
        poId: poId('P1'),
        materialId: materialId('M1'),
        supplierId: supplierId('S1'),
        qty: 200,
        promisedDate: d('2026-10-09'),
      },
    ],
    demand: [...weekdayDemand].map(([date, qty]) => ({ materialId: materialId('M1'), date, qty })),
    supplierHistory: lateHistory(delay),
    suppliers: [],
  };
}

function project(overrides: Partial<Parameters<typeof projectStock>[0]> = {}) {
  return projectStock({
    onHand: 100,
    demandByDay: new Map(),
    receiptsByDay: new Map(),
    asOf: AS_OF,
    horizonDays: 10,
    safetyStock: 0,
    ...overrides,
  });
}

describe('projectStock: Python scenario (100 on hand, 20 per weekday, PO 200 promised Fri)', () => {
  // Expected values confirmed by running `project` from shortage_radar.py with python3.
  it('ERP view (receipt Fri 2026-10-09): no stock-out, minimum 20', () => {
    expect(
      project({ demandByDay: weekdayDemand, receiptsByDay: days({ '2026-10-09': 200 }) }),
    ).toEqual({ firstStockOut: null, firstBelowSafety: null, minStock: 20 });
  });

  it('realistic view (receipt Wed 2026-10-14): stock 0 on Fri is fine, stock-out Mon, min -40', () => {
    expect(
      project({ demandByDay: weekdayDemand, receiptsByDay: days({ '2026-10-14': 200 }) }),
    ).toEqual({ firstStockOut: d('2026-10-12'), firstBelowSafety: d('2026-10-12'), minStock: -40 });
  });
});

describe('projectStock: window and ordering rules', () => {
  it.each([
    {
      name: 'a receipt before asOf never arrives (ADR-0005 item 5)',
      input: {
        onHand: 0,
        receiptsByDay: days({ '2026-10-04': 50 }),
        demandByDay: days({ '2026-10-05': 1 }),
      },
      expected: { firstStockOut: d('2026-10-05'), firstBelowSafety: d('2026-10-05'), minStock: -1 },
    },
    {
      name: 'demand before asOf is not consumed',
      input: { onHand: 5, demandByDay: days({ '2026-10-02': 50 }) },
      expected: { firstStockOut: null, firstBelowSafety: null, minStock: 5 },
    },
    {
      name: 'demand on the last horizon day (asOf + 9) counts',
      input: { onHand: 10, demandByDay: days({ '2026-10-14': 11 }) },
      expected: { firstStockOut: d('2026-10-14'), firstBelowSafety: d('2026-10-14'), minStock: -1 },
    },
    {
      name: 'demand on day asOf + horizon is outside the window',
      input: { onHand: 10, demandByDay: days({ '2026-10-15': 11 }) },
      expected: { firstStockOut: null, firstBelowSafety: null, minStock: 10 },
    },
    {
      name: 'a receipt on the same day is booked before that day’s demand',
      input: {
        onHand: 0,
        receiptsByDay: days({ '2026-10-05': 10 }),
        demandByDay: days({ '2026-10-05': 10 }),
      },
      expected: { firstStockOut: null, firstBelowSafety: null, minStock: 0 },
    },
    {
      name: 'a receipt on the day after the stock-out does not undo it',
      input: {
        onHand: 0,
        receiptsByDay: days({ '2026-10-06': 10 }),
        demandByDay: days({ '2026-10-05': 1 }),
      },
      expected: { firstStockOut: d('2026-10-05'), firstBelowSafety: d('2026-10-05'), minStock: -1 },
    },
    {
      name: 'stock exactly equal to safety stock is not below it (strict <)',
      input: { onHand: 10, safetyStock: 5, demandByDay: days({ '2026-10-05': 5 }) },
      expected: { firstStockOut: null, firstBelowSafety: null, minStock: 5 },
    },
    {
      name: 'stock just under safety stock is below it, but not a stock-out',
      input: { onHand: 10, safetyStock: 5, demandByDay: days({ '2026-10-05': 5.5 }) },
      expected: { firstStockOut: null, firstBelowSafety: d('2026-10-05'), minStock: 4.5 },
    },
    {
      name: 'on-hand already below safety stock is flagged on day 0 of the window',
      input: { onHand: 3, safetyStock: 5 },
      expected: { firstStockOut: null, firstBelowSafety: d('2026-10-05'), minStock: 3 },
    },
    {
      name: 'minStock starts at onHand, so receipts alone never raise it',
      input: { onHand: 7, receiptsByDay: days({ '2026-10-06': 100 }) },
      expected: { firstStockOut: null, firstBelowSafety: null, minStock: 7 },
    },
    {
      name: 'a horizon of 0 looks at no day at all',
      input: { onHand: 0, horizonDays: 0, demandByDay: days({ '2026-10-05': 1 }) },
      expected: { firstStockOut: null, firstBelowSafety: null, minStock: 0 },
    },
    {
      name: 'a negative horizon behaves like Python range(): no day at all',
      input: { onHand: 0, horizonDays: -3, demandByDay: days({ '2026-10-05': 1 }) },
      expected: { firstStockOut: null, firstBelowSafety: null, minStock: 0 },
    },
    {
      name: 'the first stock-out stays the first even when stock recovers and falls again',
      input: {
        onHand: 1,
        demandByDay: days({ '2026-10-06': 2, '2026-10-08': 10 }),
        receiptsByDay: days({ '2026-10-07': 5 }),
      },
      expected: { firstStockOut: d('2026-10-06'), firstBelowSafety: d('2026-10-06'), minStock: -6 },
    },
  ])('$name', ({ input, expected }) => {
    expect(project(input)).toEqual(expected);
  });

  it('rejects a fractional horizon (a programmer error)', () => {
    expect(() => project({ horizonDays: 1.5 })).toThrow(RangeError);
  });
});

describe('projectStock properties', () => {
  const offset = fc.integer({ min: -5, max: 35 });
  const schedule = fc
    .array(fc.tuple(offset, fc.integer({ min: 0, max: 200 })), { maxLength: 20 })
    .map((pairs) => {
      const map = new Map<IsoDate, number>();
      for (const [n, qty] of pairs) {
        const day = addDays(AS_OF, n);
        map.set(day, (map.get(day) ?? 0) + qty);
      }
      return map;
    });
  const base = fc.record({
    onHand: fc.integer({ min: -50, max: 400 }),
    safetyStock: fc.integer({ min: 0, max: 150 }),
    horizonDays: fc.integer({ min: 0, max: 30 }),
    demandByDay: schedule,
    receiptsByDay: schedule,
  });

  it('adding a receipt never makes the first stock-out or below-safety day earlier', () => {
    fc.assert(
      fc.property(base, offset, fc.integer({ min: 1, max: 300 }), (input, n, qty) => {
        const before = projectStock({ ...input, asOf: AS_OF });
        const receipts = new Map(input.receiptsByDay);
        const day = addDays(AS_OF, n);
        receipts.set(day, (receipts.get(day) ?? 0) + qty);
        const after = projectStock({ ...input, asOf: AS_OF, receiptsByDay: receipts });
        // More stock can only postpone a problem or remove it, never create or advance one.
        const notEarlier = (was: IsoDate | null, now: IsoDate | null) =>
          now === null || (was !== null && now >= was);
        expect(notEarlier(before.firstStockOut, after.firstStockOut)).toBe(true);
        expect(notEarlier(before.firstBelowSafety, after.firstBelowSafety)).toBe(true);
        expect(after.minStock).toBeGreaterThanOrEqual(before.minStock);
      }),
    );
  });

  it('minStock <= onHand, and a stock-out is never before the first below-safety day', () => {
    fc.assert(
      fc.property(base, (input) => {
        const result = projectStock({ ...input, asOf: AS_OF });
        expect(result.minStock).toBeLessThanOrEqual(input.onHand);
        if (result.firstStockOut !== null) {
          const { firstBelowSafety, firstStockOut } = result;
          expect(firstBelowSafety !== null && firstBelowSafety <= firstStockOut).toBe(true);
          expect(result.minStock).toBeLessThan(0);
        }
      }),
    );
  });

  /** `now` is on or before `was`, where `null` means "never" (later than any day). */
  const notLater = (was: IsoDate | null, now: IsoDate | null) =>
    was === null || (now !== null && now <= was);
  // Receipts dated before `asOf` never arrive (ADR-0005 item 5), so delaying an overdue receipt
  // can move it INTO the window and help. The monotonicity below only holds from `asOf` on; the
  // overdue case is pinned by an example test further down.
  const notOverdue = fc.integer({ min: 0, max: 35 });

  it('delaying a receipt never postpones or removes a problem (the hidden-risk direction)', () => {
    fc.assert(
      fc.property(
        base,
        notOverdue,
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 1, max: 300 }),
        (input, n, delay, qty) => {
          const withReceiptOn = (day: IsoDate) => {
            const receipts = new Map(input.receiptsByDay);
            receipts.set(day, (receipts.get(day) ?? 0) + qty);
            return projectStock({ ...input, asOf: AS_OF, receiptsByDay: receipts });
          };
          const onTime = withReceiptOn(addDays(AS_OF, n));
          const late = withReceiptOn(addDays(AS_OF, n + delay));
          expect(notLater(onTime.firstStockOut, late.firstStockOut)).toBe(true);
          expect(notLater(onTime.firstBelowSafety, late.firstBelowSafety)).toBe(true);
          expect(late.minStock).toBeLessThanOrEqual(onTime.minStock);
        },
      ),
    );
  });

  it('adding demand never postpones or removes a problem', () => {
    fc.assert(
      fc.property(base, offset, fc.integer({ min: 1, max: 300 }), (input, n, qty) => {
        const before = projectStock({ ...input, asOf: AS_OF });
        const demand = new Map(input.demandByDay);
        const day = addDays(AS_OF, n);
        demand.set(day, (demand.get(day) ?? 0) + qty);
        const after = projectStock({ ...input, asOf: AS_OF, demandByDay: demand });
        expect(notLater(before.firstStockOut, after.firstStockOut)).toBe(true);
        expect(notLater(before.firstBelowSafety, after.firstBelowSafety)).toBe(true);
        expect(after.minStock).toBeLessThanOrEqual(before.minStock);
      }),
    );
  });

  it('the realistic view never shows a problem later than the ERP view (POs not overdue)', () => {
    // P80 delays are >= 0, so realistic receipts are never earlier than promised ones. A problem
    // can therefore be hidden in the ERP view, but the ERP view can never be the more alarming one.
    const stats = new Map(
      [0, 1, 3, 7].map((p80, i) => {
        const id = supplierId(`S${String(i)}`);
        const row = {
          supplierId: id,
          meanDelayDays: p80,
          p80DelayDays: p80,
          onTimeRate: 0.5,
          deliveries: i + 1, // S0..S1 have too little history, S2..S3 enough
          reliable: i + 1 >= 3,
        };
        return [id, row] as const;
      }),
    );
    const order = fc.record({
      supplier: fc.constantFrom('S0', 'S1', 'S2', 'S3', 'UNKNOWN'),
      promised: notOverdue,
      qty: fc.integer({ min: 1, max: 300 }),
    });
    fc.assert(
      fc.property(base, fc.array(order, { maxLength: 8 }), (input, rows) => {
        const pos = rows.map((r, i) => ({
          poId: poId(`P${String(i)}`),
          materialId: materialId('M1'),
          supplierId: supplierId(r.supplier),
          qty: r.qty,
          promisedDate: addDays(AS_OF, r.promised),
        }));
        const schedule = buildReceipts(pos, stats).get(materialId('M1'));
        const view = (receiptsByDay: DailyQuantities | undefined) =>
          projectStock({ ...input, asOf: AS_OF, receiptsByDay: receiptsByDay ?? new Map() });
        const erp = view(schedule?.erp);
        const realistic = view(schedule?.realistic);
        expect(notLater(erp.firstStockOut, realistic.firstStockOut)).toBe(true);
        expect(notLater(erp.firstBelowSafety, realistic.firstBelowSafety)).toBe(true);
        expect(realistic.minStock).toBeLessThanOrEqual(erp.minStock);
      }),
    );
  });
});

describe('demandByMaterial', () => {
  it('sums demand per material and day in file order', () => {
    const line = (id: string, day: string, qty: number) => ({
      materialId: materialId(id),
      date: d(day),
      qty,
    });
    const demand = demandByMaterial([
      line('M1', '2026-10-06', 0.1),
      line('M2', '2026-10-05', 3),
      line('M1', '2026-10-06', 0.2),
      line('M1', '2026-10-05', 1),
    ]);
    expect([...demand.keys()]).toEqual(['M1', 'M2']);
    // 0.1 + 0.2 in this order, exactly like Python's float accumulation.
    expect([...(demand.get(materialId('M1')) ?? [])]).toEqual([
      ['2026-10-06', 0.30000000000000004],
      ['2026-10-05', 1],
    ]);
  });
});

describe('projectionSeries', () => {
  const options = { asOf: AS_OF, horizonDays: 10 };

  it('returns one point per day of [asOf, asOf + horizon) with both views', () => {
    const series = projectionSeries(scenarioInput(3), materialId('M1'), options);
    expect(series.materialId).toBe('M1');
    expect(series.safetyStock).toBe(0);
    expect(series.points.map((p) => p.date)).toEqual(
      Array.from({ length: 10 }, (_, i) => addDays(AS_OF, i)),
    );
    expect(series.points.map((p) => [p.demand, p.erpReceipts, p.realisticReceipts])).toEqual([
      [20, 0, 0],
      [20, 0, 0],
      [20, 0, 0],
      [20, 0, 0],
      [20, 200, 0], // Fri 2026-10-09: promised date
      [0, 0, 0],
      [0, 0, 0],
      [20, 0, 0],
      [20, 0, 0],
      [20, 0, 200], // Wed 2026-10-14: promised + 3 working days
    ]);
    expect(series.points.map((p) => p.erpStock)).toEqual([
      80, 60, 40, 20, 200, 200, 200, 180, 160, 140,
    ]);
    expect(series.points.map((p) => p.realisticStock)).toEqual([
      80, 60, 40, 20, 0, 0, 0, -20, -40, 140,
    ]);
  });

  it('matches projectStock for both views', () => {
    const series = projectionSeries(scenarioInput(3), materialId('M1'), options);
    const realistic = project({
      demandByDay: weekdayDemand,
      receiptsByDay: days({ '2026-10-14': 200 }),
    });
    const lowest = Math.min(100, ...series.points.map((p) => p.realisticStock));
    expect(lowest).toBe(realistic.minStock);
    expect(series.points.find((p) => p.realisticStock < 0)?.date).toBe(realistic.firstStockOut);
  });

  it('keeps the unrounded safety stock of the first matching material row', () => {
    const input = {
      ...scenarioInput(0),
      materials: [material('M0', 1), material('M1', 100, 12.5), material('M1', 0, 99)],
    };
    const series = projectionSeries(input, materialId('M1'), options);
    expect(series.safetyStock).toBe(12.5);
    expect(series.points[0]?.erpStock).toBe(80);
  });

  it('projects a material without POs or demand as flat on-hand stock', () => {
    const input = { ...scenarioInput(0), materials: [material('M2', 30)] };
    const series = projectionSeries(input, materialId('M2'), { asOf: AS_OF, horizonDays: 3 });
    expect(series.points).toEqual(
      [0, 1, 2].map((i) => ({
        date: addDays(AS_OF, i),
        demand: 0,
        erpReceipts: 0,
        realisticReceipts: 0,
        erpStock: 30,
        realisticStock: 30,
      })),
    );
  });

  it('throws for a material that is not in the input (a programmer error)', () => {
    expect(() => projectionSeries(scenarioInput(0), materialId('NOPE'), options)).toThrow(
      RangeError,
    );
  });

  it('crosses zero and the safety stock on the days projectStock reports (property)', () => {
    // The chart must agree with the report for every material, not just the scenario above.
    const day = fc.integer({ min: -5, max: 35 }).map((n) => addDays(AS_OF, n));
    const id = fc.constantFrom('M1', 'M2', 'M3');
    const inputArb = fc.record({
      materials: fc.tuple(
        fc.integer({ min: -20, max: 300 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 300 }),
      ),
      pos: fc.array(
        fc.record({
          material: id,
          supplier: fc.constantFrom('S1', 'S2', 'UNKNOWN'),
          qty: fc.integer({ min: 1, max: 300 }),
          promised: day,
        }),
        { maxLength: 10 },
      ),
      demand: fc.array(
        fc.record({ material: id, date: day, qty: fc.integer({ min: 0, max: 60 }) }),
        { maxLength: 40 },
      ),
      delay: fc.integer({ min: 0, max: 6 }),
      horizonDays: fc.integer({ min: 0, max: 30 }),
    });
    fc.assert(
      fc.property(inputArb, (arb) => {
        const [onHand1, safety1, onHand2] = arb.materials;
        const input: AnalysisInput = {
          // M3 is not in the materials table: its POs and demand must be ignored.
          materials: [material('M1', onHand1, safety1), material('M2', onHand2)],
          openPurchaseOrders: arb.pos.map((r, i) => ({
            poId: poId(`P${String(i)}`),
            materialId: materialId(r.material),
            supplierId: supplierId(r.supplier),
            qty: r.qty,
            promisedDate: r.promised,
          })),
          demand: arb.demand.map((r) => ({
            materialId: materialId(r.material),
            date: r.date,
            qty: r.qty,
          })),
          // S1 always `delay` working days late (5 deliveries), S2 once (too little history).
          supplierHistory: [
            ...lateHistory(arb.delay),
            { ...lateHistory(arb.delay + 1)[0]!, supplierId: supplierId('S2') },
          ],
          suppliers: [],
        };
        const opts = { asOf: AS_OF, horizonDays: arb.horizonDays };
        const receipts = buildReceipts(
          input.openPurchaseOrders,
          statsBySupplier(computeSupplierStats(input.supplierHistory)),
        );
        const demand = demandByMaterial(input.demand);
        for (const m of input.materials) {
          const series = projectionSeries(input, m.materialId, opts);
          expect(series.points).toHaveLength(Math.max(0, arb.horizonDays));
          for (const view of ['erp', 'realistic'] as const) {
            const stock = series.points.map((p) =>
              view === 'erp' ? p.erpStock : p.realisticStock,
            );
            const expected = projectStock({
              onHand: m.onHand,
              safetyStock: m.safetyStock,
              demandByDay: demand.get(m.materialId) ?? new Map(),
              receiptsByDay: receipts.get(m.materialId)?.[view] ?? new Map(),
              ...opts,
            });
            const firstDay = (below: number) =>
              series.points.find((_, i) => (stock[i] ?? 0) < below)?.date ?? null;
            expect(firstDay(0)).toBe(expected.firstStockOut);
            expect(firstDay(m.safetyStock)).toBe(expected.firstBelowSafety);
            expect(Math.min(m.onHand, ...stock)).toBe(expected.minStock);
          }
        }
      }),
    );
  });

  it('an overdue PO from a late supplier arrives only in the realistic view (prototype quirk)', () => {
    // Confirmed with python3 `project`: ERP view stock-out on 10-06 (min -1), realistic view none.
    // Promised Fri 2026-10-02 is before asOf, so the ERP view drops it (ADR-0005 item 5); one
    // working day late is Mon 2026-10-05 = asOf, inside the window. Backlog open question Q4.
    const input: AnalysisInput = {
      materials: [material('M1', 0)],
      openPurchaseOrders: [
        {
          poId: poId('P1'),
          materialId: materialId('M1'),
          supplierId: supplierId('S1'),
          qty: 5,
          promisedDate: d('2026-10-02'),
        },
      ],
      demand: [{ materialId: materialId('M1'), date: d('2026-10-06'), qty: 1 }],
      supplierHistory: lateHistory(1),
      suppliers: [],
    };
    const series = projectionSeries(input, materialId('M1'), options);
    expect(series.points[0]).toMatchObject({ erpReceipts: 0, realisticReceipts: 5 });
    expect(series.points[1]).toMatchObject({ erpStock: -1, realisticStock: 4 });
  });

  it('does not mutate its input', () => {
    const input = scenarioInput(3);
    const copy = structuredClone(input);
    projectionSeries(Object.freeze(input), materialId('M1'), options);
    expect(input).toEqual(copy);
  });
});
