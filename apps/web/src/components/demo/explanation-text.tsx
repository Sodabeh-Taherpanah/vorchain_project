'use client';

import type { Action, IsoDate, Reason, SupplierId } from '@vorchain/engine';
import { useLocale, useTranslations } from 'next-intl';

import { formatIsoDate } from './analysis-settings-model.ts';

/** Supplier ID to display name; falls back to the ID when the suppliers table lacks it. */
export type SupplierName = (id: SupplierId) => string;

export function supplierNameLookup(names: Readonly<Record<string, string>>): SupplierName {
  return (id) => names[id] ?? id;
}

function useDate() {
  const locale = useLocale();
  return (date: IsoDate) => formatIsoDate(date, locale);
}

/**
 * One localized sentence for a reason code (spec §5.2 step 9). The engine holds codes and
 * parameters only; every code has a `de` and `en` message (`explanation-text.test.tsx`).
 */
export function ReasonText({
  reason,
  supplierName,
}: {
  readonly reason: Reason;
  readonly supplierName: SupplierName;
}) {
  const t = useTranslations('demo.report.reasons');
  const date = useDate();
  switch (reason.code) {
    case 'NO_OPEN_PO':
    case 'HIDDEN_ERP_NONE':
      return t(reason.code);
    case 'PO_AFTER_CRITICAL':
      return t('PO_AFTER_CRITICAL', { poId: reason.poId, promised: date(reason.promisedDate) });
    case 'PO_LATE': {
      const late = t('PO_LATE', {
        poId: reason.poId,
        promised: date(reason.promisedDate),
        supplier: supplierName(reason.supplierId),
        days: reason.delayDays,
        rate: reason.onTimeRate,
      });
      return reason.lowConfidence
        ? `${late} ${t('PO_LATE_LOW_CONFIDENCE', { deliveries: reason.deliveries })}`
        : late;
    }
    case 'HIDDEN_ERP_LATER':
      return t('HIDDEN_ERP_LATER', { erpDate: date(reason.erpViewDate) });
    case 'PO_OVERDUE':
      return t('PO_OVERDUE', {
        poId: reason.poId,
        promised: date(reason.promisedDate),
        realistic: date(reason.realisticDate),
      });
  }
}

/** One localized sentence for an action code (spec §5.2 step 9). */
export function ActionText({
  action,
  supplierName,
}: {
  readonly action: Action;
  readonly supplierName: SupplierName;
}) {
  const t = useTranslations('demo.report.actions');
  const date = useDate();
  switch (action.code) {
    case 'PLACE_ORDER':
      return action.supplierId === null
        ? t('PLACE_ORDER', { known: 'no', supplier: '' })
        : t('PLACE_ORDER', { known: 'yes', supplier: supplierName(action.supplierId) });
    case 'PULL_FORWARD':
      return t('PULL_FORWARD', {
        supplier: supplierName(action.supplierId),
        poId: action.poId,
        before: date(action.before),
      });
    case 'EXPEDITE':
      return t('EXPEDITE', { poId: action.poId, before: date(action.before) });
    case 'REVIEW_QTY_OR_DEMAND':
      return t('REVIEW_QTY_OR_DEMAND');
  }
}
