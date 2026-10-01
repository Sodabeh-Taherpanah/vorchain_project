'use client';

import type { Report } from '@vorchain/engine';
import { Download, Printer } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@vorchain/ui/components/button';

import { formatIsoDate } from './analysis-settings-model.ts';
import { csvFileName, downloadFile, exceptionCsvRows, toCsv } from './csv-export.ts';
import { useExplanationText, type SupplierName } from './explanation-text.tsx';

const CSV_COLUMNS = [
  'table.severity',
  'table.material',
  'export.description',
  'table.criticalDate',
  'export.daysUntil',
  'table.minStock',
  'table.hidden',
  'table.why',
  'table.action',
] as const;

/**
 * Takes the results into the planners' meeting (spec §4.1 step 5): a CSV of every exception in the
 * report's language, and the print view. Both work offline; nothing is sent anywhere.
 */
export function ReportActions({
  report,
  supplierName,
}: {
  readonly report: Report;
  readonly supplierName: SupplierName;
}) {
  const t = useTranslations('demo.report');
  const locale = useLocale();
  const explanation = useExplanationText(supplierName);

  function exportCsv() {
    const rows = exceptionCsvRows(report.exceptions, {
      headers: CSV_COLUMNS.map((column) => t(column)),
      severity: (severity) => t(`severity.${severity}`),
      date: (date) => formatIsoDate(date, locale),
      hidden: (hidden) => (hidden ? t('export.yes') : t('export.no')),
      reason: explanation.reason,
      action: explanation.action,
    });
    downloadFile(toCsv(rows, locale), csvFileName(report.asOf), 'text/csv;charset=utf-8');
  }

  return (
    <div role="group" aria-label={t('export.label')} className="flex flex-wrap gap-2 print:hidden">
      <Button type="button" variant="outline" onClick={exportCsv}>
        <Download aria-hidden />
        {t('export.csv')}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          window.print();
        }}
      >
        <Printer aria-hidden />
        {t('export.print')}
      </Button>
    </div>
  );
}
