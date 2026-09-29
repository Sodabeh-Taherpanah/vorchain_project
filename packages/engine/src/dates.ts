/**
 * Date-only calendar arithmetic (ADR-0005). The prototype uses Python `datetime.date`, which has
 * no time of day and no time zone, so every helper works on whole UTC days. This is the only
 * engine module allowed to touch `Date`, and only through UTC methods, so the user's time zone
 * or a DST switch can never shift a date.
 */
import type { Brand } from './ids.ts';
import { err, ok, type Result } from './result.ts';

/** Calendar date as `YYYY-MM-DD` (year 0001..9999, like Python `date`). Compare with `<`/`===`. */
export type IsoDate = Brand<string, 'IsoDate'>;

/** Why a string or set of parts is not an {@link IsoDate}. A code, never display text. */
export interface DateError {
  readonly code: 'INVALID_FORMAT' | 'INVALID_CALENDAR_DATE';
  readonly input: string;
}

/** Day of the week, Monday = 0 … Sunday = 6, exactly like Python `date.weekday()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const MS_PER_DAY = 86_400_000;
const MIN_YEAR = 1;
const MAX_YEAR = 9999;
/** 1970-01-01 (day number 0) was a Thursday, i.e. weekday 3. */
const EPOCH_WEEKDAY = 3;
const ISO_DATE_PATTERN = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

/**
 * Parses a strict ISO calendar date. Only `YYYY-MM-DD` with a real calendar day is accepted:
 * `2026-1-5` fails with `INVALID_FORMAT`, `2026-02-30` with `INVALID_CALENDAR_DATE`.
 * Other notations (`05.10.2026`, Excel serials) are the parsers' job.
 */
export function parseIsoDate(input: string): Result<IsoDate, DateError> {
  const match = ISO_DATE_PATTERN.exec(input);
  if (match === null) return err({ code: 'INVALID_FORMAT', input });
  const [, year = '', month = '', day = ''] = match;
  const result = isoDateFromParts(Number(year), Number(month), Number(day));
  return result.ok ? result : err({ code: 'INVALID_CALENDAR_DATE', input });
}

/**
 * Builds an {@link IsoDate} from a year (1..9999), a month (1..12) and a day of month, rejecting
 * impossible dates such as 30 February instead of rolling them over like `Date` would.
 */
export function isoDateFromParts(
  year: number,
  month: number,
  day: number,
): Result<IsoDate, DateError> {
  const input = `${String(year)}-${String(month)}-${String(day)}`;
  if (![year, month, day].every(Number.isInteger) || year < MIN_YEAR || year > MAX_YEAR) {
    return err({ code: 'INVALID_CALENDAR_DATE', input });
  }
  const date = utcDate(year, month, day);
  const rollsOver = date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day;
  return rollsOver ? err({ code: 'INVALID_CALENDAR_DATE', input }) : ok(formatUtcDate(date));
}

/**
 * Shifts a date by `n` calendar days (`n` may be negative), like `date + timedelta(days=n)`.
 *
 * @throws RangeError if `n` is not an integer or the result leaves years 1..9999 (a programmer
 * error; Python raises `OverflowError` there).
 */
export function addDays(date: IsoDate, n: number): IsoDate {
  assertInteger(n, 'addDays');
  return fromDayNumber(toDayNumber(date) + n);
}

/** Signed number of calendar days from `from` to `to`, like Python `(to - from).days`. */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** Day of the week with Monday = 0 and Sunday = 6, like Python `date.weekday()`. */
export function weekday(date: IsoDate): Weekday {
  return weekdayOfDayNumber(toDayNumber(date));
}

/** True for Monday to Friday. Public holidays are ignored, as in prototype v0.2. */
export function isWorkday(date: IsoDate): boolean {
  return weekday(date) < 5;
}

/**
 * Shifts a date by `n` working days (Mon–Fri), a port of `add_workdays`. It steps one calendar
 * day at a time and counts only weekdays, so a weekend start moves to the next (or, for negative
 * `n`, previous) weekday, and `n = 0` returns `date` unchanged even on a weekend.
 *
 * @example `addWorkdays('2026-10-09', 1)` (Friday) is `'2026-10-12'` (Monday).
 * @throws RangeError if `n` is not an integer or the result leaves years 1..9999.
 */
export function addWorkdays(date: IsoDate, n: number): IsoDate {
  assertInteger(n, 'addWorkdays');
  const step = n >= 0 ? 1 : -1;
  let dayNumber = toDayNumber(date);
  let remaining = n;
  while (remaining !== 0) {
    dayNumber += step;
    if (weekdayOfDayNumber(dayNumber) < 5) remaining -= step;
  }
  return fromDayNumber(dayNumber);
}

/**
 * Signed number of working days from `a` to `b`, a port of `workdays_between`: it counts the
 * weekdays in `(min(a, b), max(a, b)]` and is negative when `b` is before `a`. Weekend endpoints
 * are legal (history rows may fall on weekends): Saturday to Monday is 1, Friday to Saturday is 0.
 */
export function workdaysBetween(a: IsoDate, b: IsoDate): number {
  const start = toDayNumber(a);
  const end = toDayNumber(b);
  const [low, high, sign] = end >= start ? [start, end, 1] : [end, start, -1];
  let count = 0;
  for (let dayNumber = low + 1; dayNumber <= high; dayNumber += 1) {
    if (weekdayOfDayNumber(dayNumber) < 5) count += 1;
  }
  // `|| 0` avoids returning -0 for an empty span, so results compare cleanly with `Object.is`.
  return sign * count || 0;
}

function assertInteger(n: number, caller: string): void {
  if (!Number.isInteger(n))
    throw new RangeError(`${caller}: expected an integer, got ${String(n)}`);
}

/** Days since 1970-01-01; negative before the epoch. */
function toDayNumber(date: IsoDate): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return utcDate(year, month, day).getTime() / MS_PER_DAY;
}

function fromDayNumber(dayNumber: number): IsoDate {
  const date = new Date(dayNumber * MS_PER_DAY);
  const year = date.getUTCFullYear();
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new RangeError(`date out of range (years ${String(MIN_YEAR)}..${String(MAX_YEAR)})`);
  }
  return formatUtcDate(date);
}

function weekdayOfDayNumber(dayNumber: number): Weekday {
  // Double modulo keeps the result in 0..6 for negative day numbers (dates before 1970).
  return ((((dayNumber + EPOCH_WEEKDAY) % 7) + 7) % 7) as Weekday;
}

/**
 * UTC midnight of the given day. `setUTCFullYear` is used instead of `Date.UTC` because the latter
 * maps years 0..99 to 1900..1999.
 */
function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function formatUtcDate(date: Date): IsoDate {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}` as IsoDate;
}
