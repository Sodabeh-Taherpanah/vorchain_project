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
import { pyRound } from './rounding.ts';

/**
 * Parity with CPython on seeded, generated inputs (see scripts/generate-python-vectors.py). The
 * hand-written tables in dates.test.ts and rounding.test.ts document intent; these vectors guard
 * against cases nobody thought to write down (random dates across years 1..9999, random bit
 * patterns for rounding).
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

const addWorkdaysVectors = vectors.addWorkdays as AddWorkdaysVector[];
const betweenVectors = vectors.workdaysBetween as BetweenVector[];
const calendarVectors = vectors.calendar as CalendarVector[];
const roundVectors = vectors.round as RoundVector[];

describe('CPython parity vectors', () => {
  it('cover every helper with a meaningful number of cases', () => {
    expect(addWorkdaysVectors.length).toBeGreaterThan(250);
    expect(betweenVectors.length).toBeGreaterThan(250);
    expect(calendarVectors.length).toBeGreaterThan(100);
    expect(roundVectors.length).toBeGreaterThan(2000);
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
});
