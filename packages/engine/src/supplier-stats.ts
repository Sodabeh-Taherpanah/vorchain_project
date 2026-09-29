/**
 * Supplier delay statistics (spec §5.2 step 1), ported from `percentile` and `supplier_stats` in
 * `reference/python-prototype/shortage_radar.py`. Delays are signed working days from the promised
 * to the actual delivery date; the realistic view shifts each open PO by its supplier's P80 delay.
 */
import { workdaysBetween } from './dates.ts';
import type { SupplierId } from './ids.ts';
import { pyRound } from './rounding.ts';
import type { DeliveryRecord, SupplierStats } from './types.ts';

/** Deliveries a supplier needs before its statistics count as reliable (prototype `min_n=3`). */
export const DEFAULT_MIN_RELIABLE_DELIVERIES = 3;

/** The percentile that models a "typical bad case" delay. */
const DELAY_PERCENTILE = 0.8;

/** Options for {@link computeSupplierStats}. */
export interface SupplierStatsOptions {
  /** Minimum number of deliveries for `reliable: true`. Default {@link DEFAULT_MIN_RELIABLE_DELIVERIES}. */
  readonly minReliableDeliveries?: number;
}

/**
 * The `p`-th percentile of `values` with linear interpolation between the closest ranks, exactly
 * like the prototype: sort numerically, `k = (n - 1) * p`, interpolate between `floor(k)` and
 * `min(floor(k) + 1, n - 1)`. Returns `0` for an empty list. Does not modify `values`.
 *
 * @example `percentile([0, 1, 2, 3, 10], 0.8)` is `4.4` (up to floating-point error).
 * @throws RangeError if `p` is not within `[0, 1]` (a programmer error).
 */
export function percentile(values: readonly number[], p: number): number {
  if (!(p >= 0 && p <= 1))
    throw new RangeError(`percentile: p must be in [0, 1], got ${String(p)}`);
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const k = (sorted.length - 1) * p;
  const lo = Math.trunc(k);
  const hi = Math.min(lo + 1, sorted.length - 1);
  // Both indices lie in [0, n - 1]; the defaults only satisfy `noUncheckedIndexedAccess`.
  const { [lo]: lower = 0, [hi]: upper = 0 } = sorted;
  return lower + (upper - lower) * (k - lo);
}

/**
 * Delivery reliability per supplier, computed from the delivery history.
 *
 * - Rows with a missing `promisedDate` or `actualDate` are skipped; a supplier without any
 *   complete row gets no entry (lookups then fall back to "unknown supplier", ADR-0005 item 9).
 * - `meanDelayDays` is the unrounded mean of the signed working-day delays.
 * - `p80DelayDays` is `max(0, pyRound(percentile(delays, 0.8)))`: early suppliers never move a
 *   receipt forward.
 * - `onTimeRate` is the share of deliveries with delay `<= 0`.
 * - `reliable` is `deliveries >= minReliableDeliveries`.
 *
 * Suppliers appear in the order of their first complete history row, like the prototype's dict.
 * The values per supplier do not depend on row order.
 */
export function computeSupplierStats(
  history: readonly DeliveryRecord[],
  options: SupplierStatsOptions = {},
): SupplierStats[] {
  const minReliable = options.minReliableDeliveries ?? DEFAULT_MIN_RELIABLE_DELIVERIES;
  // Map iteration follows insertion order, which gives the first-appearance order.
  return [...delaysBySupplier(history)].map(([id, delays]) => summarise(id, delays, minReliable));
}

/**
 * Indexes statistics by supplier for O(1) lookups while shifting receipts and writing
 * explanations. A missing key means the supplier has no usable history.
 */
export function statsBySupplier(
  stats: readonly SupplierStats[],
): ReadonlyMap<SupplierId, SupplierStats> {
  return new Map(stats.map((s) => [s.supplierId, s]));
}

function delaysBySupplier(history: readonly DeliveryRecord[]): Map<SupplierId, number[]> {
  const delays = new Map<SupplierId, number[]>();
  for (const { supplierId, promisedDate, actualDate } of history) {
    if (promisedDate === null || actualDate === null) continue;
    const delay = workdaysBetween(promisedDate, actualDate);
    const list = delays.get(supplierId);
    if (list === undefined) delays.set(supplierId, [delay]);
    else list.push(delay);
  }
  return delays;
}

function summarise(
  supplierId: SupplierId,
  delays: readonly number[],
  minReliable: number,
): SupplierStats {
  const deliveries = delays.length;
  const total = delays.reduce((sum, delay) => sum + delay, 0);
  const onTime = delays.filter((delay) => delay <= 0).length;
  return {
    supplierId,
    meanDelayDays: total / deliveries,
    p80DelayDays: Math.max(0, pyRound(percentile(delays, DELAY_PERCENTILE))),
    onTimeRate: onTime / deliveries,
    deliveries,
    reliable: deliveries >= minReliable,
  };
}
