'use client';

import type { MaterialId, Reason, ShortageException } from '@vorchain/engine';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils.ts';

import { formatIsoDate } from './analysis-settings-model.ts';
import { ActionText, ReasonText, type SupplierName } from './explanation-text.tsx';

/** Rows shown before "Alle anzeigen" (spec §4.1 step 4). */
export const TOP_ROWS = 10;

const SEVERITY_STYLE = {
  CRITICAL: 'bg-critical text-critical-foreground',
  WARNING: 'bg-warning text-warning-foreground',
} as const;

/**
 * Duplicate material rows (ADR-0005 item 10) and repeated POs could yield the same reason twice;
 * one sentence per distinct reason is enough.
 */
function distinctReasons(reasons: readonly Reason[]): { key: string; reason: Reason }[] {
  const seen = new Map<string, Reason>();
  for (const reason of reasons) seen.set(JSON.stringify(reason), reason);
  return Array.from(seen, ([key, reason]) => ({ key, reason }));
}

export interface ExceptionTableProps {
  readonly exceptions: readonly ShortageException[];
  readonly supplierName: SupplierName;
  /** Opens the detail drawer of a material (P1-18); without it the material is plain text. */
  readonly onSelect?: (materialId: MaterialId) => void;
}

/** The ranked exceptions as a semantic table, top 10 first (spec §4.1 step 4). */
export function ExceptionTable({ exceptions, supplierName, onSelect }: ExceptionTableProps) {
  const t = useTranslations('demo.report.table');
  const tableId = useId();
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? exceptions : exceptions.slice(0, TOP_ROWS);
  return (
    <div className="space-y-3">
      <div
        role="region"
        aria-label={t('region')}
        // A scrollable region must be focusable so keyboard users can scroll the table on narrow
        // screens (WCAG 2.1.1, axe `scrollable-region-focusable`); the rule does not know that.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="overflow-x-auto rounded-lg border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <table id={tableId} data-total={exceptions.length} className="w-full text-sm">
          <caption className="p-3 text-left font-medium">
            {t('caption', { shown: rows.length, total: exceptions.length })}
          </caption>
          <thead className="bg-muted text-left">
            <tr>
              {(
                [
                  'severity',
                  'material',
                  'criticalDate',
                  'daysUntil',
                  'minStock',
                  'hidden',
                  'why',
                  'action',
                ] as const
              ).map((column) => (
                <th key={column} scope="col" className="p-3 font-medium whitespace-nowrap">
                  {t(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((exception, index) => (
              <ExceptionRow
                // Duplicate material rows are possible, so the rank is part of the key.
                key={`${exception.materialId}-${String(index)}`}
                exception={exception}
                supplierName={supplierName}
                onSelect={onSelect}
              />
            ))}
          </tbody>
        </table>
      </div>
      {exceptions.length > TOP_ROWS && (
        <Button
          type="button"
          variant="outline"
          aria-controls={tableId}
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
          }}
        >
          {expanded
            ? t('showTop', { count: TOP_ROWS })
            : t('showAll', { count: exceptions.length })}
        </Button>
      )}
    </div>
  );
}

function ExceptionRow({
  exception,
  supplierName,
  onSelect,
}: {
  readonly exception: ShortageException;
  readonly supplierName: SupplierName;
  readonly onSelect: ((materialId: MaterialId) => void) | undefined;
}) {
  const t = useTranslations('demo.report');
  const format = useFormatter();
  const locale = useLocale();
  const id = <span className="font-mono">{exception.materialId}</span>;
  return (
    <tr className="border-t align-top">
      <td className="p-3">
        <span
          className={cn(
            'inline-block rounded-full px-2 py-0.5 text-xs font-semibold',
            SEVERITY_STYLE[exception.severity],
          )}
        >
          {t(`severity.${exception.severity}`)}
        </span>
      </td>
      <th scope="row" className="p-3 text-left font-normal">
        {onSelect === undefined ? (
          id
        ) : (
          <button
            type="button"
            aria-label={t('table.details', { materialId: exception.materialId })}
            className="rounded-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={() => {
              onSelect(exception.materialId);
            }}
          >
            {id}
          </button>
        )}
        {exception.description !== '' && (
          <span className="block text-muted-foreground">{exception.description}</span>
        )}
      </th>
      <td className="p-3 whitespace-nowrap tabular-nums">
        {formatIsoDate(exception.criticalDate, locale)}
      </td>
      <td className="p-3 whitespace-nowrap tabular-nums">
        {t('table.days', { days: exception.daysUntil })}
      </td>
      <td className="p-3 text-right tabular-nums">{format.number(exception.minProjectedStock)}</td>
      <td className="p-3">
        {exception.hidden ? (
          <span
            data-testid="hidden-badge"
            className="inline-block rounded-full bg-signal px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-signal-foreground"
          >
            {t('table.hiddenBadge')}
          </span>
        ) : (
          <span className="text-muted-foreground">{t('table.notHidden')}</span>
        )}
      </td>
      <td className="min-w-64 p-3">
        <ul className="space-y-1">
          {distinctReasons(exception.reasons).map(({ key, reason }) => (
            <li key={key}>
              <ReasonText reason={reason} supplierName={supplierName} />
            </li>
          ))}
        </ul>
      </td>
      <td className="min-w-56 p-3">
        <ul className="space-y-1">
          {exception.actions.map((action) => (
            <li key={JSON.stringify(action)}>
              <ActionText action={action} supplierName={supplierName} />
            </li>
          ))}
        </ul>
      </td>
    </tr>
  );
}
