import { isoDateFromParts, parseIsoDate, type IsoDate } from '@vorchain/engine';
import type { Locale } from 'next-intl';

/** Horizon limits of the demo (backlog P1-17), in calendar days. */
export const MIN_HORIZON_DAYS = 7;
export const MAX_HORIZON_DAYS = 90;
export const DEFAULT_HORIZON_DAYS = 28;

/** What the user can change before and after an analysis (spec §4.1 step 3). */
export interface AnalysisSettings {
  /** `null` until the user picks a date; then the default no longer applies. */
  readonly asOf: IsoDate | null;
  readonly horizonDays: number;
  /** Language of the results; independent of the page language. */
  readonly reportLocale: Locale;
}

/**
 * Formats a date-only value as the report shows it: `05.10.2026` in German, ISO `2026-10-05` in
 * English (like the prototype's report). String based, so no time zone can shift the day.
 */
export function formatIsoDate(date: IsoDate, locale: Locale): string {
  if (locale === 'en') return date;
  const [year, month, day] = date.split('-');
  return `${day ?? ''}.${month ?? ''}.${year ?? ''}`;
}

/** Today in the user's own time zone, as a date-only value. */
export function todayIsoDate(now: Date): IsoDate {
  const result = isoDateFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
  // A `Date` always has a real calendar day; failing here would be a programmer error.
  if (!result.ok) throw new Error(`todayIsoDate: invalid date ${result.error.input}`);
  return result.value;
}

/** The sample's analysis date, else today (backlog P1-17 criterion 1). */
export function defaultAsOf(sampleAsOf: IsoDate | null, now: Date): IsoDate {
  return sampleAsOf ?? todayIsoDate(now);
}

/** A whole number of days from 7 to 90, else `null`. */
export function parseHorizon(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  return days >= MIN_HORIZON_DAYS && days <= MAX_HORIZON_DAYS ? days : null;
}

/** The `YYYY-MM-DD` value of a date input, else `null` (empty or impossible date). */
export function parseAsOf(raw: string): IsoDate | null {
  const result = parseIsoDate(raw);
  return result.ok ? result.value : null;
}
