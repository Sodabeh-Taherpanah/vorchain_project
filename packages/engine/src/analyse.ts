/**
 * Public entry of the engine: one analysis run (spec §5.2), ported from `analyse` in
 * `reference/python-prototype/shortage_radar.py`. Explanations (`reasons`, `actions`) follow in
 * P1-05; until then they are empty.
 */
import { diffDays } from './dates.ts';
import type { DailyQuantities } from './daily-quantities.ts';
import type { MaterialId } from './ids.ts';
import {
  demandByMaterial,
  projectionWindow,
  projectOverWindow,
  type ProjectionWindow,
} from './projection.ts';
import { detectShortage, rankByScore, shortageScore } from './ranking.ts';
import { buildReceipts, type ReceiptSchedule } from './receipts.ts';
import { pyRound } from './rounding.ts';
import { computeSupplierStats, statsBySupplier } from './supplier-stats.ts';
import type {
  AnalysisInput,
  AnalysisOptions,
  Material,
  Report,
  ShortageException,
} from './types.ts';

const NO_QUANTITIES: DailyQuantities = new Map();

/** Everything shared by all materials of one run, built once. */
interface AnalysisContext {
  readonly options: AnalysisOptions;
  readonly window: ProjectionWindow;
  readonly demand: ReadonlyMap<MaterialId, DailyQuantities>;
  readonly receipts: ReadonlyMap<MaterialId, ReceiptSchedule>;
}

/**
 * Projects every material row in the ERP view and the realistic view and returns the ones that
 * run short in the realistic view within `[asOf, asOf + horizonDays)`, ranked by score.
 *
 * - Material rows are processed independently and in file order; a duplicated material gives
 *   one exception per row (ADR-0005 item 10).
 * - `exceptions` are sorted by `score` descending; ties keep materials-file order.
 * - `supplierStats` are in order of each supplier's first complete history row.
 * - The input is never mutated.
 *
 * @throws RangeError if `options.horizonDays` is not an integer (a programmer error).
 */
export function analyse(input: AnalysisInput, options: AnalysisOptions): Report {
  const supplierStats = computeSupplierStats(input.supplierHistory, options);
  const context: AnalysisContext = {
    options,
    // Built once: rebuilding the window per projection dominated the run time at 20k materials.
    window: projectionWindow(options.asOf, options.horizonDays),
    demand: demandByMaterial(input.demand),
    receipts: buildReceipts(input.openPurchaseOrders, statsBySupplier(supplierStats)),
  };
  const exceptions = rankByScore(
    input.materials.flatMap((material) => {
      const exception = materialException(material, context);
      return exception === null ? [] : [exception];
    }),
  );
  return {
    asOf: options.asOf,
    horizonDays: options.horizonDays,
    summary: summarise(exceptions),
    exceptions,
    supplierStats,
  };
}

/** The exception for one material row, or `null` if its realistic view shows no problem. */
function materialException(
  material: Material,
  { options, window, demand, receipts }: AnalysisContext,
): ShortageException | null {
  const schedule = receipts.get(material.materialId);
  const view = {
    onHand: material.onHand,
    demandByDay: demand.get(material.materialId) ?? NO_QUANTITIES,
    safetyStock: material.safetyStock,
  };
  const erp = projectOverWindow(window, { ...view, receiptsByDay: schedule?.erp ?? NO_QUANTITIES });
  const realistic = projectOverWindow(window, {
    ...view,
    receiptsByDay: schedule?.realistic ?? NO_QUANTITIES,
  });
  const finding = detectShortage(erp, realistic);
  if (finding === null) return null;

  const daysUntil = diffDays(options.asOf, finding.criticalDate);
  return {
    materialId: material.materialId,
    description: material.description,
    mainSupplierId: material.mainSupplierId,
    severity: finding.severity,
    criticalDate: finding.criticalDate,
    erpViewDate: finding.erpViewDate,
    daysUntil,
    minProjectedStock: pyRound(realistic.minStock),
    safetyStock: pyRound(material.safetyStock),
    hidden: finding.hidden,
    score: shortageScore({
      horizonDays: options.horizonDays,
      daysUntil,
      safetyStock: material.safetyStock,
      minStock: realistic.minStock,
      hidden: finding.hidden,
      severity: finding.severity,
    }),
    reasons: [],
    actions: [],
  };
}

function summarise(exceptions: readonly ShortageException[]): Report['summary'] {
  const critical = exceptions.filter((e) => e.severity === 'CRITICAL').length;
  return {
    critical,
    warning: exceptions.length - critical,
    hidden: exceptions.filter((e) => e.hidden).length,
  };
}
