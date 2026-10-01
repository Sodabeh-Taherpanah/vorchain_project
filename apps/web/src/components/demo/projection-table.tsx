'use client';

import type { ProjectionSeries } from '@vorchain/engine';
import { useFormatter, useLocale, useTranslations } from 'next-intl';

import { cn } from '@/lib/utils.ts';

import { formatIsoDate } from './analysis-settings-model.ts';

const COLUMNS = [
  'demand',
  'erpReceipts',
  'realisticReceipts',
  'erpStock',
  'realisticStock',
] as const;

/**
 * The chart's text alternative (spec §4.2): the same projection, one row per day. Negative stock
 * is marked by colour and by its minus sign, so colour is never the only signal.
 */
export function ProjectionTable({ series }: { readonly series: ProjectionSeries }) {
  const t = useTranslations('demo.report.drawer.table');
  const format = useFormatter();
  const locale = useLocale();
  return (
    <div
      role="region"
      aria-label={t('region')}
      // Scrollable on narrow screens, so keyboard users must be able to focus it (axe
      // `scrollable-region-focusable`), as in the exception table.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className="max-h-[60vh] overflow-auto rounded-lg border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <table className="w-full text-sm">
        <caption className="p-3 text-left font-medium">
          {t('caption', { materialId: series.materialId, safetyStock: series.safetyStock })}
        </caption>
        <thead className="sticky top-0 bg-muted text-left">
          <tr>
            <th scope="col" className="p-2 font-medium whitespace-nowrap">
              {t('date')}
            </th>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="p-2 text-right font-medium whitespace-nowrap">
                {t(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.points.map((point) => (
            <tr key={point.date} className="border-t">
              <th scope="row" className="p-2 text-left font-normal whitespace-nowrap tabular-nums">
                {formatIsoDate(point.date, locale)}
              </th>
              {COLUMNS.map((column) => (
                <td
                  key={column}
                  className={cn(
                    'p-2 text-right tabular-nums',
                    point[column] < 0 && 'font-semibold text-critical',
                  )}
                >
                  {format.number(point[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
