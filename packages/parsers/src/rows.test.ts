import { describe, expect, it } from 'vitest';

import { mapHeaders, type TableName } from './columns.ts';
import { MAX_ROW_ERRORS, validateRows } from './rows.ts';
import type { DateSystem, RawCell } from './table.ts';

function validate(table: TableName, headers: readonly string[], ...lines: string[][]) {
  const mapping = mapHeaders(table, headers);
  if (!mapping.ok) throw new Error('test headers must map');
  const rows = lines.map((cells, i) => ({ rowNumber: i + 2, cells }));
  const { table: validated, errors } = validateRows({
    fileName: 'f.csv',
    table,
    headers,
    rows,
    mapping: mapping.value,
  });
  return {
    records: validated.records.map((r) => r.record),
    rowNumbers: validated.records.map((r) => r.rowNumber),
    errors,
  };
}

describe('validateRows', () => {
  it('reads a German semicolon export (prototype test_german_semicolon_export)', () => {
    const { records } = validate(
      'materials',
      ['Artikelnummer', 'Bezeichnung', 'Lagerbestand', 'Sicherheitsbestand'],
      ['M1', 'Schraube', '1.000,0', '50'],
    );
    expect(records).toEqual([
      {
        materialId: 'M1',
        description: 'Schraube',
        mainSupplierId: null,
        onHand: 1000,
        safetyStock: 50,
        unit: null,
      },
    ]);
  });

  it('fills prototype defaults: empty numbers are 0, absent optional columns are empty', () => {
    const { records } = validate(
      'materials',
      ['Artikel', 'Bestand', 'Lieferant', 'ME'],
      ['M1', '', '', ''],
    );
    expect(records).toEqual([
      {
        materialId: 'M1',
        description: '',
        mainSupplierId: null,
        onHand: 0,
        safetyStock: 0,
        unit: null,
      },
    ]);
  });

  it('converts POs, demand, history and suppliers to engine records', () => {
    expect(
      validate(
        'open_purchase_orders',
        ['Bestellnr', 'Artikel', 'Lieferant', 'Menge', 'Liefertermin'],
        ['P1', 'M1', 'S1', '40,5', '09.10.2026'],
      ).records,
    ).toEqual([
      { poId: 'P1', materialId: 'M1', supplierId: 'S1', qty: 40.5, promisedDate: '2026-10-09' },
    ]);
    expect(
      validate('demand', ['Artikel', 'Datum', 'Menge'], ['M1', '2026-10-05', '20']).records,
    ).toEqual([{ materialId: 'M1', date: '2026-10-05', qty: 20 }]);
    expect(validate('suppliers', ['Lieferant', 'Name'], ['S1', 'Krüger GmbH']).records).toEqual([
      { supplierId: 'S1', name: 'Krüger GmbH' },
    ]);
  });

  it('keeps history rows with empty dates (the engine skips them) and reads an optional PO number', () => {
    const headers = ['Bestellnr', 'Lieferant', 'Liefertermin', 'Wareneingang'];
    expect(
      validate(
        'supplier_history',
        headers,
        ['H1', 'S1', '01.06.2026', ''],
        ['', 'S1', '', '03.06.2026'],
      ).records,
    ).toEqual([
      { supplierId: 'S1', promisedDate: '2026-06-01', actualDate: null, poId: 'H1' },
      { supplierId: 'S1', promisedDate: null, actualDate: '2026-06-03', poId: null },
    ]);
  });

  it('skips rows whose mapped cells are all empty, keeping physical row numbers', () => {
    const { rowNumbers, errors } = validate(
      'demand',
      ['Artikel', 'Datum', 'Menge', 'Notiz'],
      ['', '', '', 'nur Notiz'],
      ['M1', '05.10.2026', '1'],
      [''],
    );
    expect(rowNumbers).toEqual([3]);
    expect(errors).toEqual([]);
  });

  it('reports each bad cell with file, row, column and only that raw value', () => {
    const { records, errors } = validate(
      'open_purchase_orders',
      ['Bestellnr', 'Artikel', 'Lieferant', 'Menge', 'Liefertermin'],
      ['P1', 'M1', 'S1', 'viele', 'nächste Woche'],
    );
    expect(records).toEqual([]);
    expect(errors).toEqual([
      {
        code: 'INVALID_NUMBER',
        fileName: 'f.csv',
        row: 2,
        column: 'Menge',
        params: { value: 'viele' },
      },
      {
        code: 'INVALID_DATE',
        fileName: 'f.csv',
        row: 2,
        column: 'Liefertermin',
        params: { value: 'nächste Woche' },
      },
    ]);
  });

  it('deviation: empty IDs and empty PO / demand dates are MISSING_VALUE (the prototype keeps them)', () => {
    const po = validate(
      'open_purchase_orders',
      ['Bestellnr', 'Artikel', 'Lieferant', 'Menge', 'Liefertermin'],
      ['P1', '', 'S1', '1', ''],
    );
    expect(po.errors).toEqual([
      { code: 'MISSING_VALUE', fileName: 'f.csv', row: 2, column: 'Artikel', params: {} },
      { code: 'MISSING_VALUE', fileName: 'f.csv', row: 2, column: 'Liefertermin', params: {} },
    ]);
    const demand = validate('demand', ['Artikel', 'Datum', 'Menge'], ['M1', '', '5']);
    expect(demand.errors.map((e) => [e.code, e.column])).toEqual([['MISSING_VALUE', 'Datum']]);
  });

  it(`stops after ${String(MAX_ROW_ERRORS)} errors with TOO_MANY_ERRORS`, () => {
    const lines = Array.from({ length: 30 }, (_, i) => [`M${String(i)}`, 'x', '1']);
    const { errors } = validate('demand', ['Artikel', 'Datum', 'Menge'], ...lines);
    expect(errors).toHaveLength(MAX_ROW_ERRORS + 1);
    expect(errors.at(-2)).toMatchObject({ code: 'INVALID_DATE', row: MAX_ROW_ERRORS + 1 });
    expect(errors.at(-1)).toEqual({
      code: 'TOO_MANY_ERRORS',
      fileName: 'f.csv',
      params: { limit: MAX_ROW_ERRORS },
    });
  });

  it('reports exactly the limit without TOO_MANY_ERRORS', () => {
    const lines = Array.from({ length: MAX_ROW_ERRORS }, (_, i) => [`M${String(i)}`, 'x', '1']);
    const { errors } = validate('demand', ['Artikel', 'Datum', 'Menge'], ...lines);
    expect(errors).toHaveLength(MAX_ROW_ERRORS);
    expect(errors.some((e) => e.code === 'TOO_MANY_ERRORS')).toBe(false);
  });
});

describe('validateRows on XLSX cells', () => {
  const orders = (cells: RawCell[], dateSystem?: DateSystem) => {
    const headers = ['Bestellnr', 'Artikel', 'Lieferant', 'Menge', 'Liefertermin'];
    const mapping = mapHeaders('open_purchase_orders', headers);
    if (!mapping.ok) throw new Error('test headers must map');
    return validateRows({
      fileName: 'f.xlsx',
      table: 'open_purchase_orders',
      headers,
      rows: [{ rowNumber: 2, cells }],
      mapping: mapping.value,
      ...(dateSystem === undefined ? {} : { dateSystem }),
    });
  };

  it('reads number IDs as text and a number in a date column as an Excel day number', () => {
    const { table, errors } = orders([4711, 42, 'S1', 12.5, 46300]);
    expect(errors).toEqual([]);
    expect(table.records[0]?.record).toEqual({
      poId: '4711',
      materialId: '42',
      supplierId: 'S1',
      qty: 12.5,
      promisedDate: '2026-10-05',
    });
    expect(orders(['P1', 'M1', 'S1', 1, 44838], 1904).table.records[0]?.record).toMatchObject({
      promisedDate: '2026-10-05',
    });
  });

  it('reports a number that is no Excel day as INVALID_DATE with that number', () => {
    expect(orders(['P1', 'M1', 'S1', 1, -3]).errors).toEqual([
      {
        code: 'INVALID_DATE',
        fileName: 'f.xlsx',
        row: 2,
        column: 'Liefertermin',
        params: { value: '-3' },
      },
    ]);
  });
});
