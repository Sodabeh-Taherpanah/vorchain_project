import { describe, expect, it } from 'vitest';

import vectors from './__fixtures__/python-vectors.json' with { type: 'json' };
import {
  addDays,
  addWorkdays,
  diffDays,
  parseIsoDate,
  weekday,
  workdaysBetween,
  type IsoDate,
} from './dates.ts';
import { supplierId } from './ids.ts';
import { pyRound } from './rounding.ts';
import { computeSupplierStats, percentile } from './supplier-stats.ts';
import type { DeliveryRecord } from './types.ts';

/**
 * Parity with CPython on seeded, generated inputs (see scripts/generate-python-vectors.py). The
 * hand-written tables in dates.test.ts and rounding.test.ts document intent; these vectors guard
 * against cases nobody thought to write down (random dates across years 1..9999, random bit
 * patterns for rounding, random delivery histories with weekend dates and missing values, plus the
 * full delivery history of both prototype sample datasets).
 */

function d(input: string): IsoDate {
  const result = parseIsoDate(input);
  if (!result.ok) throw new Error(`fixture holds an invalid date: ${input}`);
  return result.value;
}

type AddWorkdaysVector = [from: string, n: number, expected: string];
type BetweenVector = [a: string, b: string, expected: number];
type CalendarVector = [
  date: string,
  weekday: number,
  n: number,
  shifted: string,
  other: string,
  diff: number,
];
type RoundVector = [x: number, ndigits: number | null, expected: number];
type PercentileVector = [values: number[], p: number, expected: number];
interface SupplierStatsVector {
  name: string;
  minReliableDeliveries: number;
  history: { supplierId: string; promisedDate: string | null; actualDate: string | null }[];
  expected: {
    supplierId: string;
    meanDelayDays: number;
    p80DelayDays: number;
    onTimeRate: number;
    deliveries: number;
    reliable: boolean;
  }[];
}

const addWorkdaysVectors = vectors.addWorkdays as AddWorkdaysVector[];
const betweenVectors = vectors.workdaysBetween as BetweenVector[];
const calendarVectors = vectors.calendar as CalendarVector[];
const roundVectors = vectors.round as RoundVector[];
const percentileVectors = vectors.percentile as PercentileVector[];
const supplierStatsVectors = vectors.supplierStats as SupplierStatsVector[];

function toDeliveryRecord(row: SupplierStatsVector['history'][number]): DeliveryRecord {
  return {
    supplierId: supplierId(row.supplierId),
    promisedDate: row.promisedDate === null ? null : d(row.promisedDate),
    actualDate: row.actualDate === null ? null : d(row.actualDate),
    poId: null,
  };
}

describe('CPython parity vectors', () => {
  it('cover every helper with a meaningful number of cases', () => {
    expect(addWorkdaysVectors.length).toBeGreaterThan(250);
    expect(betweenVectors.length).toBeGreaterThan(250);
    expect(calendarVectors.length).toBeGreaterThan(100);
    expect(roundVectors.length).toBeGreaterThan(2000);
    expect(percentileVectors.length).toBeGreaterThan(100);
    expect(supplierStatsVectors.length).toBeGreaterThan(50);
  });

  it('addWorkdays matches add_workdays', () => {
    const mismatches = addWorkdaysVectors.filter(
      ([from, n, expected]) => addWorkdays(d(from), n) !== expected,
    );
    expect(mismatches).toEqual([]);
  });

  it('workdaysBetween matches workdays_between', () => {
    const mismatches = betweenVectors.filter(
      ([a, b, expected]) => !Object.is(workdaysBetween(d(a), d(b)), expected),
    );
    expect(mismatches).toEqual([]);
  });

  it('weekday, addDays and diffDays match date.weekday(), timedelta and (b - a).days', () => {
    const mismatches = calendarVectors.filter(
      ([date, wd, n, shifted, other, diff]) =>
        weekday(d(date)) !== wd ||
        addDays(d(date), n) !== shifted ||
        diffDays(d(date), d(other)) !== diff,
    );
    expect(mismatches).toEqual([]);
  });

  it('pyRound matches round() bit for bit, including the sign of zero', () => {
    const mismatches = roundVectors.filter(([x, ndigits, expected]) => {
      const actual = ndigits === null ? pyRound(x) : pyRound(x, ndigits);
      return !Object.is(actual, expected);
    });
    expect(mismatches).toEqual([]);
  });

  it('percentile matches percentile', () => {
    const mismatches = percentileVectors.filter(
      ([values, p, expected]) => !Object.is(percentile(values, p), expected),
    );
    expect(mismatches).toEqual([]);
  });

  it.each(supplierStatsVectors.map((v) => [v.name, v] as const))(
    'computeSupplierStats matches supplier_stats (%s)',
    (_name, { history, minReliableDeliveries, expected }) => {
      const actual = computeSupplierStats(history.map(toDeliveryRecord), {
        minReliableDeliveries,
      });
      // Exact equality, including float bits of mean and on-time rate and the Python order.
      expect(actual).toEqual(expected);
    },
  );
});
