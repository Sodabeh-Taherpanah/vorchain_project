/** Who wrote a message in a conversation with a model. */
export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  readonly role: LlmRole;
  readonly content: string;
}

export interface LlmRequest {
  readonly messages: readonly LlmMessage[];
  /** Upper bound on generated tokens; the provider's default applies when omitted. */
  readonly maxTokens?: number;
  /** 0 = most deterministic. Providers may clamp to their own range. */
  readonly temperature?: number;
  /** Cancels the call; the provider then returns `ABORTED`. */
  readonly signal?: AbortSignal;
}

export interface LlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface LlmResponse {
  readonly text: string;
  /** Model that actually answered, for the audit trail. */
  readonly model: string;
  readonly usage?: LlmUsage;
}

/** Expected provider failures. Display text is the caller's job (i18n), so there is no message. */
export type LlmErrorCode =
  'UNAVAILABLE' | 'TIMEOUT' | 'RATE_LIMITED' | 'REFUSED' | 'INVALID_RESPONSE' | 'ABORTED';

export interface LlmError {
  readonly code: LlmErrorCode;
  /** Technical detail for logs (never customer data). */
  readonly detail?: string;
}

export type LlmResult =
  | { readonly ok: true; readonly value: LlmResponse }
  | { readonly ok: false; readonly error: LlmError };

/**
 * One way to reach a model (local Ollama, an OpenAI-compatible endpoint, Anthropic, a fake).
 * Expected failures come back as `{ ok: false }`; `complete` rejects only for programmer errors.
 */
export interface LlmProvider {
  readonly name: string;
  complete(request: LlmRequest): Promise<LlmResult>;
}
