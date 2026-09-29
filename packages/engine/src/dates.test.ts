import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addDays,
  addWorkdays,
  diffDays,
  isoDateFromParts,
  isWorkday,
  parseIsoDate,
  weekday,
  workdaysBetween,
  type IsoDate,
} from './dates.ts';

/** Test helper: parses a literal that is known to be valid, failing the test loudly otherwise. */
function d(input: string): IsoDate {
  const result = parseIsoDate(input);
  if (!result.ok) throw new Error(`invalid test date ${input}`);
  return result.value;
}

/** Arbitrary calendar date from 1990 to about 2060 (the range ERP exports realistically cover). */
const dateArb = fc
  .integer({ min: 0, max: 25_567 })
  .map((offset) => addDays(d('1990-01-01'), offset));

const weekdayDateArb = dateArb.filter((date) => isWorkday(date));

describe('parseIsoDate', () => {
  it.each(['2026-10-05', '2028-02-29', '2000-02-29', '0001-01-01', '9999-12-31', '2026-12-31'])(
    'accepts the real calendar date %s unchanged',
    (input) => {
      expect(parseIsoDate(input)).toEqual({ ok: true, value: input });
    },
  );

  it.each([
    '2026-02-30',
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-10-00',
    '0000-01-01',
  ])('rejects %s as INVALID_CALENDAR_DATE', (input) => {
    expect(parseIsoDate(input)).toEqual({
      ok: false,
      error: { code: 'INVALID_CALENDAR_DATE', input },
    });
  });

  it.each([
    '2026-1-5',
    '26-10-05',
    '20261005',
    '05.10.2026',
    ' 2026-10-05',
    '2026-10-05 ',
    '2026-10-05T00:00:00Z',
    '+02026-10-05',
    '2026/10/05',
    '２０２６-10-05',
    '',
  ])('rejects %j as INVALID_FORMAT', (input) => {
    expect(parseIsoDate(input)).toEqual({ ok: false, error: { code: 'INVALID_FORMAT', input } });
  });

  it('round-trips every calendar date produced by the UTC helpers', () => {
    fc.assert(fc.property(dateArb, (date) => parseIsoDate(date).ok));
  });
});

describe('isoDateFromParts', () => {
  it('builds a zero-padded IsoDate from numeric parts', () => {
    expect(isoDateFromParts(26, 1, 5)).toEqual({ ok: true, value: '0026-01-05' });
    expect(isoDateFromParts(2026, 10, 5)).toEqual({ ok: true, value: '2026-10-05' });
  });

  it.each([
    [2026, 2, 30],
    [2026, 13, 1],
    [0, 1, 1],
    [10_000, 1, 1],
    [2026, 1.5, 1],
    [Number.NaN, 1, 1],
  ])('rejects %d-%d-%d as INVALID_CALENDAR_DATE', (year, month, day) => {
    const result = isoDateFromParts(year, month, day);
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.code).toBe('INVALID_CALENDAR_DATE');
  });
});

describe('addDays and diffDays (calendar days)', () => {
  it.each([
    ['2026-10-05', 1, '2026-10-06'],
    ['2026-10-05', 0, '2026-10-05'],
    ['2026-10-05', -5, '2026-09-30'],
    ['2026-10-05', 27, '2026-11-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2027-01-01', -1, '2026-12-31'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2028-02-29', 1, '2028-03-01'],
    ['2026-02-28', 1, '2026-03-01'],
    ['2026-03-29', 1, '2026-03-30'], // DST switch in Europe must not matter (UTC only)
    ['2026-10-25', 1, '2026-10-26'],
    ['0001-01-01', 0, '0001-01-01'],
    ['9999-12-30', 1, '9999-12-31'],
  ])('addDays(%s, %d) = %s', (from, n, expected) => {
    expect(addDays(d(from), n)).toBe(expected);
    expect(diffDays(d(from), d(expected))).toBe(n);
  });

  it('diffDays is signed: to - from', () => {
    expect(diffDays(d('2026-10-05'), d('2026-10-08'))).toBe(3);
    expect(diffDays(d('2026-10-08'), d('2026-10-05'))).toBe(-3);
    expect(diffDays(d('2026-01-01'), d('2027-01-01'))).toBe(365);
    expect(diffDays(d('2028-01-01'), d('2029-01-01'))).toBe(366);
  });

  it('throws RangeError for programmer errors: non-integer offsets or years outside 1..9999', () => {
    expect(() => addDays(d('2026-10-05'), 1.5)).toThrow(RangeError);
    expect(() => addDays(d('2026-10-05'), Number.NaN)).toThrow(RangeError);
    expect(() => addDays(d('9999-12-31'), 1)).toThrow(RangeError);
    expect(() => addDays(d('0001-01-01'), -1)).toThrow(RangeError);
  });

  it('property: diffDays(a, addDays(a, n)) === n', () => {
    fc.assert(
      fc.property(dateArb, fc.integer({ min: -2000, max: 2000 }), (a, n) => {
        expect(diffDays(a, addDays(a, n))).toBe(n);
      }),
    );
  });
});

describe('weekday and isWorkday (Monday = 0, like Python date.weekday())', () => {
  it.each([
    ['2026-10-05', 0], // Monday
    ['2026-10-06', 1],
    ['2026-10-07', 2],
    ['2026-10-08', 3],
    ['2026-10-09', 4], // Friday
    ['2026-10-10', 5], // Saturday
    ['2026-10-11', 6], // Sunday
    ['1970-01-01', 3], // Unix epoch was a Thursday
    ['1969-12-28', 6], // before the epoch: negative day numbers
    ['2028-02-29', 1],
    ['0001-01-01', 0],
  ])('weekday(%s) = %d', (date, expected) => {
    expect(weekday(d(date))).toBe(expected);
    expect(isWorkday(d(date))).toBe(expected < 5);
  });

  it('property: the weekday repeats every 7 days', () => {
    fc.assert(fc.property(dateArb, (a) => weekday(addDays(a, 7)) === weekday(a)));
  });
});

describe('addWorkdays (port of add_workdays)', () => {
  // Expected values were produced by reference/python-prototype/shortage_radar.py.
  it.each([
    ['2026-10-09', 1, '2026-10-12'], // Fri + 1 = Mon (Python test case)
    ['2026-10-09', 0, '2026-10-09'],
    ['2026-10-10', 0, '2026-10-10'], // 0 keeps a weekend date as is
    ['2026-10-10', 1, '2026-10-12'], // Sat + 1 = Mon
    ['2026-10-11', 1, '2026-10-12'], // Sun + 1 = Mon
    ['2026-10-10', -1, '2026-10-09'], // Sat - 1 = Fri
    ['2026-10-11', -1, '2026-10-09'], // Sun - 1 = Fri
    ['2026-10-12', -1, '2026-10-09'], // Mon - 1 = Fri
    ['2026-10-05', 5, '2026-10-12'],
    ['2026-10-05', -5, '2026-09-28'],
    ['2026-09-30', 3, '2026-10-05'], // month boundary
    ['2026-12-31', 1, '2027-01-01'], // year boundary; holidays are ignored in v0.2
    ['2027-01-04', -1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'], // leap day
    ['2028-02-29', 1, '2028-03-01'],
    ['2028-02-29', -1, '2028-02-28'],
    ['2026-10-05', 25, '2026-11-09'],
  ])('addWorkdays(%s, %d) = %s', (from, n, expected) => {
    expect(addWorkdays(d(from), n)).toBe(expected);
  });

  it('throws RangeError for a non-integer number of working days', () => {
    expect(() => addWorkdays(d('2026-10-05'), 0.5)).toThrow(RangeError);
  });

  it('property: a non-zero shift always lands on a working day', () => {
    fc.assert(
      fc.property(
        dateArb,
        fc.integer({ min: -60, max: 60 }).filter((n) => n !== 0),
        (a, n) => isWorkday(addWorkdays(a, n)),
      ),
    );
  });
});

describe('workdaysBetween (port of workdays_between)', () => {
  // Counts working days in (min, max], signed. Expected values come from the Python prototype.
  it.each([
    ['2026-10-09', '2026-10-12', 1], // Fri -> Mon (Python test case)
    ['2026-10-12', '2026-10-09', -1], // Mon -> Fri (Python test case)
    ['2026-10-10', '2026-10-11', 0], // Sat -> Sun
    ['2026-10-11', '2026-10-10', 0], // Sun -> Sat
    ['2026-10-10', '2026-10-12', 1], // Sat -> Mon
    ['2026-10-09', '2026-10-10', 0], // Fri -> Sat
    ['2026-10-10', '2026-10-09', 0], // Sat -> Fri
    ['2026-10-10', '2026-10-17', 5], // Sat -> Sat
    ['2026-10-11', '2026-10-18', 5], // Sun -> Sun
    ['2026-10-05', '2026-10-05', 0],
    ['2026-10-10', '2026-10-10', 0],
    ['2026-12-31', '2027-01-04', 2], // year boundary
    ['2028-02-28', '2028-03-01', 2], // leap day counts
    ['2026-01-01', '2026-12-31', 260],
    ['2026-10-16', '2026-10-05', -9],
  ])('workdaysBetween(%s, %s) = %d', (a, b, expected) => {
    expect(workdaysBetween(d(a), d(b))).toBe(expected);
  });

  it('property: workdaysBetween(a, addWorkdays(a, n)) === n for a working day a', () => {
    fc.assert(
      fc.property(weekdayDateArb, fc.integer({ min: -60, max: 60 }), (a, n) => {
        expect(workdaysBetween(a, addWorkdays(a, n))).toBe(n);
      }),
    );
  });

  it('property: antisymmetric (swapping the dates flips the sign)', () => {
    fc.assert(
      fc.property(dateArb, fc.integer({ min: -60, max: 60 }), (a, n) => {
        const b = addDays(a, n);
        expect(workdaysBetween(b, a)).toBe(-workdaysBetween(a, b) || 0);
      }),
    );
  });
});
