/**
 * Row validation (backlog P1-09): mapped cells -> engine records through one zod 4 schema per table.
 * Cells are converted like the prototype's `load_table`: numbers via {@link parseNumber} (empty ->
 * 0), dates via {@link parseDate} (empty -> `null`), IDs and text as found (already stripped by
 * `readCsv`). Rows whose mapped cells are all empty are skipped, as in the prototype.
 *
 * Deliberate deviations from the prototype (each pinned by a test in `rows.test.ts`):
 *  - An empty ID (material, PO or supplier number) or an empty PO / demand date is `MISSING_VALUE`.
 *    The prototype keeps `""` or `None`; a `None` PO date crashes it as soon as the supplier has a
 *    delay, and an empty demand date silently drops that demand.
 *  - Errors are collected (up to {@link MAX_ROW_ERRORS} per file) instead of stopping at the first.
 */
import {
  err,
  materialId,
  ok,
  poId,
  supplierId,
  type DeliveryRecord,
  type DemandLine,
  type IsoDate,
  type Material,
  type PurchaseOrder,
  type Result,
  type Supplier,
} from '@vorchain/engine';
import { z } from 'zod';

import type { CanonicalColumn, ColumnMapping, TableName } from './columns.ts';
import type { DataError } from './errors.ts';
import { parseDate, parseNumber } from './values.ts';

/** Row errors reported per file before the rest is summarised as `TOO_MANY_ERRORS`. */
export const MAX_ROW_ERRORS = 20;

/** Engine record type of each table. */
export interface TableRecords {
  readonly materials: Material;
  readonly open_purchase_orders: PurchaseOrder;
  readonly demand: DemandLine;
  readonly supplier_history: DeliveryRecord;
  readonly suppliers: Supplier;
}

/** A validated record with the physical line it came from (for warnings such as duplicates). */
export interface NumberedRecord<T> {
  readonly rowNumber: number;
  readonly record: T;
}

/** A file's rows, validated as `table`. `records` holds only the rows without errors. */
export type ValidatedTable = {
  readonly [T in TableName]: {
    readonly table: T;
    readonly fileName: string;
    readonly records: readonly NumberedRecord<TableRecords[T]>[];
  };
}[TableName];

/** Turns a cell conversion into a zod schema; a failure carries its `DataError` in `params`. */
function cell<T>(convert: (raw: string) => Result<T, DataError>) {
  return z.string().transform((raw, context) => {
    const result = convert(raw);
    if (result.ok) return result.value;
    context.addIssue({
      code: 'custom',
      message: result.error.code,
      params: { error: result.error },
    });
    return z.NEVER;
  });
}

const MISSING_VALUE: DataError = { code: 'MISSING_VALUE', params: {} };

const text = z.string();
const number = cell(parseNumber);
const optionalDate = cell(parseDate);
const requiredId = cell((raw) => (raw === '' ? err(MISSING_VALUE) : ok(raw)));
const requiredDate = cell((raw): Result<IsoDate, DataError> => {
  const date = parseDate(raw);
  if (!date.ok) return date;
  return date.value === null ? err(MISSING_VALUE) : ok(date.value);
});

const emptyToNull = (value: string | undefined): string | null =>
  value === undefined || value === '' ? null : value;

/** One zod schema per table: canonical cells in, engine record out. */
const ROW_SCHEMAS = {
  materials: z
    .object({
      material_id: requiredId,
      on_hand: number,
      description: text.optional(),
      main_supplier_id: text.optional(),
      safety_stock: number.optional(),
      unit: text.optional(),
    })
    .transform((row): Material => {
      const mainSupplier = emptyToNull(row.main_supplier_id);
      return {
        materialId: materialId(row.material_id),
        description: row.description ?? '',
        mainSupplierId: mainSupplier === null ? null : supplierId(mainSupplier),
        onHand: row.on_hand,
        safetyStock: row.safety_stock ?? 0,
        unit: emptyToNull(row.unit),
      };
    }),
  open_purchase_orders: z
    .object({
      po_id: requiredId,
      material_id: requiredId,
      supplier_id: requiredId,
      qty: number,
      promised_date: requiredDate,
    })
    .transform((row): PurchaseOrder => ({
      poId: poId(row.po_id),
      materialId: materialId(row.material_id),
      supplierId: supplierId(row.supplier_id),
      qty: row.qty,
      promisedDate: row.promised_date,
    })),
  demand: z
    .object({ material_id: requiredId, date: requiredDate, qty: number })
    .transform((row): DemandLine => ({
      materialId: materialId(row.material_id),
      date: row.date,
      qty: row.qty,
    })),
  supplier_history: z
    .object({
      supplier_id: requiredId,
      promised_date: optionalDate,
      actual_date: optionalDate,
      po_id: text.optional(),
    })
    .transform((row): DeliveryRecord => {
      const po = emptyToNull(row.po_id);
      return {
        supplierId: supplierId(row.supplier_id),
        promisedDate: row.promised_date,
        actualDate: row.actual_date,
        poId: po === null ? null : poId(po),
      };
    }),
  suppliers: z
    .object({ supplier_id: requiredId, name: text })
    .transform((row): Supplier => ({ supplierId: supplierId(row.supplier_id), name: row.name })),
} as const;

/** The input a table's rows are validated from: header row and data rows of a `RawTable`. */
export interface MappedTable {
  readonly fileName: string;
  readonly table: TableName;
  readonly headers: readonly string[];
  readonly rows: readonly { readonly rowNumber: number; readonly cells: readonly string[] }[];
  readonly mapping: ColumnMapping;
}

/** The mapped cells of one row, or `null` if they are all empty (the prototype skips those rows). */
function mappedCells(
  cells: readonly string[],
  mapping: ColumnMapping,
): Partial<Record<CanonicalColumn, string>> | null {
  const entries = Object.entries(mapping).map(([column, index]): [string, string] => [
    column,
    cells[index] ?? '',
  ]);
  return entries.some(([, value]) => value !== '') ? Object.fromEntries(entries) : null;
}

/** Programmer error guard: every issue comes from {@link cell}, which always attaches its error. */
function dataErrorOf(issue: z.core.$ZodIssue): DataError {
  const error: unknown = issue.code === 'custom' ? issue.params?.error : undefined;
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    throw new Error(`unexpected validation issue ${issue.code} at ${issue.path.join('.')}`);
  }
  return error as DataError;
}

/**
 * Validates the rows of a mapped table. Each row error carries the file name, physical line,
 * column header and at most the one offending cell (privacy, AGENTS.md §2).
 *
 * @returns the valid records and up to {@link MAX_ROW_ERRORS} errors, followed by one
 *   `TOO_MANY_ERRORS` if there were more.
 */
export function validateRows(mapped: MappedTable): {
  readonly table: ValidatedTable;
  readonly errors: readonly DataError[];
} {
  const { fileName, headers, mapping } = mapped;
  const schema = ROW_SCHEMAS[mapped.table];
  const records: NumberedRecord<unknown>[] = [];
  const errors: DataError[] = [];
  for (const { rowNumber, cells } of mapped.rows) {
    const values = mappedCells(cells, mapping);
    if (values === null) continue;
    const parsed = schema.safeParse(values);
    if (parsed.success) {
      records.push({ rowNumber, record: parsed.data });
      continue;
    }
    for (const issue of parsed.error.issues) {
      if (errors.length === MAX_ROW_ERRORS) {
        errors.push({ code: 'TOO_MANY_ERRORS', fileName, params: { limit: MAX_ROW_ERRORS } });
        return { table: validatedTable(mapped, records), errors };
      }
      const column = headers[mapping[issue.path[0] as CanonicalColumn] ?? -1];
      errors.push({
        ...dataErrorOf(issue),
        fileName,
        row: rowNumber,
        ...(column === undefined ? {} : { column }),
      });
    }
  }
  return { table: validatedTable(mapped, records), errors };
}

function validatedTable(mapped: MappedTable, records: NumberedRecord<unknown>[]): ValidatedTable {
  // Each record was produced by ROW_SCHEMAS[mapped.table], so it has that table's record type.
  return { table: mapped.table, fileName: mapped.fileName, records } as ValidatedTable;
}
