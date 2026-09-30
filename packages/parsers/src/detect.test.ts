import { describe, expect, it } from 'vitest';

import { detectTable } from './detect.ts';

const PO_HEADERS = ['Bestellnummer', 'Artikelnummer', 'Lieferant', 'Bestellmenge', 'Liefertermin'];
const DEMAND_HEADERS = ['Artikelnummer', 'Bedarfsdatum', 'Bedarfsmenge'];

describe('detectTable', () => {
  it.each([
    ['artikel.csv', 'materials'],
    ['Bestellungen.CSV', 'open_purchase_orders'],
    ['Open Purchase Orders.csv', 'open_purchase_orders'],
    ['wareneingänge.csv', 'supplier_history'],
    ['wareneingänge.csv', 'supplier_history'], // macOS: decomposed umlaut
    ['lieferanten', 'suppliers'],
  ])('by exact stem: %s -> %s', (fileName, table) => {
    expect(detectTable(fileName, ['x'])).toEqual({ ok: true, value: table });
  });

  it.each([
    ['Export_Bestellungen_KW40.csv', 'open_purchase_orders'],
    ['2026-10 Lagerbestand.csv', 'materials'],
    ['fertigungsbedarf_werk2.csv', 'demand'],
  ])('by contained stem: %s -> %s', (fileName, table) => {
    expect(detectTable(fileName, ['x'])).toEqual({ ok: true, value: table });
  });

  it('by headers only when the name says nothing', () => {
    expect(detectTable('data1.csv', PO_HEADERS)).toEqual({
      ok: true,
      value: 'open_purchase_orders',
    });
    expect(detectTable('data2.csv', DEMAND_HEADERS)).toEqual({ ok: true, value: 'demand' });
  });

  it('prefers the table with most mapped columns', () => {
    // Fits suppliers (supplier_id, name) and materials (material_id, on_hand, description, ...).
    const headers = ['Artikelnummer', 'Bestand', 'Bezeichnung', 'Lieferant', 'Name'];
    expect(detectTable('export.csv', headers)).toEqual({ ok: true, value: 'materials' });
  });

  it('lets the headers decide when the name contains stems of several tables', () => {
    expect(detectTable('Artikel_Bedarf.csv', DEMAND_HEADERS)).toEqual({
      ok: true,
      value: 'demand',
    });
  });

  it('reports a tie as AMBIGUOUS_TABLE', () => {
    // Three columns each: demand (material_id, date, qty), materials (material_id, on_hand, description).
    const headers = ['Artikel', 'Datum', 'Menge', 'Bestand', 'Bezeichnung'];
    expect(detectTable('data.csv', headers)).toEqual({
      ok: false,
      error: {
        code: 'AMBIGUOUS_TABLE',
        fileName: 'data.csv',
        params: { candidates: ['materials', 'demand'] },
      },
    });
  });

  it('reports AMBIGUOUS_TABLE when the name names several tables and no headers fit', () => {
    expect(detectTable('Artikel_Bedarf.csv', ['Farbe'])).toEqual({
      ok: false,
      error: {
        code: 'AMBIGUOUS_TABLE',
        fileName: 'Artikel_Bedarf.csv',
        params: { candidates: ['materials', 'demand'] },
      },
    });
  });

  it('reports UNKNOWN_TABLE with the headers found', () => {
    expect(detectTable('data1.csv', ['Farbe', '', 'Gewicht'])).toEqual({
      ok: false,
      error: {
        code: 'UNKNOWN_TABLE',
        fileName: 'data1.csv',
        params: { found: ['Farbe', 'Gewicht'] },
      },
    });
  });
});
