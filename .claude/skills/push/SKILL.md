---
name: push
description: Push to GitHub after every commit or merge in the Vorchain repo. Use right after creating a commit, finishing a merge, or when the user says "push", "push it", "sync to GitHub" or "upload my changes".
---

# Push after every commit or merge

In this repo, every new commit or completed merge is pushed to `origin` right away.
Don't ask again before pushing. The user has approved this for normal pushes.

## Steps

1. **Find git.** Use `git` if `git --version` works. If it prints `xcode-select` errors,
   use `/usr/local/bin/git` instead (Homebrew git).
2. **Check the state.**
   - `git status --short --branch`: stop if a merge or rebase is still in progress, or if
     there are conflicts. Tell the user; don't push half-finished work.
   - `git remote -v`: if there is no `origin`, stop and ask the user for the repo URL, or
     offer to create a **private** GitHub repo with
     `gh repo create <name> --private --source . --remote origin`.
     Never create a public repo without an explicit yes.
3. **Push the current branch.**
   - First push of a branch: `git push -u origin <branch>`
   - Afterwards: `git push`
4. **If the push is rejected:**
   - *Behind the remote (non-fast-forward):* run `git pull --rebase`, then push again.
     If the rebase hits conflicts, stop and show them to the user.
   - *Protected branch* (`main` requires a PR, see AGENTS.md §7): don't work around it.
     Push to a branch named per AGENTS.md (`feat/…`, `fix/…`, `docs/…`, `chore/…`) and offer
     to open a PR with `gh pr create`.
   - *Auth error:* ask the user to run `! gh auth login`.
5. **Report in one line:** branch, commit hash and remote, e.g. `Pushed main (deb46f9) to origin`.

## Never

- `git push --force` or `--force-with-lease`, unless the user asks for it in that message.
- Push when the commit contains secrets, `.env*` (except `.env.example`), customer data or
  generated reports (AGENTS.md §7). Check `git show --stat HEAD` first if unsure.
- Delete remote branches or tags.
