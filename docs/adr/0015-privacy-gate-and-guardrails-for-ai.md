# 0015. Privacy gate and layered guardrails for AI prompts

- Status: accepted
- Date: 2026-11-02
- Deciders: Sodabeh Taherpanah

## Context and problem
The promise "Ihre Daten verlassen nie Ihren Browser" (ADR-0003) must hold when AI is added. Material
descriptions and supplier names come from customer files and are untrusted text (prompt injection, PII).

## Options considered
1. **Send rows and let the prompt say "be careful".** Violates the promise.
2. **Filter by regex only.** Heuristics miss paraphrases and other languages.
3. **Layered: strict allow-list of derived facts, then heuristics, then output checks, then a human.**

## Decision
Option 3 (`@vorchain/llm`). (1) `ExplanationFacts` is a strict zod schema: derived numbers and engine codes,
unknown keys rejected, free text limited to one short line; bad facts return `INVALID_FACTS` and the provider is never
called. (2) `sanitizeFacts` replaces instruction-like text and masks URLs, e-mails, IBANs, phones; `<` is escaped.
(3) The system prompt marks the facts block as inert data. (4) Output is schema-validated and `isUnsafeOutput`
rejects links, addresses, IBANs, phones and HTML. (5) A person reads every draft. Layers 1, 3, 4, 5 do not rely on
heuristics. In the web app (V-19, ADR-0018) AI is opt-in and off by default, and a remote provider is a separate explicit choice.

## Consequences
- Positive: raw files cannot reach a provider (tested); a hijacked model cannot plant a link in a draft.
- Negative: heuristics (layer 2) are incomplete; explanations cannot quote file rows.
- Follow-up: threat model in `docs/architecture/threat-model.md`.

## References
- `packages/llm/src/guard/guard.test.ts`, `packages/llm/src/explain/explain.test.ts` ("privacy gate")
