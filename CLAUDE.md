# CLAUDE.md

Follow all project rules in @AGENTS.md (single source of truth).

Specialised subagents live in `.claude/agents/`: architect, builder, qa, devops.

## Working rules

- START of every session, before anything else, sync check (read-only, no code reading): run `git fetch`, then `git status -sb` and `git log --oneline HEAD..@{u}` and `git log --oneline @{u}..HEAD`.
  - Behind GitHub, clean tree: run `git pull --ff-only`.
  - Uncommitted local changes: report them and ask before pulling.
  - Ahead of GitHub: tell me (I decide when to push).
  - Diverged, or the pull is not fast-forward: STOP and ask. Never force, rebase or reset on your own.
  - Wrong branch or no upstream: tell me.
  Say the result in one line, then continue.
- Work from the backlog in `docs/backlog-ai.md`, one task at a time, top "todo" first.
- Do NOT re-read the whole codebase at the start. Read only `docs/SESSION.md` and the current task in the backlog. Open other files only when the task needs them.
- Commit after each finished task (Conventional Commits, one task per commit) without asking. Run lint, typecheck and tests first.
- NEVER push, open a PR, or change the license unless I say so explicitly.
- A task is "done" only when its acceptance checks pass. Write the evidence (test name or command) in the backlog. Never tick a task without evidence.
- When you stop or I say "pause", run the pause routine: update `docs/SESSION.md`.
- If a task would break the architecture (browser-only core, package boundaries, parity tests), stop and ask.
