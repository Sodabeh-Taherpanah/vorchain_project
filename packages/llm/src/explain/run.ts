import type { z } from 'zod';

import type { LlmError, LlmMessage, LlmProvider } from '../types.ts';
import { explanationFactsSchema, type ExplanationFacts } from './facts.ts';

export type Language = 'de' | 'en';

/** Expected failures: the provider's, or facts that did not pass the privacy gate. */
export type ExplainError =
  | LlmError
  | {
      readonly code: 'INVALID_FACTS';
      /** Field paths only, never the offending values (they may be the data we refuse to send). */
      readonly fields: readonly string[];
    };

export type ExplainResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ExplainError };

export interface ExplainOptions {
  readonly language: Language;
  readonly signal?: AbortSignal;
  /** Total tries when the model answers with invalid JSON; default 2 (one retry). */
  readonly maxAttempts?: number;
}

const DEFAULT_MAX_ATTEMPTS = 2;
const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

/** Models often wrap JSON in a code fence despite instructions; accept that and nothing else. */
function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const body = FENCE.exec(trimmed)?.[1] ?? trimmed;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

export function checkFacts(
  raw: unknown,
): { ok: true; value: ExplanationFacts } | { ok: false; error: ExplainError } {
  const parsed = explanationFactsSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(root)'))];
  return { ok: false, error: { code: 'INVALID_FACTS', fields } };
}

/**
 * Asks the provider for a JSON answer and validates it with `schema`. Only invalid output is
 * retried (a transport failure would repeat itself); the last failure is returned as-is.
 */
export async function completeJson<T>(
  provider: LlmProvider,
  messages: readonly LlmMessage[],
  schema: z.ZodType<T>,
  options: ExplainOptions,
  maxTokens: number,
): Promise<ExplainResult<T>> {
  const attempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let last: ExplainError = { code: 'INVALID_RESPONSE', detail: 'no attempt made' };
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await provider.complete({
      messages,
      maxTokens,
      temperature: 0,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (!result.ok) return result;
    const parsed = schema.safeParse(parseJson(result.value.text));
    if (parsed.success) return { ok: true, value: parsed.data };
    last = { code: 'INVALID_RESPONSE', detail: 'answer does not match the schema' };
  }
  return { ok: false, error: last };
}

/** Facts go in as one JSON block that the system prompt declares to be data, not instructions. */
export function factsMessage(facts: ExplanationFacts): LlmMessage {
  return { role: 'user', content: `<facts>\n${JSON.stringify(facts)}\n</facts>` };
}

export const languageName = (language: Language): string =>
  language === 'de' ? 'German' : 'English';
