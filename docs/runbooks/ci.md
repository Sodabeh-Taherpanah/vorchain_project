# CI runbook

Pipelines for pull requests and `main`, set up in Task 0. Preview deploys and release-please
arrive with P1-14, production deploys and the GHCR image with P1-28, Lighthouse CI with P1-27.

## Workflows

| Workflow | Trigger | Jobs |
|---|---|---|
| `.github/workflows/ci.yml` | every PR, push to `main` | `lint`, `pr-title`, `typecheck`, `test`, `build`, `e2e`, `secrets`, `audit` |
| `.github/workflows/codeql.yml` | PRs to `main`, push to `main`, weekly | CodeQL for `javascript-typescript` and `actions` |
| `.github/dependabot.yml` | weekly (npm), monthly (actions) | grouped update PRs |

### `ci.yml` jobs

| Job | Runs | Blocks merge |
|---|---|---|
| Lint | `pnpm format:check` + `pnpm lint` (ESLint incl. package boundaries) | yes |
| PR title (Conventional Commit) | commitlint on the PR title, which becomes the squash commit | yes (PRs only) |
| Typecheck | `pnpm typecheck` | yes |
| Unit tests (coverage) | `pnpm coverage`; per-package gates; coverage uploaded as artifact `coverage` | yes |
| Build | `pnpm build` | yes |
| E2E (Playwright, Chromium) | `pnpm test:e2e` on the production build; report + traces uploaded on failure | yes |
| Secret scan (gitleaks) | full history scan | yes |
| Dependency audit | `pnpm audit --prod --audit-level=high` | **no** (see below) |

Common setup lives in `.github/actions/setup` (pnpm from `packageManager`, Node from `.nvmrc`,
pnpm store cache, `pnpm install --frozen-lockfile`, Turborepo cache per job). The e2e job restores
the build job's Turborepo cache, so its `build` step is a cache hit. Playwright browsers are cached
per Playwright version.

Security settings: default `permissions: contents: read`, jobs widen only what they need
(`pull-requests: read` for gitleaks, `security-events: write` for CodeQL). Every action is pinned
to a commit SHA with the version in a comment; Dependabot keeps them current. `concurrency`
cancels superseded runs of the same PR or branch.

### Why the audit job is non-blocking
A new advisory in a transitive dependency would otherwise block every unrelated PR until upstream
ships a fix. The job uses `continue-on-error: true`, so it shows as failed but does not fail the
workflow. Triage: check the advisory, update or override the dependency in a `build(deps)` PR. Make
it blocking (remove `continue-on-error`) once the dependency set is stable (review at P1-27).

## Required status checks (manual GitHub setting)
Branch protection for `main` is not stored in the repo. Set it in *Settings -> Rules* (or
*Branches*): require a PR, 1 approving review (CODEOWNERS), linear history, squash merge only,
no force pushes or deletions, and these required checks:
`Lint`, `PR title (Conventional Commit)`, `Typecheck`, `Unit tests (coverage)`, `Build`,
`E2E (Playwright, Chromium)`, `Secret scan (gitleaks)`,
`Analyze (javascript-typescript)`, `Analyze (actions)`.

## Common failures
| Symptom | Fix |
|---|---|
| `ERR_PNPM_OUTDATED_LOCKFILE` | Run `pnpm install` locally and commit `pnpm-lock.yaml`. |
| `ERR_PNPM_IGNORED_BUILDS` after adding a package | Decide in `pnpm-workspace.yaml` `allowBuilds` (prefer `false` for packages with prebuilt binaries). |
| Version rejected by `minimumReleaseAge` | Wait a day, or add the exact version to `minimumReleaseAgeExclude` after reviewing it. |
| PR title check fails | Rename the PR to `type(scope): summary` with a type and scope from AGENTS.md §7. |
| E2E fails | Download the `playwright-report` artifact; open `trace.zip` at https://trace.playwright.dev. |
| Coverage below threshold | Add tests; lowering a gate needs an ADR (ADR-0008). |

## Local notes
- `pnpm install` runs `lefthook install` (the `prepare` script). Hooks: Prettier + ESLint on staged
  files, commitlint on the message. Skip once with `LEFTHOOK=0 git commit ...` (CI still checks).
- If the Playwright CDN is not reachable from your network (it answered HTTP 403 "not available in
  your location" on the owner's machine in Sep 2026), point Playwright at another mirror with
  `PLAYWRIGHT_DOWNLOAD_HOST`, or run e2e only in CI.
