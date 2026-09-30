/**
 * From read files to engine input (backlog P1-09): detect each file's table, map its headers,
 * validate its rows, then assemble the five tables into an `AnalysisInput`.
 */
import { err, ok, type AnalysisInput, type Result } from '@vorchain/engine';

import { mapHeaders, type CanonicalColumn, type TableName } from './columns.ts';
import type { RawTable } from './csv.ts';
import { detectTable } from './detect.ts';
import type { DataError, DataWarning } from './errors.ts';
import { validateRows, type TableRecords, type ValidatedTable } from './rows.ts';

/** Tables the analysis cannot run without; `suppliers` (names only) is optional. */
export const REQUIRED_TABLES: readonly TableName[] = [
  'materials',
  'open_purchase_orders',
  'demand',
  'supplier_history',
];

/** A recognised file, for the demo's map check. */
export interface RecognisedTable {
  readonly fileName: string;
  readonly table: TableName;
  /** Rows that passed validation. */
  readonly rowCount: number;
  /** Which header each canonical column was read from, in header order. */
  readonly mappedColumns: readonly { readonly column: CanonicalColumn; readonly header: string }[];
}

/** Everything the UI needs after loading: what was recognised, what is wrong, and the input. */
export interface LoadResult {
  readonly tables: readonly RecognisedTable[];
  readonly errors: readonly DataError[];
  readonly warnings: readonly DataWarning[];
  /** The engine input, or `null` whenever `errors` is not empty. */
  readonly input: AnalysisInput | null;
}

type RecordsOf<T extends TableName> = readonly TableRecords[T][];

function recordsOf<T extends TableName>(tables: readonly ValidatedTable[], table: T): RecordsOf<T> {
  const found = tables.find((t) => t.table === table);
  const records: readonly unknown[] = found?.records.map((r) => r.record) ?? [];
  // `found.table === table`, and ValidatedTable ties each table to its record type, which TS
  // cannot carry through `find` on a union.
  return records as RecordsOf<T>;
}

/** Material numbers that occur more than once, reported at every repetition. */
function duplicateMaterials(tables: readonly ValidatedTable[]): DataWarning[] {
  const materials = tables.find((t) => t.table === 'materials');
  if (materials?.table !== 'materials') return [];
  const firstRows = new Map<string, number>();
  const warnings: DataWarning[] = [];
  for (const { rowNumber, record } of materials.records) {
    const firstRow = firstRows.get(record.materialId);
    if (firstRow === undefined) {
      firstRows.set(record.materialId, rowNumber);
      continue;
    }
    warnings.push({
      code: 'DUPLICATE_MATERIAL',
      fileName: materials.fileName,
      row: rowNumber,
      params: { value: record.materialId, firstRow },
    });
  }
  return warnings;
}

/**
 * Assembles validated tables into the engine input. Materials, open POs, demand and supplier
 * history are required; suppliers are optional (`[]`). Records keep file order, which the ranking
 * and explanations depend on.
 *
 * Duplicate material rows are kept and each analysed, as in the prototype (it loops over every
 * materials row), and reported as `DUPLICATE_MATERIAL` warnings.
 *
 * @returns `DUPLICATE_TABLE` for a second file of the same table, `MISSING_TABLE` per missing
 *   required table; warnings in both cases.
 */
export function assembleInput(tables: readonly ValidatedTable[]): {
  readonly input: Result<AnalysisInput, readonly DataError[]>;
  readonly warnings: readonly DataWarning[];
} {
  const errors: DataError[] = [];
  const firstFile = new Map<TableName, string>();
  for (const { table, fileName } of tables) {
    const other = firstFile.get(table);
    if (other === undefined) firstFile.set(table, fileName);
    else errors.push({ code: 'DUPLICATE_TABLE', fileName, params: { table, other } });
  }
  for (const table of REQUIRED_TABLES) {
    if (!firstFile.has(table)) errors.push({ code: 'MISSING_TABLE', params: { table } });
  }
  const warnings = duplicateMaterials(tables);
  if (errors.length > 0) return { input: err(errors), warnings };
  return {
    input: ok({
      materials: recordsOf(tables, 'materials'),
      openPurchaseOrders: recordsOf(tables, 'open_purchase_orders'),
      demand: recordsOf(tables, 'demand'),
      supplierHistory: recordsOf(tables, 'supplier_history'),
      suppliers: recordsOf(tables, 'suppliers'),
    }),
    warnings,
  };
}

/** Detect, map and validate one file; `null` table if it cannot be recognised. */
function loadTable(raw: RawTable): {
  readonly table: ValidatedTable | null;
  readonly recognised: RecognisedTable | null;
  readonly errors: readonly DataError[];
} {
  const { fileName, headers } = raw;
  const detected = detectTable(fileName, headers);
  if (!detected.ok) return { table: null, recognised: null, errors: [detected.error] };
  const table = detected.value;
  const mapping = mapHeaders(table, headers);
  if (!mapping.ok) {
    // Still counts as present, so the user is not also told the table is missing.
    const empty = { table, fileName, records: [] } as ValidatedTable;
    return { table: empty, recognised: null, errors: [{ ...mapping.error, fileName }] };
  }
  const validated = validateRows({ ...raw, table, mapping: mapping.value });
  const mappedColumns = Object.entries(mapping.value)
    .sort(([, a], [, b]) => a - b)
    .map(([column, index]) => ({
      column: column as CanonicalColumn,
      header: headers[index] ?? '',
    }));
  return {
    table: validated.table,
    recognised: { fileName, table, rowCount: validated.table.records.length, mappedColumns },
    errors: validated.errors,
  };
}

/**
 * Loads read files (`readCsv` output) into engine input: per file detection, header mapping and
 * row validation, then assembly. All problems are collected, so the user sees every file's issues
 * at once; `input` is only set when there are none.
 */
export function loadTables(files: readonly RawTable[]): LoadResult {
  const loaded = files.map(loadTable);
  const tables = loaded.flatMap((l) => (l.table === null ? [] : [l.table]));
  const assembled = assembleInput(tables);
  const errors = [
    ...loaded.flatMap((l) => l.errors),
    ...(assembled.input.ok ? [] : assembled.input.error),
  ];
  return {
    tables: loaded.flatMap((l) => (l.recognised === null ? [] : [l.recognised])),
    errors,
    warnings: assembled.warnings,
    input: errors.length === 0 && assembled.input.ok ? assembled.input.value : null,
  };
}
