import type { z } from 'zod';

import type { LlmError, LlmResult } from '../types.ts';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface AdapterOptions {
  /** Endpoint root without a trailing path, e.g. `http://localhost:11434`. */
  readonly baseUrl: string;
  /** Model name sent with each request. */
  readonly model: string;
  /** Injected so tests use a fake and the browser can pass `fetch.bind(globalThis)`. */
  readonly fetch: FetchLike;
  /** Gives up with `TIMEOUT` after this many milliseconds. */
  readonly timeoutMs?: number;
}

const fail = (code: LlmError['code'], detail?: string): LlmResult => ({
  ok: false,
  error: detail === undefined ? { code } : { code, detail },
});

/** Maps an HTTP status to an expected failure. Bodies are never echoed: they may hold prompts. */
function statusError(status: number): LlmResult {
  if (status === 429) return fail('RATE_LIMITED', 'HTTP 429');
  if (status === 408 || status === 504) return fail('TIMEOUT', `HTTP ${String(status)}`);
  return fail('UNAVAILABLE', `HTTP ${String(status)}`);
}

export interface PostJsonArgs<T> {
  readonly options: AdapterOptions;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly signal: AbortSignal | undefined;
  readonly schema: z.ZodType<T>;
}

/**
 * Shared transport for every adapter: POST JSON, map transport and HTTP failures to `LlmError`,
 * validate the answer with zod. Returns the parsed body or the failure to hand back as-is.
 */
export async function postJson<T>(
  args: PostJsonArgs<T>,
): Promise<{ ok: true; value: T } | { ok: false; result: LlmResult }> {
  const { options, signal } = args;
  if (signal?.aborted === true) return { ok: false, result: fail('ABORTED') };
  const controller = new AbortController();
  // An object, not a `let`: the timer callback mutates it, which control-flow analysis can't see.
  const state = { timedOut: false };
  const onAbort = (): void => {
    controller.abort();
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer =
    options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          state.timedOut = true;
          controller.abort();
        }, options.timeoutMs);

  try {
    const response = await options.fetch(args.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...args.headers },
      body: JSON.stringify(args.body),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, result: statusError(response.status) };
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return { ok: false, result: fail('INVALID_RESPONSE', 'body is not JSON') };
    }
    const parsed = args.schema.safeParse(json);
    if (!parsed.success) return { ok: false, result: fail('INVALID_RESPONSE', 'unexpected shape') };
    return { ok: true, value: parsed.data };
  } catch {
    // Order matters: our timer also aborts the controller.
    if (state.timedOut)
      return { ok: false, result: fail('TIMEOUT', `after ${String(options.timeoutMs)} ms`) };
    if (controller.signal.aborted) return { ok: false, result: fail('ABORTED') };
    return { ok: false, result: fail('UNAVAILABLE', 'network error') };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export { fail };
