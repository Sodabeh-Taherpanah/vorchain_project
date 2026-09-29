import { describe, expect, it } from 'vitest';

import { prototypeText, supplierNames } from './__fixtures__/prototype-text.ts';
import vectors from './__fixtures__/python-vectors.json' with { type: 'json' };
import {
  addDays,
  addWorkdays,
  diffDays,
  parseIsoDate,
  weekday,
  workdaysBetween,
  type IsoDate,
} from './dates.ts';
import type { DailyQuantities } from './daily-quantities.ts';
import { analyse } from './analyse.ts';
import { materialId, poId, supplierId } from './ids.ts';
import { demandByMaterial, projectionSeries, projectStock } from './projection.ts';
import { buildReceipts } from './receipts.ts';
import { pyRound } from './rounding.ts';
import { computeSupplierStats, percentile, statsBySupplier } from './supplier-stats.ts';
import type { AnalysisInput, DeliveryRecord, Report } from './types.ts';

/**
 * Parity with CPython on seeded, generated inputs (see scripts/generate-python-vectors.py). The
 * hand-written tables in dates.test.ts and rounding.test.ts document intent; these vectors guard
 * against cases nobody thought to write down (random dates across years 1..9999, random bit
 * patterns for rounding, random delivery histories with weekend dates and missing values, random
 * stock projections, plus the prototype sample dataset and random datasets run through the
 * prototype's `analyse`, down to the ranked exceptions and their English why / next-action text).
 */

function d(input: string): IsoDate {
  const result = parseIsoDate(input);
  if (!result.ok) throw new Error(`fixture holds an invalid date: ${input}`);
  return result.value;
}

type AddWorkdaysVector = [from: string, n: number, expected: string];
type BetweenVector = [a: string, b: string, expected: number];
type CalendarVector = [
  date: string,
  weekday: number,
  n: number,
  shifted: string,
  other: string,
  diff: number,
];
type RoundVector = [x: number, ndigits: number | null, expected: number];
type PercentileVector = [values: number[], p: number, expected: number];
interface SupplierStatsVector {
  name: string;
  minReliableDeliveries: number;
  history: { supplierId: string; promisedDate: string | null; actualDate: string | null }[];
  expected: {
    supplierId: string;
    meanDelayDays: number;
    p80DelayDays: number;
    onTimeRate: number;
    deliveries: number;
    reliable: boolean;
  }[];
}

type DayEntries = [date: string, qty: number][];
/** `[firstStockOut, firstBelowSafety, minStock]`, the prototype's `project` return value. */
type ProjectResult = [firstStockOut: string | null, firstBelowSafety: string | null, min: number];
interface ProjectVector {
  onHand: number;
  safetyStock: number;
  asOf: string;
  horizonDays: number;
  demandByDay: DayEntries;
  receiptsByDay: DayEntries;
  expected: ProjectResult;
}
/**
 * One ranked exception as the prototype's `analyse` returned it: `[materialId, severity,
 * criticalDate, erpViewDate, daysUntil, hidden, minProjectedStock, safetyStock, score]`.
 */
type ExceptionRow = [
  materialId: string,
  severity: string,
  criticalDate: string,
  erpViewDate: string | null,
  daysUntil: number,
  hidden: boolean,
  minProjectedStock: number,
  safetyStock: number,
  score: number,
];
/**
 * Tables and, per material row, every `project` call the prototype's `analyse` made, plus the
 * exceptions it returned.
 */
interface ProjectionVector {
  name: string;
  asOf: string;
  horizonDays: number;
  input: {
    materials: {
      materialId: string;
      onHand: number;
      safetyStock: number;
      mainSupplierId: string | null;
    }[];
    openPurchaseOrders: {
      poId: string;
      materialId: string;
      supplierId: string;
      qty: number;
      promisedDate: string;
    }[];
    demand: { materialId: string; date: string; qty: number }[];
    supplierHistory: SupplierStatsVector['history'];
    suppliers: { supplierId: string; name: string }[];
  };
  expected: {
    materialId: string;
    demandByDay: DayEntries;
    erpReceipts: DayEntries;
    realisticReceipts: DayEntries;
    erp: ProjectResult;
    realistic: ProjectResult;
    /** `[date, demand, erpReceipts, realisticReceipts, erpStock, realisticStock]` per day. */
    points: [string, number, number, number, number, number][];
  }[];
  exceptions: ExceptionRow[];
  /** The prototype's `[why, next_action]` per exception, English, in ranked order. */
  explanations: [why: string, nextAction: string][];
}
/**
 * Datasets built for the ranking (and the ADR-0005 overdue example): tables, the exceptions
 * `analyse` returned and their explanations, nothing else.
 */
interface RankingVector {
  name: string;
  asOf: string;
  horizonDays: number;
  input: ProjectionVector['input'];
  exceptions: ExceptionRow[];
  explanations: ProjectionVector['explanations'];
}

const addWorkdaysVectors = vectors.addWorkdays as AddWorkdaysVector[];
const betweenVectors = vectors.workdaysBetween as BetweenVector[];
const calendarVectors = vectors.calendar as CalendarVector[];
const roundVectors = vectors.round as RoundVector[];
const percentileVectors = vectors.percentile as PercentileVector[];
const supplierStatsVectors = vectors.supplierStats as SupplierStatsVector[];
const projectVectors = vectors.project as ProjectVector[];
// TypeScript infers the JSON's datasets as a union of differently shaped rows (e.g. with and without
// a main supplier), which a direct cast rejects; the shape is fixed by the generator script.
const projectionVectors = vectors.projection as unknown as ProjectionVector[];
const rankingVectors = vectors.ranking as unknown as RankingVector[];
const overdueVectors = vectors.overdue as unknown as RankingVector[];
const analyseVectors: (ProjectionVector | RankingVector)[] = [
  ...projectionVectors,
  ...rankingVectors,
  ...overdueVectors,
];

function toDeliveryRecord(row: SupplierStatsVector['history'][number]): DeliveryRecord {
  return {
    supplierId: supplierId(row.supplierId),
    promisedDate: row.promisedDate === null ? null : d(row.promisedDate),
    actualDate: row.actualDate === null ? null : d(row.actualDate),
    poId: null,
  };
}

function toDays(entries: DayEntries): DailyQuantities {
  return new Map(entries.map(([date, qty]) => [d(date), qty]));
}

function toEntries(byDay: DailyQuantities | undefined): DayEntries {
  return [...(byDay ?? [])];
}

function toProjectResult(result: ReturnType<typeof projectStock>): ProjectResult {
  return [result.firstStockOut, result.firstBelowSafety, result.minStock];
}

function toAnalysisInput({ input }: Pick<ProjectionVector, 'input'>): AnalysisInput {
  return {
    materials: input.materials.map((m) => ({
      materialId: materialId(m.materialId),
      description: '',
      mainSupplierId: m.mainSupplierId === null ? null : supplierId(m.mainSupplierId),
      onHand: m.onHand,
      safetyStock: m.safetyStock,
      unit: null,
    })),
    openPurchaseOrders: input.openPurchaseOrders.map((po) => ({
      poId: poId(po.poId),
      materialId: materialId(po.materialId),
      supplierId: supplierId(po.supplierId),
      qty: po.qty,
      promisedDate: d(po.promisedDate),
    })),
    demand: input.demand.map((line) => ({
      materialId: materialId(line.materialId),
      date: d(line.date),
      qty: line.qty,
    })),
    supplierHistory: input.supplierHistory.map(toDeliveryRecord),
    suppliers: input.suppliers.map((s) => ({ supplierId: supplierId(s.supplierId), name: s.name })),
  };
}

function toExceptionRows(report: Report): ExceptionRow[] {
  return report.exceptions.map((e) => [
    e.materialId,
    e.severity,
    e.criticalDate,
    e.erpViewDate,
    e.daysUntil,
    e.hidden,
    e.minProjectedStock,
    e.safetyStock,
    e.score,
  ]);
}

/** Adjacent exceptions of different materials with equal scores, where file order decides. */
function tiesBetweenMaterials(rows: readonly ExceptionRow[]): number {
  return rows.filter((row, i) => {
    const previous = rows[i - 1];
    return previous?.[8] === row[8] && previous[0] !== row[0];
  }).length;
}

describe('CPython parity vectors', () => {
  it('cover every helper with a meaningful number of cases', () => {
    expect(addWorkdaysVectors.length).toBeGreaterThan(250);
    expect(betweenVectors.length).toBeGreaterThan(250);
    expect(calendarVectors.length).toBeGreaterThan(100);
    expect(roundVectors.length).toBeGreaterThan(2000);
    expect(percentileVectors.length).toBeGreaterThan(100);
    expect(supplierStatsVectors.length).toBeGreaterThan(50);
    expect(projectVectors.length).toBeGreaterThan(100);
    expect(projectionVectors.length).toBeGreaterThan(40);
    // sample_data_de loads to the same projection input; the generator asserts that instead.
    expect(projectionVectors.map((v) => v.name)).toContain('sample_data');
    expect(rankingVectors.length).toBeGreaterThan(30);
    // The ranking vectors exist to reach these cases; fail loudly if a regeneration loses them.
    const rows = analyseVectors.flatMap((v) => v.exceptions);
    expect(rows.filter((r) => r[1] === 'WARNING').length).toBeGreaterThan(20);
    expect(rows.filter((r) => r[5] && r[3] === null).length).toBeGreaterThan(20);
    expect(rows.filter((r) => r[5] && r[3] !== null).length).toBeGreaterThan(5);
    expect(rows.filter((r) => !Number.isInteger(r[8])).length).toBeGreaterThan(20);
    const ties = analyseVectors.reduce((n, v) => n + tiesBetweenMaterials(v.exceptions), 0);
    expect(ties).toBeGreaterThan(5);
    // Every explanation rule, including the combinations the backlog names, is reached.
    const texts = analyseVectors.flatMap((v) => v.explanations);
    const why = texts.flatMap(([w]) => w.split('; '));
    const next = texts.flatMap(([, n]) => n.split('; '));
    const count = (parts: string[], fragment: string) =>
      parts.filter((p) => p.includes(fragment)).length;
    expect(texts.length).toBe(rows.length);
    expect(count(why, 'no open purchase order')).toBeGreaterThan(20);
    expect(count(why, 'already AFTER')).toBeGreaterThan(20);
    expect(count(why, 'working day(s) late')).toBeGreaterThan(20);
    expect(count(why, 'low confidence')).toBeGreaterThan(10);
    expect(count(why, 'problem only from')).toBeGreaterThan(5);
    expect(count(why, 'no problem at all')).toBeGreaterThan(20);
    expect(count(next, 'Place an order now with ?')).toBeGreaterThan(5);
    expect(count(next, 'Place an order now with')).toBeGreaterThan(20);
    expect(count(next, 'pull')).toBeGreaterThan(20);
    expect(count(next, 'Expedite')).toBeGreaterThan(20);
    expect(count(next, 'Increase order quantity')).toBeGreaterThan(10);
    // Late but arriving before the critical date: a PO_LATE reason without EXPEDITE.
    expect(count(why, 'working day(s) late')).toBeGreaterThan(count(next, 'Expedite'));
  });

  it('addWorkdays matches add_workdays', () => {
    const mismatches = addWorkdaysVectors.filter(
      ([from, n, expected]) => addWorkdays(d(from), n) !== expected,
    );
    expect(mismatches).toEqual([]);
  });

  it('workdaysBetween matches workdays_between', () => {
    const mismatches = betweenVectors.filter(
      ([a, b, expected]) => !Object.is(workdaysBetween(d(a), d(b)), expected),
    );
    expect(mismatches).toEqual([]);
  });

  it('weekday, addDays and diffDays match date.weekday(), timedelta and (b - a).days', () => {
    const mismatches = calendarVectors.filter(
      ([date, wd, n, shifted, other, diff]) =>
        weekday(d(date)) !== wd ||
        addDays(d(date), n) !== shifted ||
        diffDays(d(date), d(other)) !== diff,
    );
    expect(mismatches).toEqual([]);
  });

  it('pyRound matches round() bit for bit, including the sign of zero', () => {
    const mismatches = roundVectors.filter(([x, ndigits, expected]) => {
      const actual = ndigits === null ? pyRound(x) : pyRound(x, ndigits);
      return !Object.is(actual, expected);
    });
    expect(mismatches).toEqual([]);
  });

  it('percentile matches percentile', () => {
    const mismatches = percentileVectors.filter(
      ([values, p, expected]) => !Object.is(percentile(values, p), expected),
    );
    expect(mismatches).toEqual([]);
  });

  it.each(supplierStatsVectors.map((v) => [v.name, v] as const))(
    'computeSupplierStats matches supplier_stats (%s)',
    (_name, { history, minReliableDeliveries, expected }) => {
      const actual = computeSupplierStats(history.map(toDeliveryRecord), {
        minReliableDeliveries,
      });
      // Exact equality, including float bits of mean and on-time rate and the Python order.
      expect(actual).toEqual(expected);
    },
  );

  it('projectStock matches project, including float bits of the minimum stock', () => {
    const actual = projectVectors.map((v) =>
      toProjectResult(
        projectStock({
          onHand: v.onHand,
          demandByDay: toDays(v.demandByDay),
          receiptsByDay: toDays(v.receiptsByDay),
          asOf: d(v.asOf),
          horizonDays: v.horizonDays,
          safetyStock: v.safetyStock,
        }),
      ),
    );
    expect(actual).toEqual(projectVectors.map((v) => v.expected));
  });

  describe.each(projectionVectors.map((v) => [v.name, v] as const))(
    'receipts and projection match analyse (%s)',
    (_name, vector) => {
      const input = toAnalysisInput(vector);
      const options = { asOf: d(vector.asOf), horizonDays: vector.horizonDays };
      const receipts = buildReceipts(
        input.openPurchaseOrders,
        statsBySupplier(computeSupplierStats(input.supplierHistory)),
      );
      const demand = demandByMaterial(input.demand);

      it('buildReceipts and demandByMaterial give the same daily totals in the same order', () => {
        const actual = vector.expected.map(({ materialId: id }) => {
          const schedule = receipts.get(materialId(id));
          return {
            demandByDay: toEntries(demand.get(materialId(id))),
            erpReceipts: toEntries(schedule?.erp),
            realisticReceipts: toEntries(schedule?.realistic),
          };
        });
        expect(actual).toEqual(
          vector.expected.map(({ demandByDay, erpReceipts, realisticReceipts }) => ({
            demandByDay,
            erpReceipts,
            realisticReceipts,
          })),
        );
      });

      it('projectStock gives the same result per material row in both views', () => {
        const actual = input.materials.map((m) => {
          const schedule = receipts.get(m.materialId);
          const project = (receiptsByDay: DailyQuantities | undefined) =>
            toProjectResult(
              projectStock({
                onHand: m.onHand,
                demandByDay: demand.get(m.materialId) ?? new Map(),
                receiptsByDay: receiptsByDay ?? new Map(),
                safetyStock: m.safetyStock,
                ...options,
              }),
            );
          return { erp: project(schedule?.erp), realistic: project(schedule?.realistic) };
        });
        expect(actual).toEqual(vector.expected.map(({ erp, realistic }) => ({ erp, realistic })));
      });

      it('projectionSeries gives the same daily points (first row per material)', () => {
        const firstRows = vector.expected.filter(
          (row, i) => vector.expected.findIndex((r) => r.materialId === row.materialId) === i,
        );
        for (const row of firstRows) {
          const series = projectionSeries(input, materialId(row.materialId), options);
          const points = series.points.map((p) => [
            p.date,
            p.demand,
            p.erpReceipts,
            p.realisticReceipts,
            p.erpStock,
            p.realisticStock,
          ]);
          expect(points).toEqual(row.points);
        }
      });
    },
  );

  it.each(analyseVectors.map((v) => [v.name, v] as const))(
    'analyse gives the same exceptions, severities, hidden flags, scores and order (%s)',
    (_name, vector) => {
      const report = analyse(toAnalysisInput(vector), {
        asOf: d(vector.asOf),
        horizonDays: vector.horizonDays,
      });
      // Exact equality (Object.is per number), in the prototype's ranked order.
      expect(toExceptionRows(report)).toEqual(vector.exceptions);
      const names = supplierNames(toAnalysisInput(vector).suppliers);
      expect(report.exceptions.map((e) => prototypeText(e, names))).toEqual(vector.explanations);
      const critical = vector.exceptions.filter((r) => r[1] === 'CRITICAL').length;
      expect(report.summary).toEqual({
        critical,
        warning: vector.exceptions.length - critical,
        hidden: vector.exceptions.filter((r) => r[5]).length,
      });
    },
  );
});
