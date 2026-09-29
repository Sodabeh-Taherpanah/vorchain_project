<!-- PR title = the squash-merge commit: `type(scope): imperative summary` (AGENTS.md §7). -->

**Task ID:** <!-- e.g. P1-03 from docs/backlog.md -->

## What

<!-- What changes, in a few bullet points. -->

## Why

<!-- The problem this solves; link the task, spec section or ADR. -->

## Deviations from backlog

<!-- Decisions that depart from the task in docs/backlog.md, and why. Write "None" if there are none. -->

## How tested

<!-- Commands run and what you checked by hand. -->

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- [ ] `pnpm test:e2e` (if UI changed)

## Screenshots

<!-- UI changes: before/after, both locales, mobile and desktop. Otherwise "n/a". -->

## Checklist

- [ ] Task ID linked and its acceptance criteria met
- [ ] Task ticked "Done" in `docs/backlog.md`
- [ ] Tests added or updated; coverage gates hold
- [ ] i18n keys added in both `de` and `en` (if UI text changed)
- [ ] ADR added if a decision was made
- [ ] Diagrams updated if structure changed
- [ ] Docs updated (README, runbooks) where needed
- [ ] No secrets, `.env*` files, customer data or generated reports committed
