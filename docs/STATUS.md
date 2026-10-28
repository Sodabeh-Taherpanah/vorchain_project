# Status: verified against code

Checked 2026-10-29 on branch `docs/repo-truth-audit`. "Claimed" is the tick in `docs/backlog.md`.
Not every task is ticked Done: 26 are Done, 10 are open. For the 26 Done tasks the evidence below
was found in the code and tests; nothing was found that contradicts a tick.

Gates run locally: `pnpm lint`, `pnpm typecheck` (pass), `pnpm build` (pass), `pnpm coverage`
(passes for every package; engine 99.15 % lines, 97.32 % branches, threshold 95 %). Playwright e2e
was not re-run in this audit; CI runs it on three browsers.

| Task | Claimed | Real | Evidence |
|---|---|---|---|
| Task 0 bootstrap | Done | Done | `turbo.json`, `pnpm-workspace.yaml`, `lefthook.yml`, `.github/workflows/ci.yml` |
| P1-01 .. P1-05 engine | Done | Done | `packages/engine/src/{types,dates,rounding,supplier-stats,projection,receipts,analyse,ranking,explanations}.ts` + `*.test.ts` |
| P1-06 parity, properties, gate | Done | Done | `packages/engine/test/parity.test.ts` against `reference/python-prototype/golden/*.json`; fast-check in `analyse.test.ts`; 95 % gate in `vitest.config.ts` |
| P1-07 .. P1-10 parsers | Done | Done | `packages/parsers/src/{decode,sniff,csv,values,columns,table,rows,assemble,xlsx}.ts`, `test/python-*.test.ts` |
| P1-11 sample data | Done | Done | `packages/sample-data/src/{dataset,scale}.ts`, CI step `sample-data check` |
| P1-12, P1-13 routing, tokens, layout | Done | Done | `apps/web/src/i18n/*`, `app/[locale]/layout.tsx`, `app/globals.css`, `design-tokens.test.ts` |
| P1-14 container + release-please | Done | Done, not deployed | `Dockerfile`, `docker-compose.yml`, `release-please-config.json`; nothing is rented (`docs/deploy-hetzner.md`) |
| P1-15 worker bridge | Done | Done | `workers/analysis.worker.ts`, `analysis-service.ts`, `hooks/use-analysis.ts` |
| P1-16 .. P1-19 demo | Done | Done | `components/demo/*` (data source, settings, tiles, exception table, drawer + chart + table alternative, supplier table, CSV export, report) |
| P1-20 e2e suite | Done | Done | `apps/web/e2e/*.spec.ts` (network assertions, axe, XLSX, Firefox/WebKit via `playwright.config.ts`) |
| P1-21 landing sections | Done | Done | `components/sections/*`, `app/[locale]/home-page.test.tsx` |
| P1-29, P1-29b, P1-30 design system, shell | Done | Done | `packages/ui/src/components/*`, `components/layout/*`, `docs/design/README.md` |
| P1-31 landing visual design | Open | Open | branch `feat/ui-landing-design` has no commits beyond main |
| P1-32 demo visual pass | Open | Open | none |
| P1-22 hidden-risk chart | Open | Open | no landing chart component |
| P1-23 SEO | Open | Open | no `sitemap.ts`, `robots.ts` or JSON-LD in `apps/web/src` |
| P1-24 legal pages | Open | Open | `impressum`, `datenschutz` routes exist but only as stubs (`page-stub.tsx`) |
| P1-25 contact form | Open | Open | no Server Action; `kontakt` is a stub; `.env.example` and compose already list the mail variables |
| P1-26 analytics | Open | Open | only `demo-events.ts` (event names); no analytics script |
| P1-27 hardening | Open | Open | no CSP/security headers in `next.config.ts`; `pnpm lhci` only prints a notice |
| P1-28 production deploy | Open | Open | nothing deployed |
| P2-01 Postgres | Open | Open | intentionally later |

## Contradictions fixed in this audit
- README "License: TBD (decide before making the repository public)" while the repo is public: now states the true situation and points to the prepared options.
- README status ("Task 0") and architecture doc ("Nothing below is built yet") were stale: updated, unbuilt parts marked *planned*.
- Architecture doc described a CSP, Server Action, Brevo and analytics as if present: marked planned.
- README `lhci` row now says it is a placeholder.
- One engine test (`compare.test.ts`, property test) exceeded Vitest's 5 s default when all packages ran coverage in parallel (failed in 2 of 2 full runs; passes alone in under 1 s). Gave that test a 30 s timeout. Not a logic bug.

## CI coverage (A4)
`ci.yml` runs on every PR and on main: format + lint, PR-title commitlint, typecheck, `pnpm coverage` (includes the Python parity test and the coverage gates), sample-data check, benchmarks, build, e2e (Chromium, Firefox, WebKit), gitleaks, `pnpm audit` (non-blocking), plus CodeQL and release-please workflows. There is no separate "parity" job; parity is a test inside the engine suite.

## Contributors (A5d)
Commit authors: 51 commits by the owner (two git identities, same email) and 1 by `dependabot[bot]`. No outside human contributor. Open PRs: #48 release-please (owner, release 0.8.0), #59 and #60 Dependabot dependency bumps (not merged by this audit).

## Open questions
- Which license option (see `docs/license-options/README.md`)?
- ADR numbers 0007 to 0010 are already taken (contact form, testing, commits, toolchain). The new ADRs in Phase B and C need numbers from 0014 on, not 0007 to 0010 as the task text says. Confirm.
