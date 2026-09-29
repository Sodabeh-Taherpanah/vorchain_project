import { describe, expect, it } from 'vitest';

import { analyse } from './analyse.ts';
import { addDays, addWorkdays, parseIsoDate, type IsoDate } from './dates.ts';
import { explanationPoId } from './explanations.ts';
import { materialId, poId, supplierId, type MaterialId } from './ids.ts';
import { findOverduePurchaseOrders, overdueReasons } from './overdue.ts';
import type { SupplierStatsMap } from './receipts.ts';
import type { AnalysisInput, DeliveryRecord, PurchaseOrder, SupplierStats } from './types.ts';

function d(input: string): IsoDate {
  const result = parseIsoDate(input);
  if (!result.ok) throw new Error(`invalid test date ${input}`);
  return result.value;
}

const AS_OF = d('2026-10-05'); // a Monday

function stats(id: string, p80: number): SupplierStats {
  return {
    supplierId: supplierId(id),
    meanDelayDays: p80,
    p80DelayDays: p80,
    onTimeRate: 0.5,
    deliveries: 5,
    reliable: true,
  };
}

const STATS: SupplierStatsMap = new Map(
  [stats('ONTIME', 0), stats('LATE2', 2), stats('LATE10', 10)].map((s) => [s.supplierId, s]),
);

function order(id: string, material: string, supplier: string, promised: string): PurchaseOrder {
  return {
    poId: poId(id),
    materialId: materialId(material),
    supplierId: supplierId(supplier),
    qty: 50,
    promisedDate: d(promised),
  };
}

/** Five deliveries, each `delay` working days late, so the supplier's P80 is `delay`. */
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

describe('findOverduePurchaseOrders', () => {
  const orders = [
    order('P1', 'M1', 'LATE2', '2026-10-02'), // Fri before asOf -> Tue 10-06, inside the window
    order('P2', 'M2', 'ONTIME', '2026-10-05'), // on asOf: not overdue
    order('P3', 'M2', 'ONTIME', '2026-09-30'), // stays before asOf in both views
    order('P4', 'M3', 'LATE10', '2026-10-01'), // Thu -> Thu 10-15, beyond a 7-day window
    order('P5', 'M9', 'UNKNOWN', '2026-10-04'), // unknown supplier: delay 0; orphan material
  ];
  const flagged = new Set<MaterialId>([materialId('M2')]);

  it('lists every open PO promised before asOf, in PO-file order, with its realistic date', () => {
    const window = { asOf: AS_OF, horizonDays: 7 };
    expect(findOverduePurchaseOrders(orders, STATS, window, flagged)).toEqual([
      {
        poId: 'P1',
        materialId: 'M1',
        supplierId: 'LATE2',
        qty: 50,
        promisedDate: '2026-10-02',
        realisticDate: '2026-10-06',
        countedInRealisticView: true,
        hasException: false,
      },
      {
        poId: 'P3',
        materialId: 'M2',
        supplierId: 'ONTIME',
        qty: 50,
        promisedDate: '2026-09-30',
        realisticDate: '2026-09-30',
        countedInRealisticView: false,
        hasException: true,
      },
      {
        poId: 'P4',
        materialId: 'M3',
        supplierId: 'LATE10',
        qty: 50,
        promisedDate: '2026-10-01',
        realisticDate: '2026-10-15',
        countedInRealisticView: false,
        hasException: false,
      },
      {
        poId: 'P5',
        materialId: 'M9',
        supplierId: 'UNKNOWN',
        qty: 50,
        promisedDate: '2026-10-04',
        realisticDate: '2026-10-04',
        countedInRealisticView: false,
        hasException: false,
      },
    ]);
  });

  it('counts a PO in the realistic view only inside [asOf, asOf + horizonDays)', () => {
    const late = [order('P4', 'M3', 'LATE10', '2026-10-01')]; // realistic Thu 10-15
    const counted = (horizonDays: number) =>
      findOverduePurchaseOrders(late, STATS, { asOf: AS_OF, horizonDays }, flagged).map(
        (o) => o.countedInRealisticView,
      );
    expect(counted(10)).toEqual([false]); // window ends before 10-15
    expect(counted(11)).toEqual([true]); // 10-15 is the last day of the window
    expect(counted(0)).toEqual([false]); // an empty window counts nothing
    expect(counted(-3)).toEqual([false]); // a negative horizon projects no day either
  });

  it('counts a PO whose realistic date is asOf itself (the window starts at asOf)', () => {
    // Thu 10-01 + 2 working days = Mon 10-05 = asOf: the realistic view books it on day one.
    const onAsOf = [order('P6', 'M1', 'LATE2', '2026-10-01')];
    expect(
      findOverduePurchaseOrders(onAsOf, STATS, { asOf: AS_OF, horizonDays: 1 }, flagged),
    ).toEqual([expect.objectContaining({ realisticDate: AS_OF, countedInRealisticView: true })]);
  });

  it('returns an empty list when no PO is overdue', () => {
    const onTime = [order('P2', 'M2', 'ONTIME', '2026-10-05')];
    expect(
      findOverduePurchaseOrders(onTime, STATS, { asOf: AS_OF, horizonDays: 7 }, flagged),
    ).toEqual([]);
  });
});

describe('overdueReasons', () => {
  it('gives one PO_OVERDUE per overdue PO of the material, in PO-file order', () => {
    const orders = [
      order('P1', 'M1', 'LATE2', '2026-10-02'),
      order('P2', 'M1', 'ONTIME', '2026-10-09'),
      order('P3', 'M1', 'ONTIME', '2026-09-28'),
    ];
    expect(overdueReasons(orders, STATS, AS_OF)).toEqual([
      {
        code: 'PO_OVERDUE',
        poId: 'P1',
        promisedDate: '2026-10-02',
        supplierId: 'LATE2',
        realisticDate: '2026-10-06',
      },
      {
        code: 'PO_OVERDUE',
        poId: 'P3',
        promisedDate: '2026-09-28',
        supplierId: 'ONTIME',
        realisticDate: '2026-09-28',
      },
    ]);
    expect(overdueReasons(orders.slice(1, 2), STATS, AS_OF)).toEqual([]);
  });
});

describe('analyse: overdue POs (ADR-0005 item 5, option B)', () => {
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

  it('reports the ADR-0005 example although the material has no exception', () => {
    // On hand 0, demand 1 on Tue 10-06, PO 50 promised Fri 10-02 from a supplier with P80 = 2.
    // ERP view: the PO never arrives, stock-out on 10-06. Realistic view: the PO lands on 10-06
    // before the demand, so no stock-out and no exception. The overdue list is the only hint.
    const report = analyse(
      input({
        materials: [
          {
            materialId: materialId('M1'),
            description: '',
            mainSupplierId: supplierId('S1'),
            onHand: 0,
            safetyStock: 0,
            unit: null,
          },
        ],
        openPurchaseOrders: [order('PO1', 'M1', 'S1', '2026-10-02')],
        demand: [{ materialId: materialId('M1'), date: d('2026-10-06'), qty: 1 }],
        supplierHistory: history('S1', 2),
      }),
      { asOf: AS_OF, horizonDays: 28 },
    );
    expect(report.exceptions).toEqual([]);
    expect(report.summary).toEqual({
      critical: 0,
      warning: 0,
      hidden: 0,
      overduePurchaseOrders: 1,
    });
    expect(report.overduePurchaseOrders).toEqual([
      {
        poId: 'PO1',
        materialId: 'M1',
        supplierId: 'S1',
        qty: 50,
        promisedDate: '2026-10-02',
        realisticDate: '2026-10-06',
        countedInRealisticView: true,
        hasException: false,
      },
    ]);
  });

  it('appends PO_OVERDUE after the prototype reasons of a material that has an exception', () => {
    // Demand 100 on 10-06 exceeds the 50 the overdue PO brings in the realistic view.
    const report = analyse(
      input({
        materials: [
          {
            materialId: materialId('M1'),
            description: '',
            mainSupplierId: null,
            onHand: 0,
            safetyStock: 0,
            unit: null,
          },
        ],
        openPurchaseOrders: [order('PO1', 'M1', 'S1', '2026-10-02')],
        demand: [{ materialId: materialId('M1'), date: d('2026-10-06'), qty: 100 }],
        supplierHistory: history('S1', 2),
      }),
      { asOf: AS_OF, horizonDays: 28 },
    );
    const [exception] = report.exceptions;
    expect(exception?.criticalDate).toBe('2026-10-06');
    expect(exception?.hidden).toBe(false); // same stock-out date in the ERP view
    expect(exception?.reasons).toEqual([
      {
        code: 'PO_LATE',
        poId: 'PO1',
        promisedDate: '2026-10-02',
        supplierId: 'S1',
        delayDays: 2,
        onTimeRate: 0,
        lowConfidence: false,
        deliveries: 5,
      },
      {
        code: 'PO_OVERDUE',
        poId: 'PO1',
        promisedDate: '2026-10-02',
        supplierId: 'S1',
        realisticDate: '2026-10-06',
      },
    ]);
    // Option B adds no action: the prototype's actions stay as they are.
    expect(exception?.actions).toEqual([{ code: 'EXPEDITE', poId: 'PO1', before: '2026-10-06' }]);
    expect(report.overduePurchaseOrders.map((o) => o.hasException)).toEqual([true]);
    expect(report.summary.overduePurchaseOrders).toBe(1);
  });

  it('handles duplicate material rows, orphan POs and a PO promised exactly on asOf', () => {
    // M1 appears twice: row 1 (on hand 0) runs short on 10-06, row 2 (on hand 1000) never does.
    // PO1 (overdue, P80 2) lands on asOf in the realistic view only; PO3 is promised on asOf, so it
    // is not overdue; PO2 belongs to a material that is not in the materials table.
    const row = (onHand: number) => ({
      materialId: materialId('M1'),
      description: '',
      mainSupplierId: supplierId('S1'),
      onHand,
      safetyStock: 0,
      unit: null,
    });
    const report = analyse(
      input({
        materials: [row(0), row(1000)],
        openPurchaseOrders: [
          order('PO1', 'M1', 'S1', '2026-10-01'),
          order('PO2', 'M-ORPHAN', 'S1', '2026-09-30'),
          order('PO3', 'M1', 'S1', '2026-10-05'),
        ],
        demand: [{ materialId: materialId('M1'), date: d('2026-10-06'), qty: 100 }],
        supplierHistory: history('S1', 2),
      }),
      { asOf: AS_OF, horizonDays: 28 },
    );
    expect(report.exceptions.map((e) => [e.materialId, e.minProjectedStock])).toEqual([
      ['M1', -50],
    ]);
    expect(report.exceptions[0]?.reasons.map((r) => [r.code, explanationPoId(r)])).toEqual([
      ['PO_LATE', 'PO1'],
      ['PO_LATE', 'PO3'],
      ['PO_OVERDUE', 'PO1'],
    ]);
    expect(
      report.overduePurchaseOrders.map((o) => [o.poId, o.countedInRealisticView, o.hasException]),
    ).toEqual([
      ['PO1', true, true], // one of the two M1 rows has an exception
      ['PO2', false, false], // Wed 09-30 + 2 = Fri 10-02, still before asOf; no material row
    ]);
    expect(report.summary.overduePurchaseOrders).toBe(2);
  });
});
