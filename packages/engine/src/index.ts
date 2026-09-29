/**
 * Public API of the Vorchain engine: pure, deterministic domain logic with no I/O, DOM or Node
 * APIs (AGENTS.md §2, ADR-0005). Analysis functions arrive with P1-02..P1-06:
 * supplier statistics since P1-02, receipt schedules and the stock projection since P1-03.
 */
export const ENGINE_PACKAGE_NAME = '@vorchain/engine';

export {
  addDays,
  addWorkdays,
  diffDays,
  isoDateFromParts,
  isWorkday,
  parseIsoDate,
  weekday,
  workdaysBetween,
} from './dates.ts';
export type { DateError, IsoDate, Weekday } from './dates.ts';
export { materialId, poId, supplierId } from './ids.ts';
export type { Brand, MaterialId, PoId, SupplierId } from './ids.ts';
export { err, ok } from './result.ts';
export type { Err, Ok, Result } from './result.ts';
export type { DailyQuantities } from './daily-quantities.ts';
export { buildReceipts, realisticReceiptDate, receiptDelayDays } from './receipts.ts';
export type { ReceiptSchedule, SupplierStatsMap } from './receipts.ts';
export { pyRound } from './rounding.ts';
export {
  computeSupplierStats,
  DEFAULT_MIN_RELIABLE_DELIVERIES,
  percentile,
  statsBySupplier,
} from './supplier-stats.ts';
export type { SupplierStatsOptions } from './supplier-stats.ts';
export type {
  Action,
  AnalysisInput,
  AnalysisOptions,
  DeliveryRecord,
  DemandLine,
  Material,
  ProjectionPoint,
  ProjectionSeries,
  PurchaseOrder,
  Reason,
  Report,
  Severity,
  ShortageException,
  Supplier,
  SupplierStats,
} from './types.ts';
