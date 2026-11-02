/**
 * Heuristic detector for instruction-like text in customer-controlled strings. It is the last
 * of several layers, not the main defence: facts are a strict schema, travel as a data block the
 * system prompt declares inert, the answer must match a schema, and a human reviews every draft.
 * Known limit: paraphrases and homoglyphs can slip past a pattern list.
 */
const PATTERNS: readonly RegExp[] = [
  /\b(?:ignore|disregard|forget|override|bypass)\b.{0,40}\b(?:instructions?|prompts?|rules?|guidelines?|above|previous|prior)\b/i,
  /\b(?:ignoriere|vergiss|missachte|umgehe)\b.{0,40}\b(?:anweisung\w*|instruktion\w*|regeln?|vorherig\w*|obig\w*)\b/i,
  /\b(?:new|updated|neue)\s+(?:instructions?|anweisung\w*|rules?|regeln?)\b/i,
  /\b(?:you are now|from now on|act as|pretend to be|du bist (?:jetzt|nun)|ab sofort|tu so als)\b/i,
  /\b(?:system|developer)\s*(?:prompt|message|nachricht)\b/i,
  /\b(?:reveal|print|show|repeat|leak|zeige|nenne|wiederhole)\b.{0,40}\b(?:prompt|instructions?|anweisung\w*|secrets?|api[- ]?key)\b/i,
  /^\s*(?:system|assistant|user|developer)\s*:/im,
  // Delimiters of this package's prompts and of common chat templates.
  /<\s*\/?\s*(?:facts|system|assistant|user|instructions?)\b/i,
  /\[\/?INST\]|<\|[^|]*\|>|###\s*(?:system|instruction)/i,
  /```/,
];

// Zero-width and bidi control characters hide words from a pattern match and from a reader.
const INVISIBLE_CLASS = String.raw`[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]`;
const INVISIBLE_ALL = new RegExp(INVISIBLE_CLASS, 'g');
// Not global: a global regex keeps `lastIndex` between `.test()` calls.
const INVISIBLE_ANY = new RegExp(INVISIBLE_CLASS);

function normalise(text: string): string {
  return text.normalize('NFKC').replace(INVISIBLE_ALL, '').replace(/\s+/g, ' ');
}

/** True when `text` looks like an attempt to instruct the model. */
export function looksLikeInjection(text: string): boolean {
  const normalised = normalise(text);
  return PATTERNS.some((pattern) => pattern.test(normalised)) || INVISIBLE_ANY.test(text);
}
