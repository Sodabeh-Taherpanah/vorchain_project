'use client';

import type { SupplierStats } from '@vorchain/engine';
import { useFormatter, useTranslations } from 'next-intl';

import type { SupplierName } from './explanation-text.tsx';

const COLUMNS = [
  'supplier',
  'onTime',
  'meanDelay',
  'p80Delay',
  'deliveries',
  'confidence',
] as const;

/**
 * Least reliable supplier first, like the prototype's report (`sorted(..., key=on_time_rate)`).
 * The sort is stable, so ties keep the engine's order (first history row), as in Python.
 */
export function rankByOnTimeRate(stats: readonly SupplierStats[]): SupplierStats[] {
  return stats.toSorted((a, b) => a.onTimeRate - b.onTimeRate);
}

/** Delivery reliability per supplier from the engine's statistics (spec §4.1 step 4). */
export function SupplierTable({
  stats,
  supplierName,
}: {
  readonly stats: readonly SupplierStats[];
  readonly supplierName: SupplierName;
}) {
  const t = useTranslations('demo.report.suppliers');
  const format = useFormatter();
  if (stats.length === 0) return <p className="text-muted-foreground">{t('empty')}</p>;
  return (
    <div
      role="region"
      aria-label={t('region')}
      // Focusable so keyboard users can scroll it on narrow screens (see `ExceptionTable`).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className="overflow-x-auto rounded-lg border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none print:overflow-visible"
    >
      <table className="w-full text-sm">
        <caption className="p-3 text-left font-medium">{t('caption')}</caption>
        <thead className="bg-muted text-left">
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="p-3 font-medium whitespace-nowrap">
                {t(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rankByOnTimeRate(stats).map((supplier) => (
            <tr key={supplier.supplierId} className="border-t">
              <th scope="row" className="p-3 text-left font-normal">
                {supplierName(supplier.supplierId)}
              </th>
              <td className="p-3 tabular-nums">
                {format.number(supplier.onTimeRate, { style: 'percent', maximumFractionDigits: 0 })}
              </td>
              <td className="p-3 tabular-nums">
                {format.number(supplier.meanDelayDays, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </td>
              <td className="p-3 tabular-nums">{format.number(supplier.p80DelayDays)}</td>
              <td className="p-3 tabular-nums">{format.number(supplier.deliveries)}</td>
              <td className="p-3">
                {supplier.reliable ? t('sufficient') : <strong>{t('low')}</strong>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
