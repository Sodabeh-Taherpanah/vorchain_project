/**
 * Overdue open POs (ADR-0005 item 5, option B, chosen by the owner on 2026-09-29). Not in the
 * prototype: the projection window starts at `asOf`, so a PO promised before it never arrives in
 * the ERP view, while its P80-shifted date may land inside the window in the realistic view. That
 * can make the realistic view look less alarming, or drop a material from the report entirely.
 * This module only *reports* such POs; no number, severity, score or order depends on it.
 */
import { addDays, type IsoDate } from './dates.ts';
import type { MaterialId } from './ids.ts';
import { realisticReceiptDate, type SupplierStatsMap } from './receipts.ts';
import type { AnalysisOptions, OverduePurchaseOrder, PurchaseOrder, Reason } from './types.ts';

/** A PO is overdue when its promised date lies before `asOf`. */
function isOverdue(order: PurchaseOrder, asOf: IsoDate): boolean {
  // IsoDate strings are fixed-width `YYYY-MM-DD`, so string order is calendar order.
  return order.promisedDate < asOf;
}

/**
 * Every open PO promised before `asOf`, in PO-file order, with the day the realistic view books it
 * and whether that day lies inside `[asOf, asOf + horizonDays)`. POs of materials that are not in
 * the materials table are included too. `flagged` holds the materials that have an exception.
 */
export function findOverduePurchaseOrders(
  purchaseOrders: readonly PurchaseOrder[],
  stats: SupplierStatsMap,
  { asOf, horizonDays }: Pick<AnalysisOptions, 'asOf' | 'horizonDays'>,
  flagged: ReadonlySet<MaterialId>,
): OverduePurchaseOrder[] {
  const windowEnd = addDays(asOf, Math.max(horizonDays, 0));
  return purchaseOrders
    .filter((order) => isOverdue(order, asOf))
    .map((order) => {
      const realisticDate = realisticReceiptDate(order, stats);
      return {
        poId: order.poId,
        materialId: order.materialId,
        supplierId: order.supplierId,
        qty: order.qty,
        promisedDate: order.promisedDate,
        realisticDate,
        countedInRealisticView: realisticDate >= asOf && realisticDate < windowEnd,
        hasException: flagged.has(order.materialId),
      };
    });
}

/**
 * One `PO_OVERDUE` reason per overdue PO of one material, in PO-file order. `analyse` appends them
 * after the prototype's reasons, so those stay an unchanged prefix.
 */
export function overdueReasons(
  purchaseOrders: readonly PurchaseOrder[],
  stats: SupplierStatsMap,
  asOf: IsoDate,
): Reason[] {
  return purchaseOrders
    .filter((order) => isOverdue(order, asOf))
    .map((order) => ({
      code: 'PO_OVERDUE',
      poId: order.poId,
      promisedDate: order.promisedDate,
      supplierId: order.supplierId,
      realisticDate: realisticReceiptDate(order, stats),
    }));
}
