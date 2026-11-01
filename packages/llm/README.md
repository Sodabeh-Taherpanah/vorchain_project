# @vorchain/llm

Provider-neutral interface for talking to a language model, plus a deterministic fake provider.

- `LlmProvider.complete(request)` returns `{ ok, value | error }`. Expected failures
  (`UNAVAILABLE`, `TIMEOUT`, `RATE_LIMITED`, `REFUSED`, `INVALID_RESPONSE`, `ABORTED`) are values, not exceptions.
- `createFakeProvider({ replies })` scripts answers and records every request in `calls`, so tests can prove what was sent.
- Standalone: depends on no workspace package, and the engine must never import it (ESLint `boundaries` rule).
- Adapters: `createOllamaProvider`, `createOpenAiCompatibleProvider`, `createAnthropicProvider`. No vendor SDKs:
  each speaks plain HTTP through an injected `fetch`, so tests use a fake and nothing here reads the network on its own.
- All three pass the same contract tests (`src/adapters/contract.test.ts`): HTTP status mapping, bad or empty answers,
  cancellation via `signal`, `timeoutMs`, and errors that never echo the API key or the response body.
- Ollama runs locally; the other two send the prompt to a remote service. What may be put in a prompt is decided
  by the guardrails in V-05/V-06, not here.
