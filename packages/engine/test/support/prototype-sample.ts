/**
 * Test-only loader for the prototype's plain English sample data
 * (`reference/python-prototype/sample_data/*.csv`), used by the parity test (P1-06).
 *
 * The engine never reads files (AGENTS.md §2): this lives under `test/`, outside the engine's pure
 * `src`, and uses `node:fs`. It is deliberately strict and small instead of tolerant: it accepts
 * exactly the canonical English headers, `,` as delimiter, ISO dates and plain numbers, and throws
 * on anything else. Tolerant parsing (German headers, `;`, `1.234,5`, `05.10.2026`, XLSX) belongs to
 * `@vorchain/parsers`, which the engine must not depend on; P1-10 runs the full parsers -> engine
 * chain against the same golden files.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  materialId,
  parseIsoDate,
  poId,
  supplierId,
  type AnalysisInput,
  type IsoDate,
} from '../../src/index.ts';

/** `reference/python-prototype/`, resolved from this file so the working directory does not matter. */
export const PROTOTYPE_DIR = fileURLToPath(
  new URL('../../../../reference/python-prototype/', import.meta.url),
);

type Row = Readonly<Record<string, string>>;

/**
 * Reads one CSV file of the English sample into rows keyed by header. Rejects quotes and ragged
 * rows, which the sample never contains, so a changed sample fails loudly instead of misparsing.
 */
export function readCsv(path: string, columns: readonly string[]): Row[] {
  const lines = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line !== '');
  const [headerLine, ...body] = lines;
  if (headerLine === undefined) throw new Error(`${path}: empty file`);
  if (lines.some((line) => line.includes('"'))) {
    throw new Error(`${path}: quoted fields are not supported by this test loader`);
  }
  const header = headerLine.split(',');
  const missing = columns.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new Error(`${path}: missing column(s) ${missing.join(', ')}; found ${header.join(', ')}`);
  }
  return body.map((line, i) => {
    const cells = line.split(',');
    if (cells.length !== header.length) {
      throw new Error(`${path}: row ${String(i + 2)} has ${String(cells.length)} cells`);
    }
    return Object.fromEntries(header.map((h, j) => [h, cells[j] ?? '']));
  });
}

function cell(row: Row, column: string): string {
  const value = row[column];
  if (value === undefined) throw new Error(`missing column ${column}`);
  return value;
}

function date(row: Row, column: string): IsoDate {
  const raw = cell(row, column);
  const result = parseIsoDate(raw);
  if (!result.ok) throw new Error(`${column}: not an ISO date: ${JSON.stringify(raw)}`);
  return result.value;
}

/** Prototype `parse_number`, restricted to the plain `1234.5` form the English sample uses. */
function number(row: Row, column: string): number {
  const raw = cell(row, column);
  if (raw === '') return 0; // prototype: an empty number cell is 0.0
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${column}: not a number: ${JSON.stringify(raw)}`);
  return value;
}

/**
 * Builds the engine input from a directory with the five English sample tables, in file order
 * (file order is the ranking tie-break and the PO order of the explanations).
 */
export function loadPrototypeSample(dir: string): AnalysisInput {
  const table = (name: string, columns: readonly string[]) =>
    readCsv(`${dir}/${name}.csv`, columns);
  return {
    materials: table('materials', ['material_id', 'on_hand']).map((row) => {
      const mainSupplier = row.main_supplier_id ?? '';
      return {
        materialId: materialId(cell(row, 'material_id')),
        description: row.description ?? '',
        mainSupplierId: mainSupplier === '' ? null : supplierId(mainSupplier),
        onHand: number(row, 'on_hand'),
        safetyStock: row.safety_stock === undefined ? 0 : number(row, 'safety_stock'),
        unit: row.unit === undefined || row.unit === '' ? null : row.unit,
      };
    }),
    openPurchaseOrders: table('open_purchase_orders', [
      'po_id',
      'material_id',
      'supplier_id',
      'qty',
      'promised_date',
    ]).map((row) => ({
      poId: poId(cell(row, 'po_id')),
      materialId: materialId(cell(row, 'material_id')),
      supplierId: supplierId(cell(row, 'supplier_id')),
      qty: number(row, 'qty'),
      promisedDate: date(row, 'promised_date'),
    })),
    demand: table('demand', ['material_id', 'date', 'qty']).map((row) => ({
      materialId: materialId(cell(row, 'material_id')),
      date: date(row, 'date'),
      qty: number(row, 'qty'),
    })),
    supplierHistory: table('supplier_history', ['supplier_id', 'promised_date', 'actual_date']).map(
      (row) => ({
        supplierId: supplierId(cell(row, 'supplier_id')),
        // The prototype skips history rows with a missing date; the sample has none, but keep `null`.
        promisedDate: cell(row, 'promised_date') === '' ? null : date(row, 'promised_date'),
        actualDate: cell(row, 'actual_date') === '' ? null : date(row, 'actual_date'),
        poId: row.po_id === undefined || row.po_id === '' ? null : poId(row.po_id),
      }),
    ),
    suppliers: table('suppliers', ['supplier_id', 'name']).map((row) => ({
      supplierId: supplierId(cell(row, 'supplier_id')),
      name: cell(row, 'name'),
    })),
  };
}
