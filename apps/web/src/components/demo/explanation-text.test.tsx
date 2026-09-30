import { render } from '@testing-library/react';
import {
  ACTION_CODES,
  poId,
  REASON_CODES,
  supplierId,
  type Action,
  type IsoDate,
  type Reason,
} from '@vorchain/engine';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import { ActionText, ReasonText, supplierNameLookup } from './explanation-text.tsx';

const date = (value: string) => value as IsoDate;
const supplierName = supplierNameLookup({ S01: 'Metallbau Krüger GmbH' });

/** One example per code, plus the variants that change the sentence. */
const reasons: readonly Reason[] = [
  { code: 'NO_OPEN_PO' },
  { code: 'PO_AFTER_CRITICAL', poId: poId('PO1'), promisedDate: date('2026-10-20') },
  {
    code: 'PO_LATE',
    poId: poId('PO2'),
    promisedDate: date('2026-10-07'),
    supplierId: supplierId('S01'),
    delayDays: 1,
    onTimeRate: 0.25,
    lowConfidence: false,
    deliveries: 8,
  },
  {
    code: 'PO_LATE',
    poId: poId('PO3'),
    promisedDate: date('2026-10-07'),
    supplierId: supplierId('S99'),
    delayDays: 4,
    onTimeRate: 0.5,
    lowConfidence: true,
    deliveries: 2,
  },
  { code: 'HIDDEN_ERP_LATER', erpViewDate: date('2026-10-23') },
  { code: 'HIDDEN_ERP_NONE' },
  {
    code: 'PO_OVERDUE',
    poId: poId('PO4'),
    promisedDate: date('2026-10-02'),
    supplierId: supplierId('S01'),
    realisticDate: date('2026-10-06'),
  },
];

const actions: readonly Action[] = [
  { code: 'PLACE_ORDER', supplierId: supplierId('S01') },
  { code: 'PLACE_ORDER', supplierId: null },
  {
    code: 'PULL_FORWARD',
    supplierId: supplierId('S01'),
    poId: poId('PO1'),
    before: date('2026-10-13'),
  },
  { code: 'EXPEDITE', poId: poId('PO2'), before: date('2026-10-13') },
  { code: 'REVIEW_QTY_OR_DEMAND' },
];

function texts(locale: 'de' | 'en') {
  const { container } = render(
    <NextIntlClientProvider locale={locale} messages={locale === 'de' ? de : en}>
      {reasons.map((reason, i) => (
        <p key={`r${String(i)}`}>
          <ReasonText reason={reason} supplierName={supplierName} />
        </p>
      ))}
      {actions.map((action, i) => (
        <p key={`a${String(i)}`}>
          <ActionText action={action} supplierName={supplierName} />
        </p>
      ))}
    </NextIntlClientProvider>,
  );
  // German Intl puts a no-break space before "%"; a plain space keeps the snapshot readable.
  return Array.from(container.querySelectorAll('p'), (p) =>
    p.textContent.replaceAll('\u00a0', ' '),
  );
}

describe('ReasonText and ActionText', () => {
  it('cover every reason and action code of the engine', () => {
    expect(new Set(reasons.map((r) => r.code))).toEqual(new Set(REASON_CODES));
    expect(new Set(actions.map((a) => a.code))).toEqual(new Set(ACTION_CODES));
  });

  it('render every code in German', () => {
    expect(texts('de')).toMatchInlineSnapshot(`
      [
        "Keine offene Bestellung deckt den Bedarf.",
        "PO1 ist für 20.10.2026 bestätigt – bereits nach dem kritischen Datum.",
        "PO2 ist für 07.10.2026 bestätigt, aber Metallbau Krüger GmbH liefert typischerweise 1 Arbeitstag zu spät (Termintreue 25 %).",
        "PO3 ist für 07.10.2026 bestätigt, aber S99 liefert typischerweise 4 Arbeitstage zu spät (Termintreue 50 %). Nur 2 frühere Lieferungen, geringe Aussagekraft.",
        "Die ERP-Sicht (bestätigte Termine) zeigt das Problem erst ab 23.10.2026: verdecktes Risiko.",
        "Die ERP-Sicht (bestätigte Termine) zeigt gar kein Problem: verdecktes Risiko.",
        "PO4 war für 02.10.2026 bestätigt und ist überfällig; die ERP-Sicht zählt sie nicht, realistisch kommt sie am 06.10.2026.",
        "Jetzt bei Metallbau Krüger GmbH bestellen.",
        "Jetzt beim Hauptlieferanten bestellen (nicht hinterlegt).",
        "Metallbau Krüger GmbH bitten, PO1 vor 13.10.2026 vorzuziehen, oder alternativ beschaffen.",
        "PO2 nachfassen oder Teillieferung vor 13.10.2026 anfragen.",
        "Bestellmenge erhöhen oder Bedarfsplanung prüfen.",
      ]
    `);
  });

  it('render every code in English', () => {
    expect(texts('en')).toMatchInlineSnapshot(`
      [
        "No open purchase order covers the demand.",
        "PO1 is promised for 2026-10-20 – already after the critical date.",
        "PO2 is promised for 2026-10-07, but Metallbau Krüger GmbH is typically 1 working day late (on-time rate 25%).",
        "PO3 is promised for 2026-10-07, but S99 is typically 4 working days late (on-time rate 50%). Only 2 past deliveries, low confidence.",
        "The ERP view (promised dates) shows the problem only from 2026-10-23: hidden risk.",
        "The ERP view (promised dates) shows no problem at all: hidden risk.",
        "PO4 was promised for 2026-10-02 and is overdue; the ERP view does not count it, realistically it arrives on 2026-10-06.",
        "Order now from Metallbau Krüger GmbH.",
        "Order now from the main supplier (not on file).",
        "Ask Metallbau Krüger GmbH to pull PO1 forward before 2026-10-13, or source elsewhere.",
        "Expedite PO2 or ask for a partial delivery before 2026-10-13.",
        "Increase the order quantity or check the demand plan.",
      ]
    `);
  });

  it('resolves only own supplier IDs, so IDs like `constructor` fall back to the ID', () => {
    const lookup = supplierNameLookup(Object.fromEntries([['__proto__', 'Proto GmbH']]));

    expect(lookup(supplierId('__proto__'))).toBe('Proto GmbH');
    expect(lookup(supplierId('constructor'))).toBe('constructor');
    expect(lookup(supplierId('toString'))).toBe('toString');
  });
});
