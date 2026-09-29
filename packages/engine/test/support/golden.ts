/**
 * Test-only reader for the prototype's golden files (`reference/python-prototype/golden/*.json`,
 * written by `export_golden.py`). It checks the shape at runtime, because `JSON.parse` returns
 * `unknown`, and maps the prototype's encodings to engine values explicitly:
 * - `hidden_risk` is `"yes"` / `"no"` -> `boolean`;
 * - `erp_view_date` is `"none"` when the ERP view shows no problem -> `null`;
 * - `score` is a Python `int` or `float` (`130` vs `128.0`, depending on whether the score formula
 *   touched a float); JSON has one number type, so both become a JS `number` and compare exactly.
 */
import { readFileSync } from 'node:fs';

/** One exception as `export_golden.py` writes it, mapped to engine value types. */
export interface GoldenException {
  readonly materialId: string;
  readonly severity: 'CRITICAL' | 'WARNING';
  readonly criticalDate: string;
  readonly daysUntil: number;
  readonly minProjectedStock: number;
  readonly hidden: boolean;
  readonly erpViewDate: string | null;
  readonly score: number;
}

/** One supplier entry; `mean` and `onTimeRate` are rounded to 4 decimals by the export. */
export interface GoldenSupplier {
  readonly supplierId: string;
  readonly mean: number;
  readonly p80: number;
  readonly onTimeRate: number;
  readonly n: number;
}

export interface Golden {
  readonly asOf: string;
  readonly horizon: number;
  readonly exceptions: readonly GoldenException[];
  /** In the file's order, which is `sorted(sstats.items())`: by supplier ID, code point order. */
  readonly suppliers: readonly GoldenSupplier[];
}

type Json = Readonly<Record<string, unknown>>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field<T>(obj: Json, key: string, check: (v: unknown) => v is T, where: string): T {
  const value = obj[key];
  if (!check(value)) throw new Error(`${where}: unexpected ${key}: ${JSON.stringify(value)}`);
  return value;
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isSeverity = (v: unknown): v is GoldenException['severity'] =>
  v === 'CRITICAL' || v === 'WARNING';
const isYesNo = (v: unknown): v is 'yes' | 'no' => v === 'yes' || v === 'no';

function expectKeys(obj: Json, keys: readonly string[], where: string): void {
  const actual = Object.keys(obj).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...keys].sort())) {
    // A new golden column must be compared on purpose, never ignored silently.
    throw new Error(`${where}: keys ${actual.join(', ')}, expected ${keys.join(', ')}`);
  }
}

const EXCEPTION_KEYS = [
  'material_id',
  'severity',
  'critical_date',
  'days_until',
  'min_projected_stock',
  'hidden_risk',
  'erp_view_date',
  'score',
];

function toException(raw: unknown, index: number): GoldenException {
  const where = `exceptions[${String(index)}]`;
  if (!isObject(raw)) throw new Error(`${where}: not an object`);
  expectKeys(raw, EXCEPTION_KEYS, where);
  const erpViewDate = field(raw, 'erp_view_date', isString, where);
  return {
    materialId: field(raw, 'material_id', isString, where),
    severity: field(raw, 'severity', isSeverity, where),
    criticalDate: field(raw, 'critical_date', isString, where),
    daysUntil: field(raw, 'days_until', isNumber, where),
    minProjectedStock: field(raw, 'min_projected_stock', isNumber, where),
    hidden: field(raw, 'hidden_risk', isYesNo, where) === 'yes',
    erpViewDate: erpViewDate === 'none' ? null : erpViewDate,
    score: field(raw, 'score', isNumber, where),
  };
}

function toSupplier([supplierId, raw]: [string, unknown]): GoldenSupplier {
  const where = `suppliers.${supplierId}`;
  if (!isObject(raw)) throw new Error(`${where}: not an object`);
  expectKeys(raw, ['mean', 'p80', 'on_time_rate', 'n'], where);
  return {
    supplierId,
    mean: field(raw, 'mean', isNumber, where),
    p80: field(raw, 'p80', isNumber, where),
    onTimeRate: field(raw, 'on_time_rate', isNumber, where),
    n: field(raw, 'n', isNumber, where),
  };
}

/** Parses a golden file's JSON text; throws with the offending path on any unexpected shape. */
export function parseGolden(text: string): Golden {
  const raw: unknown = JSON.parse(text);
  if (!isObject(raw)) throw new Error('golden: not an object');
  expectKeys(raw, ['asOf', 'horizon', 'exceptions', 'suppliers'], 'golden');
  const exceptions = raw.exceptions;
  const suppliers = raw.suppliers;
  if (!Array.isArray(exceptions)) throw new Error('golden: exceptions is not an array');
  if (!isObject(suppliers)) throw new Error('golden: suppliers is not an object');
  return {
    asOf: field(raw, 'asOf', isString, 'golden'),
    horizon: field(raw, 'horizon', isNumber, 'golden'),
    exceptions: exceptions.map(toException),
    // Supplier IDs like `S01` are not array-index keys, so `Object.entries` keeps the file order.
    suppliers: Object.entries(suppliers).map(toSupplier),
  };
}

export function readGolden(path: string): Golden {
  return parseGolden(readFileSync(path, 'utf8'));
}
