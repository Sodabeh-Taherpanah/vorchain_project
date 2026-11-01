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

## Guardrails (V-06)
Layers, outermost first (`src/guard/`):
1. Strict facts schema (V-05): no rows or file content.
2. `sanitizeFacts`: in the two free-text fields, instruction-like text becomes `[removed]` (`looksLikeInjection`, German and
   English patterns, zero-width and full-width tricks normalised), and URLs, e-mails, IBANs and phone numbers become
   `[URL]`, `[EMAIL]`, `[IBAN]`, `[PHONE]` (`maskPii`). `<` is escaped in the prompt so nothing can close the `<facts>` block.
3. The system prompt declares the block inert data.
4. Output is schema-validated, then `isUnsafeOutput` rejects links, addresses, IBANs, phone numbers and HTML, so a steered
   model cannot put a phishing link into a draft.
5. A person reads every draft before anything is sent.

Known limits: the injection and PII patterns are heuristics (paraphrases, other languages and unusual number formats can
slip through), which is why layers 1, 3, 4 and 5 do not depend on them. Tests: `src/guard/guard.test.ts` (20 injection
strings, each checked to produce a prompt identical to a neutral name, and a hijacked model's answers rejected).
