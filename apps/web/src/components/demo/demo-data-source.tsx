'use client';

import { Database, FileSpreadsheet, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button.tsx';

import { useAnalysis, type AnalysisState } from '../../hooks/use-analysis.ts';
import {
  DEFAULT_HORIZON_DAYS,
  defaultAsOf,
  type AnalysisSettings,
} from './analysis-settings-model.ts';
import { DemoAnalysis, type ReportMessages } from './demo-analysis.tsx';
import { FileDropzone } from './file-dropzone.tsx';
import { MapCheckPanel } from './map-check-panel.tsx';
import { addFiles, NO_SOURCE, removeFileAt, type DataSource } from './file-selection.ts';
import { SampleTemplates } from './sample-templates.tsx';

/**
 * The demo (spec §4.1): choose the data, see what was recognised, then adjust the settings and read
 * the results. The settings live here so they survive loading other files.
 */
export function DemoDataSource({ reportMessages }: { readonly reportMessages: ReportMessages }) {
  const t = useTranslations('demo');
  const locale = useLocale();
  const { state, loadFiles, loadSample, analyse, getProjection, reset } = useAnalysis();
  const [source, setSource] = useState<DataSource>(NO_SOURCE);
  const [settings, setSettings] = useState<AnalysisSettings>({
    asOf: null,
    horizonDays: DEFAULT_HORIZON_DAYS,
    reportLocale: locale,
  });
  // Today only matters for uploads without a chosen date; read once so it stays stable.
  const [now] = useState(() => new Date());

  function chooseSample() {
    setSource({ kind: 'sample' });
    void loadSample(locale);
  }

  function selectFiles(files: readonly File[]) {
    if (files.length === 0) {
      setSource(NO_SOURCE);
      reset();
      return;
    }
    setSource({ kind: 'files', files });
    void loadFiles(files);
  }

  const selected = source.kind === 'files' ? source.files : [];

  return (
    <div className="mt-8 space-y-8">
      <section aria-labelledby="data-source-heading" className="space-y-4">
        <h2 id="data-source-heading" className="text-xl font-semibold">
          {t('dataSource.heading')}
        </h2>
        <p className="max-w-prose text-muted-foreground">{t('dataSource.intro')}</p>
        <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
          <Button type="button" size="lg" onClick={chooseSample}>
            <Database aria-hidden />
            {t('dataSource.loadSample')}
          </Button>
          <FileDropzone
            onFiles={(added) => {
              selectFiles(addFiles(selected, added));
            }}
          />
        </div>
        <SampleTemplates />
        {source.kind === 'sample' && (
          <p className="text-sm text-muted-foreground">{t('dataSource.sampleSelected')}</p>
        )}
        {selected.length > 0 && (
          <div className="space-y-2">
            <h3 id="selected-files-heading" className="text-sm font-medium">
              {t('dataSource.selectedFiles')}
            </h3>
            <ul aria-labelledby="selected-files-heading" className="space-y-2">
              {selected.map((file, index) => (
                <li
                  key={`${file.name}-${String(file.lastModified)}`}
                  className="flex min-w-0 items-center gap-2 rounded-md border border-border px-3 py-1.5"
                >
                  <FileSpreadsheet aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('dataSource.remove', { file: file.name })}
                    onClick={() => {
                      selectFiles(removeFileAt(selected, index));
                    }}
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <p role="status" className="text-muted-foreground">
        <StatusText state={state} />
      </p>
      {state.status === 'error' && (
        <p role="alert" className="font-medium text-critical">
          {t(`errors.${state.error}`)}
        </p>
      )}
      {'load' in state && <MapCheckPanel load={state.load} />}
      {'load' in state && state.load.ready && (
        <DemoAnalysis
          load={state.load}
          state={state}
          analyse={analyse}
          getProjection={getProjection}
          settings={{ ...settings, asOf: settings.asOf ?? defaultAsOf(state.load.asOf, now) }}
          onSettingsChange={(change) => {
            setSettings((current) => ({ ...current, ...change }));
          }}
          reportMessages={reportMessages}
        />
      )}
    </div>
  );
}

/** One short sentence for the live region; details follow in the map check. */
function StatusText({ state }: { readonly state: AnalysisState }) {
  const t = useTranslations('demo.status');
  switch (state.status) {
    case 'loading':
      return t('loading');
    case 'mapped':
    case 'analysing':
    case 'ready':
      return state.load.ready
        ? t('complete')
        : t('incomplete', { count: state.load.errors.length });
    case 'idle':
    case 'error':
      return null;
  }
}
