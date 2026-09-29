/**
 * Receipt schedules for the two views (spec §5.2 step 2), ported from the PO loop in `analyse` in
 * `reference/python-prototype/shortage_radar.py`. The ERP view books each open PO on its promised
 * date; the realistic view shifts it by the supplier's P80 delay in working days.
 */
import { addWorkdays, type IsoDate } from './dates.ts';
import { addToDay, type DailyQuantities } from './daily-quantities.ts';
import type { MaterialId, SupplierId } from './ids.ts';
import type { PurchaseOrder, SupplierStats } from './types.ts';

/** Incoming quantities of one material per day, in both views. */
export interface ReceiptSchedule {
  /** Every PO arrives on its promised date (what the ERP plans with). */
  readonly erp: DailyQuantities;
  /** Every PO arrives `p80DelayDays` working days after its promised date. */
  readonly realistic: DailyQuantities;
}

/** Supplier statistics indexed by supplier, as returned by `statsBySupplier`. */
export type SupplierStatsMap = ReadonlyMap<SupplierId, SupplierStats>;

/**
 * Working days a PO from `supplier` is expected to arrive late: the supplier's `p80DelayDays`, or
 * `0` when the supplier has no usable history (ADR-0005 item 9). Suppliers with too little history
 * (`reliable: false`) are still shifted by their P80, as in the prototype; explanations flag them.
 */
export function receiptDelayDays(supplier: SupplierId, stats: SupplierStatsMap): number {
  return stats.get(supplier)?.p80DelayDays ?? 0;
}

/**
 * The day a PO really arrives in the realistic view: `addWorkdays(promisedDate, p80)`. With a delay
 * of 0 the promised date is kept unchanged, even when it falls on a weekend.
 */
export function realisticReceiptDate(order: PurchaseOrder, stats: SupplierStatsMap): IsoDate {
  return addWorkdays(order.promisedDate, receiptDelayDays(order.supplierId, stats));
}

/**
 * Groups open POs into per-material receipt schedules for the ERP and the realistic view,
 * summing quantities per day in PO-file order. Nothing is filtered here: POs before `asOf` or
 * beyond the horizon are dropped by the projection window (ADR-0005 item 5). Materials without an
 * open PO have no entry. Materials appear in order of their first PO.
 */
export function buildReceipts(
  purchaseOrders: readonly PurchaseOrder[],
  stats: SupplierStatsMap,
): ReadonlyMap<MaterialId, ReceiptSchedule> {
  const schedules = new Map<
    MaterialId,
    { erp: Map<IsoDate, number>; realistic: Map<IsoDate, number> }
  >();
  for (const order of purchaseOrders) {
    let schedule = schedules.get(order.materialId);
    if (schedule === undefined) {
      schedule = { erp: new Map(), realistic: new Map() };
      schedules.set(order.materialId, schedule);
    }
    addToDay(schedule.erp, order.promisedDate, order.qty);
    addToDay(schedule.realistic, realisticReceiptDate(order, stats), order.qty);
  }
  return schedules;
}
