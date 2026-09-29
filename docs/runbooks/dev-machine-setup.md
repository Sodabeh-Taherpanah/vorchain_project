# Dev machine setup

Status of the local development setup, last updated 2026-09-25.

## Done

| Step | Result |
|---|---|
| Node LTS via nvm | v24.21.0, set as nvm default (`nvm alias default 'lts/*'`) |
| pnpm via corepack | 12.6.0 (`corepack enable && corepack prepare pnpm@latest --activate`) |
| `git init -b main` | Repo created on `main`. No commits yet, everything untracked. |
| Homebrew git | 2.55.0 installed and linked at `/usr/local/bin/git` (`brew link --overwrite git`) |

## Known problems on this machine

- **Xcode doesn't load on macOS 26.6.** `xcodebuild` fails with
  `libxcodebuildLoader.dylib … Symbol not found: _XPCTypeBool`. This breaks
  `/usr/bin/git` (a stub that hands off to Xcode) and `clang`, so native builds
  (Homebrew source builds, some npm packages) fail too.
- An old standalone git 2.33.0 is still in `/usr/local/git`. Nothing uses it
  any more.

## To do manually

- [x] **Fix the PATH order.** Done 2026-09-25 in `~/.bash_profile` (`~/.zshrc` loads it).
      Removed the wrong `/usr/local/bin/brew/bin` line and changed the next line to
      `export PATH=/usr/local/bin:/bin:/usr/bin:/sbin:${PATH}`. Backup:
      `~/.bash_profile.bak-2026-09-25`. `which git` now prints `/usr/local/bin/git`.
- [ ] **Fix the npm settings in `~/.bash_profile`.** It sets
      `NPM_CONFIG_REGISTRY="https://registry.npm.taobao.org"` (a mirror that was shut down in 2022)
      and `NPM_CONFIG_STRICT_SSL=false` (turns off HTTPS certificate checks). pnpm reads these
      too, so `pnpm install` will probably fail. Delete both lines to use the default registry, or
      switch to `https://registry.npmmirror.com` if you need a mirror in China.
- [ ] Optional: tidy `~/.bash_profile`. Line 9 (`export PATH=$JAVA_HOME/bin:...`) replaces PATH
      completely, so the Android, rbenv, ruby and nodenv lines above it do nothing.
- [ ] **Repair Xcode or the Command Line Tools.** Either:
      - update Xcode from the App Store, or
      - run `xcode-select --install`, then `sudo xcode-select --switch /Library/Developer/CommandLineTools`.

      Check with `clang --version` and `/usr/bin/git --version`.
- [x] **Git identity.** Already set globally (`user.name` and `user.email`).
- [x] **Add a `.gitignore` and make the first commit.** Done 2026-09-25 (`docs: add project rules, spec and agent definitions`).
- [x] **Create `package.json`** with `"packageManager": "pnpm@12.6.0"` so corepack uses the same pnpm everywhere, then run `pnpm install`.
      Done in Task 0. The repo's `.npmrc` sets `registry=https://registry.npmjs.org/`, but the
      `NPM_CONFIG_*` variables above still override it until they are removed; until then prefix
      commands with `NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ NPM_CONFIG_STRICT_SSL=true`.
- [ ] **Playwright browsers.** `cdn.playwright.dev` answered HTTP 403 ("not available in your
      location") for Chromium 153 (Playwright 1.63) on 2026-09-26. Try another network or set
      `PLAYWRIGHT_DOWNLOAD_HOST` to a mirror; CI is not affected.
- [ ] Optional cleanup: remove the old git (`sudo rm -rf /usr/local/git`) and the old Node (`nvm uninstall 18.18.2`).

## Quick check

Run this in a new terminal. Every line should print a version, with no `xcode-select` errors:

```sh
node -v && pnpm -v && which git && git --version && clang --version | head -1
```
