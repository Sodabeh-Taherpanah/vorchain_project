import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { materialId, poId, supplierId, type IsoDate } from '@vorchain/engine';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import { ExceptionTable, TOP_ROWS } from './exception-table.tsx';
import { supplierNameLookup } from './explanation-text.tsx';
import { OverdueNote, SummaryTiles } from './summary-tiles.tsx';
import { exception, overdueReason, testReport } from './test-report.ts';

const supplierName = supplierNameLookup({ S01: 'Metallbau Krüger GmbH' });

function renderIn(locale: 'de' | 'en', ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'de' ? de : en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** The row header (material) is a `th`, the rest are `td`s; read them in column order. */
const cells = (row: HTMLElement) =>
  Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent);

describe('ExceptionTable', () => {
  it('is a captioned table with column headers and one row per exception', () => {
    renderIn(
      'de',
      <ExceptionTable exceptions={testReport().exceptions} supplierName={supplierName} />,
    );

    const table = screen.getByRole('table', { name: /Materialien mit Fehlteil-Risiko/ });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual([
      'Schwere',
      'Material',
      'Kritisch ab',
      'In',
      'Niedrigster Bestand',
      'Verdeckt',
      'Warum',
      'Nächster Schritt',
    ]);
    const [, first] = within(table).getAllByRole('row');
    if (first === undefined) throw new Error('no data row');
    expect(cells(first)).toEqual([
      'Kritisch',
      'M0011Teil M0011',
      '08.10.2026',
      '3 Tage',
      '-1.380,5',
      'Nein',
      'Keine offene Bestellung deckt den Bedarf.',
      'Jetzt bei Metallbau Krüger GmbH bestellen.',
    ]);
    expect(screen.getAllByTestId('hidden-badge').map((b) => b.textContent)).toEqual([
      'Verdecktes Risiko',
    ]);
  });

  it('uses English dates and number separators in the English report', () => {
    renderIn(
      'en',
      <ExceptionTable exceptions={testReport().exceptions} supplierName={supplierName} />,
    );

    const [, first] = screen.getAllByRole('row');
    if (first === undefined) throw new Error('no data row');
    expect(cells(first).slice(0, 5)).toEqual([
      'Critical',
      'M0011Teil M0011',
      '2026-10-08',
      '3 days',
      '-1,380.5',
    ]);
  });

  it(`shows the top ${String(TOP_ROWS)} and expands to all rows`, async () => {
    const many = Array.from({ length: 12 }, (_, i) => exception(`M${String(i).padStart(4, '0')}`));
    renderIn('de', <ExceptionTable exceptions={many} supplierName={supplierName} />);

    expect(screen.getAllByRole('row')).toHaveLength(TOP_ROWS + 1);
    expect(screen.getByRole('table').querySelector('caption')?.textContent).toContain(
      '(10 von 12)',
    );

    const toggle = screen.getByRole('button', { name: 'Alle anzeigen (12)' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(toggle);

    expect(screen.getAllByRole('row')).toHaveLength(13);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Nur die ersten 10 anzeigen');
  });

  it('has no expand button for ten rows or fewer', () => {
    renderIn(
      'de',
      <ExceptionTable exceptions={testReport().exceptions} supplierName={supplierName} />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders a repeated reason once per row', () => {
    const duplicated = exception('M0005', { reasons: [overdueReason, overdueReason] });
    renderIn('de', <ExceptionTable exceptions={[duplicated]} supplierName={supplierName} />);

    expect(screen.getAllByText(/PO9 war für 02\.10\.2026 bestätigt/)).toHaveLength(1);
  });

  it('opens the details of a material from the keyboard', async () => {
    const onSelect = vi.fn();
    renderIn(
      'de',
      <ExceptionTable
        exceptions={testReport().exceptions}
        supplierName={supplierName}
        onSelect={onSelect}
      />,
    );

    await userEvent.tab(); // the scrollable table region
    await userEvent.tab();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Details zu M0011');
    await userEvent.keyboard('{Enter}');
    await userEvent.tab();
    await userEvent.keyboard(' ');

    expect(onSelect.mock.calls).toEqual([
      [materialId('M0011'), screen.getByRole('button', { name: 'Details zu M0011' })],
      [materialId('M0030'), screen.getByRole('button', { name: 'Details zu M0030' })],
    ]);
  });
});

describe('SummaryTiles', () => {
  it('shows the three counts in a polite live region', () => {
    const { container } = renderIn('de', <SummaryTiles summary={testReport().summary} />);

    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(screen.getByTestId('tile-critical').textContent).toContain('Kritisch2');
    expect(screen.getByTestId('tile-warning').textContent).toContain('Warnungen0');
    expect(screen.getByTestId('tile-hidden').textContent).toContain('Verdeckte Risiken1');
  });
});

describe('OverdueNote', () => {
  const overdue = [
    {
      poId: poId('PO9'),
      materialId: materialId('M0005'),
      supplierId: supplierId('S01'),
      qty: 50,
      promisedDate: '2026-10-02' as IsoDate,
      realisticDate: '2026-10-06' as IsoDate,
      countedInRealisticView: true,
      hasException: false,
    },
    {
      poId: poId('PO8'),
      materialId: materialId('M0011'),
      supplierId: supplierId('S02'),
      qty: 10,
      promisedDate: '2026-09-30' as IsoDate,
      realisticDate: '2026-10-02' as IsoDate,
      countedInRealisticView: false,
      hasException: true,
    },
  ];

  it.each([
    [
      'de',
      '2 offene Bestellungen sind überfällig',
      'PO9 für M0005 bei Metallbau Krüger GmbH: bestätigt für 02.10.2026, realistisch am 06.10.2026. Das Material steht nicht in der Liste',
      'PO8 für M0011 bei S02: bestätigt für 30.09.2026, realistisch am 02.10.2026.',
    ],
    [
      'en',
      '2 open purchase orders are overdue',
      'PO9 for M0005 from Metallbau Krüger GmbH: promised 2026-10-02, realistically 2026-10-06. The material is not in the list',
      'PO8 for M0011 from S02: promised 2026-09-30, realistically 2026-10-02.',
    ],
  ] as const)('lists every overdue PO once in %s', (locale, note, dropped, listed) => {
    renderIn(locale, <OverdueNote overdue={overdue} supplierName={supplierName} />);

    const box = screen.getByTestId('overdue-note');
    expect(box.textContent).toContain(note);
    const items = within(box)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items[0]).toContain(dropped);
    expect(items[1]).toBe(listed);
  });

  it('lists two lines of the same PO without a duplicate React key', () => {
    // One PO number can cover several materials in customer data (P1-17 QA note).
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const [first] = overdue;
    if (first === undefined) throw new Error('fixture has no PO');
    const sameNumber = [first, { ...first, materialId: materialId('M0006') }, first];

    renderIn('de', <OverdueNote overdue={sameNumber} supplierName={supplierName} />);

    expect(within(screen.getByTestId('overdue-note')).getAllByRole('listitem')).toHaveLength(3);
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key/);
    errors.mockRestore();
  });

  it('renders nothing without overdue POs', () => {
    const { container } = renderIn('de', <OverdueNote overdue={[]} supplierName={supplierName} />);

    expect(container.textContent).toBe('');
  });
});
