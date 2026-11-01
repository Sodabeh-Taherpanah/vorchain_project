import { containsPii } from './pii.ts';

const MARKUP = /<\s*\/?\s*[a-z!][^>]*>/i;

function anyString(value: unknown, test: (text: string) => boolean): boolean {
  if (typeof value === 'string') return test(value);
  if (Array.isArray(value)) return value.some((item) => anyString(item, test));
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some((item) => anyString(item, test));
  }
  return false;
}

/**
 * Output guard for a schema-valid model answer. The prompts only allow facts we supplied, none of
 * which contain links, addresses or markup, so any of those means the model was steered or made
 * them up. Rejecting them keeps a hijacked answer from becoming a phishing link in a mail draft.
 */
export function isUnsafeOutput(value: unknown): boolean {
  return anyString(value, (text) => containsPii(text) || MARKUP.test(text));
}
