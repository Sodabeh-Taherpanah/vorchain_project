import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IsoDate } from '@vorchain/engine';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import de from '../../../messages/de.json';
import type { AnalysisService, LoadSummary } from '../../workers/analysis-service.ts';
import { DemoDataSource } from './demo-data-source.tsx';

const complete: LoadSummary = {
  tables: [],
  errors: [],
  warnings: [],
  ready: true,
  asOf: '2026-10-05' as IsoDate,
};
const incomplete: LoadSummary = {
  tables: [],
  errors: [{ code: 'MISSING_TABLE', params: { table: 'demand' } }],
  warnings: [],
  ready: false,
  asOf: null,
};

const service = {
  loadFiles: vi.fn<AnalysisService['loadFiles']>(() => Promise.resolve(incomplete)),
  loadSample: vi.fn(() => Promise.resolve(complete)),
  analyse: vi.fn(),
  getProjection: vi.fn(),
} satisfies AnalysisService;

vi.mock('../../workers/connect-analysis-worker.ts', () => ({
  connectAnalysisWorker: () => ({ service, terminate: vi.fn() }),
}));

const csv = (name: string) => new File(['a;b\n1;2\n'], name, { type: 'text/csv' });
const loadedNames = () => service.loadFiles.mock.lastCall?.[0].map((f) => f.name);

function renderDemo() {
  render(
    <NextIntlClientProvider locale="de" messages={de}>
      <DemoDataSource />
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
        <DemoDataSource />
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
