/**
 * Day-by-day stock projection (spec §5.2 steps 3 and 4), ported from `project` and the demand
 * grouping in `analyse` in `reference/python-prototype/shortage_radar.py`. The window is
 * `[asOf, asOf + horizonDays)` in calendar days; on each day receipts are booked before demand.
 * Anything dated outside the window is never visited, so overdue POs never arrive (ADR-0005 item 5).
 */
import { addDays, type IsoDate } from './dates.ts';
import { addToDay, type DailyQuantities } from './daily-quantities.ts';
import type { MaterialId } from './ids.ts';
import { buildReceipts } from './receipts.ts';
import { computeSupplierStats, statsBySupplier } from './supplier-stats.ts';
import type {
  AnalysisInput,
  AnalysisOptions,
  DemandLine,
  ProjectionPoint,
  ProjectionSeries,
} from './types.ts';

/** One material in one view: everything the projection needs besides the window. */
export interface MaterialView {
  /** Stock at the start of `asOf`. */
  readonly onHand: number;
  readonly demandByDay: DailyQuantities;
  readonly receiptsByDay: DailyQuantities;
  readonly safetyStock: number;
}

/** Input of {@link projectStock}: one material in one view, plus the window it is projected over. */
export interface StockProjectionInput extends MaterialView {
  /** Day 0 of the window. */
  readonly asOf: IsoDate;
  /** Window length in calendar days; `0` or less means no day is projected, like `range()`. */
  readonly horizonDays: number;
}

/**
 * The calendar days `asOf, asOf + 1, …` of the window `[asOf, asOf + horizonDays)`. Building it
 * costs one date calculation per day, so `analyse` builds it once and shares it across all
 * materials and both views instead of rebuilding it per projection.
 */
export type ProjectionWindow = readonly IsoDate[];

/** Outcome of {@link projectStock}; the prototype's `(first_short, first_below_ss, min_stock)`. */
export interface StockProjection {
  /** First day with end-of-day stock `< 0`, or `null`. */
  readonly firstStockOut: IsoDate | null;
  /** First day with end-of-day stock `< safetyStock`, or `null`. */
  readonly firstBelowSafety: IsoDate | null;
  /** Lowest end-of-day stock in the window, unrounded; starts at `onHand`, so never above it. */
  readonly minStock: number;
}

const NO_QUANTITIES: DailyQuantities = new Map();

/**
 * Projects one material's stock day by day over `[asOf, asOf + horizonDays)`: each day adds that
 * day's receipts, then subtracts that day's demand. Both comparisons are strict, so stock exactly
 * at 0 (or exactly at the safety stock) is not a problem yet.
 *
 * @throws RangeError if `horizonDays` is not an integer (a programmer error).
 */
export function projectStock(input: StockProjectionInput): StockProjection {
  return projectOverWindow(projectionWindow(input.asOf, input.horizonDays), input);
}

/**
 * {@link projectStock} over a prebuilt window, for callers that project many materials over the
 * same window. Same arithmetic, same results bit for bit.
 */
export function projectOverWindow(window: ProjectionWindow, view: MaterialView): StockProjection {
  const { onHand, demandByDay, receiptsByDay, safetyStock } = view;
  let firstStockOut: IsoDate | null = null;
  let firstBelowSafety: IsoDate | null = null;
  let minStock = onHand;
  let stock = onHand;
  for (const date of window) {
    stock = nextStock(stock, quantityOn(receiptsByDay, date), quantityOn(demandByDay, date));
    // Same operand order as Python `min(min_stock, stock)`, which keeps the first of equal values.
    if (stock < minStock) minStock = stock;
    if (stock < 0) firstStockOut ??= date;
    if (stock < safetyStock) firstBelowSafety ??= date;
  }
  return { firstStockOut, firstBelowSafety, minStock };
}

/**
 * Sums demand per material and day in file order (prototype: `dem[material_id][date] += qty`).
 * Materials appear in order of their first demand line; materials without demand have no entry.
 */
export function demandByMaterial(
  demand: readonly DemandLine[],
): ReadonlyMap<MaterialId, DailyQuantities> {
  const totals = new Map<MaterialId, Map<IsoDate, number>>();
  for (const { materialId, date, qty } of demand) {
    let byDay = totals.get(materialId);
    if (byDay === undefined) {
      byDay = new Map();
      totals.set(materialId, byDay);
    }
    addToDay(byDay, date, qty);
  }
  return totals;
}

/**
 * Daily stock of one material in the ERP view and the realistic view, for the detail chart and
 * its table alternative. Uses the same receipts, demand and arithmetic as the analysis, so the
 * lines cross zero and the safety stock on exactly the dates the report shows.
 *
 * When the materials table lists `materialId` more than once, the first row is used.
 *
 * @throws RangeError if `materialId` is not in `input.materials` or `options.horizonDays` is not
 * an integer (programmer errors: the UI only asks for materials of the current report).
 */
export function projectionSeries(
  input: AnalysisInput,
  materialId: MaterialId,
  options: AnalysisOptions,
): ProjectionSeries {
  const material = input.materials.find((m) => m.materialId === materialId);
  if (material === undefined) {
    throw new RangeError(`projectionSeries: unknown material ${materialId}`);
  }
  // `minReliableDeliveries` only sets the `reliable` flag; the P80 shift does not depend on it.
  const stats = statsBySupplier(computeSupplierStats(input.supplierHistory));
  const orders = input.openPurchaseOrders.filter((po) => po.materialId === materialId);
  const receipts = buildReceipts(orders, stats).get(materialId);
  const lines = input.demand.filter((line) => line.materialId === materialId);
  const demandByDay = demandByMaterial(lines).get(materialId) ?? NO_QUANTITIES;

  let erpStock = material.onHand;
  let realisticStock = material.onHand;
  const points = projectionWindow(options.asOf, options.horizonDays).map(
    (date): ProjectionPoint => {
      const demand = quantityOn(demandByDay, date);
      const erpReceipts = quantityOn(receipts?.erp, date);
      const realisticReceipts = quantityOn(receipts?.realistic, date);
      erpStock = nextStock(erpStock, erpReceipts, demand);
      realisticStock = nextStock(realisticStock, realisticReceipts, demand);
      return { date, demand, erpReceipts, realisticReceipts, erpStock, realisticStock };
    },
  );
  return { materialId, safetyStock: material.safetyStock, points };
}

/**
 * Builds the {@link ProjectionWindow}; empty for `horizonDays <= 0`.
 *
 * @throws RangeError if `horizonDays` is not an integer (a programmer error).
 */
export function projectionWindow(asOf: IsoDate, horizonDays: number): ProjectionWindow {
  if (!Number.isInteger(horizonDays)) {
    throw new RangeError(`horizonDays must be an integer, got ${String(horizonDays)}`);
  }
  return Array.from({ length: Math.max(0, horizonDays) }, (_, i) => addDays(asOf, i));
}

function quantityOn(byDay: DailyQuantities | undefined, date: IsoDate): number {
  return byDay?.get(date) ?? 0;
}

/**
 * End-of-day stock: receipts first, then demand, as two float operations in the prototype's order
 * (`stock += receipts; stock -= demand`), so results are equal bit for bit.
 */
function nextStock(stock: number, receipts: number, demand: number): number {
  return stock + receipts - demand;
}
