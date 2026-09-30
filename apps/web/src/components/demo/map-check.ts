import type { DataError, DataWarning, RecognisedTable, TableName } from '@vorchain/parsers';

import type { LoadSummary } from '../../workers/analysis-service.ts';

/**
 * The five tables in the order the map check lists them. A local copy of the parsers'
 * `TABLE_NAMES` keeps the parsers' runtime code out of the page bundle; a test keeps both equal.
 */
export const MAP_CHECK_TABLES = [
  'materials',
  'open_purchase_orders',
  'demand',
  'supplier_history',
  'suppliers',
] as const satisfies readonly TableName[];

/** The only table the analysis can run without (parsers' `REQUIRED_TABLES`). */
const OPTIONAL_TABLES: ReadonlySet<TableName> = new Set<TableName>(['suppliers']);

/**
 * - `recognised`: a file holds the table and has no errors
 * - `invalid`: a file holds the table, but it has errors (e.g. missing columns, bad values)
 * - `missing`: a required table has no file
 * - `absent`: the optional table has no file
 */
export type TableStatus = 'recognised' | 'invalid' | 'missing' | 'absent';

export interface TableCheck {
  readonly table: TableName;
  readonly required: boolean;
  readonly status: TableStatus;
  /** Files recognised as this table; more than one is itself an error (`DUPLICATE_TABLE`). */
  readonly files: readonly RecognisedTable[];
  readonly errors: readonly DataError[];
  readonly warnings: readonly DataWarning[];
}

export interface MapCheck {
  readonly tables: readonly TableCheck[];
  /** Problems of files that could not be assigned to a table (unreadable, unknown, too large). */
  readonly fileErrors: readonly DataError[];
}

/** The table an error is about, if the error names one. */
function namedTable(error: DataError): TableName | null {
  switch (error.code) {
    case 'MISSING_COLUMNS':
    case 'DUPLICATE_TABLE':
    case 'MISSING_TABLE':
      return error.params.table;
    default:
      return null;
  }
}

function statusOf(table: TableName, files: number, errors: readonly DataError[]): TableStatus {
  if (errors.some((e) => e.code === 'MISSING_TABLE')) return 'missing';
  // Any other error of a table comes from a file that holds it.
  if (errors.length > 0) return 'invalid';
  if (files > 0) return 'recognised';
  return OPTIONAL_TABLES.has(table) ? 'absent' : 'missing';
}

/**
 * Groups a load's tables, errors and warnings by table for the map check (spec §4.1 step 2), so
 * each problem is shown next to the table it concerns. Errors are matched by the table they name,
 * else by file name; the rest are file-level problems.
 */
export function buildMapCheck(load: LoadSummary): MapCheck {
  const tableOfFile = new Map(load.tables.map((t) => [t.fileName, t.table]));
  const tableOf = (issue: DataError | DataWarning): TableName | null =>
    (issue.code === 'DUPLICATE_MATERIAL' ? null : namedTable(issue)) ??
    (issue.fileName === undefined ? null : (tableOfFile.get(issue.fileName) ?? null));

  const tables = MAP_CHECK_TABLES.map((table): TableCheck => {
    const files = load.tables.filter((t) => t.table === table);
    const errors = load.errors.filter((e) => tableOf(e) === table);
    const warnings = load.warnings.filter((w) => tableOf(w) === table);
    const status = statusOf(table, files.length, errors);
    return { table, required: !OPTIONAL_TABLES.has(table), status, files, errors, warnings };
  });
  return { tables, fileErrors: load.errors.filter((e) => tableOf(e) === null) };
}
