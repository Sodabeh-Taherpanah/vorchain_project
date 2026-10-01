'use client';

import type { IsoDate, MaterialId, ProjectionSeries } from '@vorchain/engine';
import { BarChart3, Table2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@vorchain/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@vorchain/ui/components/sheet';

import { formatIsoDate } from './analysis-settings-model.ts';
import {
  matchesWindow,
  projectionOutlook,
  type ProjectionWindowKey,
  type ViewOutlook,
} from './projection-model.ts';
import { ProjectionTable } from './projection-table.tsx';

function ChartPlaceholder() {
  const t = useTranslations('demo.report.drawer');
  // Same height as the chart, so nothing jumps when it arrives.
  return <p className="flex h-[300px] items-center text-muted-foreground">{t('chartLoading')}</p>;
}

// Recharts is only fetched when a drawer first shows a chart (ADR-0011, P1-18 criterion 4).
const ProjectionChart = dynamic(
  () => import('./projection-chart.tsx').then((module) => module.ProjectionChart),
  { ssr: false, loading: ChartPlaceholder },
);

/** The material the drawer shows. */
export interface DrawerSelection {
  readonly materialId: MaterialId;
  readonly description: string;
  /** The control that opened the drawer; focus goes back to it on close. */
  readonly trigger: HTMLElement | null;
}

export interface ProjectionDrawerProps {
  readonly open: boolean;
  /** Kept after closing, so the content stays during the closing animation. */
  readonly selection: DrawerSelection | null;
  /** The window of the report on screen; a projection for any other window is ignored. */
  readonly asOf: IsoDate;
  readonly horizonDays: number;
  readonly getProjection: (materialId: MaterialId) => Promise<ProjectionSeries | null>;
  readonly onClose: () => void;
}

type ProjectionState =
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'ready'; readonly series: ProjectionSeries };

/**
 * Loads the projection of the selected material for the report on screen. Every new material or
 * window is a new request; a response for an older request, or one computed for other settings
 * than the report shown (an analysis still running), never reaches the screen.
 */
function useProjection(
  request: ProjectionWindowKey | null,
  getProjection: ProjectionDrawerProps['getProjection'],
): ProjectionState {
  const [result, setResult] = useState<{
    readonly request: ProjectionWindowKey;
    readonly series: ProjectionSeries | null;
  } | null>(null);

  useEffect(() => {
    if (request === null) return;
    let current = true;
    void getProjection(request.materialId).then((series) => {
      // A series for other settings is followed by a new report and so a new request: wait for it.
      if (!current || (series !== null && !matchesWindow(series, request))) return;
      setResult({ request, series });
    });
    return () => {
      current = false;
    };
  }, [request, getProjection]);

  if (result?.request !== request) return { status: 'loading' };
  return result.series === null
    ? { status: 'unavailable' }
    : { status: 'ready', series: result.series };
}

/**
 * Detail drawer of one exception (spec §4.1 step 4): ERP view vs realistic view as a chart, with a
 * text summary and a table alternative. A modal sheet: focus is trapped, Escape closes it, and
 * focus returns to the row's button.
 */
export function ProjectionDrawer({
  open,
  selection,
  asOf,
  horizonDays,
  getProjection,
  onClose,
}: ProjectionDrawerProps) {
  const t = useTranslations('demo.report.drawer');
  const locale = useLocale();
  const materialId = open ? (selection?.materialId ?? null) : null;
  const request = useMemo(
    () => (materialId === null ? null : { materialId, asOf, horizonDays }),
    [materialId, asOf, horizonDays],
  );
  const projection = useProjection(request, getProjection);
  const [asTable, setAsTable] = useState(false);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        closeLabel={t('close')}
        data-testid="projection-drawer"
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          // Radix would focus the element focused at open time; Safari does not focus a clicked
          // button, so return to the row's button explicitly while it still exists.
          const trigger = selection?.trigger;
          if (trigger?.isConnected !== true) return;
          event.preventDefault();
          trigger.focus();
        }}
      >
        <SheetHeader className="pr-12">
          <SheetTitle className="text-lg font-semibold">
            {t('title', { materialId: selection?.materialId ?? '' })}
          </SheetTitle>
          {selection !== null && selection.description !== '' && (
            <p className="text-sm">{selection.description}</p>
          )}
          <SheetDescription>
            {t('intro', { days: horizonDays, asOf: formatIsoDate(asOf, locale) })}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {projection.status === 'loading' && (
            <p role="status" className="text-muted-foreground">
              {t('loading')}
            </p>
          )}
          {projection.status === 'unavailable' && (
            <p role="alert" className="font-medium text-critical">
              {t('unavailable')}
            </p>
          )}
          {projection.status === 'ready' && (
            <ProjectionDetails
              series={projection.series}
              asTable={asTable}
              onToggle={() => {
                setAsTable(!asTable);
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProjectionDetails({
  series,
  asTable,
  onToggle,
}: {
  readonly series: ProjectionSeries;
  readonly asTable: boolean;
  readonly onToggle: () => void;
}) {
  const t = useTranslations('demo.report.drawer');
  const summary = useProjectionSummary(series);
  return (
    <>
      <p data-testid="projection-summary" className="font-medium">
        {summary}
      </p>
      <Button type="button" variant="outline" onClick={onToggle}>
        {asTable ? <BarChart3 aria-hidden /> : <Table2 aria-hidden />}
        {asTable ? t('showChart') : t('showTable')}
      </Button>
      {asTable ? (
        <ProjectionTable series={series} />
      ) : (
        <div role="img" aria-label={summary} data-testid="projection-chart">
          <ProjectionChart series={series} />
        </div>
      )}
    </>
  );
}

/** "Realistische Sicht: Fehlteil am 13.10.2026, ERP-Sicht: Fehlteil am 23.10.2026." */
export function useProjectionSummary(series: ProjectionSeries): string {
  const t = useTranslations('demo.report.drawer');
  const locale = useLocale();
  const outlook = projectionOutlook(series);
  const describe = (view: ViewOutlook) =>
    view.kind === 'none'
      ? t('outlook.none')
      : t(`outlook.${view.kind}`, { date: formatIsoDate(view.date, locale) });
  return t('summary', { realistic: describe(outlook.realistic), erp: describe(outlook.erp) });
}
