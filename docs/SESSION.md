# Session state

- Current task: V-20 (ADRs 0019-0021), branch `docs/V-20-server-hosting-gdpr-adrs`, 1 commit ahead of main, NOT pushed. Status "in review" in docs/backlog-ai.md
- Last finished: V-19 code is on main (#66); its backlog entry still says "in review" and the local branch `feat/V-19-ai-in-web` is not deleted. Owner said to check V-19 and the old branches later (`gh` timed out on 2026-11-04)
- Half-done: kept `feat/ui-primitives` (8 commits not on main), `feat/ui-primitives-content`
- Next step: ask the owner "Push this branch, open a PR, and merge it when CI is green?" for V-20. Then V-12 (benchmarks), then V-21. Small follow-up idea: limits note ("can be wrong") in the AI consent step (de, en), from ADR-0021
- Open questions: owner confirms ADRs 0019-0021 (status proposed); a lawyer reviews ADR-0021 before launch; revoke the GitHub token in the old dropped stash (commit 3e8f672); PR title check does not re-run on title edit
- Check commands: pnpm check
