import type { ExplanationFacts } from '../explain/facts.ts';
import type { Language } from '../explain/run.ts';

const dateDe = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** A faithful scripted explanation built only from the facts, as a good model would answer. */
export function goldenExplanation(facts: ExplanationFacts, language: Language): string {
  const { supplier } = facts;
  const weak = supplier?.reliable !== true;
  const erp = facts.hidden
    ? language === 'de'
      ? ' Das ERP zeigt dieses Risiko nicht.'
      : ' The ERP does not show this risk.'
    : '';
  const drivers =
    supplier === null
      ? [language === 'de' ? 'Kein Lieferant mit Historie bekannt' : 'No supplier history is known']
      : [
          language === 'de'
            ? `Lieferant liefert typischerweise ${String(supplier.p80DelayDays)} Arbeitstage zu spät`
            : `The supplier is usually ${String(supplier.p80DelayDays)} working days late`,
        ];
  const summary =
    language === 'de'
      ? `Material ${facts.materialId} ist am ${dateDe(facts.criticalDate)} nicht mehr verfügbar.${erp}`
      : `Material ${facts.materialId} runs out on ${facts.criticalDate}.${erp}`;
  return JSON.stringify({
    summary,
    riskDrivers: drivers,
    recommendedActions: [
      language === 'de'
        ? 'Bestellung prüfen und beschleunigen'
        : 'Review the order and expedite it',
    ],
    confidence: weak ? 'low' : 'high',
  });
}

/** A faithful scripted supplier e-mail built only from the facts. */
export function goldenEmail(facts: ExplanationFacts, language: Language): string {
  return JSON.stringify(
    language === 'de'
      ? {
          subject: `Lieferstatus ${facts.materialId}`,
          body: `Guten Tag, wir benötigen ${facts.materialId} bis zum ${dateDe(facts.criticalDate)}. Bitte bestätigen Sie den Liefertermin.\n\nViele Grüße\n[Name]\n[Telefon/Phone]`,
        }
      : {
          subject: `Delivery status ${facts.materialId}`,
          body: `Hello, we need ${facts.materialId} by ${facts.criticalDate}. Please confirm the delivery date.\n\nKind regards\n[Name]\n[Telefon/Phone]`,
        },
  );
}
