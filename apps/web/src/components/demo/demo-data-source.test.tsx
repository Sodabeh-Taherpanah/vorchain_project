import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IsoDate } from '@vorchain/engine';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import type { AnalysisService, LoadSummary } from '../../workers/analysis-service.ts';
import { DemoDataSource } from './demo-data-source.tsx';
import { trackDemoEvent } from './demo-events.ts';
import { testReport } from './test-report.ts';

const complete: LoadSummary = {
  tables: [],
  errors: [],
  warnings: [],
  ready: true,
  asOf: '2026-10-05' as IsoDate,
  supplierNames: { S01: 'Metallbau Krüger GmbH' },
};
const incomplete: LoadSummary = {
  tables: [],
  errors: [{ code: 'MISSING_TABLE', params: { table: 'demand' } }],
  warnings: [],
  ready: false,
  asOf: null,
  supplierNames: {},
};

const service = {
  loadFiles: vi.fn<AnalysisService['loadFiles']>(() => Promise.resolve(incomplete)),
  loadSample: vi.fn(() => Promise.resolve(complete)),
  analyse: vi.fn<AnalysisService['analyse']>((options) =>
    Promise.resolve(testReport({ asOf: options.asOf, horizonDays: options.horizonDays })),
  ),
  getProjection: vi.fn(),
} satisfies AnalysisService;

vi.mock('../../workers/connect-analysis-worker.ts', () => ({
  connectAnalysisWorker: () => ({ service, terminate: vi.fn() }),
}));
vi.mock('./demo-events.ts', () => ({ trackDemoEvent: vi.fn() }));

const reportMessages = { de: de.demo.report, en: en.demo.report };

const csv = (name: string) => new File(['a;b\n1;2\n'], name, { type: 'text/csv' });
const loadedNames = () => service.loadFiles.mock.lastCall?.[0].map((f) => f.name);

function renderDemo() {
  render(
    <NextIntlClientProvider locale="de" messages={de}>
      <DemoDataSource reportMessages={reportMessages} />
    </NextIntlClientProvider>,
  );
  return { input: screen.getByTestId<HTMLInputElement>('file-input') };
}

describe('DemoDataSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the sample of the current locale and announces a complete load', async () => {
    renderDemo();

    await userEvent.click(screen.getByRole('button', { name: de.demo.dataSource.loadSample }));

    expect(service.loadSample).toHaveBeenCalledWith('de');
    expect(await screen.findByText(de.demo.status.complete)).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe(de.demo.status.complete);
    expect(screen.getByText(de.demo.dataSource.sampleSelected)).toBeDefined();
  });

  it('opens the file picker from a real button that accepts several CSV/XLSX files', async () => {
    const { input } = renderDemo();
    const click = vi.spyOn(input, 'click');

    const button = screen.getByRole('button', { name: de.demo.dataSource.chooseFiles });
    button.focus();
    await userEvent.keyboard('{Enter}');

    expect(click).toHaveBeenCalledOnce();
    expect(input.accept).toBe('.csv,.xlsx');
    expect(input.multiple).toBe(true);
  });

  it('hands chosen files to the worker and lets the user remove and add files', async () => {
    const { input } = renderDemo();

    await userEvent.upload(input, [csv('bestellungen.csv'), csv('bedarf.csv')]);
    expect(loadedNames()).toEqual(['bestellungen.csv', 'bedarf.csv']);
    expect(await screen.findByText('1 Problem gefunden', { exact: false })).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'bedarf.csv entfernen' }));
    expect(loadedNames()).toEqual(['bestellungen.csv']);

    await userEvent.upload(input, csv('artikel.csv'));
    expect(loadedNames()).toEqual(['bestellungen.csv', 'artikel.csv']);
    const list = screen.getByRole('list', { name: de.demo.dataSource.selectedFiles });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('returns to the empty state when the last file is removed', async () => {
    const { input } = renderDemo();
    await userEvent.upload(input, csv('bestellungen.csv'));
    await screen.findByText('1 Problem gefunden', { exact: false });

    await userEvent.click(screen.getByRole('button', { name: 'bestellungen.csv entfernen' }));

    expect(service.loadFiles).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByText(de.demo.dataSource.selectedFiles)).toBeNull();
  });

  it('accepts dropped files', async () => {
    renderDemo();
    const zone = screen.getByText(de.demo.dataSource.dropHint).parentElement;
    if (zone === null) throw new Error('drop zone not found');

    fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
    expect(zone.dataset.dragging).toBe('true');
    fireEvent.drop(zone, { dataTransfer: { files: [csv('artikel.csv')] } });

    expect(zone.dataset.dragging).toBe('false');
    expect(loadedNames()).toEqual(['artikel.csv']);
    await screen.findByText('1 Problem gefunden', { exact: false });
  });

  it('analyses a complete load with the sample date and a 28-day horizon', async () => {
    renderDemo();

    await userEvent.click(screen.getByRole('button', { name: de.demo.dataSource.loadSample }));

    const results = await screen.findByTestId('demo-results');
    expect(service.analyse).toHaveBeenCalledWith({ asOf: '2026-10-05', horizonDays: 28 });
    expect(within(results).getByRole('heading', { name: de.demo.report.heading })).toBeDefined();
    expect(await within(results).findByRole('table')).toBeDefined();
    expect(within(results).getByTestId('tile-critical').textContent).toContain('2');
    // Showing the report must not start another analysis.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(service.analyse).toHaveBeenCalledOnce();
  });

  it('re-runs the analysis when a setting changes, without reloading the files', async () => {
    renderDemo();
    await userEvent.click(screen.getByRole('button', { name: de.demo.dataSource.loadSample }));
    await screen.findByRole('table');

    const horizon = screen.getByLabelText(de.demo.settings.horizon);
    await userEvent.clear(horizon);
    await userEvent.type(horizon, '7');
    await vi.waitFor(() => {
      expect(service.analyse).toHaveBeenLastCalledWith({ asOf: '2026-10-05', horizonDays: 7 });
    });
    fireEvent.change(screen.getByLabelText(de.demo.settings.asOf), {
      target: { value: '2026-10-12' },
    });
    await vi.waitFor(() => {
      expect(service.analyse).toHaveBeenLastCalledWith({ asOf: '2026-10-12', horizonDays: 7 });
    });

    expect(service.loadSample).toHaveBeenCalledOnce();
    expect(await screen.findByText('Stichtag 12.10.2026, Horizont 7 Tage.')).toBeDefined();
  });

  it('does not analyse while the horizon is out of range and says why', async () => {
    renderDemo();
    await userEvent.click(screen.getByRole('button', { name: de.demo.dataSource.loadSample }));
    await screen.findByRole('table');
    const calls = service.analyse.mock.calls.length;

    const horizon = screen.getByLabelText(de.demo.settings.horizon);
    await userEvent.clear(horizon);
    await userEvent.type(horizon, '5');

    expect(horizon.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Bitte geben Sie eine ganze Zahl von 7 bis 90 ein.')).toBeDefined();
    // Clearing the field left it empty, which is out of range too.
    expect(service.analyse.mock.calls.length).toBe(calls);
  });

  it('switches the report language without changing the page language', async () => {
    renderDemo();
    await userEvent.click(screen.getByRole('button', { name: de.demo.dataSource.loadSample }));
    await screen.findByRole('table');
    const calls = service.analyse.mock.calls.length;

    await userEvent.selectOptions(screen.getByLabelText(de.demo.settings.reportLanguage), 'en');

    expect(screen.getByRole('heading', { name: en.demo.report.heading })).toBeDefined();
    expect(screen.getByText('As of 2026-10-05, horizon 28 days.')).toBeDefined();
    expect(screen.getByRole('heading', { name: de.demo.settings.heading })).toBeDefined();
    expect(service.analyse.mock.calls.length).toBe(calls);
  });

  it("uses today in the user's time zone for uploads, which carry no date", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 9, 0));
    service.loadFiles.mockResolvedValueOnce({ ...complete, asOf: null });
    const { input } = renderDemo();

    await userEvent.upload(input, csv('artikel.csv'));

    await vi.waitFor(() => {
      expect(service.analyse).toHaveBeenCalledWith({ asOf: '2026-10-01', horizonDays: 28 });
    });
    vi.useRealTimers();
  });

  it('fires the demo_completed hook once per load, with no data attached', async () => {
    renderDemo();
    await userEvent.click(screen.getByRole('button', { name: de.demo.dataSource.loadSample }));
    await screen.findByRole('table');
    const horizon = screen.getByLabelText(de.demo.settings.horizon);
    await userEvent.clear(horizon);
    await userEvent.type(horizon, '14');
    await vi.waitFor(() => {
      expect(service.analyse).toHaveBeenLastCalledWith({ asOf: '2026-10-05', horizonDays: 14 });
    });

    expect(trackDemoEvent).toHaveBeenCalledOnce();
    expect(trackDemoEvent).toHaveBeenCalledWith('demo_completed');
  });

  it('shows a worker failure as an alert', async () => {
    service.loadSample.mockRejectedValueOnce(new Error('crash'));
    renderDemo();

    await userEvent.click(screen.getByRole('button', { name: de.demo.dataSource.loadSample }));

    expect((await screen.findByRole('alert')).textContent).toBe(de.demo.errors.WORKER_FAILED);
  });
});

describe('sample templates', () => {
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:template');
  const revokeObjectURL = vi.fn();

  // jsdom has no object URLs.
  beforeEach(() => {
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('offers the sample files of the locale as local downloads', async () => {
    const { unmount } = render(
      <NextIntlClientProvider locale="de" messages={de}>
        <DemoDataSource reportMessages={reportMessages} />
      </NextIntlClientProvider>,
    );
    const toggle = screen.getByRole('button', { name: de.demo.dataSource.templates });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    await userEvent.click(toggle);

    const links = await screen.findAllByRole('link');
    expect(links.map((a) => a.getAttribute('download'))).toEqual([
      'artikel.csv',
      'bedarf.csv',
      'bestellungen.csv',
      'lieferanten.csv',
      'lieferhistorie.csv',
    ]);
    expect(links.every((a) => a.getAttribute('href') === 'blob:template')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const [firstBlob] = createObjectURL.mock.calls[0] ?? [];
    expect(await firstBlob?.text()).toContain('Artikelnummer;');

    act(() => {
      unmount();
    });
    expect(revokeObjectURL).toHaveBeenCalledTimes(5);
  });
});
