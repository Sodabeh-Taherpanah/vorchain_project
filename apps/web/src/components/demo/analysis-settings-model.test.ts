import type { IsoDate } from '@vorchain/engine';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HORIZON_DAYS,
  defaultAsOf,
  formatIsoDate,
  parseAsOf,
  parseHorizon,
  todayIsoDate,
} from './analysis-settings-model.ts';

const date = (value: string) => value as IsoDate;

describe('formatIsoDate', () => {
  it.each([
    ['de', '05.10.2026'],
    ['en', '2026-10-05'],
  ] as const)('formats a date-only value for %s without time zones', (locale, expected) => {
    expect(formatIsoDate(date('2026-10-05'), locale)).toBe(expected);
  });
});

describe('todayIsoDate', () => {
  it("takes the calendar day in the user's time zone, not UTC", () => {
    // 23:30 local time on 31 Dec: still the old year locally, whatever the UTC day is.
    expect(todayIsoDate(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31');
    expect(todayIsoDate(new Date(2027, 0, 1, 0, 5))).toBe('2027-01-01');
  });
});

describe('defaultAsOf', () => {
  it("prefers the sample's date and falls back to today", () => {
    const now = new Date(2026, 9, 1);
    expect(defaultAsOf(date('2026-10-05'), now)).toBe('2026-10-05');
    expect(defaultAsOf(null, now)).toBe('2026-10-01');
  });
});

describe('parseHorizon', () => {
  it('defaults to 28 days', () => {
    expect(DEFAULT_HORIZON_DAYS).toBe(28);
  });

  it.each([
    ['7', 7],
    ['28', 28],
    ['90', 90],
    [' 14 ', 14],
  ])('accepts %j', (raw, expected) => {
    expect(parseHorizon(raw)).toBe(expected);
  });

  it.each(['', '6', '91', '7.5', '1e1', 'abc', '-7'])('rejects %j', (raw) => {
    expect(parseHorizon(raw)).toBeNull();
  });
});

describe('parseAsOf', () => {
  it('accepts the value of a date input and rejects anything else', () => {
    expect(parseAsOf('2026-10-05')).toBe('2026-10-05');
    expect(parseAsOf('')).toBeNull();
    expect(parseAsOf('2026-02-30')).toBeNull();
  });
});
