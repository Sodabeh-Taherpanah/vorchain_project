/**
 * Seeded generator for large, realistic datasets (backlog P1-11, spec §4.2): the performance
 * benchmark and later load tests need 20 000 materials / 100 000 demand rows that are identical on
 * every machine. Output is a German ERP export (UTF-8 with BOM, CRLF, `;`, `1.234,5`,
 * `DD.MM.YYYY`), the harder of the two input dialects for the parsers.
 *
 * Deterministic by construction: a seeded PRNG, no clock and no `Math.random`, so the same options
 * give the same bytes. Separate entry point (`@vorchain/sample-data/scale`), never bundled into the
 * demo.
 */
import { addDays, type IsoDate } from '@vorchain/engine';

import type { SampleDataset, SampleFile } from './dataset.ts';
import { de } from './generated/de.ts';

export interface ScaleOptions {
  /** Number of materials (rows of `artikel.csv`), at least 1. */
  readonly materials: number;
  /** Number of demand rows (`bedarf.csv`), spread evenly over the materials. */
  readonly demandRows: number;
  /** Any 32-bit integer; the same seed gives the same bytes. */
  readonly seed: number;
}

/** Analysis date of every scale dataset: the bundled German sample's (from its golden file). */
const AS_OF = de.asOf;
/** Demand falls on days 1..DEMAND_DAYS after `asOf`, inside the default 28-day horizon. */
const DEMAND_DAYS = 27;
const MATERIALS_PER_SUPPLIER = 100;
const HISTORY_PER_SUPPLIER = 20;

type Rng = () => number;

/** Mulberry32: tiny, fast and good enough for test data; returns floats in [0, 1). */
function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const intBetween = (rng: Rng, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));

/** `2026-10-05` -> `05.10.2026`. */
function germanDate(date: IsoDate): string {
  return date.replace(/^(\d{4})-(\d{2})-(\d{2})$/u, '$3.$2.$1');
}

/** One decimal, `.` for thousands and `,` for decimals: `1234.5` -> `1.234,5`. */
function germanNumber(value: number): string {
  const [whole = '0', fraction = '0'] = value.toFixed(1).split('.');
  return `${whole.replace(/\B(?=(\d{3})+$)/gu, '.')},${fraction}`;
}

const pad = (n: number) => String(n).padStart(6, '0');
const materialCode = (i: number) => `M${pad(i + 1)}`;
const supplierCode = (s: number) => `S${String(s + 1).padStart(4, '0')}`;

/** Every third supplier is chronically late: the source of the dataset's hidden risks. */
const isLateSupplier = (s: number) => s % 3 === 2;

function csv(name: string, header: readonly string[], rows: readonly string[]): SampleFile {
  return { name, content: `\u{feff}${[header.join(';'), ...rows].join('\r\n')}\r\n` };
}

function assertCount(name: string, value: number, min: number): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new RangeError(`${name} must be an integer >= ${String(min)}, got ${String(value)}`);
  }
}

/** Demand days of material `i`: its demand rows are `i`, `i + materials`, `i + 2 * materials` … */
function demandDays(i: number, materials: number, demandRows: number): number[] {
  const count = Math.floor(demandRows / materials) + (i < demandRows % materials ? 1 : 0);
  const stride = Math.max(1, Math.floor(DEMAND_DAYS / Math.max(1, count)));
  return Array.from({ length: count }, (_, k) => 1 + ((k * stride) % DEMAND_DAYS));
}

/**
 * Generates the five input tables for `materials` materials and `demandRows` demand rows.
 * About a third of the suppliers deliver 3–10 days late; half of their materials have just enough
 * stock to bridge to the promised date, so the ERP view shows no problem but the realistic view
 * does (hidden risk). Another ~15% of all materials are visibly short.
 *
 * @throws RangeError for non-integer or out-of-range options (a programmer error).
 */
export function generateScaleDataset(options: ScaleOptions): SampleDataset {
  const { materials, demandRows, seed } = options;
  assertCount('materials', materials, 1);
  assertCount('demandRows', demandRows, 0);
  if (!Number.isInteger(seed)) throw new RangeError(`seed must be an integer, got ${String(seed)}`);

  const rng = mulberry32(seed);
  const supplierCount = Math.max(3, Math.ceil(materials / MATERIALS_PER_SUPPLIER));
  const articles: string[] = [];
  const orders: string[] = [];
  const plans: { readonly daily: number; readonly days: readonly number[] }[] = [];

  for (let i = 0; i < materials; i += 1) {
    const supplier = i % supplierCount;
    const daily = intBetween(rng, 1, 400) / 2;
    const days = demandDays(i, materials, demandRows);
    const promisedDay = intBetween(rng, 5, 14);
    const beforeArrival = daily * days.filter((d) => d < promisedDay).length;
    const safety = daily * 2;
    const scenario = rng();
    const onHand =
      isLateSupplier(supplier) && scenario < 0.5
        ? safety + beforeArrival + daily / 2 // bridges to the promise, not to the real arrival
        : scenario < 0.15
          ? beforeArrival / 2 // visibly short
          : safety + daily * (days.length + 2); // healthy
    plans.push({ daily, days });
    articles.push(
      [
        materialCode(i),
        `Teil ${materialCode(i)}`,
        supplierCode(supplier),
        germanNumber(onHand),
        germanNumber(safety),
        'Stk',
      ].join(';'),
    );
    const promised = germanDate(addDays(AS_OF, promisedDay));
    orders.push(
      [
        `PO${pad(i + 1)}`,
        materialCode(i),
        supplierCode(supplier),
        germanNumber(daily * days.length),
        promised,
      ].join(';'),
    );
  }

  // Row r is the (r / materials)-th demand day of material r % materials: round-robin order.
  const demand: string[] = [];
  for (let k = 0; demand.length < demandRows; k += 1) {
    for (const [i, { daily, days }] of plans.entries()) {
      const day = days[k];
      if (day === undefined) break; // later materials have no more rows either
      demand.push(
        [materialCode(i), germanDate(addDays(AS_OF, day)), germanNumber(daily)].join(';'),
      );
    }
  }

  const suppliers: string[] = [];
  const history: string[] = [];
  for (let s = 0; s < supplierCount; s += 1) {
    suppliers.push([supplierCode(s), `Lieferant ${String(s + 1)} GmbH`].join(';'));
    for (let h = 0; h < HISTORY_PER_SUPPLIER; h += 1) {
      const promised = addDays(AS_OF, -intBetween(rng, 7, 365));
      const delay = isLateSupplier(s) ? intBetween(rng, 3, 10) : intBetween(rng, -1, 2);
      history.push(
        [
          `H${pad(s * HISTORY_PER_SUPPLIER + h + 1)}`,
          supplierCode(s),
          germanDate(promised),
          germanDate(addDays(promised, delay)),
        ].join(';'),
      );
    }
  }

  return {
    asOf: AS_OF,
    files: [
      csv(
        'artikel.csv',
        [
          'Artikelnummer',
          'Bezeichnung',
          'Hauptlieferant',
          'Lagerbestand',
          'Sicherheitsbestand',
          'ME',
        ],
        articles,
      ),
      csv('bedarf.csv', ['Artikelnummer', 'Bedarfsdatum', 'Menge'], demand),
      csv(
        'bestellungen.csv',
        ['Bestellnummer', 'Artikelnummer', 'Lieferant', 'Bestellmenge', 'Liefertermin'],
        orders,
      ),
      csv('lieferanten.csv', ['Lieferantennr', 'Name'], suppliers),
      csv(
        'lieferhistorie.csv',
        ['Bestellnummer', 'Lieferant', 'Liefertermin', 'Wareneingang'],
        history,
      ),
    ],
  };
}
