# Threat model: Vorchain AI track

Scope: `@vorchain/llm`, `@vorchain/mcp`, `@vorchain/agent` (see [architecture §10](README.md#10-ai-track-v-03-to-v-09-components-and-trust-boundaries)).
Phase 1 web demo: files stay in the browser (ADR-0003); the AI packages are not wired into it yet.
Method: STRIDE-style walk over assets and trust boundaries. Last reviewed 2026-11-02.

## Assets
| Asset | Why it matters |
|---|---|
| Customer file contents (materials, suppliers, stock, orders) | Business secret; privacy promise |
| Supplier relationships (outgoing e-mail) | A wrong or injected mail damages trust |
| API keys for remote providers | Cost and account abuse |
| Integrity of shortage results | Planners act on them |

## Threats and controls
| # | Threat | Control (where) | Evidence | Residual risk |
|---|---|---|---|---|
| T1 | Raw file rows or content sent to a provider | Strict facts schema, unknown keys rejected, provider not called on bad facts (`llm/explain`) | `explain.test.ts` "privacy gate" | Low. Derived numbers and one short text line still leave if a remote provider is used |
| T2 | Prompt injection via material or supplier text | `sanitizeFacts`, `<` escaped, facts block declared inert, output guard, human review (`llm/guard`) | `guard.test.ts` (20 strings x 2 functions) | Medium. Patterns are heuristics; layers that do not depend on them limit the damage |
| T3 | Hijacked model puts phishing link, IBAN, phone or HTML into a draft | `isUnsafeOutput` rejects it; schema validation | `guard.test.ts` hijacked outputs | Low. A convincing plain-text lie is possible, hence T5 |
| T4 | PII in free text reaches a remote provider | `maskPii` for URL, e-mail, IBAN, phone | `guard.test.ts` PII table | Medium. Unusual formats and names are not detected |
| T5 | Agent contacts a supplier without consent | `startRun` has no sender; `resumeRun` sends approved proposals only, once (`agent`) | `agent.test.ts` | Low. Depends on the caller wiring the decision UI honestly |
| T6 | Tampered or stale saved run state | State re-validated by strict zod schema with version; unknown or duplicate decisions send nothing | `agent.test.ts` | Medium. State is not signed; whoever controls the store can alter drafts before approval, but the person still reads them |
| T7 | Edit at approval time bypasses checks | Edits use the same schema and output guard | `agent.test.ts` | Low |
| T8 | MCP tool misuse (write, file or network access) | Two tools, read-only annotations, no I/O in the server, zod-validated args | `server.test.ts`, `stdio.test.ts` | Low. Annotations are hints; real protection is that the server has no write path |
| T9 | Untrusted material text returned by MCP steers the agent | Agent flattens it to one short line (control characters removed, 80 chars) in `prepare.ts`, then the `llm` facts schema and `sanitizeFacts` apply (T2) | `agent.test.ts`, `mcp-tools.test.ts`, `guard.test.ts` | Medium, same as T2 |
| T10 | API key or response body leaks in errors or logs | Adapter errors never echo key or body | `adapters/contract.test.ts` | Low |
| T11 | Hung or slow provider blocks the flow | `timeoutMs` and `AbortSignal` in all adapters; failures are values | `adapters/contract.test.ts` | Low |
| T12 | Engine gains network or AI access | ESLint boundaries forbid `engine` to import `llm`, `mcp`, `agent` | `packages/config/eslint.config.js` | Low. Enforced only while lint is a CI gate |
| T13 | Remote provider data retention or cross-border transfer | Ollama (local) is the privacy-first option; remote is opt-in | ADR-0014, ADR-0015 | Needs a DPA and customer consent before real data goes to a remote provider |
| T14 | Quality of AI text (wrong advice) | Numbers must come from facts, checked by the evaluation harness; confidence `low` without a reliable supplier | `eval/eval.test.ts` (fake provider, guards the harness) | Medium. Real-model quality is measured by hand only |

## Out of scope for now
Authentication and multi-tenant storage (Phase 2), the contact-form server action (ADR-0007), supply chain
(V-16), server hardening (V-18). Each gets its own review.

## Open items
- Wire AI into the web app only as opt-in, off by default, with the remote provider a separate explicit choice.
- Decide whether `RunState` needs a signature or integrity check before a shared store is used.
