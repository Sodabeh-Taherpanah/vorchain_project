/**
 * Public API of the Vorchain engine: pure, deterministic domain logic with no I/O, DOM or Node
 * APIs (AGENTS.md §2, ADR-0005). Analysis functions arrive with P1-02..P1-06:
 * supplier statistics since P1-02, receipt schedules and the stock projection since P1-03,
 * `analyse` with exception detection, scoring and ranking since P1-04, structured explanations
 * (reason and action codes) and overdue POs (ADR-0005 option B) since P1-05.
 */
export const ENGINE_PACKAGE_NAME = '@vorchain/engine';

export { analyse } from './analyse.ts';
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
export { demandByMaterial, projectionSeries, projectStock } from './projection.ts';
export type { StockProjection, StockProjectionInput } from './projection.ts';
export { buildReceipts, realisticReceiptDate, receiptDelayDays } from './receipts.ts';
export type { ReceiptSchedule, SupplierStatsMap } from './receipts.ts';
export { detectShortage, rankByScore, shortageScore } from './ranking.ts';
export { ACTION_CODES, explainShortage, explanationPoId, REASON_CODES } from './explanations.ts';
export type { Explanation, ShortageContext } from './explanations.ts';
export { findOverduePurchaseOrders, overdueReasons } from './overdue.ts';
export type { ScoreFactors, ShortageFinding } from './ranking.ts';
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
  ActionCode,
  AnalysisInput,
  AnalysisOptions,
  DeliveryRecord,
  DemandLine,
  Material,
  OverduePurchaseOrder,
  ProjectionPoint,
  ProjectionSeries,
  PurchaseOrder,
  Reason,
  ReasonCode,
  Report,
  Severity,
  ShortageException,
  Supplier,
  SupplierStats,
} from './types.ts';
