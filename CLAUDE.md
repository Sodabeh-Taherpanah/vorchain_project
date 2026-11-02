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
- NEVER push, open a PR, merge, or change the license unless I say so explicitly (see "Branch workflow" below).
- A task is "done" only when its acceptance checks pass. Write the evidence (test name or command) in the backlog. Never tick a task without evidence.
- When you stop or I say "pause", run the pause routine: update `docs/SESSION.md`.
- If a task would break the architecture (browser-only core, package boundaries, parity tests), stop and ask.

## Branch workflow
- One backlog task = one short-lived branch named <type>/<task-id>-<slug>, created from an up-to-date main. No parallel worktrees unless I ask.
- Work and commit on that branch. When the task is done and checks pass, ask me ONE question: "Push this branch, open a PR, and merge it when CI is green?" Do each step only after I say yes. If I say yes to push only, stop there.
- On "yes": run `git push -u origin <branch>`, then `gh pr create --base main --fill`, then wait for CI (`gh pr checks`). When CI is green, ask me once more before running `gh pr merge --merge`. Never merge with failing or pending checks.
- Never push to main directly. Never force-push. Never merge without my explicit yes in that session.
- After the merge: `git switch main`, `git pull --ff-only`, delete the merged local branch with `git branch -d`, then continue with the next backlog task on a new branch.
- At the start of each session, after the sync check: pull main (fast-forward only); list local branches whose remote branch is gone or whose PR is merged; delete them with `git branch -d` (use -D only if the PR is merged, it exists on GitHub and has 0 unpushed commits; list them first). Remove their worktrees if clean.
- Keep at most one open task branch at a time.
