/**
 * Logical tables, their accepted file names and the German/English header aliases of every column,
 * ported 1:1 from `reference/python-prototype/loaders.py` (`TABLE_FILES`, `COLUMN_ALIASES`,
 * `REQUIRED`, and the optional columns inside `_map_headers`). Parity is checked against the
 * prototype's `_map_headers` in `test/python-tables.test.ts`.
 */
import { err, ok, type Result } from '@vorchain/engine';

import type { DataError } from './errors.ts';
import { PYTHON_WHITESPACE, stripPython } from './strip.ts';

export const TABLE_NAMES = [
  'materials',
  'open_purchase_orders',
  'demand',
  'supplier_history',
  'suppliers',
] as const;

/** One of the five logical tables of an ERP export (prototype table names). */
export type TableName = (typeof TABLE_NAMES)[number];

// One line per table / column, as in loaders.py, so the two can be reviewed side by side.
/** File stems (name without extension) that identify a table, as in the prototype's `TABLE_FILES`. */
// prettier-ignore
export const TABLE_FILE_STEMS: Readonly<Record<TableName, readonly string[]>> = {
  materials: ['materials', 'artikel', 'materialstamm', 'bestand'],
  open_purchase_orders: ['open_purchase_orders', 'bestellungen', 'offene_bestellungen', 'purchase_orders'],
  demand: ['demand', 'bedarf', 'bedarfe', 'fertigungsbedarf'],
  supplier_history: ['supplier_history', 'lieferhistorie', 'wareneingaenge', 'wareneingänge'],
  suppliers: ['suppliers', 'lieferanten'],
};

/** Canonical column -> accepted header spellings, compared after {@link normaliseHeader}. */
// prettier-ignore
export const COLUMN_ALIASES = {
  material_id: ['material_id', 'material', 'materialnr', 'materialnummer', 'artikel', 'artikelnr', 'artikelnummer', 'teilenummer', 'sku', 'item', 'item_no'],
  description: ['description', 'bezeichnung', 'beschreibung', 'artikelbezeichnung', 'materialkurztext', 'kurztext'],
  main_supplier_id: ['main_supplier_id', 'hauptlieferant', 'lieferant', 'lieferantennr', 'supplier', 'supplier_id', 'kreditor'],
  on_hand: ['on_hand', 'bestand', 'lagerbestand', 'menge_lager', 'stock', 'frei_verwendbar', 'freiverwendbar'],
  safety_stock: ['safety_stock', 'sicherheitsbestand', 'mindestbestand', 'min_stock'],
  unit: ['unit', 'einheit', 'me', 'mengeneinheit', 'uom'],
  po_id: ['po_id', 'bestellung', 'bestellnr', 'bestellnummer', 'einkaufsbeleg', 'po', 'po_number'],
  supplier_id: ['supplier_id', 'lieferant', 'lieferantennr', 'kreditor', 'supplier'],
  qty: ['qty', 'menge', 'bestellmenge', 'offene_menge', 'offenemenge', 'quantity', 'bedarfsmenge'],
  promised_date: ['promised_date', 'liefertermin', 'bestaetigter_termin', 'bestätigter_termin', 'ab_termin', 'wunschtermin', 'due_date', 'confirmed_date'],
  actual_date: ['actual_date', 'wareneingang', 'eingangsdatum', 'we_datum', 'lieferdatum', 'receipt_date'],
  date: ['date', 'datum', 'bedarfsdatum', 'bedarfstermin', 'termin'],
  name: ['name', 'lieferantenname', 'firma', 'name1'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

/** A column as the engine input knows it, independent of the ERP's header spelling. */
export type CanonicalColumn = keyof typeof COLUMN_ALIASES;

/** Columns a table cannot do without (prototype `REQUIRED`). */
export const REQUIRED: Readonly<Record<TableName, readonly CanonicalColumn[]>> = {
  materials: ['material_id', 'on_hand'],
  open_purchase_orders: ['po_id', 'material_id', 'supplier_id', 'qty', 'promised_date'],
  demand: ['material_id', 'date', 'qty'],
  supplier_history: ['supplier_id', 'promised_date', 'actual_date'],
  suppliers: ['supplier_id', 'name'],
};

/** Columns read when present (the extra `wanted` set in the prototype's `_map_headers`). */
export const OPTIONAL: Readonly<Record<TableName, readonly CanonicalColumn[]>> = {
  materials: ['description', 'main_supplier_id', 'safety_stock', 'unit'],
  open_purchase_orders: [],
  demand: [],
  supplier_history: ['po_id'],
  suppliers: [],
};

/** Canonical column -> index of the header it was found under. */
export type ColumnMapping = Readonly<Partial<Record<CanonicalColumn, number>>>;

const IGNORED_IN_HEADERS = new RegExp(`[${PYTHON_WHITESPACE}_\\-.]`, 'gu');

/**
 * Prototype `_norm`: trim, lower-case, then drop whitespace, `_`, `-` and `.`, so `Offene Menge`,
 * `offene_menge` and `OFFENE-MENGE` compare equal.
 */
export function normaliseHeader(header: string): string {
  return stripPython(header).toLowerCase().replace(IGNORED_IN_HEADERS, '');
}

/** Headers as shown to the user in error messages: the non-empty ones, as found. */
export function foundHeaders(headers: readonly string[]): readonly string[] {
  return headers.filter((header) => header !== '');
}

/**
 * Maps a table's required and optional columns to header positions, like the prototype's
 * `_map_headers`: for each column, the first alias (in alias order) found among the headers wins;
 * with duplicate headers the leftmost counts; a header position serves at most one column.
 *
 * @returns `MISSING_COLUMNS` with the missing required columns and the headers that were found.
 */
export function mapHeaders(
  table: TableName,
  headers: readonly string[],
): Result<ColumnMapping, DataError> {
  const normalised = headers.map(normaliseHeader);
  const mapping: Partial<Record<CanonicalColumn, number>> = {};
  const used = new Set<number>();
  for (const column of [...REQUIRED[table], ...OPTIONAL[table]]) {
    const index = firstFreeAliasIndex(column, normalised, used);
    if (index !== undefined) {
      mapping[column] = index;
      used.add(index);
    }
  }
  const missing = REQUIRED[table].filter((column) => mapping[column] === undefined);
  if (missing.length > 0) {
    return err({
      code: 'MISSING_COLUMNS',
      params: { table, missing, found: foundHeaders(headers) },
    });
  }
  return ok(mapping);
}

function firstFreeAliasIndex(
  column: CanonicalColumn,
  normalised: readonly string[],
  used: ReadonlySet<number>,
): number | undefined {
  for (const alias of COLUMN_ALIASES[column]) {
    const index = normalised.indexOf(normaliseHeader(alias));
    if (index !== -1 && !used.has(index)) return index;
  }
  return undefined;
}
