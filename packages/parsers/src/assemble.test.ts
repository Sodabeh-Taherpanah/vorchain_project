import { describe, expect, it } from 'vitest';

import { loadTables } from './assemble.ts';
import type { RawTable } from './csv.ts';

function file(fileName: string, headers: string[], ...lines: string[][]): RawTable {
  const rows = lines.map((cells, i) => ({ rowNumber: i + 2, cells }));
  return { fileName, headers, rows, encoding: 'utf-8', delimiter: ';' };
}

const materials = file(
  'artikel.csv',
  ['Artikelnummer', 'Lagerbestand'],
  ['M1', '100'],
  ['M2', '5'],
);
const orders = file(
  'bestellungen.csv',
  ['Bestellnr', 'Artikel', 'Lieferant', 'Menge', 'Liefertermin'],
  ['P1', 'M1', 'S1', '10', '09.10.2026'],
);
const demand = file('bedarf.csv', ['Artikel', 'Datum', 'Menge'], ['M1', '05.10.2026', '20']);
const history = file(
  'lieferhistorie.csv',
  ['Lieferant', 'Liefertermin', 'Wareneingang'],
  ['S1', '01.06.2026', '02.06.2026'],
);
const suppliers = file('lieferanten.csv', ['Lieferant', 'Name'], ['S1', 'Krüger GmbH']);

describe('loadTables', () => {
  it('assembles the engine input in file order and describes each recognised file', () => {
    const result = loadTables([suppliers, history, demand, orders, materials]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.input?.materials.map((m) => m.materialId)).toEqual(['M1', 'M2']);
    expect(result.input?.openPurchaseOrders).toHaveLength(1);
    expect(result.input?.demand).toHaveLength(1);
    expect(result.input?.supplierHistory).toHaveLength(1);
    expect(result.input?.suppliers).toEqual([{ supplierId: 'S1', name: 'Krüger GmbH' }]);
    expect(result.tables.find((t) => t.table === 'materials')).toEqual({
      fileName: 'artikel.csv',
      table: 'materials',
      rowCount: 2,
      mappedColumns: [
        { column: 'material_id', header: 'Artikelnummer' },
        { column: 'on_hand', header: 'Lagerbestand' },
      ],
    });
  });

  it('treats suppliers as optional', () => {
    expect(loadTables([materials, orders, demand, history]).input?.suppliers).toEqual([]);
  });

  it('reports each missing required table', () => {
    const result = loadTables([materials, demand]);
    expect(result.input).toBeNull();
    expect(result.errors).toEqual([
      { code: 'MISSING_TABLE', params: { table: 'open_purchase_orders' } },
      { code: 'MISSING_TABLE', params: { table: 'supplier_history' } },
    ]);
  });

  it('rejects two files for the same table', () => {
    const second = { ...materials, fileName: 'materialstamm.csv' };
    expect(loadTables([materials, orders, demand, history, second]).errors).toEqual([
      {
        code: 'DUPLICATE_TABLE',
        fileName: 'materialstamm.csv',
        params: { table: 'materials', other: 'artikel.csv' },
      },
    ]);
  });

  it('keeps duplicate material rows (as the prototype does) and warns about each repetition', () => {
    const doubled = file(
      'artikel.csv',
      ['Artikel', 'Bestand'],
      ['M1', '1'],
      ['M2', '2'],
      ['M1', '3'],
    );
    const result = loadTables([doubled, orders, demand, history]);
    expect(result.input?.materials.map((m) => m.onHand)).toEqual([1, 2, 3]);
    expect(result.warnings).toEqual([
      {
        code: 'DUPLICATE_MATERIAL',
        fileName: 'artikel.csv',
        row: 4,
        params: { value: 'M1', firstRow: 2 },
      },
    ]);
  });

  it('collects detection, column and row errors of all files and returns no input', () => {
    const unknown = file('data1.csv', ['Farbe']);
    const noStock = file('artikel.csv', ['Artikelnummer', 'Farbe'], ['M1', 'rot']);
    const badDemand = file('bedarf.csv', ['Artikel', 'Datum', 'Menge'], ['M1', 'morgen', '1']);
    const result = loadTables([unknown, noStock, orders, badDemand, history]);
    expect(result.input).toBeNull();
    expect(result.errors.map((e) => [e.code, e.fileName])).toEqual([
      ['UNKNOWN_TABLE', 'data1.csv'],
      ['MISSING_COLUMNS', 'artikel.csv'],
      ['INVALID_DATE', 'bedarf.csv'],
    ]);
    expect(result.tables.map((t) => t.table)).toEqual([
      'open_purchase_orders',
      'demand',
      'supplier_history',
    ]);
  });
});
