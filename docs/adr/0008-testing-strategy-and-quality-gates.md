# 0008. Testing strategy and quality gates

- Status: accepted
- Date: 2026-09-25
- Deciders: Sodabeh Taherpanah

## Context and problem
The product's value depends on correct numbers (a wrong critical date is worse than no tool), the
privacy promise must be proven, and the repo is a portfolio where CI results are visible. Agents
implement tasks in small steps, so every task needs an unambiguous, automated definition of "done".

## Options considered
1. **Layered pyramid with hard CI gates** (unit + property + parity + component + e2e + a11y +
   Lighthouse), each layer with a clear owner and threshold. Pros: fast feedback from unit tests,
   real confidence from parity and e2e, measurable quality. Cons: more CI minutes, flaky-test risk
   in e2e.
2. **Unit tests only, manual QA for UI.** Pros: cheap. Cons: no proof of privacy or a11y; manual
   QA does not scale with agent-driven development.
3. **E2E-heavy testing.** Pros: tests what users see. Cons: slow, flaky, poor diagnostics for
   engine bugs.

## Decision
We choose **option 1**, with these tools and gates.

| Layer | Tool (version checked 2026-09-25) | Gate in CI |
|---|---|---|
| Engine unit | `vitest@5.0.x`, `@vitest/coverage-v8@5.0.x` | >= 95 % lines and branches on `packages/engine` |
| Engine properties | `fast-check@4.10.x` | Part of `pnpm test`; fixed seed in CI, seed printed on failure |
| Parity | Vitest vs `reference/python-prototype/golden/*.json` | Must pass; blocks merge |
| Parsers | Vitest, fixtures in `packages/parsers/test/fixtures/` | >= 90 % lines |
| Components | Vitest + `@testing-library/react@16.3.x` + jsdom | Web overall >= 80 % lines |
| E2E | `@playwright/test@1.63.x` (Chromium on every PR; Firefox + WebKit for `demo.spec.ts`) | Must pass |
| Accessibility | `@axe-core/playwright@4.13.x` | Zero serious/critical violations on every page, both locales |
| Privacy | Playwright request interception | No request URL or body contains the fixture marker string |
| Perf / SEO | `@lhci/cli@0.15.x` on `/de` and `/de/demo` (mobile preset) | Perf >= 90, A11y >= 95, Best Practices >= 95, SEO = 100 |
| Bundle | `next build` output check script | JS for `/` <= 120 KB gzip |
| Static | ESLint, `tsc --noEmit`, Prettier check | Zero errors |

Note: AGENTS.md lists Vitest 4; Vitest 5.0 is the current stable major (Sep 2026) and is used
instead. Vitest 5 requires Vite 6.4+/7/8 (peer), which Task 0 installs explicitly.

Conventions:
- Tests live next to code (`*.test.ts`) in packages; Playwright specs in `apps/web/e2e/`.
- Determinism: fixed `asOf` (`2026-10-05`), seeded generators, `vi.useFakeTimers()` only where time
  is involved, no real network (Playwright routes external hosts to 404 except the app).
- Table-driven tests for every engine rule (spec §5.2 steps 1 to 9).
- Properties to include (at minimum): adding a receipt never makes the first stock-out earlier;
  CRITICAL implies `minProjectedStock < 0`; realistic view is never better than ERP view
  (realistic stock-out date <= ERP stock-out date when both exist) **for inputs whose POs are all
  promised on or after `asOf`** (overdue POs are dropped by the ERP view but can be shifted into the
  window by the realistic view; see ADR-0005 item 5); `workdaysBetween(a, addWorkdays(a, n)) === n` for weekday `a`; output order is a permutation sorted by score.
- Flaky e2e tests are quarantined with an issue link within one day, never silently retried more
  than once (`retries: 1` in CI).
- CI job order: `lint + typecheck + unit` (parallel) -> `build` -> `e2e + a11y` -> `lhci`.
  Required status checks on `main`: all of them.

## Consequences
- Positive: each task has an objective "done"; engine correctness and privacy are proven
  continuously; coverage and Lighthouse badges support the portfolio.
- Negative / risks: CI time (target < 10 min per PR with Turborepo cache and sharded Playwright);
  Lighthouse scores vary on shared runners (use 3 runs, median).
- Follow-ups: Task 0 wires Vitest, Playwright skeleton and CI; P1-06 adds parity and coverage gate;
  P1-20 privacy e2e; P1-27 Lighthouse CI and bundle budget.

## References
- `vitest@5.0.2`, `@playwright/test@1.63.0`, `@axe-core/playwright@4.13.0`, `@lhci/cli@0.15.1`, `fast-check@4.10.2`, `@testing-library/react@16.3.3` (registry.npmjs.org, 2026-09-25)
