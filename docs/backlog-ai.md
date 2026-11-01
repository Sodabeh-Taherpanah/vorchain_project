# AI layer backlog

Status: todo | doing | blocked | done. "done" needs evidence.

## V-01 Verify real status of Phase 1 backlog
- Status: done
- Depends on: -
- Acceptance: docs/STATUS.md lists every task with claimed vs real status and evidence
- Evidence: docs/STATUS.md (commit ec4d93c); 26 Done and 10 open tasks checked against code

## V-02 License decision (waiting for owner)
- Status: done
- Depends on: V-01
- Acceptance: LICENSE and README note match the owner's choice
- Evidence: owner chose option 2; LICENSE is PolyForm Noncommercial 1.0.0 + Required Notice; README License section and package.json "license" match; docs/license-options removed

## V-03 LlmProvider interface + fake provider
- Status: done
- Depends on: V-01
- Acceptance: packages/llm builds; unit tests pass; engine does not import it
- Evidence: `pnpm lint && pnpm typecheck && pnpm test` green; `pnpm --filter @vorchain/llm coverage` 100% lines (gate 90); packages/llm/src/fake-provider.test.ts (6 tests); ESLint boundaries rejects `import '@vorchain/llm'` in packages/engine/src (checked by hand)

## V-04 Ollama + OpenAI-compatible + Anthropic adapters
- Status: todo
- Depends on: V-03
- Acceptance: each adapter passes the same contract tests (fake HTTP)
- Evidence:

## V-05 Structured explanation + supplier email draft
- Status: todo
- Depends on: V-03
- Acceptance: JSON validated by schema; test proves raw files cannot reach the provider
- Evidence:

## V-06 Prompt injection guardrails + PII masking
- Status: todo
- Depends on: V-05
- Acceptance: injection test strings fail to change behavior
- Evidence:

## V-07 Evaluation set (about 20 cases)
- Status: todo
- Depends on: V-05
- Acceptance: runs in CI with the fake provider
- Evidence:

## V-08 MCP server package
- Status: todo
- Depends on: V-01
- Acceptance: tools list_shortages and get_projection callable; test calls them
- Evidence:

## V-09 Agent with human approval
- Status: todo
- Depends on: V-05, V-08
- Acceptance: real interrupt, state saved, nothing sent automatically
- Evidence:

## V-10 ADRs 0007 to 0010 + C4 + threat model
- Status: todo
- Note: ADR numbers 0007 to 0010 already exist in docs/adr/; use 0014 and up (owner to confirm)
- Depends on: V-01
- Acceptance: files exist and are consistent with the code
- Evidence:

## V-12 Benchmarks and performance budgets
- Status: todo
- Depends on: V-01
- Acceptance: docs/performance.md has numbers for 10k/100k/1M rows; CI fails on bundle size or benchmark regression; Lighthouse CI runs
- Evidence:

## V-13 Large-file handling in the browser
- Status: todo
- Depends on: V-12
- Acceptance: streaming parse, worker chunks, progress and cancel; UI stays responsive on 1M rows; parity tests green
- Evidence:

## V-14 Property-based and mutation tests for the engine
- Status: todo
- Depends on: V-01
- Acceptance: fast-check invariants pass; Stryker score reported with notes on survivors
- Evidence:

## V-15 Accessibility and e2e checks
- Status: todo
- Depends on: V-01
- Acceptance: axe checks inside Playwright; WCAG 2.2 AA issues on the demo fixed or listed
- Evidence:

## V-16 Supply chain and security automation
- Status: todo
- Depends on: V-01
- Acceptance: Renovate or Dependabot, gitleaks and SBOM in CI; CSP set; test proves no file contents leave the browser while AI is off
- Evidence:

## V-17 Architecture fitness tests and business-alignment doc
- Status: todo
- Depends on: V-10
- Acceptance: dependency-graph check fails when the engine imports UI/network/AI; docs/architecture/business-alignment.md complete
- Evidence:

## V-18 Server-side hardening (only for server modules that exist)
- Status: todo
- Depends on: V-08
- Acceptance: health/readiness, timeouts, structured logs, OpenTelemetry flag, k6 result recorded
- Evidence:

## V-11 Optional Java module (Spring AI)
- Status: todo
- Depends on: V-05
- Acceptance: contract test against the shared JSON schema; skip if it harms structure
- Evidence:
