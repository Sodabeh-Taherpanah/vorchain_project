/**
 * Test helper: renders reason and action codes with the prototype's English templates
 * (`TXT['en']` in `reference/python-prototype/shortage_radar.py`), so `python-vectors.test.ts` can
 * compare them with the `why` / `next_action` strings the prototype's `analyse` returned. The
 * engine itself holds no display text; the UI renders the codes via i18n (P1-17).
 */
import type { SupplierId } from '../ids.ts';
import { pyRound } from '../rounding.ts';
import type { Action, Reason, Supplier } from '../types.ts';

/** `suppliers.get(sid, sid)` in the prototype: the supplier's name, or its ID when unnamed. */
export type SupplierNames = (id: SupplierId) => string;

export function supplierNames(suppliers: readonly Supplier[]): SupplierNames {
  const names = new Map(suppliers.map((s) => [s.supplierId, s.name]));
  return (id) => names.get(id) ?? id;
}

/** Python `f"{r:.0%}"`: the rate times 100 (as a double), rounded half to even, plus `%`. */
function percent(rate: number): string {
  return `${String(pyRound(rate * 100))}%`;
}

/**
 * The prototype's text for one reason, or `null` for `PO_OVERDUE`: that code comes from ADR-0005
 * option B and has no prototype counterpart, so the parity comparison skips it on purpose.
 */
export function reasonText(reason: Reason, name: SupplierNames): string | null {
  switch (reason.code) {
    case 'NO_OPEN_PO':
      return 'no open purchase order covers the demand';
    case 'PO_AFTER_CRITICAL':
      return `${reason.poId} is promised for ${reason.promisedDate}, already AFTER the critical date`;
    case 'PO_LATE': {
      const late =
        `${reason.poId} promised ${reason.promisedDate}, but ${name(reason.supplierId)} is ` +
        `typically ${String(reason.delayDays)} working day(s) late ` +
        `(on-time rate ${percent(reason.onTimeRate)})`;
      const few = ` (only ${String(reason.deliveries)} past deliveries, low confidence)`;
      return reason.lowConfidence ? late + few : late;
    }
    case 'HIDDEN_ERP_LATER':
      return `ERP view (promised dates) shows the problem only from ${reason.erpViewDate}: hidden risk`;
    case 'HIDDEN_ERP_NONE':
      return 'ERP view (promised dates) shows no problem at all: hidden risk';
    case 'PO_OVERDUE':
      return null;
    default:
      return reason satisfies never;
  }
}

/** The prototype's text for one action. */
export function actionText(action: Action, name: SupplierNames): string {
  switch (action.code) {
    case 'PLACE_ORDER':
      // Python: `sname(sup) or "?"`, where a missing main supplier is `""`.
      return `Place an order now with ${(action.supplierId === null ? '' : name(action.supplierId)) || '?'}`;
    case 'PULL_FORWARD':
      return `Ask ${name(action.supplierId)} to pull ${action.poId} forward before ${action.before}, or source elsewhere`;
    case 'EXPEDITE':
      return `Expedite ${action.poId} / ask for partial delivery before ${action.before}`;
    case 'REVIEW_QTY_OR_DEMAND':
      return 'Increase order quantity or check the demand plan';
    default:
      return action satisfies never;
  }
}

/** `"; ".join(why)` and `"; ".join(action)`, skipping `PO_OVERDUE` (see `reasonText`). */
export function prototypeText(
  explanation: { readonly reasons: readonly Reason[]; readonly actions: readonly Action[] },
  name: SupplierNames,
): [why: string, nextAction: string] {
  const why = explanation.reasons.flatMap((r) => reasonText(r, name) ?? []);
  const next = explanation.actions.map((a) => actionText(a, name));
  return [why.join('; '), next.join('; ')];
}
