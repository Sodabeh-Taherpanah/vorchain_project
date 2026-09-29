import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { analyse } from './analyse.ts';
import { addDays, addWorkdays, diffDays, isWorkday, parseIsoDate, type IsoDate } from './dates.ts';
import { materialId, poId, supplierId } from './ids.ts';
import type {
  AnalysisInput,
  DeliveryRecord,
  DemandLine,
  Material,
  PurchaseOrder,
  ShortageException,
} from './types.ts';

function d(input: string): IsoDate {
  const result = parseIsoDate(input);
  if (!result.ok) throw new Error(`invalid test date ${input}`);
  return result.value;
}

const AS_OF = d('2026-10-05'); // a Monday

function material(id: string, onHand: number, safetyStock = 0): Material {
  return {
    materialId: materialId(id),
    description: `desc ${id}`,
    mainSupplierId: supplierId('S1'),
    onHand,
    safetyStock,
    unit: 'Stk',
  };
}

function order(id: string, material: string, supplier: string, qty: number, promised: string) {
  return {
    poId: poId(id),
    materialId: materialId(material),
    supplierId: supplierId(supplier),
    qty,
    promisedDate: d(promised),
  } satisfies PurchaseOrder;
}

/** Python `base_dataset`: 20 per weekday for 14 days from `asOf`. */
function weekdayDemand(id: string): DemandLine[] {
  return Array.from({ length: 14 }, (_, i) => addDays(AS_OF, i))
    .filter(isWorkday)
    .map((date) => ({ materialId: materialId(id), date, qty: 20 }));
}

/** Python `base_dataset`: 5 Mondays in June, each `delay` working days late. */
function history(supplier: string, delay: number): DeliveryRecord[] {
  return Array.from({ length: 5 }, (_, i) => {
    const promised = addDays(d('2026-06-01'), 7 * i);
    return {
      supplierId: supplierId(supplier),
      promisedDate: promised,
      actualDate: addWorkdays(promised, delay),
      poId: null,
    };
  });
}

function input(parts: Partial<AnalysisInput>): AnalysisInput {
  return {
    materials: [],
    openPurchaseOrders: [],
    demand: [],
    supplierHistory: [],
    suppliers: [],
    ...parts,
  };
}

/** Python `base_dataset(supplier_delay_days=delay)`. */
function baseDataset(delay: number): AnalysisInput {
  return input({
    materials: [material('M1', 100)],
    openPurchaseOrders: [order('P1', 'M1', 'S1', 200, '2026-10-09')],
    demand: weekdayDemand('M1'),
    supplierHistory: history('S1', delay),
  });
}

/** The fields the prototype's `analyse` returns, in its vocabulary. */
function core(e: ShortageException) {
  return {
    materialId: e.materialId,
    severity: e.severity,
    criticalDate: e.criticalDate,
    erpViewDate: e.erpViewDate,
    daysUntil: e.daysUntil,
    hidden: e.hidden,
    minProjectedStock: e.minProjectedStock,
    safetyStock: e.safetyStock,
    score: e.score,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('analyse: ports of the Python tests', () => {
  it('test_reliable_supplier_no_alert: an on-time supplier raises nothing', () => {
    const report = analyse(baseDataset(0), { asOf: AS_OF, horizonDays: 10 });
    expect(report.exceptions).toEqual([]);
    expect(report.summary).toEqual({ critical: 0, warning: 0, hidden: 0 });
  });

  it('test_late_supplier_creates_hidden_risk: 1 CRITICAL, hidden, ERP view shows nothing', () => {
    const report = analyse(baseDataset(3), { asOf: AS_OF, horizonDays: 10 });
    expect(report.exceptions).toEqual([
      {
        materialId: 'M1',
        description: 'desc M1',
        mainSupplierId: 'S1',
        severity: 'CRITICAL',
        criticalDate: '2026-10-12',
        erpViewDate: null,
        daysUntil: 7,
        minProjectedStock: -40,
        safetyStock: 0,
        hidden: true,
        score: 79, // 9 + 30 + 15 + 25
        reasons: [],
        actions: [],
      },
    ]);
    expect(report.summary).toEqual({ critical: 1, warning: 0, hidden: 1 });
  });
});

describe('analyse: exceptions (expected values from the prototype run with python3)', () => {
  it.each([
    {
      name: 'WARNING only, same date in the ERP view: not hidden',
      data: input({
        materials: [material('M1', 100, 50)],
        openPurchaseOrders: [order('P1', 'M1', 'S1', 200, '2026-10-08')],
        demand: weekdayDemand('M1'),
        supplierHistory: history('S1', 0),
      }),
      horizonDays: 10,
      expected: [
        {
          materialId: 'M1',
          severity: 'WARNING',
          criticalDate: '2026-10-07',
          erpViewDate: '2026-10-07',
          daysUntil: 2,
          hidden: false,
          minProjectedStock: 40,
          safetyStock: 50,
          score: 26,
        },
      ],
    },
    {
      name: 'WARNING, ERP view fine: hidden with erpViewDate null',
      data: input({
        materials: [material('M1', 100, 30)],
        openPurchaseOrders: [order('P1', 'M1', 'S1', 200, '2026-10-08')],
        demand: weekdayDemand('M1'),
        supplierHistory: history('S1', 1),
      }),
      horizonDays: 10,
      expected: [
        {
          materialId: 'M1',
          severity: 'WARNING',
          criticalDate: '2026-10-08',
          erpViewDate: null,
          daysUntil: 3,
          hidden: true,
          minProjectedStock: 20,
          safetyStock: 30,
          score: 39.3,
        },
      ],
    },
    {
      name: 'WARNING, ERP view below safety later: hidden',
      data: input({
        materials: [material('M1', 100, 30)],
        openPurchaseOrders: [order('P1', 'M1', 'S1', 60, '2026-10-08')],
        demand: weekdayDemand('M1'),
        supplierHistory: history('S1', 1),
      }),
      horizonDays: 9,
      expected: [
        {
          materialId: 'M1',
          severity: 'WARNING',
          criticalDate: '2026-10-08',
          erpViewDate: '2026-10-13',
          daysUntil: 3,
          hidden: true,
          minProjectedStock: 20,
          safetyStock: 30,
          score: 36.3,
        },
      ],
    },
    {
      name: 'CRITICAL, ERP stock-out later: hidden',
      data: input({
        materials: [material('M1', 100)],
        openPurchaseOrders: [order('P1', 'M1', 'S1', 80, '2026-10-09')],
        demand: weekdayDemand('M1'),
        supplierHistory: history('S1', 3),
      }),
      horizonDays: 14,
      expected: [
        {
          materialId: 'M1',
          severity: 'CRITICAL',
          criticalDate: '2026-10-12',
          erpViewDate: '2026-10-16',
          daysUntil: 7,
          hidden: true,
          minProjectedStock: -40,
          safetyStock: 0,
          score: 91,
        },
      ],
    },
    {
      name: 'CRITICAL without any PO, same date in both views: not hidden',
      data: input({ materials: [material('M1', 50)], demand: weekdayDemand('M1') }),
      horizonDays: 10,
      expected: [
        {
          materialId: 'M1',
          severity: 'CRITICAL',
          criticalDate: '2026-10-07',
          erpViewDate: '2026-10-07',
          daysUntil: 2,
          hidden: false,
          minProjectedStock: -110,
          safetyStock: 0,
          score: 79,
        },
      ],
    },
    {
      name: 'fractional stock: minProjectedStock and safetyStock use pyRound, score the raw minimum',
      data: input({
        materials: [material('M1', 10.5, 12.5)],
        demand: [{ materialId: materialId('M1'), date: AS_OF, qty: 2.5 }],
      }),
      horizonDays: 7,
      expected: [
        {
          materialId: 'M1',
          severity: 'WARNING',
          criticalDate: '2026-10-05',
          erpViewDate: '2026-10-05',
          daysUntil: 0,
          hidden: false,
          minProjectedStock: 8,
          safetyStock: 12, // pyRound(12.5) ties to even
          score: 24.6,
        },
      ],
    },
    {
      name: 'negative stock on hand without demand is CRITICAL on day 0',
      data: input({ materials: [material('M1', -5)] }),
      horizonDays: 3,
      expected: [
        {
          materialId: 'M1',
          severity: 'CRITICAL',
          criticalDate: '2026-10-05',
          erpViewDate: '2026-10-05',
          daysUntil: 0,
          hidden: false,
          minProjectedStock: -5,
          safetyStock: 0,
          score: 64,
        },
      ],
    },
    {
      name: 'a horizon of 0 projects no day, so nothing is raised',
      data: input({ materials: [material('M1', -5)] }),
      horizonDays: 0,
      expected: [],
    },
    {
      name: 'overdue POs never arrive in the ERP view (ADR-0005 item 5, kept on purpose)',
      // P1 (on-time supplier, promised Thu before asOf) never arrives: M1 runs out on Tuesday.
      // P2 (3 working days late) lands on Tue 2026-10-06 in the realistic view, so M2 is fine
      // there and raises nothing, although its ERP view shows a stock-out.
      data: input({
        materials: [material('M1', 30), material('M2', 30)],
        openPurchaseOrders: [
          order('P1', 'M1', 'S1', 500, '2026-10-01'),
          order('P2', 'M2', 'S2', 500, '2026-10-01'),
        ],
        demand: [...weekdayDemand('M1'), ...weekdayDemand('M2')],
        supplierHistory: [...history('S1', 0), ...history('S2', 3)],
      }),
      horizonDays: 10,
      expected: [
        {
          materialId: 'M1',
          severity: 'CRITICAL',
          criticalDate: '2026-10-06',
          erpViewDate: '2026-10-06',
          daysUntil: 1,
          hidden: false,
          minProjectedStock: -130,
          safetyStock: 0,
          score: 82,
        },
      ],
    },
  ])('$name', ({ data, horizonDays, expected }) => {
    const report = analyse(data, { asOf: AS_OF, horizonDays });
    expect(report.exceptions.map(core)).toEqual(expected);
  });
});

describe('analyse: ranking', () => {
  it('ranks by score and keeps materials order for ties; duplicate rows are separate exceptions', () => {
    // Prototype result: M3 (10 on hand) 85, then M2, M1, M3 (50 on hand) all at 79 in file order.
    const report = analyse(
      input({
        materials: [material('M2', 50), material('M1', 50), material('M3', 50), material('M3', 10)],
        demand: [...weekdayDemand('M2'), ...weekdayDemand('M1'), ...weekdayDemand('M3')],
      }),
      { asOf: AS_OF, horizonDays: 10 },
    );
    expect(report.exceptions.map((e) => [e.materialId, e.minProjectedStock, e.score])).toEqual([
      ['M3', -150, 85],
      ['M2', -110, 79],
      ['M1', -110, 79],
      ['M3', -110, 79],
    ]);
    expect(report.summary).toEqual({ critical: 4, warning: 0, hidden: 0 });
  });
});

describe('analyse: report', () => {
  it('echoes asOf and horizon and includes the supplier statistics in first-appearance order', () => {
    const data = input({
      materials: [material('M1', 1000)],
      supplierHistory: [...history('S2', 1), ...history('S1', 0)],
    });
    const report = analyse(data, { asOf: AS_OF, horizonDays: 28 });
    expect(report.asOf).toBe(AS_OF);
    expect(report.horizonDays).toBe(28);
    expect(report.supplierStats.map((s) => [s.supplierId, s.p80DelayDays, s.reliable])).toEqual([
      ['S2', 1, true],
      ['S1', 0, true],
    ]);
  });

  it('passes minReliableDeliveries on to the supplier statistics', () => {
    const report = analyse(input({ supplierHistory: history('S1', 0) }), {
      asOf: AS_OF,
      horizonDays: 28,
      minReliableDeliveries: 6,
    });
    expect(report.supplierStats.map((s) => s.reliable)).toEqual([false]);
  });

  it('does not mutate its input', () => {
    const data = deepFreeze(baseDataset(3));
    const copy = structuredClone(data);
    expect(() => analyse(data, { asOf: AS_OF, horizonDays: 10 })).not.toThrow();
    expect(data).toEqual(copy);
  });

  it('rejects a fractional horizon (a programmer error)', () => {
    expect(() => analyse(baseDataset(3), { asOf: AS_OF, horizonDays: 2.5 })).toThrow(RangeError);
  });
});

describe('analyse: properties', () => {
  const ids = ['M1', 'M2', 'M3', 'M4'];
  const offset = (horizon: number) => fc.integer({ min: -5, max: horizon + 5 });

  /** Small random datasets; `quantity` decides between whole and fractional quantities. */
  const dataset = (quantity: fc.Arbitrary<number>) =>
    fc.integer({ min: 0, max: 30 }).chain((horizonDays) =>
      fc.record({
        horizonDays: fc.constant(horizonDays),
        data: fc.record({
          materials: fc.array(
            fc.record({
              id: fc.constantFrom(...ids),
              onHand: fc.oneof(quantity, fc.constant(0)),
              safety: fc.oneof(fc.constant(0), quantity),
            }),
            { minLength: 1, maxLength: 6 },
          ),
          orders: fc.array(
            fc.record({
              id: fc.constantFrom(...ids),
              supplier: fc.constantFrom('S1', 'S2', 'SX'),
              qty: quantity,
              at: offset(horizonDays),
            }),
            { maxLength: 8 },
          ),
          demand: fc.array(
            fc.record({ id: fc.constantFrom(...ids), qty: quantity, at: offset(horizonDays) }),
            { maxLength: 30 },
          ),
          delays: fc.array(fc.tuple(fc.constantFrom('S1', 'S2'), fc.integer({ min: -2, max: 8 })), {
            maxLength: 8,
          }),
        }),
      }),
    );

  interface RawDataset {
    materials: { id: string; onHand: number; safety: number }[];
    orders: { id: string; supplier: string; qty: number; at: number }[];
    demand: { id: string; qty: number; at: number }[];
    delays: [string, number][];
  }

  function toInput(raw: RawDataset): AnalysisInput {
    return input({
      materials: raw.materials.map((m) => material(m.id, m.onHand, m.safety)),
      openPurchaseOrders: raw.orders.map((o, i) =>
        order(`P${String(i)}`, o.id, o.supplier, o.qty, addDays(AS_OF, o.at)),
      ),
      demand: raw.demand.map((l) => ({
        materialId: materialId(l.id),
        date: addDays(AS_OF, l.at),
        qty: l.qty,
      })),
      supplierHistory: raw.delays.map(([supplier, delay], i) => {
        const promised = addDays(d('2026-06-01'), 7 * i);
        return {
          supplierId: supplierId(supplier),
          promisedDate: promised,
          actualDate: addWorkdays(promised, delay),
          poId: null,
        };
      }),
    });
  }

  const wholeQuantities = dataset(fc.integer({ min: 1, max: 200 }));
  const anyQuantities = dataset(
    fc.oneof(fc.integer({ min: 1, max: 200 }), fc.double({ min: 0.01, max: 200, noNaN: true })),
  );

  it('CRITICAL => minProjectedStock < 0 (whole quantities)', () => {
    fc.assert(
      fc.property(wholeQuantities, ({ data, horizonDays }) => {
        const report = analyse(toInput(data), { asOf: AS_OF, horizonDays });
        for (const e of report.exceptions) {
          if (e.severity === 'CRITICAL') expect(e.minProjectedStock).toBeLessThan(0);
          else expect(e.minProjectedStock).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });

  it('CRITICAL => minProjectedStock <= 0 with fractional quantities (pyRound(-0.4) is 0)', () => {
    fc.assert(
      fc.property(anyQuantities, ({ data, horizonDays }) => {
        const report = analyse(toInput(data), { asOf: AS_OF, horizonDays });
        for (const e of report.exceptions) {
          if (e.severity === 'CRITICAL') expect(e.minProjectedStock).toBeLessThanOrEqual(0);
        }
      }),
    );
  });

  it('exceptions are sorted by score, dated inside the window, and consistently flagged', () => {
    fc.assert(
      fc.property(anyQuantities, ({ data, horizonDays }) => {
        const report = analyse(toInput(data), { asOf: AS_OF, horizonDays });
        const { exceptions, summary } = report;
        exceptions.forEach((e, i) => {
          const previous = exceptions[i - 1];
          if (previous !== undefined) expect(previous.score).toBeGreaterThanOrEqual(e.score);
          expect(e.daysUntil).toBeGreaterThanOrEqual(0);
          expect(e.daysUntil).toBeLessThan(horizonDays);
          expect(e.daysUntil).toBe(diffDays(AS_OF, e.criticalDate));
          expect(e.hidden).toBe(e.erpViewDate === null || e.erpViewDate > e.criticalDate);
          expect(e.reasons).toEqual([]);
          expect(e.actions).toEqual([]);
        });
        expect(summary.critical + summary.warning).toBe(exceptions.length);
        expect(summary.critical).toBe(exceptions.filter((e) => e.severity === 'CRITICAL').length);
        expect(summary.hidden).toBe(exceptions.filter((e) => e.hidden).length);
      }),
    );
  });

  it('equals a stable sort of the material rows analysed one by one (ties keep file order)', () => {
    fc.assert(
      fc.property(anyQuantities, ({ data, horizonDays }) => {
        const full = toInput(data);
        const options = { asOf: AS_OF, horizonDays };
        // Rows are independent, so analysing each row alone gives its exception (or none).
        const perRow = full.materials.flatMap((row, index) =>
          analyse({ ...full, materials: [row] }, options).exceptions.map((e) => ({ e, index })),
        );
        const expected = perRow
          .sort((a, b) => b.e.score - a.e.score || a.index - b.index)
          .map(({ e }) => e);
        expect(analyse(full, options).exceptions).toEqual(expected);
      }),
    );
  });
});
