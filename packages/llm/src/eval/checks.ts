import type { ExplanationFacts } from '../explain/facts.ts';
import type { Language } from '../explain/run.ts';

/** Digit runs of a text as integers: "14.10.2026" gives 14, 10, 2026; "-120" gives 120. */
function digitRuns(text: string): number[] {
  return (text.match(/\d+/g) ?? []).map(Number);
}

/** Every number a faithful answer may quote: the facts' own values and their date parts. */
function allowedNumbers(facts: ExplanationFacts): Set<number> {
  const values = [
    Math.abs(Math.round(facts.minProjectedStock)),
    Math.abs(Math.round(facts.safetyStock)),
    facts.daysUntil,
    ...(facts.supplier === null
      ? []
      : [
          facts.supplier.p80DelayDays,
          facts.supplier.deliveries,
          Math.round(facts.supplier.onTimeRate * 100),
        ]),
    ...digitRuns(facts.asOf),
    ...digitRuns(facts.criticalDate),
    ...(facts.erpViewDate === null ? [] : digitRuns(facts.erpViewDate)),
  ];
  return new Set(values);
}

/**
 * No invented figures: every number in the answer comes from the facts. The material's id and
 * name are removed first, because they legitimately contain digits ("M-100", "Stahlblech 2 mm").
 */
export function numbersAreGrounded(text: string, facts: ExplanationFacts): boolean {
  const allowed = allowedNumbers(facts);
  const withoutLabels = text.replaceAll(facts.materialId, ' ').replaceAll(facts.materialName, ' ');
  return digitRuns(withoutLabels).every((n) => allowed.has(n));
}

export function mentionsMaterial(text: string, facts: ExplanationFacts): boolean {
  return text.includes(facts.materialId) || text.includes(facts.materialName);
}

const GERMAN_WORDS =
  /\b(?:der|die|das|und|ist|nicht|wird|bitte|bestellung|lieferant|am|auf|mit)\b/gi;
const ENGLISH_WORDS = /\b(?:the|and|is|not|will|please|order|supplier|on|with|to)\b/gi;

/** Rough language check: the requested language's common words must outnumber the other's. */
export function isInLanguage(text: string, language: Language): boolean {
  const german = text.match(GERMAN_WORDS)?.length ?? 0;
  const english = text.match(ENGLISH_WORDS)?.length ?? 0;
  return language === 'de' ? german > english : english > german;
}

/** Without a reliable supplier history the answer must admit low confidence. */
export function confidenceMatchesEvidence(
  confidence: 'low' | 'medium' | 'high',
  facts: ExplanationFacts,
): boolean {
  const weak = facts.supplier?.reliable !== true;
  return weak ? confidence === 'low' : true;
}

/** A hidden risk is the product's point: the answer must say the ERP does not show it. */
export function mentionsErpWhenHidden(text: string, facts: ExplanationFacts): boolean {
  return !facts.hidden || /\bERP\b/.test(text);
}

export function keepsSenderPlaceholder(body: string): boolean {
  return body.includes('[Name]');
}

export function asksForDeliveryDate(text: string, language: Language): boolean {
  return language === 'de' ? /liefertermin/i.test(text) : /delivery date/i.test(text);
}
