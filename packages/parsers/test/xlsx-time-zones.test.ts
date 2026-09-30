/**
 * XLSX date cells must give the same calendar day on every machine (backlog P1-10 AC 3). Node
 * applies a change of `process.env.TZ` immediately, so one run covers time zones from UTC-11 to
 * UTC+14, including one with daylight saving time on the test dates.
 */
import { readFileSync } from 'node:fs';

import { afterAll, describe, expect, it } from 'vitest';

import { parseFile, type RawTable } from '../src/index.ts';
import { workbookBytes } from './support/workbook.ts';

/** Time zones and their UTC offset in hours on 2026-10-05. */
const TIME_ZONES = [
  ['Pacific/Kiritimati', 14],
  ['Europe/Berlin', 2],
  ['UTC', 0],
  ['America/Los_Angeles', -7],
  ['Pacific/Pago_Pago', -11],
] as const;
const originalTimeZone = process.env.TZ;

const written = workbookBytes({
  Bedarf: [
    ['Artikel', 'Datum', 'Menge'],
    ['M1', new Date(Date.UTC(2026, 9, 5)), 5],
    ['M1', { t: 'n', v: 46300, z: 'dd.mm.yyyy' }, 5],
    ['M1', { t: 'n', v: 46110.75, z: 'dd.mm.yyyy hh:mm' }, 5],
    ['M1', 46300, 5],
    ['M1', '05.10.2026', 5],
  ],
});
const written1904 = workbookBytes(
  { Bedarf: [['Datum'], [{ t: 'n', v: 44838, z: 'dd.mm.yyyy' }]] },
  { date1904: true },
);
const openpyxlFile = new Uint8Array(
  readFileSync(new URL('fixtures/xlsx/sample_data_de/lieferhistorie.xlsx', import.meta.url)),
);

function dateColumn(name: string, bytes: Uint8Array, column: number): unknown[] {
  const result = parseFile({ name, bytes });
  if (!result.ok) throw new Error(result.error.code);
  const table: RawTable = result.value;
  return table.rows.slice(0, 5).map((row) => row.cells[column]);
}

afterAll(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

describe.each(TIME_ZONES)('XLSX dates in time zone %s (UTC%i)', (timeZone, offset) => {
  it('are the calendar days Excel shows', () => {
    process.env.TZ = timeZone;
    // `|| 0` turns UTC's -0 into 0.
    expect(-new Date(Date.UTC(2026, 9, 5)).getTimezoneOffset() / 60 || 0).toBe(offset);

    expect(dateColumn('bedarf.xlsx', written, 1)).toEqual([
      '2026-10-05',
      '2026-10-05',
      '2026-03-29', // 18:00 on the day Europe switches to summer time
      46300, // plain number: read as a day number by the row validation
      '05.10.2026',
    ]);
    expect(dateColumn('bedarf.xlsx', written1904, 0)).toEqual(['2026-10-05']);
    expect(dateColumn('lieferhistorie.xlsx', openpyxlFile, 3)).toEqual([
      '2025-11-03',
      '2026-05-24',
      '2026-06-03',
      '2025-12-20',
      '2026-08-12',
    ]);
  });
});
