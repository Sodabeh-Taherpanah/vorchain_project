import type { ExplanationFacts } from '../explain/facts.ts';
import { looksLikeInjection } from './injection.ts';
import { maskPii } from './pii.ts';

/** What replaces free text that looks like an instruction. */
export const REMOVED_PLACEHOLDER = '[removed]';

export interface SanitizedFacts {
  readonly facts: ExplanationFacts;
  /** Paths of fields that were masked or removed, for a UI notice. Never the values. */
  readonly sanitizedFields: readonly string[];
}

/** One free-text value: instruction-like text is dropped, then contact data is masked. */
function cleanText(text: string): string {
  if (looksLikeInjection(text)) return REMOVED_PLACEHOLDER;
  // `<` and `>` could close the data block; JSON escaping in the prompt covers it too (belt and braces).
  return maskPii(text).replace(/[<>]/g, '');
}

/**
 * Cleans the free-text fields of already validated facts (`materialName`, `supplier.name`).
 * Ids, numbers, dates and codes are fixed formats and pass through unchanged.
 */
export function sanitizeFacts(facts: ExplanationFacts): SanitizedFacts {
  const sanitizedFields: string[] = [];
  const materialName = cleanText(facts.materialName);
  if (materialName !== facts.materialName) sanitizedFields.push('materialName');

  let supplier = facts.supplier;
  if (supplier !== null) {
    const name = cleanText(supplier.name);
    if (name !== supplier.name) {
      sanitizedFields.push('supplier.name');
      supplier = { ...supplier, name };
    }
  }
  return { facts: { ...facts, materialName, supplier }, sanitizedFields };
}
