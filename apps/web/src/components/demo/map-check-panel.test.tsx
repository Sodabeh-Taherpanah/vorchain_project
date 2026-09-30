import { render, screen, within } from '@testing-library/react';
import type { DataError, RecognisedTable } from '@vorchain/parsers';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import de from '../../../messages/de.json';
import type { LoadSummary } from '../../workers/analysis-service.ts';
import { MapCheckPanel } from './map-check-panel.tsx';

const orders: RecognisedTable = {
  fileName: 'bestellungen.csv',
  table: 'open_purchase_orders',
  rowCount: 32,
  mappedColumns: [
    { column: 'po_id', header: 'Bestellnummer' },
    { column: 'material_id', header: 'Artikelnummer' },
  ],
};

function renderPanel(load: Partial<LoadSummary>) {
  render(
    <NextIntlClientProvider locale="de" messages={de}>
      <MapCheckPanel
        load={{
          tables: [],
          errors: [],
          warnings: [],
          ready: false,
          asOf: null,
          supplierNames: {},
          ...load,
        }}
      />
    </NextIntlClientProvider>,
  );
}

const tableItem = (name: string) => screen.getByRole('listitem', { name: new RegExp(`^${name}`) });

describe('MapCheckPanel', () => {
  it('shows file, rows and mapped columns of a recognised table', () => {
    renderPanel({ tables: [orders] });

    const item = tableItem('Offene Bestellungen');
    expect(item.dataset.status).toBe('recognised');
    expect(within(item).getByText('Erkannt')).toBeDefined();
    expect(within(item).getByText('bestellungen.csv · 32 Zeilen')).toBeDefined();
    expect(within(item).getByText('Bestellnummer, Artikelnummer')).toBeDefined();
  });

  it('lists all five tables with missing required tables and their fix hint', () => {
    const errors: DataError[] = (['materials', 'demand', 'supplier_history'] as const).map(
      (table) => ({ code: 'MISSING_TABLE', params: { table } }),
    );
    renderPanel({ tables: [orders], errors });

    expect(screen.getAllByRole('listitem', { name: /\((Pflicht|Optional)\)$/ })).toHaveLength(5);
    const demand = tableItem('Bedarf');
    expect(demand.dataset.status).toBe('missing');
    expect(within(demand).getByText('Fehlt')).toBeDefined();
    expect(demand.textContent).toContain('Die Tabelle Bedarf fehlt.');
    expect(tableItem('Lieferanten').dataset.status).toBe('absent');
  });

  it('shows a missing column next to its table with the columns found', () => {
    const error: DataError = {
      code: 'MISSING_COLUMNS',
      fileName: 'bestellungen.csv',
      params: {
        table: 'open_purchase_orders',
        missing: ['promised_date'],
        found: ['Bestellnummer', 'Termin_neu'],
      },
    };
    renderPanel({ errors: [error] });

    const item = tableItem('Offene Bestellungen');
    expect(item.dataset.status).toBe('invalid');
    expect(within(item).getByText('Fehlerhaft')).toBeDefined();
    expect(item.textContent).toContain(
      'Fehler: bestellungen.csv: Spalte Liefertermin nicht gefunden – gefundene Spalten: ' +
        'Bestellnummer und Termin_neu.',
    );
  });

  it('lists problems of unassigned files and warnings separately', () => {
    const unknown: DataError = {
      code: 'UNKNOWN_TABLE',
      fileName: 'notizen.csv',
      params: { found: ['Text'] },
    };
    renderPanel({
      tables: [{ ...orders, fileName: 'artikel.csv', table: 'materials' }],
      errors: [unknown],
      warnings: [
        {
          code: 'DUPLICATE_MATERIAL',
          fileName: 'artikel.csv',
          row: 5,
          params: { value: 'M1', firstRow: 2 },
        },
      ],
    });

    expect(screen.getByRole('heading', { name: de.demo.mapCheck.fileErrors })).toBeDefined();
    expect(screen.getByText(/notizen\.csv: Die Tabelle wurde nicht erkannt/)).toBeDefined();
    expect(tableItem('Materialstamm').textContent).toContain(
      'Hinweis: artikel.csv, Zeile 5: Artikelnummer „M1“ kommt mehrfach vor (zuerst in Zeile 2).',
    );
  });
});
