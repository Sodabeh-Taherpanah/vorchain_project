import { addDays, type IsoDate } from '@vorchain/engine';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { dateFromSerial, parseDate, parseNumber } from './values.ts';

function numberOf(input: string | number): unknown {
  const result = parseNumber(input);
  return result.ok ? result.value : result.error;
}

function dateOf(input: string): unknown {
  const result = parseDate(input);
  return result.ok ? result.value : result.error;
}

describe('parseNumber', () => {
  it.each([
    // The prototype's `test_numbers`.
    { input: '1.234,5', expected: 1234.5 },
    { input: '1,234.5', expected: 1234.5 },
    { input: '12,5', expected: 12.5 },
    { input: '', expected: 0 },
    // Backlog P1-08 and spec §5.1.
    { input: '1234.5', expected: 1234.5 },
    { input: '1.234.567,89', expected: 1234567.89 },
    { input: '1,234,567.89', expected: 1234567.89 },
    { input: ' 15,0 ', expected: 15 },
    { input: '1 234,5', expected: 1234.5 },
    { input: '1\u00a0234,5', expected: 1234.5 },
    { input: '-12,5', expected: -12.5 },
    { input: '+3', expected: 3 },
    { input: ',5', expected: 0.5 },
    { input: '5,', expected: 5 },
    { input: '1,5e3', expected: 1500 },
    { input: '1_000', expected: 1000 },
    { input: '\t7\t', expected: 7 },
    // Known quirk kept for parity (open question Q3): a lone dot or comma is a decimal separator.
    { input: '1.234', expected: 1.234 },
    { input: '1,234', expected: 1.234 },
  ])('parses $input as $expected', ({ input, expected }) => {
    expect(numberOf(input)).toBe(expected);
  });

  it('keeps the sign of zero like Python float', () => {
    expect(numberOf('-0,0')).toBe(-0);
  });

  it.each(['abc', '12 Stk', '1,2,3', '1.2.3', '--1', '1-', '1__000', '_1', '0x10', ' ', '1\t2'])(
    'rejects %j with INVALID_NUMBER and the raw value',
    (input) => {
      expect(numberOf(input)).toEqual({ code: 'INVALID_NUMBER', params: { value: input } });
    },
  );

  it.each(['inf', '-Infinity', 'nan', 'NaN', '1e400', '١٢', '１２'])(
    'rejects %j although Python float accepts it (deliberate deviation)',
    (input) => {
      expect(numberOf(input)).toEqual({ code: 'INVALID_NUMBER', params: { value: input } });
    },
  );

  it('passes finite numbers through (XLSX cells) and rejects non-finite ones', () => {
    expect(numberOf(12.5)).toBe(12.5);
    expect(numberOf(Number.NaN)).toEqual({ code: 'INVALID_NUMBER', params: { value: 'NaN' } });
    expect(numberOf(Number.POSITIVE_INFINITY)).toEqual({
      code: 'INVALID_NUMBER',
      params: { value: 'Infinity' },
    });
  });

  const decimal = fc
    .tuple(fc.integer({ min: -1e12, max: 1e12 }), fc.integer({ min: 0, max: 999 }))
    .map(([whole, fraction]) => ({ whole, digits: String(fraction).padStart(3, '0') }));

  it('round-trips numbers formatted in German style', () => {
    const grouping = new Intl.NumberFormat('de-DE', { useGrouping: true });
    fc.assert(
      fc.property(decimal, ({ whole, digits }) => {
        const german = `${grouping.format(whole)},${digits}`;
        expect(numberOf(german)).toBe(Number(`${String(whole)}.${digits}`));
      }),
    );
  });

  it('round-trips numbers formatted in English style', () => {
    const grouping = new Intl.NumberFormat('en-US', { useGrouping: true });
    fc.assert(
      fc.property(decimal, ({ whole, digits }) => {
        const english = `${grouping.format(whole)}.${digits}`;
        expect(numberOf(english)).toBe(Number(`${String(whole)}.${digits}`));
      }),
    );
  });
});

describe('parseDate', () => {
  it.each([
    // The prototype's `test_dates`.
    { input: '05.10.2026', expected: '2026-10-05' },
    { input: '2026-10-05', expected: '2026-10-05' },
    { input: '', expected: null },
    // Every format of backlog P1-08.
    { input: '5.10.2026', expected: '2026-10-05' },
    { input: '05.10.26', expected: '2026-10-05' },
    { input: '05.10.68', expected: '2068-10-05' },
    { input: '05.10.69', expected: '1969-10-05' },
    { input: '05.10.00', expected: '2000-10-05' },
    { input: '05/10/2026', expected: '2026-10-05' },
    { input: '2026-10-05 13:45:00', expected: '2026-10-05' },
    { input: '2026-10-05\t1:2:3', expected: '2026-10-05' },
    { input: '05.10.2026 13:45', expected: '2026-10-05' },
    { input: ' 05.10.2026 ', expected: '2026-10-05' },
    // Python strptime quirks: single-digit fields and a space-padded day.
    { input: '2026-1-5', expected: '2026-01-05' },
    { input: '2026-10- 5', expected: '2026-10-05' },
    { input: '29.02.2024', expected: '2024-02-29' },
    { input: '01.01.0001', expected: '0001-01-01' },
    { input: '31.12.9999', expected: '9999-12-31' },
  ])('parses $input as $expected', ({ input, expected }) => {
    expect(dateOf(input)).toBe(expected);
  });

  it.each([
    'next week',
    ' ',
    '31.02.2026',
    '29.02.2025',
    '31.04.2026',
    '0000-01-01',
    '2026-13-01',
    '00.10.2026',
    '2026-10-05T13:45:00',
    '2026-10-05 24:00:00',
    '2026-10-05 23:59:60',
    '05.10.2026 13:45:00',
    '05.10.20261',
    '20261005',
    '05.10.٢٠٢٦',
  ])('rejects %j with INVALID_DATE and the raw value', (input) => {
    expect(dateOf(input)).toEqual({ code: 'INVALID_DATE', params: { value: input } });
  });

  const isoDate = fc
    .integer({ min: 0, max: 3_652_058 }) // 0001-01-01 .. 9999-12-31
    .map((offset) => addDays('0001-01-01' as IsoDate, offset));

  it('round-trips any IsoDate formatted as DD.MM.YYYY', () => {
    fc.assert(
      fc.property(isoDate, (date) => {
        const [year, month, day] = date.split('-');
        expect(dateOf(`${day ?? ''}.${month ?? ''}.${year ?? ''}`)).toBe(date);
      }),
    );
  });

  it('rejects days past the end of the month', () => {
    const pastMonthEnd = fc
      .record({
        year: fc.integer({ min: 1, max: 9999 }),
        month: fc.integer({ min: 1, max: 12 }),
        extra: fc.integer({ min: 1, max: 3 }),
      })
      .map(({ year, month, extra }) => {
        const lastDay = new Date(Date.UTC(2000, month, 0)).getUTCDate(); // leap-year February: 29
        const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const monthEnd = month === 2 && !isLeap ? 28 : lastDay;
        return { year, month, day: monthEnd + extra };
      })
      .filter(({ day }) => day <= 31);
    fc.assert(
      fc.property(pastMonthEnd, ({ year, month, day }) => {
        const text = `${String(day)}.${String(month).padStart(2, '0')}.${String(year).padStart(4, '0')}`;
        expect(dateOf(text)).toEqual({ code: 'INVALID_DATE', params: { value: text } });
      }),
    );
  });
});

describe('dateFromSerial', () => {
  it.each([
    { serial: 1, system: 1900, date: '1900-01-01' },
    { serial: 59, system: 1900, date: '1900-02-28' },
    { serial: 61, system: 1900, date: '1900-03-01' },
    { serial: 46300, system: 1900, date: '2026-10-05' },
    { serial: 46300.999, system: 1900, date: '2026-10-05' },
    { serial: 2_958_465, system: 1900, date: '9999-12-31' },
    { serial: 0, system: 1904, date: '1904-01-01' },
    { serial: 44838, system: 1904, date: '2026-10-05' },
    { serial: 2_957_003, system: 1904, date: '9999-12-31' },
  ] as const)('$serial in the $system system is $date', ({ serial, system, date }) => {
    expect(dateFromSerial(serial, system)).toBe(date);
  });

  it.each([
    { serial: 0, system: 1900 },
    { serial: 60, system: 1900 },
    { serial: -1, system: 1904 },
    { serial: 2_958_466, system: 1900 },
    { serial: 2_957_004, system: 1904 },
    { serial: Number.NaN, system: 1900 },
    { serial: Infinity, system: 1904 },
  ] as const)('$serial is no day in the $system system', ({ serial, system }) => {
    expect(dateFromSerial(serial, system)).toBeNull();
  });

  it('keeps the two date systems 1462 days apart', () => {
    fc.assert(
      fc.property(fc.integer({ min: 61 + 1462, max: 2_958_465 }), (serial) => {
        expect(dateFromSerial(serial - 1462, 1904)).toBe(dateFromSerial(serial, 1900));
      }),
    );
  });
});
