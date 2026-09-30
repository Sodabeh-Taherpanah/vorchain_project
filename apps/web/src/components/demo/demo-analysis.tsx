'use client';

import type { MaterialId, Report } from '@vorchain/engine';
import {
  NextIntlClientProvider,
  useLocale,
  useTranslations,
  type Locale,
  type Messages,
} from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';

import type { AnalysisState, UseAnalysis } from '../../hooks/use-analysis.ts';
import type { LoadSummary } from '../../workers/analysis-service.ts';
import { AnalysisSettingsForm, type EffectiveSettings } from './analysis-settings.tsx';
import { formatIsoDate, type AnalysisSettings } from './analysis-settings-model.ts';
import { trackDemoEvent } from './demo-events.ts';
import { ExceptionTable } from './exception-table.tsx';
import { supplierNameLookup } from './explanation-text.tsx';
import { OverdueNote, SummaryTiles } from './summary-tiles.tsx';

/** The results' messages in every locale, so the report language can differ from the page's. */
export type ReportMessages = Readonly<Record<Locale, Messages['demo']['report']>>;

export interface DemoAnalysisProps {
  readonly load: LoadSummary;
  readonly state: AnalysisState;
  readonly analyse: UseAnalysis['analyse'];
  readonly settings: EffectiveSettings;
  readonly onSettingsChange: (change: Partial<AnalysisSettings>) => void;
  readonly reportMessages: ReportMessages;
  /** Runs once per load, when its first report is shown (funnel event hook point). */
  readonly onCompleted?: () => void;
  /** Opens the detail drawer of a material (P1-18). */
  readonly onSelect?: (materialId: MaterialId) => void;
}

const completed = () => {
  trackDemoEvent('demo_completed');
};

/**
 * Steps 3 and 4 of the demo (spec §4.1) for a complete load: settings, then the results. Every
 * settings change re-runs `analyse` in the worker on the data it already holds.
 */
export function DemoAnalysis({
  load,
  state,
  analyse,
  settings,
  onSettingsChange,
  reportMessages,
  onCompleted = completed,
  onSelect,
}: DemoAnalysisProps) {
  const { asOf, horizonDays, reportLocale } = settings;

  useEffect(() => {
    void analyse({ asOf, horizonDays });
  }, [analyse, load, asOf, horizonDays]);

  // The last report stays visible while a new one is computed, so the table does not flicker.
  const [report, setReport] = useState<Report | null>(null);
  if (state.status === 'ready' && state.report !== report) setReport(state.report);

  const completedLoad = useRef<LoadSummary | null>(null);
  useEffect(() => {
    if (report === null || completedLoad.current === load) return;
    completedLoad.current = load;
    onCompleted();
  }, [report, load, onCompleted]);

  return (
    <>
      <AnalysisSettingsForm settings={settings} onChange={onSettingsChange} />
      <NextIntlClientProvider
        locale={reportLocale}
        messages={{ demo: { report: reportMessages[reportLocale] } }}
      >
        <DemoResults
          report={report}
          busy={state.status === 'analysing'}
          supplierNames={load.supplierNames}
          onSelect={onSelect}
        />
      </NextIntlClientProvider>
    </>
  );
}

function DemoResults({
  report,
  busy,
  supplierNames,
  onSelect,
}: {
  readonly report: Report | null;
  readonly busy: boolean;
  readonly supplierNames: LoadSummary['supplierNames'];
  readonly onSelect: ((materialId: MaterialId) => void) | undefined;
}) {
  const t = useTranslations('demo.report');
  const headingId = useId();
  const supplierName = supplierNameLookup(supplierNames);
  return (
    <section
      aria-labelledby={headingId}
      aria-busy={busy}
      data-testid="demo-results"
      className="space-y-4"
    >
      <h2 id={headingId} className="text-xl font-semibold">
        {t('heading')}
      </h2>
      {report === null ? (
        <p className="text-muted-foreground">{t('analysing')}</p>
      ) : (
        <ReportView report={report} supplierName={supplierName} onSelect={onSelect} />
      )}
    </section>
  );
}

function ReportView({
  report,
  supplierName,
  onSelect,
}: {
  readonly report: Report;
  readonly supplierName: ReturnType<typeof supplierNameLookup>;
  readonly onSelect: ((materialId: MaterialId) => void) | undefined;
}) {
  const t = useTranslations('demo.report');
  const locale = useLocale();
  return (
    <>
      <p className="text-muted-foreground">
        {t('scope', { asOf: formatIsoDate(report.asOf, locale), days: report.horizonDays })}
      </p>
      <SummaryTiles summary={report.summary} />
      <OverdueNote overdue={report.overduePurchaseOrders} supplierName={supplierName} />
      {report.exceptions.length === 0 ? (
        <p>{t('table.empty', { days: report.horizonDays })}</p>
      ) : (
        <ExceptionTable
          exceptions={report.exceptions}
          supplierName={supplierName}
          {...(onSelect === undefined ? {} : { onSelect })}
        />
      )}
    </>
  );
}
