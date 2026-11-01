import type { LlmError, LlmProvider, LlmRequest, LlmResponse, LlmResult } from './types.ts';

/** One scripted answer: plain text, a failure, or a function of the request. */
export type FakeReply = string | LlmError | ((request: LlmRequest) => string | LlmError);

export interface FakeProviderOptions {
  /** Answers handed out in order; the last one repeats once the script runs out. */
  readonly replies: readonly [FakeReply, ...FakeReply[]];
  readonly name?: string;
  readonly model?: string;
}

export interface FakeProvider extends LlmProvider {
  /** Every request received, oldest first, so tests can assert what was (not) sent. */
  readonly calls: readonly LlmRequest[];
}

function isError(reply: string | LlmError): reply is LlmError {
  return typeof reply !== 'string';
}

/**
 * Deterministic provider for tests and offline demos: no network, no clock, no randomness.
 * Honours `signal` like a real adapter so cancellation paths can be tested.
 */
export function createFakeProvider(options: FakeProviderOptions): FakeProvider {
  const { replies, name = 'fake', model = 'fake-model' } = options;
  const calls: LlmRequest[] = [];

  return {
    name,
    calls,
    complete(request: LlmRequest): Promise<LlmResult> {
      // Record first: a cancelled call was still attempted.
      const index = Math.min(calls.length, replies.length - 1);
      calls.push(request);
      if (request.signal?.aborted === true) {
        return Promise.resolve({ ok: false, error: { code: 'ABORTED' } });
      }
      // `noUncheckedIndexedAccess`: the tuple type guarantees `replies[0]`, so the fallback is typed.
      const scripted = replies[index] ?? replies[0];
      const reply = typeof scripted === 'function' ? scripted(request) : scripted;
      if (isError(reply)) return Promise.resolve({ ok: false, error: reply });
      const value: LlmResponse = { text: reply, model };
      return Promise.resolve({ ok: true, value });
    },
  };
}
