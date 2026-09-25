# Copilot instructions

Follow **`AGENTS.md`** at the repo root. It is the single source of truth for stack, structure, coding standards, testing, git workflow and Definition of Done.

Before any work, read `docs/spec/phase-1-demo.md` and `docs/backlog.md` (if it exists).

Specialised agents are in `.github/agents/`: `architect`, `builder`, `qa`, `devops`. Pick the one that matches the job.

Key rules in one breath: pure TS engine with parity against `reference/python-prototype/golden`, customer files never leave the browser, German-first i18n, strict TypeScript, tests first, Conventional Commits, small PRs.
