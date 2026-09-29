import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { addDays, addWorkdays, parseIsoDate, type IsoDate } from './dates.ts';
import { materialId, poId, supplierId, type SupplierId } from './ids.ts';
import {
  buildReceipts,
  realisticReceiptDate,
  receiptDelayDays,
  type ReceiptSchedule,
} from './receipts.ts';
import type { PurchaseOrder, SupplierStats } from './types.ts';

function d(input: string): IsoDate {
  const result = parseIsoDate(input);
  if (!result.ok) throw new Error(`invalid test date ${input}`);
  return result.value;
}

function po(id: string, material: string, supplier: string, qty: number, promised: string) {
  return {
    poId: poId(id),
    materialId: materialId(material),
    supplierId: supplierId(supplier),
    qty,
    promisedDate: d(promised),
  } satisfies PurchaseOrder;
}

function statsMap(
  entries: Record<string, { p80: number; deliveries?: number }>,
): ReadonlyMap<SupplierId, SupplierStats> {
  return new Map(
    Object.entries(entries).map(([id, { p80, deliveries = 5 }]) => [
      supplierId(id),
      {
        supplierId: supplierId(id),
        meanDelayDays: p80,
        p80DelayDays: p80,
        onTimeRate: 0.5,
        deliveries,
        reliable: deliveries >= 3,
      },
    ]),
  );
}

function asEntries(schedule: ReceiptSchedule | undefined) {
  return {
    erp: [...(schedule?.erp ?? [])],
    realistic: [...(schedule?.realistic ?? [])],
  };
}

describe('receiptDelayDays', () => {
  const stats = statsMap({ S1: { p80: 3 }, S2: { p80: 0 } });

  it.each([
    { supplier: 'S1', expected: 3 },
    { supplier: 'S2', expected: 0 },
    // Unknown supplier (no usable history): no shift, like `sstats.get(sid, {}).get("p80", 0)`.
    { supplier: 'S9', expected: 0 },
  ])('is $expected working days for $supplier', ({ supplier, expected }) => {
    expect(receiptDelayDays(supplierId(supplier), stats)).toBe(expected);
  });

  it('still uses the P80 of a supplier with too little history (prototype ignores reliable)', () => {
    const few = statsMap({ S1: { p80: 4, deliveries: 1 } });
    expect(receiptDelayDays(supplierId('S1'), few)).toBe(4);
  });
});

describe('realisticReceiptDate', () => {
  const stats = statsMap({ LATE: { p80: 3 }, ONTIME: { p80: 0 } });

  it.each([
    // Python scenario: promised Fri 2026-10-09, 3 working days late -> Wed 2026-10-14.
    { supplier: 'LATE', promised: '2026-10-09', expected: '2026-10-14' },
    // A weekend promise with a delay moves to working days only.
    { supplier: 'LATE', promised: '2026-10-10', expected: '2026-10-14' },
    // Across a year boundary.
    { supplier: 'LATE', promised: '2026-12-31', expected: '2027-01-05' },
    // No delay keeps the promised date, even on a weekend (`add_workdays(d, 0) == d`).
    { supplier: 'ONTIME', promised: '2026-10-10', expected: '2026-10-10' },
    { supplier: 'UNKNOWN', promised: '2026-10-11', expected: '2026-10-11' },
  ])('$supplier promised $promised -> $expected', ({ supplier, promised, expected }) => {
    expect(realisticReceiptDate(po('P', 'M', supplier, 1, promised), stats)).toBe(expected);
  });
});

describe('buildReceipts', () => {
  const stats = statsMap({ LATE: { p80: 3 }, ONTIME: { p80: 0 } });

  it('schedules the ERP view on the promised date and the realistic view after the P80 delay', () => {
    const receipts = buildReceipts([po('P1', 'M1', 'LATE', 200, '2026-10-09')], stats);
    expect(asEntries(receipts.get(materialId('M1')))).toEqual({
      erp: [['2026-10-09', 200]],
      realistic: [['2026-10-14', 200]],
    });
  });

  it('sums quantities per day and keeps each material separate', () => {
    const receipts = buildReceipts(
      [
        po('P1', 'M1', 'LATE', 10, '2026-10-09'), // realistic 2026-10-14
        po('P2', 'M1', 'ONTIME', 5, '2026-10-14'), // same realistic day, different ERP day
        po('P3', 'M1', 'ONTIME', 2.5, '2026-10-09'), // same ERP day as P1
        po('P4', 'M2', 'ONTIME', 7, '2026-10-09'),
      ],
      stats,
    );
    expect(asEntries(receipts.get(materialId('M1')))).toEqual({
      erp: [
        ['2026-10-09', 12.5],
        ['2026-10-14', 5],
      ],
      realistic: [
        ['2026-10-14', 15],
        ['2026-10-09', 2.5],
      ],
    });
    expect(asEntries(receipts.get(materialId('M2')))).toEqual({
      erp: [['2026-10-09', 7]],
      realistic: [['2026-10-09', 7]],
    });
  });

  it('keeps POs dated before asOf: the projection window, not this step, ignores them', () => {
    const receipts = buildReceipts([po('P1', 'M1', 'ONTIME', 1, '2020-01-01')], stats);
    expect(asEntries(receipts.get(materialId('M1'))).erp).toEqual([['2020-01-01', 1]]);
  });

  it('has no entry for materials without open POs', () => {
    expect(buildReceipts([], stats).size).toBe(0);
  });

  it('lists materials in order of their first PO', () => {
    const receipts = buildReceipts(
      [
        po('P1', 'M9', 'ONTIME', 1, '2026-10-09'),
        po('P2', 'M1', 'ONTIME', 1, '2026-10-09'),
        po('P3', 'M9', 'ONTIME', 1, '2026-10-12'),
      ],
      stats,
    );
    expect([...receipts.keys()]).toEqual(['M9', 'M1']);
  });

  it('never loses or invents quantity and never moves a receipt earlier (property)', () => {
    const day = fc.integer({ min: 0, max: 60 }).map((n) => addDays(d('2026-10-01'), n));
    const order = fc.record({
      material: fc.constantFrom('M1', 'M2'),
      supplier: fc.constantFrom('LATE', 'ONTIME', 'UNKNOWN'),
      qty: fc.integer({ min: 1, max: 500 }),
      promised: day,
    });
    fc.assert(
      fc.property(fc.array(order, { maxLength: 30 }), (rows) => {
        const pos = rows.map((r, i) =>
          po(`P${String(i)}`, r.material, r.supplier, r.qty, r.promised),
        );
        const total = (schedule: ReadonlyMap<IsoDate, number>) =>
          [...schedule.values()].reduce((sum, qty) => sum + qty, 0);
        const receipts = buildReceipts(pos, stats);
        for (const material of ['M1', 'M2']) {
          const expected = pos
            .filter((p) => p.materialId === material)
            .reduce((sum, p) => sum + p.qty, 0);
          const schedule = receipts.get(materialId(material));
          expect(schedule === undefined ? 0 : total(schedule.erp)).toBe(expected);
          expect(schedule === undefined ? 0 : total(schedule.realistic)).toBe(expected);
        }
        for (const p of pos) {
          const realistic = realisticReceiptDate(p, stats);
          expect(realistic >= p.promisedDate).toBe(true);
          expect(realistic).toBe(
            addWorkdays(p.promisedDate, receiptDelayDays(p.supplierId, stats)),
          );
        }
      }),
    );
  });
});
