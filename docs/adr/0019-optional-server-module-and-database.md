# 0019. Optional server module and database (Phase 2), the demo stays server-free

- Status: proposed (owner confirms before any Phase 2 work starts)
- Date: 2026-11-05
- Deciders: Sodabeh Taherpanah

## Context and problem
Phase 1 stores nothing on the server (ADR-0003, ADR-0006). Some wanted features need state: saved
analyses, supplier history across uploads, shared agent runs (`RunState`, ADR-0017), scheduled
e-mail drafts, user accounts. The browser-only demo is the product promise and the portfolio core,
so a server must not become a dependency of it.

## Options considered
1. **No server, ever.** Keeps the promise trivially, but blocks every feature above.
2. **Server code inside the Next.js app** (Server Actions, route handlers). One deploy, but the
   marketing site and a data-holding service then share a process, a CSP and an attack surface.
3. **Separate optional service (`apps/server`) with its own Postgres.** Own container, own
   release, can be switched off; the web app calls it only after login and consent.

## Decision
Option 3, when the first feature needs it (backlog P2-01).
- The demo, parsers and engine keep working with the server absent; CI keeps a test that `/demo`
  makes no request to it without sign-in.
- The server imports `engine`, `parsers`, `llm`, `mcp`, `agent` as libraries (the dependency rule
  of AGENTS.md §4 gets one new row for `apps/server`); the engine stays pure.
- Stores derived results and account data by default, not raw uploads. Storing a file needs a
  separate opt-in per customer and a stated retention period.
- Postgres, EU region, tenant id on every row with row-level security, encrypted backups with a
  tested restore, retention and delete-on-request implemented before real customer data (ADR-0021).
- Authentication choice is a separate ADR; no server code merges before it exists.

## Consequences
- Positive: promise intact for Phase 1; stateful features have a clear home; the server can be
  deployed, scaled and audited apart from the site.
- Negative / risks: we start holding customer data, so GDPR duties (ADR-0021), breach handling and
  on-call work begin. Threat T6 (unsigned `RunState`) and a new T19 become real (threat model).
- Follow-ups: ADR for authentication; P2-01 gets the points above; Datenschutz text (P1-24) must
  say when a server is used.

## References
- ADR-0003, ADR-0006, ADR-0017; `docs/backlog.md` P2-01; `docs/architecture/threat-model.md`
