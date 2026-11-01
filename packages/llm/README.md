# @vorchain/llm

Provider-neutral interface for talking to a language model, plus a deterministic fake provider.

- `LlmProvider.complete(request)` returns `{ ok, value | error }`. Expected failures
  (`UNAVAILABLE`, `TIMEOUT`, `RATE_LIMITED`, `REFUSED`, `INVALID_RESPONSE`, `ABORTED`) are values, not exceptions.
- `createFakeProvider({ replies })` scripts answers and records every request in `calls`, so tests can prove what was sent.
- Standalone: depends on no workspace package, and the engine must never import it (ESLint `boundaries` rule).
- Real adapters (Ollama, OpenAI-compatible, Anthropic) arrive in V-04.
