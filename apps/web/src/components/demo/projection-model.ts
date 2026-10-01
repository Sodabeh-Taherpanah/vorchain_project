/**
 * Pure helpers for the detail drawer (backlog P1-18): what the chart, its text summary and the
 * table alternative show for one `ProjectionSeries`. No React, so every rule is unit-tested here.
 */
import type { IsoDate, MaterialId, ProjectionPoint, ProjectionSeries } from '@vorchain/engine';
import type { Locale } from 'next-intl';

/** The two views of the projection (spec §5 step 4). */
export type ProjectionView = 'erp' | 'realistic';

/** The worst thing that happens to the stock in one view, and the first day it happens. */
export type ViewOutlook =
  | { readonly kind: 'stockOut' | 'belowSafety'; readonly date: IsoDate }
  | { readonly kind: 'none'; readonly date: null };

export interface ProjectionOutlook {
  readonly realistic: ViewOutlook;
  readonly erp: ViewOutlook;
}

const STOCK_KEY = { erp: 'erpStock', realistic: 'realisticStock' } as const;
const RECEIPT_KEY = { erp: 'erpReceipts', realistic: 'realisticReceipts' } as const;

/**
 * Same rules as the engine's projection: a stock-out is end-of-day stock `< 0`, "below safety" is
 * `< safetyStock` (both strict). A stock-out wins over a safety-stock breach.
 */
function viewOutlook(series: ProjectionSeries, view: ProjectionView): ViewOutlook {
  const stock = (p: ProjectionPoint) => p[STOCK_KEY[view]];
  const stockOut = series.points.find((p) => stock(p) < 0);
  if (stockOut !== undefined) return { kind: 'stockOut', date: stockOut.date };
  const below = series.points.find((p) => stock(p) < series.safetyStock);
  if (below !== undefined) return { kind: 'belowSafety', date: below.date };
  return { kind: 'none', date: null };
}

/** Both views' outlook; the chart's `aria-label` and the visible summary are built from it. */
export function projectionOutlook(series: ProjectionSeries): ProjectionOutlook {
  return { realistic: viewOutlook(series, 'realistic'), erp: viewOutlook(series, 'erp') };
}

/** One chart row: the projection point plus the realistic stock below 0 for the shaded area. */
export interface ChartRow extends ProjectionPoint {
  /** `min(realisticStock, 0)`: the area between 0 and this value is the stock-out. */
  readonly shortfall: number;
}

export function chartRows(series: ProjectionSeries): ChartRow[] {
  return series.points.map((p) => ({ ...p, shortfall: Math.min(p.realisticStock, 0) }));
}

/** A PO arriving on one day in one view, drawn on that view's line. */
export interface ReceiptMarker {
  readonly view: ProjectionView;
  readonly date: IsoDate;
  readonly stock: number;
  readonly quantity: number;
}

/** Receipt days of both views, ERP first; the series only knows quantities per day, not POs. */
export function receiptMarkers(series: ProjectionSeries): ReceiptMarker[] {
  return (['erp', 'realistic'] as const).flatMap((view) =>
    series.points
      .filter((p) => p[RECEIPT_KEY[view]] > 0)
      .map((p) => ({
        view,
        date: p.date,
        stock: p[STOCK_KEY[view]],
        quantity: p[RECEIPT_KEY[view]],
      })),
  );
}

/** The material and window a projection was requested for. */
export interface ProjectionWindowKey {
  readonly materialId: MaterialId;
  readonly asOf: IsoDate;
  readonly horizonDays: number;
}

/**
 * Whether a series belongs to the report on screen. The worker projects with the options of its
 * latest analysis, which can be newer than the report shown while an analysis is still running;
 * such a series must not be displayed next to the older report.
 */
export function matchesWindow(series: ProjectionSeries, key: ProjectionWindowKey): boolean {
  if (series.materialId !== key.materialId) return false;
  if (series.points.length !== Math.max(0, key.horizonDays)) return false;
  return series.points.length === 0 || series.points[0]?.date === key.asOf;
}

/** Axis tick without the year: `05.10.` in German, `10-05` in English (ISO order, like the report). */
export function formatShortDate(date: IsoDate, locale: Locale): string {
  const [, month, day] = date.split('-');
  return locale === 'en' ? `${month ?? ''}-${day ?? ''}` : `${day ?? ''}.${month ?? ''}.`;
}
