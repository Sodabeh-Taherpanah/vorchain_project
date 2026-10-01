import {
  materialId,
  type IsoDate,
  type ProjectionPoint,
  type ProjectionSeries,
} from '@vorchain/engine';
import { describe, expect, it } from 'vitest';

import {
  chartRows,
  formatShortDate,
  matchesWindow,
  projectionOutlook,
  receiptMarkers,
} from './projection-model.ts';

const date = (value: string) => value as IsoDate;

function point(day: string, overrides: Partial<ProjectionPoint> = {}): ProjectionPoint {
  return {
    date: date(day),
    demand: 0,
    erpReceipts: 0,
    realisticReceipts: 0,
    erpStock: 50,
    realisticStock: 50,
    ...overrides,
  };
}

function series(points: ProjectionPoint[], safetyStock = 10): ProjectionSeries {
  return { materialId: materialId('M0030'), safetyStock, points };
}

describe('projectionOutlook', () => {
  it('reports the first stock-out of each view', () => {
    const outlook = projectionOutlook(
      series([
        point('2026-10-12'),
        point('2026-10-13', { realisticStock: -5 }),
        point('2026-10-14', { realisticStock: -10, erpStock: -1 }),
        point('2026-10-15', { realisticStock: -20, erpStock: -30 }),
      ]),
    );

    expect(outlook).toEqual({
      realistic: { kind: 'stockOut', date: '2026-10-13' },
      erp: { kind: 'stockOut', date: '2026-10-14' },
    });
  });

  it('falls back to the first day below safety stock (strict <) when stock stays >= 0', () => {
    const outlook = projectionOutlook(
      series([
        point('2026-10-12', { realisticStock: 10 }),
        point('2026-10-13', { realisticStock: 9 }),
        point('2026-10-14', { realisticStock: 0, erpStock: 10 }),
      ]),
    );

    expect(outlook.realistic).toEqual({ kind: 'belowSafety', date: '2026-10-13' });
    // Exactly the safety stock is not "below" (spec §5, engine projection).
    expect(outlook.erp).toEqual({ kind: 'none', date: null });
  });

  it('is "none" for both views when nothing happens or the window is empty', () => {
    expect(projectionOutlook(series([point('2026-10-12')]))).toEqual({
      realistic: { kind: 'none', date: null },
      erp: { kind: 'none', date: null },
    });
    expect(projectionOutlook(series([])).erp.kind).toBe('none');
  });

  it('treats stock exactly 0 as no stock-out', () => {
    const outlook = projectionOutlook(series([point('2026-10-12', { realisticStock: 0 })], 0));

    expect(outlook.realistic.kind).toBe('none');
  });
});

describe('chartRows', () => {
  it('adds the realistic shortfall (stock below 0, else 0) for the shaded area', () => {
    const rows = chartRows(
      series([
        point('2026-10-12', { realisticStock: 5 }),
        point('2026-10-13', { realisticStock: -7 }),
      ]),
    );

    expect(rows.map((row) => row.shortfall)).toEqual([0, -7]);
    expect(rows[1]).toMatchObject({ date: '2026-10-13', erpStock: 50, realisticStock: -7 });
  });
});

describe('receiptMarkers', () => {
  it('places one marker per receipt day on its own view, at that day’s stock', () => {
    const markers = receiptMarkers(
      series([
        point('2026-10-12', { erpReceipts: 200, erpStock: 210 }),
        point('2026-10-13'),
        point('2026-10-15', { realisticReceipts: 200, realisticStock: 190 }),
      ]),
    );

    expect(markers).toEqual([
      { view: 'erp', date: '2026-10-12', stock: 210, quantity: 200 },
      { view: 'realistic', date: '2026-10-15', stock: 190, quantity: 200 },
    ]);
  });
});

describe('matchesWindow', () => {
  const window = { materialId: materialId('M0030'), asOf: date('2026-10-12'), horizonDays: 2 };
  const twoDays = series([point('2026-10-12'), point('2026-10-13')]);

  it('accepts a series of the same material, start day and length', () => {
    expect(matchesWindow(twoDays, window)).toBe(true);
  });

  it('rejects a series computed for other settings or another material', () => {
    expect(matchesWindow(twoDays, { ...window, horizonDays: 3 })).toBe(false);
    expect(matchesWindow(twoDays, { ...window, asOf: date('2026-10-11') })).toBe(false);
    expect(matchesWindow(twoDays, { ...window, materialId: materialId('M0011') })).toBe(false);
  });

  it('accepts an empty series only for an empty window', () => {
    expect(matchesWindow(series([]), { ...window, horizonDays: 0 })).toBe(true);
    expect(matchesWindow(series([]), window)).toBe(false);
  });
});

describe('formatShortDate', () => {
  it('formats axis ticks without the year, string based', () => {
    expect(formatShortDate(date('2026-10-05'), 'de')).toBe('05.10.');
    expect(formatShortDate(date('2026-10-05'), 'en')).toBe('10-05');
  });
});
