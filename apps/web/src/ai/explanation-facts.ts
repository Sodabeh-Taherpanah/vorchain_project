import type { Report, ShortageException } from '@vorchain/engine';

/**
 * The only data about a material that may leave the browser (ADR-0015): derived numbers, engine
 * codes and two short text lines (material name, supplier name). The shape is the `llm` package's
 * `ExplanationFacts`, which its strict schema checks again before any request is built; this
 * file stays free of `@vorchain/llm` so that package is only ever loaded after consent.
 */
export interface FactsForModel {
  readonly materialId: string;
  readonly materialName: string;
  readonly severity: 'CRITICAL' | 'WARNING';
  readonly asOf: string;
  readonly criticalDate: string;
  readonly erpViewDate: string | null;
  readonly daysUntil: number;
  readonly minProjectedStock: number;
  readonly safetyStock: number;
  readonly hidden: boolean;
  readonly reasonCodes: readonly string[];
  readonly actionCodes: readonly string[];
  readonly supplier: {
    readonly name: string;
    readonly p80DelayDays: number;
    readonly onTimeRate: number;
    readonly deliveries: number;
    readonly reliable: boolean;
  } | null;
}

const LINE_MAX = 80;
// eslint-disable-next-line no-control-regex -- one clean line: control characters become spaces
const CONTROL = /[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g;

/** One short line: the file's text is untrusted, so control characters go and the length is cut. */
function shortLine(text: string, fallback: string): string {
  const cleaned = text.replace(CONTROL, ' ').trim().slice(0, LINE_MAX).trim();
  return cleaned === '' ? fallback : cleaned;
}

export function toExplanationFacts(
  exception: ShortageException,
  report: Pick<Report, 'asOf' | 'supplierStats'>,
  supplierName: (id: string) => string,
): FactsForModel {
  const stats =
    exception.mainSupplierId === null
      ? undefined
      : report.supplierStats.find((s) => s.supplierId === exception.mainSupplierId);
  return {
    materialId: shortLine(exception.materialId, 'unknown'),
    materialName: shortLine(exception.description, exception.materialId),
    severity: exception.severity,
    asOf: report.asOf,
    criticalDate: exception.criticalDate,
    erpViewDate: exception.erpViewDate,
    daysUntil: exception.daysUntil,
    minProjectedStock: exception.minProjectedStock,
    safetyStock: exception.safetyStock,
    hidden: exception.hidden,
    reasonCodes: [...new Set(exception.reasons.map((r) => r.code))],
    actionCodes: [...new Set(exception.actions.map((a) => a.code))],
    supplier:
      stats === undefined || exception.mainSupplierId === null
        ? null
        : {
            name: shortLine(supplierName(exception.mainSupplierId), exception.mainSupplierId),
            p80DelayDays: stats.p80DelayDays,
            onTimeRate: stats.onTimeRate,
            deliveries: stats.deliveries,
            reliable: stats.reliable,
          },
  };
}
