# 0018. AI explanation in the web app: opt-in, in-memory, lazy, one gateway

- Status: accepted
- Date: 2026-11-03
- Deciders: Sodabeh Taherpanah

## Context and problem
V-19 puts the AI packages into the demo. The promise "Ihre Daten verlassen nie Ihren Browser"
(ADR-0003) must stay true for files, and anything that does leave must be chosen by the visitor.
Free text from the file (material and supplier name) is part of the facts, so "no file data" is not
an honest claim for the AI path.

## Options considered
1. **AI on by default, notice in the footer.** Breaks the promise.
2. **Server-side proxy to the model.** Adds a server that sees customer data and a key to guard.
3. **Opt-in in the browser, calling the provider directly, in memory only.**

## Decision
Option 3, for `@vorchain/llm` only (`agent` and `mcp` stay server/CLI packages; in the browser the
person is the approver and drafts are not sent anywhere).
- Off on every load; state and the API key live in React state only (no storage, no URL, no logs).
- Consent step (de/en) lists what is sent (derived numbers, engine codes, material and supplier
  name) and to whom. A remote provider needs a second, separate agreement that names its host.
- "Local" accepts loopback addresses only (`localhost`, `127.0.0.1`, `[::1]`); a remote URL must be
  `https:` without credentials. Requests use `redirect: 'error'`, no cookies and no referrer.
- Nothing is sent until "Explain" is pressed for one material; output is shown as plain text.
- `src/ai/gateway.ts` is the only file allowed to import `@vorchain/llm`, via dynamic `import()`
  (ESLint `no-restricted-imports`; `no-restricted-syntax` forbids a static value import there), so it is not in the bundle of `/` or loaded before consent.
- `src/ai/explanation-facts.ts` maps an exception to the facts; the llm package's strict schema
  checks them again. No analytics event for AI actions (ADR-0012).

## Consequences
- Positive: files stay in the browser; the e2e test proves no model request before the click and
  only the facts keys after it; `/` does not grow.
- Negative: a real provider may block the browser (CORS: Ollama needs `OLLAMA_ORIGINS`, the
  Anthropic adapter needs a browser-access header and is not offered in the UI); stubbed e2e
  cannot catch that. There is no CSP yet (P1-27): when `connect-src` is added it must allow the
  chosen hosts on `/demo` only, never `https:`.
- Follow-up: the Datenschutz page is still a stub (P1-24) and must describe this path.

## References
- ADR-0003, ADR-0015, ADR-0012; `apps/web/e2e/demo-ai.spec.ts`
