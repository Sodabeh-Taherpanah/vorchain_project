/**
 * Quantities per calendar day, the shape both the demand plan and the receipt schedules take
 * before the projection walks through them (prototype: `defaultdict(float)` keyed by `date`).
 */
import type { IsoDate } from './dates.ts';

/** Quantity per day; a missing day means 0. Map order is the order days first appeared. */
export type DailyQuantities = ReadonlyMap<IsoDate, number>;

/**
 * Adds `qty` to the running total of `day`, starting from 0 like `defaultdict(float)`. Rows are
 * summed in input order, so floating-point totals equal the prototype's bit for bit.
 */
export function addToDay(totals: Map<IsoDate, number>, day: IsoDate, qty: number): void {
  totals.set(day, (totals.get(day) ?? 0) + qty);
}
