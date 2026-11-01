/**
 * Masks contact data and links in free text before it reaches a model (AGENTS.md §2). Pattern
 * based, so it catches the common German/EU shapes, not every possible identifier: the strict
 * facts schema (V-05) is what keeps real records out. Applied only to free-text fields, never to
 * ids or numbers.
 */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// Country code, check digits, then groups of four; spaces optional (DE89 3704 0044 0532 0130 00).
const IBAN_PATTERN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g;
const INTERNATIONAL_PHONE = /(?<![\w])(?:\+|00)\d[\d\s()/.-]{6,}\d/g;
const NATIONAL_PHONE = /(?<![\w])0\d{2,5}[\s/-]?\d{3,}(?:[\s-]?\d+)*/g;

const MASKS: readonly (readonly [RegExp, string])[] = [
  [URL_PATTERN, '[URL]'],
  [EMAIL_PATTERN, '[EMAIL]'],
  [IBAN_PATTERN, '[IBAN]'],
  [INTERNATIONAL_PHONE, '[PHONE]'],
  [NATIONAL_PHONE, '[PHONE]'],
];

/** Replaces URLs, e-mail addresses, IBANs and phone numbers with placeholders. */
export function maskPii(text: string): string {
  return MASKS.reduce(
    (masked, [pattern, placeholder]) => masked.replace(pattern, placeholder),
    text,
  );
}

/** True when `text` still contains something `maskPii` would replace. */
export function containsPii(text: string): boolean {
  return maskPii(text) !== text;
}
