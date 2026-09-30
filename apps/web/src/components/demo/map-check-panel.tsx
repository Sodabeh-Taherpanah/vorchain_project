'use client';

import { CircleCheck, CircleMinus, CircleX, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { cn } from '@/lib/utils.ts';

import type { LoadSummary } from '../../workers/analysis-service.ts';
import { DataIssueText, type DataIssue } from './data-issue-text.tsx';
import { buildMapCheck, type TableCheck, type TableStatus } from './map-check.ts';

const STATUS_STYLE: Record<
  TableStatus,
  { readonly icon: typeof CircleCheck; readonly className: string }
> = {
  recognised: { icon: CircleCheck, className: 'bg-ok text-ok-foreground' },
  invalid: { icon: CircleX, className: 'bg-critical text-critical-foreground' },
  missing: { icon: CircleX, className: 'bg-critical text-critical-foreground' },
  absent: { icon: CircleMinus, className: 'bg-muted text-muted-foreground' },
};

/**
 * Step 2 of the demo (spec §4.1): which of the five tables were recognised, from which file, with
 * how many rows and columns, and every problem with its fix hint next to the table it concerns.
 */
export function MapCheckPanel({ load }: { readonly load: LoadSummary }) {
  const t = useTranslations('demo.mapCheck');
  const headingId = useId();
  const check = buildMapCheck(load);
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className="text-xl font-semibold">
        {t('heading')}
      </h2>
      <p className="max-w-prose text-muted-foreground">{t('intro')}</p>
      <ul className="grid gap-3">
        {check.tables.map((table) => (
          <TableItem key={table.table} check={table} />
        ))}
      </ul>
      {check.fileErrors.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">{t('fileErrors')}</h3>
          <IssueList issues={check.fileErrors} kind="error" />
        </div>
      )}
    </section>
  );
}

function TableItem({ check }: { readonly check: TableCheck }) {
  const t = useTranslations('demo');
  const headingId = useId();
  const { icon: StatusIcon, className } = STATUS_STYLE[check.status];
  return (
    <li
      aria-labelledby={headingId}
      data-testid={`table-${check.table}`}
      data-status={check.status}
      className={cn(
        'min-w-0 rounded-lg border border-border bg-card p-4 text-card-foreground',
        (check.status === 'invalid' || check.status === 'missing') && 'border-critical',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="font-medium">
          {t(`tables.${check.table}`)}{' '}
          <span className="text-sm font-normal text-muted-foreground">
            ({t(check.required ? 'mapCheck.required' : 'mapCheck.optional')})
          </span>
        </h3>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium',
            className,
          )}
        >
          <StatusIcon aria-hidden className="size-4" />
          {t(`mapCheck.status.${check.status}`)}
        </span>
      </div>
      {check.files.map((file) => (
        <dl
          key={file.fileName}
          className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]"
        >
          <dt className="text-muted-foreground">{t('mapCheck.file')}</dt>
          <dd className="break-all">
            {file.fileName} · {t('mapCheck.rows', { count: file.rowCount })}
          </dd>
          <dt className="text-muted-foreground">{t('mapCheck.columns')}</dt>
          <dd className="break-words">{file.mappedColumns.map((c) => c.header).join(', ')}</dd>
        </dl>
      ))}
      {check.errors.length > 0 && <IssueList issues={check.errors} kind="error" />}
      {check.warnings.length > 0 && <IssueList issues={check.warnings} kind="warning" />}
    </li>
  );
}

/** At most one issue per code and cell, or per code and table for table-level codes. */
function issueKey(issue: DataIssue): string {
  const table = 'table' in issue.params ? issue.params.table : '';
  return [issue.code, issue.fileName, issue.row, issue.column, table].join('|');
}

function IssueList({
  issues,
  kind,
}: {
  readonly issues: readonly DataIssue[];
  readonly kind: 'error' | 'warning';
}) {
  const t = useTranslations('demo.mapCheck');
  const Icon = kind === 'error' ? CircleX : TriangleAlert;
  return (
    <ul className="mt-3 space-y-1.5 text-sm">
      {issues.map((issue) => (
        <li key={issueKey(issue)} className="flex gap-2 break-words">
          <Icon
            aria-hidden
            className={cn(
              'mt-0.5 size-4 shrink-0',
              kind === 'error' ? 'text-critical' : 'text-signal-strong',
            )}
          />
          <span className="min-w-0">
            <span className="sr-only">{t(kind === 'error' ? 'errorLabel' : 'warningLabel')} </span>
            <DataIssueText issue={issue} />
          </span>
        </li>
      ))}
    </ul>
  );
}
