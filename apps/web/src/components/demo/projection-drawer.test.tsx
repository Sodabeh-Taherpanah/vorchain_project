import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { materialId, type IsoDate, type MaterialId, type ProjectionSeries } from '@vorchain/engine';
import { NextIntlClientProvider } from 'next-intl';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import golden from '../../../../../reference/python-prototype/golden/sample_data_de.json' with { type: 'json' };
import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import { createAnalysisService } from '../../workers/analysis-service.ts';
import { ProjectionDrawer, type ProjectionDrawerProps } from './projection-drawer.tsx';

// Recharts needs a laid-out DOM; its own rendering is covered in projection-chart.test.tsx and e2e.
vi.mock('./projection-chart.tsx', () => ({
  ProjectionChart: ({ series }: { series: ProjectionSeries }) => (
    <div data-testid="chart-stub">{series.materialId}</div>
  ),
}));

const M0030 = materialId('M0030');
const goldenM0030 = golden.exceptions.find((e) => e.material_id === 'M0030');
const asOf = golden.asOf as IsoDate;
const horizonDays = golden.horizon;
const toGermanDate = (iso: string) => iso.split('-').reverse().join('.');

/** M0030's projection from the real engine on the German sample, as the worker computes it. */
let sampleSeries: ProjectionSeries;
beforeAll(async () => {
  const service = createAnalysisService();
  await service.loadSample('de');
  await service.analyse({ asOf, horizonDays });
  sampleSeries = await service.getProjection(M0030);
});

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderDrawer(props: Partial<ProjectionDrawerProps> = {}, locale: 'de' | 'en' = 'de') {
  const all: ProjectionDrawerProps = {
    open: true,
    selection: { materialId: M0030, description: 'Hydraulikzylinder', trigger: null },
    asOf,
    horizonDays,
    getProjection: () => Promise.resolve(sampleSeries),
    onClose: vi.fn(),
    ...props,
  };
  const ui = (p: ProjectionDrawerProps) => (
    <NextIntlClientProvider locale={locale} messages={locale === 'de' ? de : en}>
      <ProjectionDrawer {...p} />
    </NextIntlClientProvider>
  );
  const view = render(ui(all));
  return {
    ...view,
    props: all,
    rerender: (next: Partial<ProjectionDrawerProps>) => {
      view.rerender(ui({ ...all, ...next }));
    },
  };
}

describe('ProjectionDrawer', () => {
  it('summarises both views with the golden dates of M0030 (de)', async () => {
    if (goldenM0030 === undefined) throw new Error('golden file has no M0030');
    renderDrawer();

    const dialog = screen.getByRole('dialog', { name: 'Bestandsverlauf M0030' });
    const summary = await within(dialog).findByTestId('projection-summary');

    const expected = `Realistische Sicht: Fehlteil am ${toGermanDate(goldenM0030.critical_date)}, ERP-Sicht: Fehlteil am ${toGermanDate(goldenM0030.erp_view_date)}.`;
    expect(summary.textContent).toBe(expected);
    expect(within(dialog).getByRole('img', { name: expected })).toBeDefined();
    expect(within(dialog).getByText('Hydraulikzylinder')).toBeDefined();
  });

  it('summarises in English with ISO dates', async () => {
    if (goldenM0030 === undefined) throw new Error('golden file has no M0030');
    renderDrawer({}, 'en');

    expect((await screen.findByTestId('projection-summary')).textContent).toBe(
      `Realistic view: stock-out on ${goldenM0030.critical_date}, ERP view: stock-out on ${goldenM0030.erp_view_date}.`,
    );
  });

  it('shows the same data as an accessible table and back', async () => {
    renderDrawer();
    await userEvent.click(
      await screen.findByRole('button', { name: de.demo.report.drawer.showTable }),
    );

    const table = screen.getByRole('table', { name: /Projizierter Bestand von M0030/ });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent);
    expect(headers).toEqual([
      'Datum',
      'Bedarf',
      'Zugang ERP',
      'Zugang realistisch',
      'Bestand ERP',
      'Bestand realistisch',
    ]);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(horizonDays);
    const critical = goldenM0030?.critical_date ?? '';
    const stockOutRow = rows.find(
      (row) => within(row).getByRole('rowheader').textContent === toGermanDate(critical),
    );
    const point = sampleSeries.points.find((p) => p.date === critical);
    expect(point?.realisticStock).toBeLessThan(0);
    expect(stockOutRow?.textContent).toContain(
      new Intl.NumberFormat('de').format(point?.realisticStock ?? 0),
    );
    expect(screen.queryByRole('img')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: de.demo.report.drawer.showChart }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('img')).toBeDefined();
  });

  it('describes a view without problems and one below safety stock', async () => {
    const series: ProjectionSeries = {
      materialId: M0030,
      safetyStock: 10,
      points: [
        {
          date: asOf,
          demand: 5,
          erpReceipts: 0,
          realisticReceipts: 0,
          erpStock: 15,
          realisticStock: 5,
        },
      ],
    };
    renderDrawer({ horizonDays: 1, getProjection: () => Promise.resolve(series) });

    expect((await screen.findByTestId('projection-summary')).textContent).toBe(
      'Realistische Sicht: unter Sicherheitsbestand ab 05.10.2026, ERP-Sicht: kein Engpass im Horizont.',
    );
  });

  it('shows a loading state, then an error when the worker has no projection', async () => {
    const pending = deferred<ProjectionSeries | null>();
    renderDrawer({ getProjection: () => pending.promise });
    expect(screen.getByRole('status').textContent).toBe(de.demo.report.drawer.loading);

    await act(async () => {
      pending.resolve(null);
      await pending.promise;
    });

    expect(screen.getByRole('alert').textContent).toBe(de.demo.report.drawer.unavailable);
  });

  it('never shows a projection computed for other settings than the report on screen', async () => {
    const getProjection = vi.fn(() => Promise.resolve(sampleSeries));
    // The report on screen is still the 7-day one; the worker already projects 28 days.
    const { rerender } = renderDrawer({ horizonDays: 7, getProjection });
    await act(() => Promise.resolve());
    expect(screen.queryByTestId('projection-summary')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(de.demo.report.drawer.loading);

    // The newer report arrives: the drawer asks again and shows the matching series.
    rerender({ horizonDays });

    expect(await screen.findByTestId('projection-summary')).toBeDefined();
    expect(getProjection).toHaveBeenCalledTimes(2);
  });

  it('ignores a late answer for the previously selected material', async () => {
    const answers = new Map<MaterialId, ReturnType<typeof deferred<ProjectionSeries>>>([
      [materialId('M0011'), deferred()],
      [M0030, deferred()],
    ]);
    const getProjection = (id: MaterialId) =>
      answers.get(id)?.promise ?? Promise.reject(new Error(id));
    const { rerender } = renderDrawer({
      selection: { materialId: materialId('M0011'), description: '', trigger: null },
      getProjection,
    });

    rerender({ selection: { materialId: M0030, description: '', trigger: null } });
    await act(async () => {
      answers.get(M0030)?.resolve(sampleSeries);
      answers
        .get(materialId('M0011'))
        ?.resolve({ ...sampleSeries, materialId: materialId('M0011') });
      await Promise.resolve();
    });

    expect(await screen.findByTestId('chart-stub')).toHaveProperty('textContent', 'M0030');
  });

  it('drops an answer that arrives after closing and asks again on reopen', async () => {
    const answers = [deferred<ProjectionSeries | null>(), deferred<ProjectionSeries | null>()];
    let call = 0;
    const getProjection = vi.fn(() => answers[call++]?.promise ?? Promise.resolve(null));
    const { rerender } = renderDrawer({ getProjection });

    rerender({ open: false, getProjection });
    await act(async () => {
      // The first request's answer says "unavailable"; it must not stick to the next opening.
      answers[0]?.resolve(null);
      await Promise.resolve();
    });
    rerender({ open: true, getProjection });

    expect(getProjection).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status').textContent).toBe(de.demo.report.drawer.loading);
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => {
      answers[1]?.resolve(sampleSeries);
      await Promise.resolve();
    });
    expect(await screen.findByTestId('projection-summary')).toBeDefined();
  });

  it('closes on Escape and returns focus to the button that opened it', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const onClose = vi.fn();
    const { rerender } = renderDrawer({
      onClose,
      selection: { materialId: M0030, description: '', trigger },
    });
    await screen.findByTestId('projection-summary');
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    rerender({ open: false, onClose, selection: { materialId: M0030, description: '', trigger } });

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
    trigger.remove();
  });

  it('has a localized close button', async () => {
    const onClose = vi.fn();
    renderDrawer({ onClose }, 'en');
    await screen.findByTestId('projection-summary');

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
