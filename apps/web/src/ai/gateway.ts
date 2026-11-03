/**
 * The ONLY file in `apps/web` that may import `@vorchain/llm` (ESLint `no-restricted-imports`),
 * and only through a dynamic `import()`, so the package is fetched after the visitor has agreed
 * (ADR-0018) and never ends up in the bundle of `/`. Components never call `fetch` themselves.
 *
 * Nothing is sent from here until `explain` is called for one material by an explicit click.
 */
import type { FactsForModel } from './explanation-facts.ts';

export type AiProviderConfig =
  | {
      readonly kind: 'local';
      /** Ollama on the visitor's own machine. */
      readonly baseUrl: string;
      readonly model: string;
    }
  | {
      readonly kind: 'remote';
      /** OpenAI-compatible endpoint including `/v1`. The key lives in memory only. */
      readonly baseUrl: string;
      readonly model: string;
      readonly apiKey: string;
    };

export interface AiExplanation {
  readonly summary: string;
  readonly riskDrivers: readonly string[];
  readonly recommendedActions: readonly string[];
  readonly confidence: 'low' | 'medium' | 'high';
}

export type AiFailure =
  | 'INVALID_FACTS'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'REFUSED'
  | 'INVALID_RESPONSE'
  | 'ABORTED';

export type AiResult =
  | { readonly ok: true; readonly value: AiExplanation }
  | { readonly ok: false; readonly code: AiFailure };

const TIMEOUT_MS = 60_000;

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Host shown in the consent text; `null` when the URL is not usable for that kind. Local means the
 * visitor's own machine (loopback only, so "local" can never name a foreign host). A remote host
 * must use https, because the API key travels with every request. URLs with credentials are
 * refused: the consent names a host, and `fetch` rejects them anyway.
 */
export function hostOf(baseUrl: string, kind: 'local' | 'remote' = 'remote'): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.username !== '' || url.password !== '') return null;
    const loopback = LOOPBACK.has(url.hostname);
    if (kind === 'local') {
      return loopback && (url.protocol === 'http:' || url.protocol === 'https:') ? url.host : null;
    }
    return url.protocol === 'https:' ? url.host : null;
  } catch {
    return null;
  }
}

export async function explainWithAi(
  facts: FactsForModel,
  config: AiProviderConfig,
  language: 'de' | 'en',
  signal?: AbortSignal,
): Promise<AiResult> {
  const llm = await import('@vorchain/llm');
  // No redirects (a 307 would replay the body elsewhere), no cookies, no referrer.
  const fetchFn = (input: string, init: RequestInit) =>
    fetch(input, {
      ...init,
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  const base = {
    baseUrl: config.baseUrl,
    model: config.model,
    fetch: fetchFn,
    timeoutMs: TIMEOUT_MS,
  };
  const provider =
    config.kind === 'local'
      ? llm.createOllamaProvider(base)
      : llm.createOpenAiCompatibleProvider({ ...base, apiKey: config.apiKey });
  const result = await llm.explainShortageWithLlm(provider, facts, {
    language,
    ...(signal === undefined ? {} : { signal }),
  });
  if (result.ok) return { ok: true, value: result.value };
  return { ok: false, code: result.error.code };
}
