# Threat model: Vorchain AI track

Scope: `@vorchain/llm`, `@vorchain/mcp`, `@vorchain/agent` (see [architecture §10](README.md#10-ai-track-v-03-to-v-09-components-and-trust-boundaries)).
Phase 1 web demo: files stay in the browser (ADR-0003). `llm` is wired into the demo as an opt-in explanation (ADR-0018); `mcp` and `agent` are not.
Method: STRIDE-style walk over assets and trust boundaries. Last reviewed 2026-11-05 (V-20).

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
| T6 | Tampered or stale saved run state | State re-validated by strict zod schema with version; unknown or duplicate decisions send nothing | `agent.test.ts` | Medium. Becomes real once a server store exists (ADR-0019): sign or store server-side first. State is not signed; whoever controls the store can alter drafts before approval, but the person still reads them |
| T7 | Edit at approval time bypasses checks | Edits use the same schema and output guard | `agent.test.ts` | Low |
| T8 | MCP tool misuse (write, file or network access) | Two tools, read-only annotations, no I/O in the server, zod-validated args | `server.test.ts`, `stdio.test.ts` | Low. Annotations are hints; real protection is that the server has no write path |
| T9 | Untrusted material text returned by MCP steers the agent | Agent flattens it to one short line (control characters removed, 80 chars) in `prepare.ts`, then the `llm` facts schema and `sanitizeFacts` apply (T2) | `agent.test.ts`, `mcp-tools.test.ts`, `guard.test.ts` | Medium, same as T2 |
| T10 | API key or response body leaks in errors or logs | Adapter errors never echo key or body | `adapters/contract.test.ts` | Low |
| T11 | Hung or slow provider blocks the flow | `timeoutMs` and `AbortSignal` in all adapters; failures are values | `adapters/contract.test.ts` | Low |
| T12 | Engine gains network or AI access | ESLint boundaries forbid `engine` to import `llm`, `mcp`, `agent` | `packages/config/eslint.config.js` | Low. Enforced only while lint is a CI gate |
| T13 | Remote provider data retention or cross-border transfer | Ollama (local) is the privacy-first option; remote is opt-in | ADR-0014, ADR-0015 | Needs the customer's own agreement with the provider and consent before real data goes to a remote provider; position in ADR-0021 |
| T14 | Quality of AI text (wrong advice) | Numbers must come from facts, checked by the evaluation harness; confidence `low` without a reliable supplier | `eval/eval.test.ts` (fake provider, guards the harness) | Medium. Real-model quality is measured by hand only |
| T15 | API key typed in the browser is stolen (XSS, extension, shoulder surfing) | Key in React state only: no storage, URL or logs; gone on reload; remote provider needs a separate consent naming the host (ADR-0018) | `demo-ai.spec.ts` "nothing is stored" | Medium. Any XSS on `/demo` could read it; a CSP (P1-27) is still open |
| T16 | Model text rendered as HTML (XSS via AI) | Output is schema-validated, checked by `isUnsafeOutput` and rendered as React text, never as HTML | `ai-explain-panel.test.tsx` (markup shown as characters) | Low |
| T17 | Free text from the file leaves the browser | Only material and supplier name, one short line each, sanitised; consent text says so; opt-in per session | `demo-ai.spec.ts` (keys equal facts schema; other materials absent) | Medium by design: the visitor chooses this |
| T18 | CORS or mixed-content blocks the call, or a wrong URL sends facts to an unintended host | Host shown in the consent; local URL must be loopback, remote URL https without credentials; redirects refused; errors map to a plain message | `demo-ai.spec.ts` | Low. A stubbed e2e cannot prove a real provider works |
| T19 | Optional server store (ADR-0019, not built): cross-tenant read, leaked backup, data kept too long | Tenant id on every row with row-level security, encrypted EU backups, retention and delete-on-request, derived data only by default | Planned: tests with two tenants before any customer data (P2-01) | High until built; nothing is stored in Phase 1 |

## Out of scope for now
Authentication (separate ADR) and the build of multi-tenant storage (Phase 2; risk T19 recorded), the contact-form server action (ADR-0007), supply chain
(V-16), server hardening (V-18). Each gets its own review.

## Open items
- Add a CSP with `connect-src` limited to the chosen hosts on `/demo` (P1-27) and describe the AI path in the Datenschutz page (P1-24).
- Decide whether `RunState` needs a signature or integrity check before a shared store is used.
