import { TABLE_NAMES, type DataError, type RecognisedTable } from '@vorchain/parsers';
import { describe, expect, it } from 'vitest';

import type { LoadSummary } from '../../workers/analysis-service.ts';
import { buildMapCheck, MAP_CHECK_TABLES } from './map-check.ts';

const recognised = (fileName: string, table: RecognisedTable['table']): RecognisedTable => ({
  fileName,
  table,
  rowCount: 3,
  mappedColumns: [],
});

const load = (overrides: Partial<LoadSummary>): LoadSummary => ({
  tables: [],
  errors: [],
  warnings: [],
  ready: false,
  asOf: null,
  supplierNames: {},
  ...overrides,
});

const orders = recognised('bestellungen.csv', 'open_purchase_orders');
const allTables = [
  recognised('artikel.csv', 'materials'),
  orders,
  recognised('bedarf.csv', 'demand'),
  recognised('lieferhistorie.csv', 'supplier_history'),
  recognised('lieferanten.csv', 'suppliers'),
];

const statuses = (check: ReturnType<typeof buildMapCheck>) =>
  Object.fromEntries(check.tables.map((t) => [t.table, t.status]));

describe('buildMapCheck', () => {
  it('lists the same five tables as the parsers, in their order', () => {
    expect(MAP_CHECK_TABLES).toEqual(TABLE_NAMES);
  });

  it('marks every table recognised after a complete load', () => {
    const check = buildMapCheck(load({ tables: allTables, ready: true }));

    expect(Object.values(statuses(check))).toEqual(Array(5).fill('recognised'));
    expect(check.tables[0]?.files).toEqual([allTables[0]]);
    expect(check.fileErrors).toEqual([]);
  });

  it('shows missing required tables and the absent optional table', () => {
    const errors: DataError[] = (['materials', 'demand', 'supplier_history'] as const).map(
      (table) => ({ code: 'MISSING_TABLE', params: { table } }),
    );
    const check = buildMapCheck(load({ tables: [orders], errors }));

    expect(statuses(check)).toEqual({
      materials: 'missing',
      open_purchase_orders: 'recognised',
      demand: 'missing',
      supplier_history: 'missing',
      suppliers: 'absent',
    });
    expect(check.tables.map((t) => t.required)).toEqual([true, true, true, true, false]);
    expect(check.tables[2]?.errors).toEqual([errors[1]]);
  });

  it('puts missing columns and row errors next to their table', () => {
    const missingColumns: DataError = {
      code: 'MISSING_COLUMNS',
      fileName: 'lieferanten.csv',
      params: { table: 'suppliers', missing: ['name'], found: ['Nr'] },
    };
    const badDate: DataError = {
      code: 'INVALID_DATE',
      fileName: 'bedarf.csv',
      row: 4,
      column: 'Datum',
      params: { value: '31.02.2026' },
    };
    const check = buildMapCheck(
      load({ tables: allTables.slice(0, 4), errors: [missingColumns, badDate] }),
    );

    expect(statuses(check)).toMatchObject({ demand: 'invalid', suppliers: 'invalid' });
    expect(check.tables[2]?.errors).toEqual([badDate]);
    expect(check.tables[4]?.errors).toEqual([missingColumns]);
    expect(check.fileErrors).toEqual([]);
  });

  it('keeps errors of unrecognised files and without a file apart', () => {
    const unknown: DataError = { code: 'UNKNOWN_TABLE', fileName: 'x.csv', params: { found: [] } };
    const tooLarge: DataError = {
      code: 'FILE_TOO_LARGE',
      params: { limit: 1, unit: 'bytes' },
    };
    const check = buildMapCheck(load({ tables: allTables, errors: [unknown, tooLarge] }));

    expect(check.fileErrors).toEqual([unknown, tooLarge]);
    expect(Object.values(statuses(check))).toEqual(Array(5).fill('recognised'));
  });

  it('attaches warnings to the table of their file', () => {
    const warning = {
      code: 'DUPLICATE_MATERIAL',
      fileName: 'artikel.csv',
      row: 5,
      params: { value: 'M1', firstRow: 2 },
    } as const;
    const check = buildMapCheck(load({ tables: allTables, warnings: [warning], ready: true }));

    expect(check.tables[0]?.warnings).toEqual([warning]);
    expect(check.tables[0]?.status).toBe('recognised');
  });
});
