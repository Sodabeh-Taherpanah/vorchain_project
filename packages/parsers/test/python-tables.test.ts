/**
 * Header normalisation, header mapping, table loading and the whole chain up to the engine against
 * the prototype, recorded by `scripts/generate-python-fixtures.py` in `fixtures/python-tables.json`:
 * - `norm`: `_norm` on hand-picked headers and every alias;
 * - `headers`: `_map_headers` for every table on the sample headers, hand-picked and seeded random
 *   header sets (mapping, or the missing required columns);
 * - `load`: `load_table` records for every file of `sample_data` (EN) and `sample_data_de` (DE).
 *
 * The end-to-end block runs `parseFile` -> `loadTables` -> `analyse` on both sample folders, as CSV
 * and as the XLSX conversions from `scripts/generate-xlsx-fixtures.py` (typed number and date
 * cells, checked against the golden output by the prototype's own XLSX loader), and compares the
 * records and the ranked exceptions with the prototype.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { analyse, type AnalysisInput, type IsoDate } from '@vorchain/engine';
import { describe, expect, it } from 'vitest';

import {
  loadTables,
  mapHeaders,
  normaliseHeader,
  parseFile,
  TABLE_NAMES,
  type RawTable,
  type TableName,
} from '../src/index.ts';
import vectors from './fixtures/python-tables.json' with { type: 'json' };

type PythonRow = Readonly<Record<string, string | number | null>>;
type Case =
  | { readonly kind: 'norm'; readonly input: string; readonly python: string }
  | {
      readonly kind: 'headers';
      readonly headers: readonly string[];
      readonly python: Readonly<
        Record<TableName, { mapping?: Record<string, number>; missing?: string[] }>
      >;
    }
  | {
      readonly kind: 'load';
      readonly file: string;
      readonly table: TableName;
      readonly rows: readonly PythonRow[];
    };

const cases = vectors.cases as readonly Case[];
const REPO_ROOT = new URL('../../../', import.meta.url);
const SOURCES = [
  { folder: 'sample_data', format: 'csv' },
  { folder: 'sample_data_de', format: 'csv' },
  { folder: 'sample_data', format: 'xlsx' },
  { folder: 'sample_data_de', format: 'xlsx' },
] as const;
type Source = (typeof SOURCES)[number];

function ofKind<K extends Case['kind']>(kind: K): Extract<Case, { kind: K }>[] {
  return cases.filter((c): c is Extract<Case, { kind: K }> => c.kind === kind);
}

async function readFolder({ folder, format }: Source): Promise<RawTable[]> {
  const dir =
    format === 'csv'
      ? new URL(`reference/python-prototype/${folder}/`, REPO_ROOT)
      : new URL(`fixtures/xlsx/${folder}/`, import.meta.url);
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(`.${format}`))
    .sort();
  return Promise.all(
    names.map(async (name) => {
      const bytes = new Uint8Array(readFileSync(new URL(name, dir)));
      const result = await parseFile({ name, bytes });
      if (!result.ok) throw new Error(`${folder}/${name}: ${result.error.code}`);
      expect(result.value.format).toBe(format);
      return result.value;
    }),
  );
}

/** The engine record the prototype's row stands for (its defaults: `m.get("description", "")` …). */
function engineRecord(table: TableName, row: PythonRow): unknown {
  const nullIfEmpty = (value: unknown) => (value === undefined || value === '' ? null : value);
  switch (table) {
    case 'materials':
      return {
        materialId: row.material_id,
        description: row.description ?? '',
        mainSupplierId: nullIfEmpty(row.main_supplier_id),
        onHand: row.on_hand,
        safetyStock: row.safety_stock ?? 0,
        unit: nullIfEmpty(row.unit),
      };
    case 'open_purchase_orders':
      return {
        poId: row.po_id,
        materialId: row.material_id,
        supplierId: row.supplier_id,
        qty: row.qty,
        promisedDate: row.promised_date,
      };
    case 'demand':
      return { materialId: row.material_id, date: row.date, qty: row.qty };
    case 'supplier_history':
      return {
        supplierId: row.supplier_id,
        promisedDate: row.promised_date,
        actualDate: row.actual_date,
        poId: nullIfEmpty(row.po_id),
      };
    case 'suppliers':
      return { supplierId: row.supplier_id, name: row.name };
  }
}

const INPUT_KEYS: Readonly<Record<TableName, keyof AnalysisInput>> = {
  materials: 'materials',
  open_purchase_orders: 'openPurchaseOrders',
  demand: 'demand',
  supplier_history: 'supplierHistory',
  suppliers: 'suppliers',
};

describe('header normalisation matches the prototype (_norm)', () => {
  it.each(ofKind('norm'))('$input', ({ input, python }) => {
    expect(normaliseHeader(input)).toBe(python);
  });
});

describe('header mapping matches the prototype (_map_headers)', () => {
  const headerCases = ofKind('headers');

  it('has mapped and missing outcomes for every table', () => {
    for (const table of TABLE_NAMES) {
      const outcomes = headerCases.map((c) => c.python[table]);
      expect(outcomes.filter((o) => o.mapping !== undefined).length, table).toBeGreaterThan(5);
      expect(outcomes.filter((o) => o.missing !== undefined).length, table).toBeGreaterThan(5);
    }
  });

  it.each(headerCases.map((c, index) => ({ ...c, index })))('header set $index', (c) => {
    for (const table of TABLE_NAMES) {
      const result = mapHeaders(table, c.headers);
      const actual = result.ok
        ? { mapping: result.value }
        : { missing: result.error.code === 'MISSING_COLUMNS' ? result.error.params.missing : [] };
      expect(actual, table).toEqual(c.python[table]);
    }
  });
});

const stem = (path: string | undefined) =>
  path
    ?.split('/')
    .at(-1)
    ?.replace(/\.\w+$/u, '');

const tablesBySource = new Map(
  await Promise.all(SOURCES.map(async (source) => [source, await readFolder(source)] as const)),
);

describe.each(SOURCES)(
  '$folder ($format) loads like the prototype, gives golden output',
  (source) => {
    const { folder } = source;
    const result = loadTables(tablesBySource.get(source) ?? []);
    const loads = ofKind('load').filter((c) => c.file.includes(`/${folder}/`));

    it('recognises all five files without errors or warnings', () => {
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(loads.map((c) => c.table).sort()).toEqual([...TABLE_NAMES].sort());
      const detected = result.tables.map((t) => [stem(t.fileName), t.table]);
      expect(detected.sort()).toEqual(loads.map((c) => [stem(c.file), c.table]).sort());
    });

    it.each(loads)('$table: same records as load_table', ({ table, rows }) => {
      expect(result.input?.[INPUT_KEYS[table]]).toEqual(
        rows.map((row) => engineRecord(table, row)),
      );
    });

    it('parsers -> engine gives the golden exceptions, in order', () => {
      const goldenUrl = new URL(`reference/python-prototype/golden/${folder}.json`, REPO_ROOT);
      const golden = JSON.parse(readFileSync(fileURLToPath(goldenUrl), 'utf8')) as {
        asOf: IsoDate;
        horizon: number;
        exceptions: unknown[];
      };
      if (result.input === null) throw new Error('sample input did not load');
      const report = analyse(result.input, { asOf: golden.asOf, horizonDays: golden.horizon });
      const exceptions = report.exceptions.map((e) => ({
        material_id: e.materialId,
        severity: e.severity,
        critical_date: e.criticalDate,
        days_until: e.daysUntil,
        min_projected_stock: e.minProjectedStock,
        hidden_risk: e.hidden ? 'yes' : 'no',
        erp_view_date: e.erpViewDate ?? 'none',
        score: e.score,
      }));
      expect(golden.exceptions.length).toBeGreaterThan(10);
      expect(exceptions).toEqual(golden.exceptions);
    });
  },
);
