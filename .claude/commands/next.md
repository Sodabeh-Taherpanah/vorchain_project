---
description: Continue with the next backlog task (resume without re-reading the repo)
---
0. Sync check first (see "Working rules" in CLAUDE.md): `git fetch`, compare local with GitHub, `git pull --ff-only` only if the tree is clean and you are only behind. Report in one line. If diverged or dirty, stop and ask.
1. Read only `docs/SESSION.md` and `docs/backlog-ai.md`.
2. If SESSION.md names a task in progress, continue it. Otherwise take the first "todo" whose dependencies are done.
3. Set its status to "doing", do the work, run the checks, commit.
4. Update the task (status, evidence) and `docs/SESSION.md`.
5. Report in five lines or less: what is done, what is next, any open question. Then stop.
