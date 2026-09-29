import { describe, expect, expectTypeOf, it } from 'vitest';

import { parseIsoDate, type IsoDate } from './dates.ts';
import { materialId, poId, supplierId } from './ids.ts';
import type {
  Action,
  AnalysisInput,
  AnalysisOptions,
  Reason,
  Report,
  ShortageException,
} from './types.ts';

function d(input: string): IsoDate {
  const result = parseIsoDate(input);
  if (!result.ok) throw new Error(`invalid test date ${input}`);
  return result.value;
}

describe('engine contract types', () => {
  it('describe plain data that survives a JSON round trip (Worker and Phase 2 HTTP boundary)', () => {
    const exception: ShortageException = {
      materialId: materialId('M0030'),
      description: 'Hydraulikventil',
      mainSupplierId: supplierId('S03'),
      severity: 'CRITICAL',
      criticalDate: d('2026-10-13'),
      erpViewDate: d('2026-10-23'),
      daysUntil: 8,
      minProjectedStock: -60,
      safetyStock: 20,
      hidden: true,
      score: 122,
      reasons: [
        {
          code: 'PO_LATE',
          poId: poId('PO1'),
          promisedDate: d('2026-10-09'),
          supplierId: supplierId('S03'),
          delayDays: 3,
          onTimeRate: 0.25,
          lowConfidence: false,
          deliveries: 8,
        },
        { code: 'HIDDEN_ERP_LATER', erpViewDate: d('2026-10-23') },
      ],
      actions: [{ code: 'EXPEDITE', poId: poId('PO1'), before: d('2026-10-13') }],
    };
    const report: Report = {
      asOf: d('2026-10-05'),
      horizonDays: 28,
      summary: { critical: 1, warning: 0, hidden: 1 },
      exceptions: [exception],
      supplierStats: [],
    };
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('model reasons and actions as discriminated unions on `code`', () => {
    expectTypeOf<Reason['code']>().toEqualTypeOf<
      'NO_OPEN_PO' | 'PO_AFTER_CRITICAL' | 'PO_LATE' | 'HIDDEN_ERP_LATER' | 'HIDDEN_ERP_NONE'
    >();
    expectTypeOf<Action['code']>().toEqualTypeOf<
      'PLACE_ORDER' | 'PULL_FORWARD' | 'EXPEDITE' | 'REVIEW_QTY_OR_DEMAND'
    >();
    expectTypeOf<Extract<Reason, { code: 'PO_LATE' }>['delayDays']>().toEqualTypeOf<number>();
  });

  it('require asOf as input (no clock) and keep minReliableDeliveries optional', () => {
    expectTypeOf<AnalysisOptions['asOf']>().toEqualTypeOf<IsoDate>();
    expectTypeOf<{ asOf: IsoDate; horizonDays: number }>().toExtend<AnalysisOptions>();
    expectTypeOf<AnalysisInput['materials'][number]['materialId']>().not.toEqualTypeOf<string>();
  });
});
