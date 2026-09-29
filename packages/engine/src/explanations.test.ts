import { describe, expect, expectTypeOf, it } from 'vitest';

import { parseIsoDate, type IsoDate } from './dates.ts';
import * as explanations from './explanations.ts';
import {
  ACTION_CODES,
  explainShortage,
  explanationPoId,
  REASON_CODES,
  type ShortageContext,
} from './explanations.ts';
import { materialId, poId, supplierId } from './ids.ts';
import type { SupplierStatsMap } from './receipts.ts';
import type { ShortageFinding } from './ranking.ts';
import type { Action, PurchaseOrder, Reason, SupplierStats } from './types.ts';

function d(input: string): IsoDate {
  const result = parseIsoDate(input);
  if (!result.ok) throw new Error(`invalid test date ${input}`);
  return result.value;
}

// asOf is Mon 2026-10-05; the critical date is Mon 2026-10-12 in every case below.
const CRITICAL = d('2026-10-12');

function stats(id: string, p80: number, deliveries = 5, onTimeRate = 0.25): SupplierStats {
  return {
    supplierId: supplierId(id),
    meanDelayDays: p80,
    p80DelayDays: p80,
    onTimeRate,
    deliveries,
    reliable: deliveries >= 3,
  };
}

const STATS: SupplierStatsMap = new Map(
  [
    stats('ONTIME', 0, 5, 1),
    stats('LATE1', 1),
    stats('LATE3', 3),
    stats('LATE5', 5, 8, 0.125),
    stats('FEW', 3, 2, 0.5),
  ].map((s) => [s.supplierId, s]),
);

function order(id: string, supplier: string, promised: string): PurchaseOrder {
  return {
    poId: poId(id),
    materialId: materialId('M1'),
    supplierId: supplierId(supplier),
    qty: 10,
    promisedDate: d(promised),
  };
}

const NOT_HIDDEN: ShortageFinding = {
  severity: 'CRITICAL',
  criticalDate: CRITICAL,
  erpViewDate: CRITICAL,
  hidden: false,
};

function context(parts: Partial<ShortageContext>): ShortageContext {
  return {
    mainSupplierId: supplierId('MAIN'),
    purchaseOrders: [],
    stats: STATS,
    finding: NOT_HIDDEN,
    ...parts,
  };
}

const REVIEW: Action = { code: 'REVIEW_QTY_OR_DEMAND' };

describe('explainShortage: one table row per rule and combination (prototype why/next action)', () => {
  it.each<{ name: string; context: ShortageContext; reasons: Reason[]; actions: Action[] }>([
    {
      name: 'no open PO: order from the main supplier',
      context: context({}),
      reasons: [{ code: 'NO_OPEN_PO' }],
      actions: [{ code: 'PLACE_ORDER', supplierId: supplierId('MAIN') }],
    },
    {
      name: 'no open PO and unknown main supplier: supplierId null (prototype prints "?")',
      context: context({ mainSupplierId: null }),
      reasons: [{ code: 'NO_OPEN_PO' }],
      actions: [{ code: 'PLACE_ORDER', supplierId: null }],
    },
    {
      name: 'PO promised on the critical date counts as after it (promised >= critical)',
      context: context({ purchaseOrders: [order('P1', 'ONTIME', '2026-10-12')] }),
      reasons: [{ code: 'PO_AFTER_CRITICAL', poId: poId('P1'), promisedDate: CRITICAL }],
      actions: [
        {
          code: 'PULL_FORWARD',
          supplierId: supplierId('ONTIME'),
          poId: poId('P1'),
          before: CRITICAL,
        },
      ],
    },
    {
      name: 'PO after the critical date and beyond the horizon still counts',
      context: context({ purchaseOrders: [order('P1', 'LATE3', '2027-03-01')] }),
      reasons: [{ code: 'PO_AFTER_CRITICAL', poId: poId('P1'), promisedDate: d('2027-03-01') }],
      actions: [
        {
          code: 'PULL_FORWARD',
          supplierId: supplierId('LATE3'),
          poId: poId('P1'),
          before: CRITICAL,
        },
      ],
    },
    {
      name: 'late PO whose realistic date reaches the critical date: late + expedite',
      // Wed 10-07 + 3 working days = Mon 10-12 = critical date (realistic >= critical).
      context: context({ purchaseOrders: [order('P1', 'LATE3', '2026-10-07')] }),
      reasons: [
        {
          code: 'PO_LATE',
          poId: poId('P1'),
          promisedDate: d('2026-10-07'),
          supplierId: supplierId('LATE3'),
          delayDays: 3,
          onTimeRate: 0.25,
          lowConfidence: false,
          deliveries: 5,
        },
      ],
      actions: [{ code: 'EXPEDITE', poId: poId('P1'), before: CRITICAL }],
    },
    {
      name: 'late PO arriving before the critical date: late, no expedite, default action',
      // Tue 10-06 + 1 working day = Wed 10-07 < critical date.
      context: context({ purchaseOrders: [order('P1', 'LATE1', '2026-10-06')] }),
      reasons: [
        {
          code: 'PO_LATE',
          poId: poId('P1'),
          promisedDate: d('2026-10-06'),
          supplierId: supplierId('LATE1'),
          delayDays: 1,
          onTimeRate: 0.25,
          lowConfidence: false,
          deliveries: 5,
        },
      ],
      actions: [REVIEW],
    },
    {
      name: 'late PO from a supplier with only 2 deliveries: low confidence',
      context: context({ purchaseOrders: [order('P1', 'FEW', '2026-10-08')] }),
      reasons: [
        {
          code: 'PO_LATE',
          poId: poId('P1'),
          promisedDate: d('2026-10-08'),
          supplierId: supplierId('FEW'),
          delayDays: 3,
          onTimeRate: 0.5,
          lowConfidence: true,
          deliveries: 2,
        },
      ],
      actions: [{ code: 'EXPEDITE', poId: poId('P1'), before: CRITICAL }],
    },
    {
      name: 'on-time PO before the critical date: no reason, default action',
      context: context({ purchaseOrders: [order('P1', 'ONTIME', '2026-10-06')] }),
      reasons: [],
      actions: [REVIEW],
    },
    {
      name: 'PO from an unknown supplier: delay 0, so no reason (ADR-0005 item 9)',
      context: context({ purchaseOrders: [order('P1', 'UNKNOWN', '2026-10-06')] }),
      reasons: [],
      actions: [REVIEW],
    },
    {
      name: 'overdue PO from a late supplier is explained like any late PO (prototype)',
      context: context({ purchaseOrders: [order('P1', 'LATE5', '2026-10-02')] }),
      reasons: [
        {
          code: 'PO_LATE',
          poId: poId('P1'),
          promisedDate: d('2026-10-02'),
          supplierId: supplierId('LATE5'),
          delayDays: 5,
          onTimeRate: 0.125,
          lowConfidence: false,
          deliveries: 8,
        },
      ],
      actions: [REVIEW], // Fri 10-02 + 5 working days = Fri 10-09 < critical date
    },
    {
      name: 'hidden, ERP view shows the problem later',
      context: context({
        mainSupplierId: null,
        finding: { ...NOT_HIDDEN, erpViewDate: d('2026-10-20'), hidden: true },
      }),
      reasons: [{ code: 'NO_OPEN_PO' }, { code: 'HIDDEN_ERP_LATER', erpViewDate: d('2026-10-20') }],
      actions: [{ code: 'PLACE_ORDER', supplierId: null }],
    },
    {
      name: 'hidden, ERP view shows no problem',
      context: context({
        purchaseOrders: [order('P1', 'ONTIME', '2026-10-06')],
        finding: { ...NOT_HIDDEN, severity: 'WARNING', erpViewDate: null, hidden: true },
      }),
      reasons: [{ code: 'HIDDEN_ERP_NONE' }],
      actions: [REVIEW],
    },
    {
      name: 'several POs: entries follow PO-file order, the hidden reason comes last',
      context: context({
        purchaseOrders: [
          order('P9', 'LATE3', '2026-10-14'),
          order('P2', 'LATE1', '2026-10-06'),
          order('P5', 'LATE3', '2026-10-08'),
          order('P1', 'ONTIME', '2026-10-06'),
        ],
        finding: { ...NOT_HIDDEN, erpViewDate: null, hidden: true },
      }),
      reasons: [
        { code: 'PO_AFTER_CRITICAL', poId: poId('P9'), promisedDate: d('2026-10-14') },
        {
          code: 'PO_LATE',
          poId: poId('P2'),
          promisedDate: d('2026-10-06'),
          supplierId: supplierId('LATE1'),
          delayDays: 1,
          onTimeRate: 0.25,
          lowConfidence: false,
          deliveries: 5,
        },
        {
          code: 'PO_LATE',
          poId: poId('P5'),
          promisedDate: d('2026-10-08'),
          supplierId: supplierId('LATE3'),
          delayDays: 3,
          onTimeRate: 0.25,
          lowConfidence: false,
          deliveries: 5,
        },
        { code: 'HIDDEN_ERP_NONE' },
      ],
      // No default action: P9 and P5 already gave one.
      actions: [
        {
          code: 'PULL_FORWARD',
          supplierId: supplierId('LATE3'),
          poId: poId('P9'),
          before: CRITICAL,
        },
        { code: 'EXPEDITE', poId: poId('P5'), before: CRITICAL },
      ],
    },
  ])('$name', ({ context: input, reasons, actions }) => {
    expect(explainShortage(input)).toEqual({ reasons, actions });
  });
});

describe('explanation codes', () => {
  it('list every reason and action code exactly once', () => {
    expectTypeOf<(typeof REASON_CODES)[number]>().toEqualTypeOf<Reason['code']>();
    expectTypeOf<(typeof ACTION_CODES)[number]>().toEqualTypeOf<Action['code']>();
    expect(new Set(REASON_CODES).size).toBe(REASON_CODES.length);
    expect(new Set(ACTION_CODES).size).toBe(ACTION_CODES.length);
  });

  it('explanationPoId returns the PO an entry is about, or null', () => {
    const late = explainShortage(context({ purchaseOrders: [order('P1', 'LATE3', '2026-10-07')] }));
    expect([...late.reasons, ...late.actions].map(explanationPoId)).toEqual(['P1', 'P1']);
    expect(explanationPoId({ code: 'NO_OPEN_PO' })).toBeNull();
    expect(explanationPoId({ code: 'HIDDEN_ERP_NONE' })).toBeNull();
    expect(explanationPoId({ code: 'HIDDEN_ERP_LATER', erpViewDate: CRITICAL })).toBeNull();
    expect(explanationPoId({ code: 'PLACE_ORDER', supplierId: null })).toBeNull();
    expect(explanationPoId(REVIEW)).toBeNull();
    expect(
      explanationPoId({ code: 'PO_AFTER_CRITICAL', poId: poId('P7'), promisedDate: CRITICAL }),
    ).toBe('P7');
    expect(
      explanationPoId({
        code: 'PULL_FORWARD',
        supplierId: supplierId('S'),
        poId: poId('P8'),
        before: CRITICAL,
      }),
    ).toBe('P8');
  });

  it('an exhaustive switch over the codes fails to compile when a case is missing', () => {
    function incomplete(reason: Reason): string {
      switch (reason.code) {
        case 'NO_OPEN_PO':
          return 'covered';
        default:
          // @ts-expect-error: the other reason codes are not handled, so `reason` is not `never`.
          return reason satisfies never;
      }
    }
    expect(incomplete({ code: 'NO_OPEN_PO' })).toBe('covered');
  });

  it('the module holds no display text: its only exported strings are codes (AC 3)', () => {
    const codes = new Set<string>([...REASON_CODES, ...ACTION_CODES]);
    const strings = Object.values(explanations).flatMap((value) =>
      Array.isArray(value) ? value : [value],
    );
    for (const value of strings) {
      if (typeof value === 'string') expect(codes).toContain(value);
    }
  });
});
