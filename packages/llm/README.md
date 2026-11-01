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

## Explanations and e-mail drafts (V-05)
- `explainShortageWithLlm` and `draftSupplierEmail` take an `ExplanationFacts` object: derived numbers and engine codes
  only. The caller (web app) maps the engine's `ShortageException` and supplier stats into it.
- Privacy gate: the facts schema is strict (unknown keys rejected, free text is one short line), so file rows and
  file content cannot be sent. Rejected facts return `INVALID_FACTS` with field paths only, and the provider is never
  called. Tests: `src/explain/explain.test.ts`, "privacy gate".
- Output is JSON validated by zod (`structuredExplanationSchema`, `supplierEmailSchema`). Invalid output is retried
  once; transport failures are not.
- The e-mail is a draft for a human to edit and send. Nothing is sent from here.
