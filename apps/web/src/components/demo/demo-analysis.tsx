'use client';

import type { Report } from '@vorchain/engine';
import {
  NextIntlClientProvider,
  useLocale,
  useTranslations,
  type Locale,
  type Messages,
} from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { AnalysisState, UseAnalysis } from '../../hooks/use-analysis.ts';
import type { LoadSummary } from '../../workers/analysis-service.ts';
import { AnalysisSettingsForm, type EffectiveSettings } from './analysis-settings.tsx';
import { formatIsoDate, type AnalysisSettings } from './analysis-settings-model.ts';
import { trackDemoEvent } from './demo-events.ts';
import { ExceptionTable, type ExceptionTableProps } from './exception-table.tsx';
import { supplierNameLookup } from './explanation-text.tsx';
import { ProjectionDrawer, type DrawerSelection } from './projection-drawer.tsx';
import { ReportActions } from './report-actions.tsx';
import { OverdueNote, SummaryTiles } from './summary-tiles.tsx';
import { SupplierTable } from './supplier-table.tsx';

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
  /** Loads one material's projection for the detail drawer (P1-18). */
  readonly getProjection: UseAnalysis['getProjection'];
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
  getProjection,
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
          getProjection={getProjection}
        />
      </NextIntlClientProvider>
    </>
  );
}

function DemoResults({
  report,
  busy,
  supplierNames,
  getProjection,
}: {
  readonly report: Report | null;
  readonly busy: boolean;
  readonly supplierNames: LoadSummary['supplierNames'];
  readonly getProjection: UseAnalysis['getProjection'];
}) {
  const t = useTranslations('demo.report');
  const headingId = useId();
  const supplierName = supplierNameLookup(supplierNames);
  // The drawer lives as long as these results: a new load unmounts them and so closes it. The
  // selection outlives `open` so the content stays during the closing animation.
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<DrawerSelection | null>(null);
  const select = useCallback(
    (materialId: DrawerSelection['materialId'], trigger: HTMLElement) => {
      const description =
        report?.exceptions.find((e) => e.materialId === materialId)?.description ?? '';
      setSelection({ materialId, description, trigger });
      setOpen(true);
    },
    [report],
  );
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
        <>
          <ReportView report={report} supplierName={supplierName} onSelect={select} />
          <ProjectionDrawer
            open={open}
            selection={selection}
            asOf={report.asOf}
            horizonDays={report.horizonDays}
            getProjection={getProjection}
            onClose={() => {
              setOpen(false);
            }}
          />
        </>
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
  readonly onSelect: ExceptionTableProps['onSelect'];
}) {
  const t = useTranslations('demo.report');
  const locale = useLocale();
  const suppliersId = useId();
  return (
    <>
      <p className="text-muted-foreground">
        {t('scope', { asOf: formatIsoDate(report.asOf, locale), days: report.horizonDays })}
      </p>
      <ReportActions report={report} supplierName={supplierName} />
      <SummaryTiles summary={report.summary} />
      <OverdueNote overdue={report.overduePurchaseOrders} supplierName={supplierName} />
      {report.exceptions.length === 0 ? (
        <p>{t('table.empty', { days: report.horizonDays })}</p>
      ) : (
        <ExceptionTable
          exceptions={report.exceptions}
          supplierName={supplierName}
          onSelect={onSelect}
        />
      )}
      <section aria-labelledby={suppliersId} className="space-y-3 pt-4">
        <h3 id={suppliersId} className="text-lg font-semibold">
          {t('suppliers.heading')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('suppliers.intro')}</p>
        <SupplierTable stats={report.supplierStats} supplierName={supplierName} />
      </section>
    </>
  );
}
