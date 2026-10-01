'use client';

import type { Report } from '@vorchain/engine';
import { useLocale, useTranslations } from 'next-intl';

import { cn } from '@/lib/utils.ts';

import { formatIsoDate } from './analysis-settings-model.ts';
import type { SupplierName } from './explanation-text.tsx';

const TILES = [
  { key: 'critical', count: 'critical', className: 'border-critical' },
  { key: 'warning', count: 'warning', className: 'border-warning' },
  { key: 'hidden', count: 'hidden', className: 'border-signal' },
] as const;

/** Counts of critical, warning and hidden exceptions; updates are announced politely. */
export function SummaryTiles({ summary }: { readonly summary: Report['summary'] }) {
  const t = useTranslations('demo.report.tiles');
  return (
    <dl aria-live="polite" className="grid gap-3 sm:grid-cols-3">
      {TILES.map((tile) => (
        <div
          key={tile.key}
          data-testid={`tile-${tile.key}`}
          className={cn('rounded-lg border border-l-4 bg-card p-4', tile.className)}
        >
          <dt className="font-medium">{t(tile.key)}</dt>
          <dd className="text-3xl font-semibold tabular-nums">{summary[tile.count]}</dd>
          <dd className="text-sm text-muted-foreground">{t(`${tile.key}Hint`)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * ADR-0005 item 5, option B: open POs promised before `asOf`. Listed once per PO (from the report,
 * not from the table rows, so duplicate material rows do not repeat it), including POs of
 * materials that are not in the table at all.
 */
export function OverdueNote({
  overdue,
  supplierName,
}: {
  readonly overdue: Report['overduePurchaseOrders'];
  readonly supplierName: SupplierName;
}) {
  const t = useTranslations('demo.report.overdue');
  const locale = useLocale();
  if (overdue.length === 0) return null;
  return (
    <div data-testid="overdue-note" className="space-y-2 rounded-lg border bg-muted p-4 text-sm">
      <p>{t('note', { count: overdue.length })}</p>
      <ul className="list-disc space-y-1 pl-5">
        {overdue.map((po, index) => (
          // PO IDs are not unique in customer data (one PO, several lines or materials).
          <li key={`${po.poId}-${po.materialId}-${String(index)}`}>
            {t('item', {
              poId: po.poId,
              materialId: po.materialId,
              supplier: supplierName(po.supplierId),
              promised: formatIsoDate(po.promisedDate, locale),
              realistic: formatIsoDate(po.realisticDate, locale),
            })}
            {!po.hasException && ` ${t('notListed')}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
