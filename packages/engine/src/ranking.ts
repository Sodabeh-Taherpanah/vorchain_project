/**
 * Exception detection, severity, hidden flag, score and ranking (spec §5.2 steps 5 to 8), ported
 * from the per-material block and the final sort in `analyse` in
 * `reference/python-prototype/shortage_radar.py`.
 */
import type { IsoDate } from './dates.ts';
import type { StockProjection } from './projection.ts';
import { pyRound } from './rounding.ts';
import type { Severity } from './types.ts';

/** What the two projections of one material say, before scoring. */
export interface ShortageFinding {
  readonly severity: Severity;
  /** First realistic stock-out day (`CRITICAL`) or first below-safety day (`WARNING`). */
  readonly criticalDate: IsoDate;
  /** The ERP-view day of the same kind, or `null` when the ERP view shows no such day. */
  readonly erpViewDate: IsoDate | null;
  /** `erpViewDate === null || erpViewDate > criticalDate` (ADR-0005 item 7). */
  readonly hidden: boolean;
}

/**
 * Compares a material's ERP view with its realistic view. Returns `null` when the realistic view
 * has neither a stock-out nor a below-safety day (spec §5.2 step 5); otherwise `CRITICAL` if it
 * has a stock-out, else `WARNING`, dated by the first day of that kind in each view.
 *
 * The ERP view alone never raises an exception: with an overdue PO it can look worse than the
 * realistic view (ADR-0005 item 5), and the prototype then reports nothing.
 */
export function detectShortage(
  erp: StockProjection,
  realistic: StockProjection,
): ShortageFinding | null {
  if (realistic.firstStockOut !== null) {
    return finding('CRITICAL', realistic.firstStockOut, erp.firstStockOut);
  }
  if (realistic.firstBelowSafety !== null) {
    return finding('WARNING', realistic.firstBelowSafety, erp.firstBelowSafety);
  }
  return null;
}

function finding(
  severity: Severity,
  criticalDate: IsoDate,
  erpViewDate: IsoDate | null,
): ShortageFinding {
  // IsoDate strings are fixed-width `YYYY-MM-DD`, so string order is calendar order.
  return {
    severity,
    criticalDate,
    erpViewDate,
    hidden: erpViewDate === null || erpViewDate > criticalDate,
  };
}

/** Inputs of {@link shortageScore}. */
export interface ScoreFactors {
  readonly horizonDays: number;
  /** Calendar days from `asOf` to the critical date, in `[0, horizonDays)`. */
  readonly daysUntil: number;
  /** The material's unrounded safety stock. */
  readonly safetyStock: number;
  /** The unrounded minimum realistic stock (ADR-0005 item 6). */
  readonly minStock: number;
  readonly hidden: boolean;
  readonly severity: Severity;
}

/** Upper bound of the safety-gap term, so a huge gap cannot outweigh urgency. */
const MAX_GAP_POINTS = 30;
const POINTS_PER_SAFETY_STOCK = 10;
const POINTS_PER_DAY_LEFT = 3;
const HIDDEN_POINTS = 15;
const CRITICAL_POINTS = 25;

/**
 * Ranking score (spec §5.2 step 8), rounded like Python `round(x, 1)`:
 *
 * `(horizon − daysUntil) × 3 + min(max(safety − minStock, 0) / max(safety, 1) × 10, 30)
 *  + (hidden ? 15 : 0) + (CRITICAL ? 25 : 0)`
 *
 * The terms are added left to right in the prototype's order, so the float result (and the
 * rounding of `x.x5` cases) is identical bit for bit.
 */
export function shortageScore(factors: ScoreFactors): number {
  const { horizonDays, daysUntil, safetyStock, minStock, hidden, severity } = factors;
  const urgency = (horizonDays - daysUntil) * POINTS_PER_DAY_LEFT;
  const gap = Math.min(
    (Math.max(safetyStock - minStock, 0) / Math.max(safetyStock, 1)) * POINTS_PER_SAFETY_STOCK,
    MAX_GAP_POINTS,
  );
  const raw =
    urgency + gap + (hidden ? HIDDEN_POINTS : 0) + (severity === 'CRITICAL' ? CRITICAL_POINTS : 0);
  return pyRound(raw, 1);
}

/**
 * Sorts by `score` descending. The sort is stable (ES2019), so equal scores keep their input
 * order, which for exceptions is the materials-file order (ADR-0005 item 2). Returns a new array.
 */
export function rankByScore<T extends { readonly score: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.score - a.score);
}
