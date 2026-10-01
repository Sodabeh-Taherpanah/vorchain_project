'use client';

import type { Action, IsoDate, Reason, SupplierId } from '@vorchain/engine';
import { useLocale, useTranslations } from 'next-intl';

import { formatIsoDate } from './analysis-settings-model.ts';

/** Supplier ID to display name; falls back to the ID when the suppliers table lacks it. */
export type SupplierName = (id: SupplierId) => string;

export function supplierNameLookup(names: Readonly<Record<string, string>>): SupplierName {
  // Own keys only: the IDs come from the user's file, and `constructor` or `toString` must not
  // resolve to `Object.prototype` members.
  return (id) => (Object.hasOwn(names, id) ? (names[id] ?? id) : id);
}

/** Plain-text renderers for reasons and actions, shared by the table and the CSV export. */
export interface ExplanationText {
  readonly reason: (reason: Reason) => string;
  readonly action: (action: Action) => string;
}

/**
 * Localized sentences for reason and action codes (spec §5.2 step 9). The engine holds codes and
 * parameters only; every code has a `de` and `en` message (`explanation-text.test.tsx`).
 */
export function useExplanationText(supplierName: SupplierName): ExplanationText {
  const tReason = useTranslations('demo.report.reasons');
  const tAction = useTranslations('demo.report.actions');
  const locale = useLocale();
  const date = (value: IsoDate) => formatIsoDate(value, locale);

  function renderReason(reason: Reason): string {
    switch (reason.code) {
      case 'NO_OPEN_PO':
      case 'HIDDEN_ERP_NONE':
        return tReason(reason.code);
      case 'PO_AFTER_CRITICAL':
        return tReason('PO_AFTER_CRITICAL', {
          poId: reason.poId,
          promised: date(reason.promisedDate),
        });
      case 'PO_LATE': {
        const late = tReason('PO_LATE', {
          poId: reason.poId,
          promised: date(reason.promisedDate),
          supplier: supplierName(reason.supplierId),
          days: reason.delayDays,
          rate: reason.onTimeRate,
        });
        return reason.lowConfidence
          ? `${late} ${tReason('PO_LATE_LOW_CONFIDENCE', { deliveries: reason.deliveries })}`
          : late;
      }
      case 'HIDDEN_ERP_LATER':
        return tReason('HIDDEN_ERP_LATER', { erpDate: date(reason.erpViewDate) });
      case 'PO_OVERDUE':
        return tReason('PO_OVERDUE', {
          poId: reason.poId,
          promised: date(reason.promisedDate),
          realistic: date(reason.realisticDate),
        });
    }
  }

  function renderAction(action: Action): string {
    switch (action.code) {
      case 'PLACE_ORDER':
        return action.supplierId === null
          ? tAction('PLACE_ORDER', { known: 'no', supplier: '' })
          : tAction('PLACE_ORDER', { known: 'yes', supplier: supplierName(action.supplierId) });
      case 'PULL_FORWARD':
        return tAction('PULL_FORWARD', {
          supplier: supplierName(action.supplierId),
          poId: action.poId,
          before: date(action.before),
        });
      case 'EXPEDITE':
        return tAction('EXPEDITE', { poId: action.poId, before: date(action.before) });
      case 'REVIEW_QTY_OR_DEMAND':
        return tAction('REVIEW_QTY_OR_DEMAND');
    }
  }

  return { reason: renderReason, action: renderAction };
}

/** One localized sentence for a reason code. */
export function ReasonText({
  reason,
  supplierName,
}: {
  readonly reason: Reason;
  readonly supplierName: SupplierName;
}) {
  return useExplanationText(supplierName).reason(reason);
}

/** One localized sentence for an action code. */
export function ActionText({
  action,
  supplierName,
}: {
  readonly action: Action;
  readonly supplierName: SupplierName;
}) {
  return useExplanationText(supplierName).action(action);
}
