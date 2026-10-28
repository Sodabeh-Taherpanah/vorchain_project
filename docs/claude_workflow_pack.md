# Claude workflow pack for Vorchain (VS Code)

Four small files. Copy each block into the path shown. Merge with what already exists in the repo (it already has `CLAUDE.md`, `AGENTS.md` and `.claude/`), do not overwrite blindly.

Tip: if you use a different agent (for example Copilot), the same text works in `.github/copilot-instructions.md`, and the two commands become prompt files. Skills and slash commands below are for Claude Code.

---

## 1. Add to `CLAUDE.md` (rules the agent reads every session)

```markdown
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
```

## 2. `.claude/settings.json` (permissions, so you stop saying "commit / don't push")

```json
{
  "permissions": {
    "allow": [
      "Bash(git fetch:*)",
      "Bash(git pull --ff-only:*)",
      "Bash(git log:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(pnpm check:*)",
      "Bash(pnpm test:*)",
      "Bash(pnpm lint:*)",
      "Bash(pnpm typecheck:*)"
    ],
    "deny": [
      "Bash(git push:*)",
      "Bash(git reset --hard:*)"
    ]
  }
}
```

Check it with `/permissions` inside Claude Code, because the exact rule syntax can change between versions. With this, commits happen automatically and a push is always blocked until you remove the rule or push yourself.

## 3. Two commands

`.claude/commands/next.md`

```markdown
---
description: Continue with the next backlog task (resume without re-reading the repo)
---
0. Sync check first (see "Working rules" in CLAUDE.md): `git fetch`, compare local with GitHub, `git pull --ff-only` only if the tree is clean and you are only behind. Report in one line. If diverged or dirty, stop and ask.
1. Read only `docs/SESSION.md` and `docs/backlog-ai.md`.
2. If SESSION.md names a task in progress, continue it. Otherwise take the first "todo" whose dependencies are done.
3. Set its status to "doing", do the work, run the checks, commit.
4. Update the task (status, evidence) and `docs/SESSION.md`.
5. Report in five lines or less: what is done, what is next, any open question. Then stop.
```

`.claude/commands/pause.md`

```markdown
---
description: Save state so the next session can continue without re-reading the code
---
Update `docs/SESSION.md` with: current task id, what is finished, what is half-done (files touched, what is missing), the exact next step, open questions, commands to run the checks. If there are uncommitted changes, commit them as "wip:" only if checks pass; otherwise list them in SESSION.md. Do not push.
```

To continue later: open a new chat and run `/next`. Or use `claude --continue` / `claude --resume` to reopen the previous conversation. The file route is more reliable because it does not depend on the old chat still being available.

## 4. `docs/SESSION.md` (small, always current)

```markdown
# Session state

- Current task: none
- Last finished: -
- Half-done: -
- Next step: start the first todo in docs/backlog-ai.md
- Open questions: -
- Check commands: pnpm check
```

## 5. `docs/backlog-ai.md` (task by task)

Keep the existing `docs/backlog.md` for Phase 1. This new file is for the AI layer. Because the old backlog showed everything as "Done", phase A task A1 will re-verify it.

```markdown
# AI layer backlog

Status: todo | doing | blocked | done. "done" needs evidence.

## V-01 Verify real status of Phase 1 backlog
- Status: todo
- Depends on: -
- Acceptance: docs/STATUS.md lists every task with claimed vs real status and evidence
- Evidence:

## V-02 License decision (waiting for owner)
- Status: todo
- Depends on: V-01
- Acceptance: LICENSE and README note match the owner's choice
- Evidence:

## V-03 LlmProvider interface + fake provider
- Status: todo
- Depends on: V-01
- Acceptance: packages/llm builds; unit tests pass; engine does not import it
- Evidence:

## V-04 Ollama + OpenAI-compatible + Anthropic adapters
- Status: todo
- Depends on: V-03
- Acceptance: each adapter passes the same contract tests (fake HTTP)
- Evidence:

## V-05 Structured explanation + supplier email draft
- Status: todo
- Depends on: V-03
- Acceptance: JSON validated by schema; test proves raw files cannot reach the provider
- Evidence:

## V-06 Prompt injection guardrails + PII masking
- Status: todo
- Depends on: V-05
- Acceptance: injection test strings fail to change behavior
- Evidence:

## V-07 Evaluation set (about 20 cases)
- Status: todo
- Depends on: V-05
- Acceptance: runs in CI with the fake provider
- Evidence:

## V-08 MCP server package
- Status: todo
- Depends on: V-01
- Acceptance: tools list_shortages and get_projection callable; test calls them
- Evidence:

## V-09 Agent with human approval
- Status: todo
- Depends on: V-05, V-08
- Acceptance: real interrupt, state saved, nothing sent automatically
- Evidence:

## V-10 ADRs 0007 to 0010 + C4 + threat model
- Status: todo
- Depends on: V-01
- Acceptance: files exist and are consistent with the code
- Evidence:

## V-12 Benchmarks and performance budgets
- Status: todo
- Depends on: V-01
- Acceptance: docs/performance.md has numbers for 10k/100k/1M rows; CI fails on bundle size or benchmark regression; Lighthouse CI runs
- Evidence:

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
```
