/**
 * Structured explanations (spec §5.2 step 9), ported from the `why` / `action` block in `analyse`
 * in `reference/python-prototype/shortage_radar.py`. The engine returns codes and parameters only;
 * the UI renders them per locale (AGENTS.md §2.3, ADR-0005). No display text lives here.
 */
import type { PoId, SupplierId } from './ids.ts';
import type { ShortageFinding } from './ranking.ts';
import { realisticReceiptDate, type SupplierStatsMap } from './receipts.ts';
import type { Action, ActionCode, PurchaseOrder, Reason, ReasonCode } from './types.ts';

/** Every reason code, for exhaustiveness checks of i18n messages in the UI. */
export const REASON_CODES = [
  'NO_OPEN_PO',
  'PO_AFTER_CRITICAL',
  'PO_LATE',
  'HIDDEN_ERP_LATER',
  'HIDDEN_ERP_NONE',
] as const satisfies readonly ReasonCode[];

/** Every action code, for exhaustiveness checks of i18n messages in the UI. */
export const ACTION_CODES = [
  'PLACE_ORDER',
  'PULL_FORWARD',
  'EXPEDITE',
  'REVIEW_QTY_OR_DEMAND',
] as const satisfies readonly ActionCode[];

/** Everything the rules need about one material that has an exception. */
export interface ShortageContext {
  /** The material's main supplier, for `PLACE_ORDER`; `null` when unknown. */
  readonly mainSupplierId: SupplierId | null;
  /** The material's open POs in PO-file order (ADR-0005 item 8). */
  readonly purchaseOrders: readonly PurchaseOrder[];
  readonly stats: SupplierStatsMap;
  readonly finding: ShortageFinding;
}

/** Why a material is at risk and what to do next, in the prototype's order. */
export interface Explanation {
  readonly reasons: readonly Reason[];
  readonly actions: readonly Action[];
}

/**
 * Explains one exception with the prototype's rules, in its order:
 *
 * 1. No open PO: `NO_OPEN_PO` and `PLACE_ORDER` with the main supplier.
 * 2. For each PO in file order: promised on or after the critical date (even beyond the horizon)
 *    gives `PO_AFTER_CRITICAL` and `PULL_FORWARD`; otherwise a supplier P80 delay above 0 gives
 *    `PO_LATE` and, if the delayed date is on or after the critical date, `EXPEDITE`.
 * 3. Hidden risk: `HIDDEN_ERP_LATER` or `HIDDEN_ERP_NONE`.
 * 4. No action so far: `REVIEW_QTY_OR_DEMAND`, so every exception has at least one action.
 *
 * A PO from a supplier without usable history has delay 0, so it gives no entry (ADR-0005 item 9).
 */
export function explainShortage(context: ShortageContext): Explanation {
  const { mainSupplierId, purchaseOrders, finding } = context;
  const reasons: Reason[] = [];
  const actions: Action[] = [];
  if (purchaseOrders.length === 0) {
    reasons.push({ code: 'NO_OPEN_PO' });
    actions.push({ code: 'PLACE_ORDER', supplierId: mainSupplierId });
  }
  for (const order of purchaseOrders) {
    const entries = explainPurchaseOrder(order, context);
    reasons.push(...entries.reasons);
    actions.push(...entries.actions);
  }
  if (finding.hidden) reasons.push(hiddenReason(finding));
  if (actions.length === 0) actions.push({ code: 'REVIEW_QTY_OR_DEMAND' });
  return { reasons, actions };
}

function explainPurchaseOrder(
  order: PurchaseOrder,
  { stats, finding: { criticalDate } }: ShortageContext,
): Explanation {
  // IsoDate strings are fixed-width `YYYY-MM-DD`, so string order is calendar order.
  if (order.promisedDate >= criticalDate) {
    return {
      reasons: [{ code: 'PO_AFTER_CRITICAL', poId: order.poId, promisedDate: order.promisedDate }],
      actions: [
        {
          code: 'PULL_FORWARD',
          supplierId: order.supplierId,
          poId: order.poId,
          before: criticalDate,
        },
      ],
    };
  }
  // An unknown supplier has delay 0 (ADR-0005 item 9), so only known suppliers get this far.
  const supplier = stats.get(order.supplierId);
  if (supplier === undefined || supplier.p80DelayDays <= 0) return { reasons: [], actions: [] };

  const late: Reason = {
    code: 'PO_LATE',
    poId: order.poId,
    promisedDate: order.promisedDate,
    supplierId: order.supplierId,
    delayDays: supplier.p80DelayDays,
    onTimeRate: supplier.onTimeRate,
    lowConfidence: !supplier.reliable,
    deliveries: supplier.deliveries,
  };
  const arrivesTooLate = realisticReceiptDate(order, stats) >= criticalDate;
  return {
    reasons: [late],
    actions: arrivesTooLate ? [{ code: 'EXPEDITE', poId: order.poId, before: criticalDate }] : [],
  };
}

function hiddenReason({ erpViewDate }: ShortageFinding): Reason {
  return erpViewDate === null
    ? { code: 'HIDDEN_ERP_NONE' }
    : { code: 'HIDDEN_ERP_LATER', erpViewDate };
}

/**
 * The PO a reason or action is about, or `null`, e.g. to mark POs in the detail chart. The
 * exhaustive `switch` fails to compile when a new code is added without a case here.
 */
export function explanationPoId(entry: Reason | Action): PoId | null {
  switch (entry.code) {
    case 'PO_AFTER_CRITICAL':
    case 'PO_LATE':
    case 'PULL_FORWARD':
    case 'EXPEDITE':
      return entry.poId;
    case 'NO_OPEN_PO':
    case 'HIDDEN_ERP_LATER':
    case 'HIDDEN_ERP_NONE':
    case 'PLACE_ORDER':
    case 'REVIEW_QTY_OR_DEMAND':
      return null;
    default:
      return entry satisfies never;
  }
}
