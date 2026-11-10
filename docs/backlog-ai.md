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
- Status: done
- Depends on: V-03
- Acceptance: each adapter passes the same contract tests (fake HTTP)
- Evidence: `describe.each` contract suite in packages/llm/src/adapters/contract.test.ts runs against all 3 adapters (60 tests in the package pass); `pnpm --filter @vorchain/llm coverage` 99% lines, 95% branches (gate 90); `pnpm lint && pnpm typecheck && pnpm test` green

## V-05 Structured explanation + supplier email draft
- Status: done
- Depends on: V-03
- Acceptance: JSON validated by schema; test proves raw files cannot reach the provider
- Evidence: packages/llm/src/explain/explain.test.ts: zod-validated output (schema failures return INVALID_RESPONSE) and describe "privacy gate: raw files cannot reach the provider" (strict facts schema; 9 bad inputs per function give INVALID_FACTS with `provider.calls` empty; sent block keys equal the schema keys); 98 tests in package pass, 99% lines / 96% branches (gate 90); `pnpm lint && pnpm typecheck && pnpm test` green

## V-06 Prompt injection guardrails + PII masking
- Status: done
- Depends on: V-05
- Acceptance: injection test strings fail to change behavior
- Evidence: packages/llm/src/guard/guard.test.ts: 20 injection strings x 2 functions each produce a prompt deep-equal to the neutral-name baseline and the attack text is absent from `provider.calls`; hijacked-model outputs (link, e-mail, IBAN, phone, HTML) return INVALID_RESPONSE "answer failed the output guard"; PII masking table; 211 tests in package pass (after QA fixes), 99% lines / 96% branches (gate 90); `pnpm lint && pnpm typecheck && pnpm test` green

## V-07 Evaluation set (about 20 cases)
- Status: done
- Depends on: V-05
- Acceptance: runs in CI with the fake provider
- Evidence: packages/llm/src/eval/eval.test.ts runs 23 cases (`runEvaluation` + fake provider) inside `pnpm test` / `pnpm coverage` (CI step `pnpm coverage` in .github/workflows/ci.yml:83); bad answers fail exactly their intended check; 221 tests in package pass, 99.6% lines / 97% branches (gate 90); `pnpm lint && pnpm typecheck && pnpm test` green

## V-08 MCP server package
- Status: done
- Depends on: V-01
- Acceptance: tools list_shortages and get_projection callable; test calls them
- Evidence: packages/mcp/src/server.test.ts calls both tools through an in-memory MCP client (filters, limit, invalid args, unknown material, hidden risk found) and packages/mcp/src/stdio.test.ts starts bin.ts over real stdio; 20 tests pass (after QA fixes), 100% lines/branches (gate 90); `pnpm lint && pnpm typecheck && pnpm test` green

## V-09 Agent with human approval
- Status: done
- Depends on: V-05, V-08
- Acceptance: real interrupt, state saved, nothing sent automatically
- Evidence: packages/agent/src/agent.test.ts: `startRun` takes no sender (cannot send), saves the state as JSON and returns `awaiting_approval`; `resumeRun` in a fresh call loads that JSON and sends only approved proposals, once (second approve gives ALREADY_DECIDED); bad edits, unknown or duplicate decisions send nothing; failed send is recorded, not retried. packages/agent/src/mcp-tools.test.ts reads `list_shortages` through a real MCP client. 14 tests, 100% lines / 97.9% branches (gate 90); `pnpm check` green; ESLint boundaries rejected `engine -> agent` and `agent -> engine` imports (checked by hand)

## V-10 ADRs 0007 to 0010 + C4 + threat model
- Status: done
- Note: ADR numbers 0007 to 0010 already exist in docs/adr/; used 0014 to 0017 (owner to confirm)
- Depends on: V-01
- Acceptance: files exist and are consistent with the code
- Evidence: docs/adr/0014..0017 (LLM layer, privacy gate, MCP server, agent approval) indexed in docs/adr/README.md; C4 section 10 added to docs/architecture/README.md; docs/architecture/threat-model.md (14 threats, each mapped to a control and test); claims checked against packages/llm, mcp, agent and the ESLint boundaries in packages/config/eslint.config.js; `prettier --check docs/adr docs/architecture` clean

## V-19 Wire the AI packages into apps/web (AI off by default)
- Status: done (merged in #66, CI e2e green)
- Depends on: V-09, V-10
- Acceptance: AI is off by default; turning it on needs an explicit consent notice (German first, then English) that says what is sent and to whom; a remote provider is a separate explicit choice; only derived facts reach a provider (ADR-0015); e2e network test proves no request carries file content while AI is off and that, when on, only the facts schema leaves; i18n keys in `de` and `en`; JS budget for `/` holds (AI code lazy-loaded on `/demo` only)
- Evidence: apps/web/e2e/demo-ai.spec.ts (Chromium, local): AI off by default with no off-origin request and no llm chunk loaded; agreeing sends nothing; the click sends one request whose facts keys equal the schema keys and which holds no other material; remote needs its own host-naming consent; key not stored after reload; axe clean for intro, consent and remote consent; full Chromium suite 105 passed. apps/web/src/ai/explanation-facts.test.ts maps every sample exception (de, en) through the llm `explanationFactsSchema`. apps/web/src/components/demo/ai-explain-panel.test.tsx (9 tests). ESLint rule `vorchain/web/llm-only-via-gateway` fires on a temporary violation. ADR-0018; `/` HTML and chunks hold no AI strings or llm code (checked in `.next`). Firefox/WebKit e2e: CI only

## V-20 ADRs: optional server module and database, cloud and hosting, GDPR and EU AI Act
- Status: done (merged in #71)
- Depends on: V-10
- Acceptance: short ADRs (numbered from 0019) for (1) an optional server module and its database, (2) cloud and hosting options beyond ADR-0006, (3) a GDPR and EU AI Act assessment of the AI track (risk class, transparency duties, data transfers, DPA needs); threat model updated where they change a risk
- Evidence: docs/adr/0019 (optional server + Postgres, separate service, demo stays server-free), 0020 (Hetzner first, EU-owned managed DB later, hyperscaler only on demand), 0021 (AI Act risk class, Art. 50 transparency, GDPR roles, transfers, DPA needs); all three `proposed`; indexed in docs/adr/README.md; threat model: T19 added, T6 and T13 updated; UI claims in 0021 checked against `apps/web/messages/en.json`; `prettier --check docs` clean (see commit)

## V-12 Benchmarks and performance budgets
- Status: in review
- Depends on: V-01
- Acceptance: docs/performance.md has numbers for 10k/100k/1M rows; CI fails on bundle size or benchmark regression; Lighthouse CI runs
- Evidence: `pnpm bench:update` + `pnpm bench:gate` (10k/100k/1M rows, numbers in docs/performance.md); `pnpm test:scripts` (9 unit tests for the gates); `pnpm budget:bundle` (180.8 KB gzip, ceiling 190 KB, +5% vs baseline); `pnpm lhci` passed locally on /de and /en (median of 3: Perf 99-100, A11y 100, BP 96, SEO 100, LCP 0.77 s, CLS 0). CI jobs `Performance budgets` and `Lighthouse CI` are new in ci.yml and can only be confirmed on GitHub.
- Deviation: first-load JS of / is 180.8 KB, above the 120 KB target, so the enforced ceiling is 190 KB until the gap is closed (see docs/performance.md, "Known gap"). Follow-up needed (P1-27 or a new task).

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

## V-21 Make fixture generation deterministic and keep it out of committed files
- Status: todo
- Depends on: V-01
- Note: found 2026-11-03. The tests do not rewrite `packages/parsers/test/fixtures/python-*.json`
  (verified: parsers tests in main leave `git status` clean). Only `scripts/generate-python-fixtures.py` writes them, by hand.
  Old worktrees showed them as modified because Prettier reformatted them before `.prettierignore` listed the folder (#24).
- Acceptance: one documented command regenerates the fixtures byte-identically; CI fails if a regenerate changes a committed file; no format or test step can modify them
- Evidence:
