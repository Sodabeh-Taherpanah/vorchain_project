# 0009. Commit convention and release process: Conventional Commits + release-please

- Status: accepted
- Date: 2026-09-25
- Deciders: Sodabeh Taherpanah

## Context and problem
Many small PRs from several agents need a readable history, an automatic changelog and a clear
trigger for production deploys. Trunk-based development with squash merges is already set in
AGENTS.md §7.

## Options considered
1. **Conventional Commits (commitlint + lefthook) + release-please (GitHub Action).** Pros: the
   PR title becomes the squash commit, release-please keeps an always-open release PR with the
   changelog and version bump; merging it creates a tag and GitHub Release, which triggers the
   production deploy. Cons: contributors must write correct PR titles.
2. **Conventional Commits + semantic-release.** Pros: fully automatic releases on every merge.
   Cons: no human checkpoint before production; publishes on every `feat`/`fix`, noisier for a site.
3. **Changesets.** Pros: great for multi-package npm publishing. Cons: we do not publish packages;
   extra files per PR.
4. **Manual tags and changelog.** Pros: no tooling. Cons: error-prone, no portfolio value.

## Decision
We choose **option 1**.
- Commit format `type(scope): imperative summary`, types and scopes exactly as in AGENTS.md §7.
  Enforced locally by `lefthook` `commit-msg` -> `commitlint` (`@commitlint/cli@21.x`,
  `@commitlint/config-conventional@21.x`) and in CI by linting the **PR title** (squash merge uses
  it) with a commitlint check.
- One version for the whole product (the site), not per package: release-please
  `release-type: node` on the repo root, `CHANGELOG.md` at the root, starting at `0.1.0`
  (`bump-minor-pre-major: true`, so `feat` bumps minor and breaking changes bump minor until 1.0).
  Internal packages stay `private: true` at `0.0.0`.
- Workflow `.github/workflows/release-please.yml` uses `googleapis/release-please-action@v4`
  (check for a newer major when implementing) on push to `main`.
- **Production deploy trigger:** `release: published` -> deploy workflow (ADR-0006) + GHCR image
  tagged `vX.Y.Z` and `latest`.
- `1.0.0` is cut when Phase 1 is live on the production domain with legal pages completed.

## Consequences
- Positive: readable history, automatic changelog and SemVer tags, deliberate production releases
  by merging one PR.
- Negative / risks: release-please needs a token that can trigger other workflows (a fine-grained
  PAT or GitHub App token; the default `GITHUB_TOKEN` does not trigger `release` workflows).
- Follow-ups: Task 0 adds commitlint + lefthook + PR-title check; P1-14 adds release-please;
  P1-28 adds the release-triggered production deploy.

## References
- `@commitlint/cli@21.2.3`, `lefthook@2.1.14`, `release-please@17.11.2` (CLI; the Action wraps it) (checked 2026-09-25)
- https://www.conventionalcommits.org/en/v1.0.0/ , https://github.com/googleapis/release-please-action
