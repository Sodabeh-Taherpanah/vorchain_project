export { createAnthropicProvider } from './adapters/anthropic.ts';
export type { AnthropicOptions } from './adapters/anthropic.ts';
export type { AdapterOptions, FetchLike } from './adapters/http.ts';
export { createOllamaProvider } from './adapters/ollama.ts';
export { createOpenAiCompatibleProvider } from './adapters/openai-compatible.ts';
export type { OpenAiCompatibleOptions } from './adapters/openai-compatible.ts';
export { createFakeProvider } from './fake-provider.ts';
export type { FakeProvider, FakeProviderOptions, FakeReply } from './fake-provider.ts';
export type {
  LlmError,
  LlmErrorCode,
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmResult,
  LlmRole,
  LlmUsage,
} from './types.ts';
export { explainShortageWithLlm, structuredExplanationSchema } from './explain/explain-shortage.ts';
export type { StructuredExplanation } from './explain/explain-shortage.ts';
export { explanationFactsSchema } from './explain/facts.ts';
export type { ExplanationFacts } from './explain/facts.ts';
export type { ExplainError, ExplainOptions, ExplainResult, Language } from './explain/run.ts';
export { draftSupplierEmail, supplierEmailSchema } from './explain/supplier-email.ts';
export type { SupplierEmailDraft } from './explain/supplier-email.ts';
export { isUnsafeOutput } from './guard/output.ts';
export { looksLikeInjection } from './guard/injection.ts';
export { containsPii, maskPii } from './guard/pii.ts';
export { REMOVED_PLACEHOLDER, sanitizeFacts } from './guard/sanitize-facts.ts';
export type { SanitizedFacts } from './guard/sanitize-facts.ts';
