# Session state

- Current task: V-19 (wire AI into apps/web), branch `feat/V-19-ai-in-web`, 7 commits ahead of main, NOT pushed
- Last finished: V-10 (merged in #62), deps audit fix (#63). V-19 built, QA done (fixes in a399d1e), all local checks green (lint, typecheck, coverage, build, Chromium e2e 105 passed)
- Half-done: V-19 is "in review" in docs/backlog-ai.md. Not ticked done until CI e2e (Firefox/WebKit) is green
- Next step: ask the owner "Push this branch, open a PR, and merge it when CI is green?" (owner runs `! git push -u origin feat/V-19-ai-in-web` because .claude/settings.json still denies git push). Then PR, wait for CI, ask before merge, tick V-19 done, then V-20 (ADRs from 0019), then V-12
- Open questions: PR title check does not re-run on title edit (ci.yml pull_request types lack `edited`); optional small CI task. V-21 = deterministic fixture generation. Revoke the GitHub token that was in an old dropped stash (commit 3e8f672 is still in .git until gc)
- Local-only note: Chromium e2e runs here via a symlink ~/Library/Caches/ms-playwright/chromium_headless_shell-1243 -> 1248 (the Playwright download is blocked, 403); Firefox/WebKit are CI only. Run `pnpm --filter @vorchain/web build` before e2e
- Known gaps for V-19: no test that a new file resets the AI session; real-provider CORS cannot be proven by the stubbed e2e; no CSP yet (P1-27); Datenschutz page still a stub (P1-24)
- Check commands: pnpm check
