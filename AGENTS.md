# AGENTS.md: Vorchain

This is the single source of truth for every AI coding agent (GitHub Copilot, Claude Code, Codex, Cursor) and for humans working in this repo.
Role-specific agents live in `.github/agents/`. They all follow this file. If anything conflicts, this file wins, except where the user explicitly says otherwise.

## 1. What we are building
**Vorchain** warns production planners at German mid-sized manufacturers ("Mittelstand", 50–500 employees) about **material shortages that their ERP does not show**.
The ERP plans with the supplier's *promised* date. We add each supplier's *real historical delay* (80th percentile, in working days). That exposes "hidden risks": materials that look fine in the ERP but will run out before the goods really arrive.

**Phase 1 (current):** a marketing website plus an **in-browser demo**. The full spec is in `docs/spec/phase-1-demo.md`. Read it before any work.
The product logic already exists as a tested Python prototype in `reference/python-prototype/`. The TypeScript engine must reproduce its results (see §6 Parity).

This repo is also the owner's **technical portfolio**. Code quality, tests, docs and CI/CD must be production-grade and easy for a reviewer to follow.

## 2. Non-negotiable principles
1. **Privacy by design.** In Phase 1, customer files are parsed and analysed **only in the browser** (Web Worker). They are never uploaded, logged or sent to analytics. This is a product promise ("Ihre Daten verlassen nie Ihren Browser"), so treat any violation as a critical bug.
2. **Pure domain core.** Business logic lives in `packages/engine`. It is pure TypeScript with no React, DOM, Node or I/O imports, and it is deterministic (pass `asOf` in; never read the clock inside the engine).
3. **Explainability.** Every alert carries a human-readable *why* and *next action*. No black box.
4. **German first, English second.** All UI text goes through i18n. No hard-coded user-facing strings. Default locale `de`.
5. **Small, reviewable steps.** One task per branch, one purpose per commit, PRs under ~400 changed lines where possible.
6. **Tests before "done".** A task is done only when lint, typecheck, unit tests and e2e tests (where relevant) all pass locally and in CI.

## 3. Tech stack (verify latest stable before installing)
Always check the latest stable version (`pnpm view <pkg> version`) and the official docs before adding a dependency. Pin versions via the lockfile. Do not use deprecated APIs. As of Sep 2026 the expected majors are:

| Concern | Choice |
|---|---|
| Runtime | Node.js **active LTS** (24.x; check if 26 LTS is out), `.nvmrc` + `engines` + `packageManager` field |
| Package manager / monorepo | **pnpm** workspaces + **Turborepo** |
| Language | **TypeScript** strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). TS 7 (native) if the toolchain supports it, else latest 5.x/6.x |
| Web app | **Next.js 16.x** App Router, React 19, Server Components by default, static generation for marketing pages |
| Styling / UI | **Tailwind CSS 4.x**, **shadcn/ui** (copy-in components), `lucide-react` icons, CSS variables for theming, dark mode |
| i18n | **next-intl** with `/[locale]` routing (`de`, `en`), `hreflang` alternates |
| Validation | **zod 4** at every boundary (file parsing, forms, env vars) |
| Parsing | **papaparse** (CSV) and **SheetJS** installed from the official `cdn.sheetjs.com` tarball, not the outdated npm version (XLSX). Both run inside the Web Worker |
| Worker bridge | **Comlink** |
| Charts | **Recharts 3** (or visx if Recharts blocks a requirement; write an ADR) |
| Unit / component tests | **Vitest 4** + Testing Library + `@vitest/coverage-v8`; **fast-check** for property-based engine tests |
| E2E / a11y / perf | **Playwright** + `@axe-core/playwright`; **Lighthouse CI** budgets |
| Lint / format | ESLint 9 flat config (`typescript-eslint`, `eslint-plugin-jsx-a11y`, Next config) + Prettier (+ `prettier-plugin-tailwindcss`). Oxlint as an optional fast pre-pass |
| Git hooks | **lefthook** (pre-commit: lint-staged-style format + lint on staged files; commit-msg: commitlint) |
| Release | **release-please** (Conventional Commits → CHANGELOG + SemVer tags) |
| CI/CD | **GitHub Actions**. Preview deploy per PR, production deploy on release. Hosting per ADR-0006: Docker container (`output: 'standalone'`) on Hetzner Cloud in Germany, deployed with Coolify; image also pushed to GHCR for portability |
| Security | Dependabot or Renovate, CodeQL, gitleaks, `pnpm audit` in CI, strict security headers / CSP |
| Analytics | Privacy-friendly and cookieless only (Plausible or Umami, EU-hosted), and **never** on demo data events |

## 4. Repository layout (target)
```
vorchain/
├─ apps/
│  └─ web/                     # Next.js site + demo UI
│     ├─ src/app/[locale]/     # routes: /, /demo, /kontakt, /impressum, /datenschutz
│     ├─ src/components/       # ui/ (shadcn), sections/, demo/
│     ├─ src/workers/          # analysis.worker.ts (Comlink)
│     ├─ src/i18n/ messages/   # de.json, en.json
│     └─ e2e/                  # Playwright specs
├─ packages/
│  ├─ engine/                  # pure domain logic: types, supplier stats, projection, ranking, explanations
│  ├─ parsers/                 # CSV/XLSX → validated domain input (zod), German/English header aliases
│  ├─ sample-data/             # generated demo datasets (DE + EN) + generator
│  └─ config/                  # shared tsconfig, eslint, prettier, vitest presets
├─ docs/
│  ├─ spec/                    # product specs per phase
│  ├─ architecture/            # C4 diagrams (Mermaid), data flow, glossary
│  ├─ adr/                     # Architecture Decision Records (MADR)
│  └─ runbooks/                # deploy, rollback, incident
├─ reference/python-prototype/ # read-only source of truth for engine behaviour
├─ .github/                    # workflows, agents, templates, CODEOWNERS
└─ AGENTS.md
```
Dependency rule: `apps/web → parsers → engine`. `engine` depends on nothing internal. Enforce this with ESLint `no-restricted-imports` or `eslint-plugin-boundaries`.

## 5. Coding standards
- Functions stay small and named by intent. Avoid `any`; use `unknown` + zod at boundaries. Model domain types explicitly (`MaterialId` branded strings, `IsoDate`).
- Errors: domain functions return typed results (`Result<T, DataError>`) for expected failures. Throw only for programmer errors. User-facing error messages are i18n keys with specific fix hints (e.g. "Spalte *Liefertermin* nicht gefunden – gefundene Spalten: …").
- React: Server Components by default; `"use client"` only where interactivity needs it. No data fetching in client components for static content. Accessible by default (labels, focus states, keyboard, `prefers-reduced-motion`).
- Styling: Tailwind utilities + design tokens in CSS variables. No inline magic colors. Mobile-first and responsive down to 360px.
- Performance budgets: LCP < 2.0s and CLS < 0.05 on the landing page (mobile, Lighthouse). JS for `/` < 120 KB gzip. The demo worker and XLSX parser are lazy-loaded only on `/demo`.
- SEO: Next Metadata API per page and locale, `sitemap.ts`, `robots.ts`, canonical + `hreflang`, JSON-LD (`Organization`, `SoftwareApplication`, `FAQPage`), OG images via `next/og`, semantic HTML with one `h1` per page.
- Legal (Germany): `Impressum` and `Datenschutzerklärung` pages are required. No cookies that need consent in Phase 1, so no cookie banner.
- Comments explain *why*, not *what*. Public engine functions get TSDoc.

## 6. Testing strategy
| Layer | Tool | Rule |
|---|---|---|
| Engine unit | Vitest | ≥ 95% line/branch coverage on `packages/engine`; table-driven tests for every rule |
| Engine properties | fast-check | e.g. "adding a later receipt never creates an earlier shortage"; "severity CRITICAL ⇒ min stock < 0" |
| **Parity** | Vitest | Engine output on `reference/python-prototype/sample_data*` must equal `reference/python-prototype/golden/*.json` (same materials, severity, dates, hidden flag, order) |
| Parsers | Vitest | German/English headers, `;`/`,`/tab, UTF-8/BOM/Windows-1252, `1.234,5` numbers, `05.10.2026` dates, missing-column errors |
| Components | Vitest + Testing Library | behaviour, not implementation; a11y roles |
| E2E | Playwright | landing renders in de/en; demo with sample data shows ≥ 1 hidden risk; XLSX upload happy path + wrong-file error; **network assertion: no request carries file content** |
| Accessibility | axe via Playwright | zero serious/critical violations on all pages |
| Performance/SEO | Lighthouse CI | Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO = 100 |

Overall coverage gate: 80% (web), 95% (engine). Tests must be deterministic: fixed `asOf`, seeded data, no real timers.

## 7. Git workflow and commits
- Trunk-based: `main` is always deployable and protected (PR + green CI + 1 review, linear history, squash-merge).
- Branch names: `feat/<scope>-<short>`, `fix/…`, `chore/…`, `docs/…`, `test/…`, `ci/…`, `refactor/…`.
- **Conventional Commits** (enforced by commitlint): `type(scope): imperative summary`
  - types: `feat fix docs style refactor perf test build ci chore revert`
  - scopes: `engine parsers sample-data web demo i18n seo ui ci infra docs deps`
  - example: `feat(engine): flag hidden risk when ERP view shows shortage later`
  - breaking change: `feat(engine)!: …` + `BREAKING CHANGE:` footer
- Every PR uses the template: What / Why / How tested / Screenshots / Checklist. Link the task ID from `docs/backlog.md`.
- Never commit secrets, `.env*` (except `.env.example`), customer data or generated reports.

## 8. Definition of Done
- [ ] Acceptance criteria of the task met
- [ ] Tests added/updated and passing; coverage gates hold
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green; e2e green if UI changed
- [ ] i18n keys in both `de` and `en`
- [ ] Docs updated (README, ADR if a decision was made, architecture diagram if structure changed)
- [ ] Conventional commit(s), PR description complete
- [ ] Task ticked "Done" in `docs/backlog.md` in the same PR (updates `PROJECT_MAP.html`)
- [ ] PR description has a "Deviations from backlog" section ("None" if there are none)

## 9. Commands (to be created in Task 0)
```
pnpm i            pnpm dev          pnpm build
pnpm lint         pnpm typecheck    pnpm test         pnpm test:e2e
pnpm coverage     pnpm lhci         pnpm format
```

## 10. How agents collaborate
`architect` (plan, diagrams, ADRs, backlog) → `builder` (implement one task, TDD) → `qa` (verify, extend tests, review; only when the review rule below requires it) → `devops` (CI/CD, deploy, release, security).
Each agent ends its turn with: what changed, how it was verified, and the suggested next handoff.

### Review rule after each builder PR
1. Decide whether a QA review is needed. Run the `qa` agent when ANY of these is true:
   - the builder reports gaps or open questions
   - a change is not checked against the Python prototype (parity)
   - privacy or security code is touched (file handling, Web Worker, network, analytics, headers/CSP, contact form)
   - UI changes could not be tested
   - it is a large refactor
   - tests are deleted, skipped (`.skip` / `.only`) or loosened
   - coverage thresholds or lint rules are changed
   - CI workflows (`.github/workflows`), git hooks (`lefthook.yml`), golden files in `reference/`, or dependencies in `package.json` change
2. Otherwise, review the main code yourself.
3. In the same PR, tick the task "Done" in `docs/backlog.md` (so `PROJECT_MAP.html` updates).
4. List any decision that departs from the backlog under a heading "Deviations from backlog" in the PR description. Write "None" if there are none.
5. When CI is green, tell the owner the PR is ready, with a 3–5 line summary: what changed, whether QA ran (and why or why not), and any deviations.
6. Do NOT merge. The owner merges the PR on GitHub.

### Working with the owner (save tokens)
1. Make reasonable decisions yourself. Ask the owner only if it costs money, needs an account, or cannot be undone.
2. If you must ask, ask all questions at once.
3. Keep ADRs short (5–10 lines). Don't re-read files you have already read.
4. Do only the one task the owner gives you, then stop.
