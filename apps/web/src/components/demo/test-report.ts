/** Hand-made reports for component tests; the real engine output is covered by the e2e suite. */
import {
  materialId,
  poId,
  supplierId,
  type IsoDate,
  type Report,
  type ShortageException,
} from '@vorchain/engine';

const date = (value: string) => value as IsoDate;

export const overdueReason = {
  code: 'PO_OVERDUE',
  poId: poId('PO9'),
  promisedDate: date('2026-10-02'),
  supplierId: supplierId('S01'),
  realisticDate: date('2026-10-06'),
} as const;

export function exception(
  id: string,
  overrides: Partial<ShortageException> = {},
): ShortageException {
  return {
    materialId: materialId(id),
    description: `Teil ${id}`,
    mainSupplierId: supplierId('S01'),
    severity: 'WARNING',
    criticalDate: date('2026-10-20'),
    erpViewDate: date('2026-10-20'),
    daysUntil: 15,
    minProjectedStock: 5,
    safetyStock: 10,
    hidden: false,
    score: 50,
    reasons: [{ code: 'NO_OPEN_PO' }],
    actions: [{ code: 'PLACE_ORDER', supplierId: supplierId('S01') }],
    ...overrides,
  };
}

export function testReport(overrides: Partial<Report> = {}): Report {
  const exceptions = [
    exception('M0011', {
      severity: 'CRITICAL',
      criticalDate: date('2026-10-08'),
      daysUntil: 3,
      minProjectedStock: -1380.5,
    }),
    exception('M0030', {
      severity: 'CRITICAL',
      criticalDate: date('2026-10-13'),
      erpViewDate: date('2026-10-23'),
      hidden: true,
      reasons: [{ code: 'HIDDEN_ERP_LATER', erpViewDate: date('2026-10-23') }],
    }),
  ];
  return {
    asOf: date('2026-10-05'),
    horizonDays: 28,
    summary: { critical: 2, warning: 0, hidden: 1, overduePurchaseOrders: 0 },
    exceptions,
    supplierStats: [],
    overduePurchaseOrders: [],
    ...overrides,
  };
}
