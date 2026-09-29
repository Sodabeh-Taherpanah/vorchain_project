# Vorchain

[![CI](https://github.com/Sodabeh-Taherpanah/vorchain_project/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Sodabeh-Taherpanah/vorchain_project/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Sodabeh-Taherpanah/vorchain_project/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/Sodabeh-Taherpanah/vorchain_project/actions/workflows/codeql.yml)

> See the material shortages your ERP doesn't show, before production stops.

Vorchain compares the ERP's *promised* supplier dates with each supplier's *real* delivery history. It then flags materials that will run out even though the ERP says everything is fine. Phase 1 is a website with an in-browser demo, where **your files never leave your browser**.

**Status:** Phase 1 in progress. The workspace, tooling and CI are set up (Task 0); features follow the [backlog](docs/backlog.md).

## Quick start
Requires Node.js 24 LTS (see `.nvmrc`) and pnpm via Corepack (version pinned in `package.json`).

```sh
nvm use            # Node 24
corepack enable    # pnpm 12.6.0 from "packageManager"
pnpm i             # installs dependencies and the git hooks (lefthook)
pnpm dev           # http://localhost:3000
```

## Commands
| Command | What it does |
|---|---|
| `pnpm check` | Quick check after each task: lint, typecheck and unit tests |
| `pnpm check:all` | Full check, the same as CI: format, lint, typecheck, tests, build and e2e |
| `pnpm dev` | Start the Next.js dev server (`apps/web`) |
| `pnpm build` | Production build of all packages (Turborepo, cached) |
| `pnpm lint` | ESLint, including the package boundary rules (`web -> parsers -> engine`) |
| `pnpm typecheck` | `tsc --noEmit` in every package (strict TypeScript) |
| `pnpm test` | Vitest unit tests in every package |
| `pnpm coverage` | Unit tests with coverage gates (engine 95 %, parsers 90 %, web 80 %) |
| `pnpm test:e2e` | Playwright against the production build (run `pnpm --filter @vorchain/web exec playwright install chromium` once) |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm lhci` | Lighthouse CI (placeholder until P1-27) |
| `pnpm map` | Refresh the task progress in `PROJECT_MAP.html` (also runs automatically when `docs/backlog.md` is committed) |

## Repository layout
```
apps/web              Next.js 16 App Router site and demo
packages/engine       pure domain logic (no I/O, DOM or Node APIs)
packages/parsers      CSV/XLSX -> validated engine input
packages/sample-data  demo datasets and generator
packages/config       shared tsconfig, ESLint, Prettier and Vitest presets
```

## Docs
| | |
|---|---|
| Product spec (Phase 1) | [`docs/spec/phase-1-demo.md`](docs/spec/phase-1-demo.md) |
| Architecture (C4, data flow, glossary) | [`docs/architecture/`](docs/architecture/README.md) · [glossary](docs/architecture/glossary.md) |
| Decisions (ADRs) | [`docs/adr/`](docs/adr/README.md) |
| Backlog (Phase 1 tasks) | [`docs/backlog.md`](docs/backlog.md) |
| Visual project map and progress (Persian) | [`PROJECT_MAP.html`](PROJECT_MAP.html), open it locally in a browser |
| CI and runbooks | [`docs/runbooks/`](docs/runbooks/ci.md) |
| Conventions for humans and AI agents | [`AGENTS.md`](AGENTS.md) |
| Reference algorithm (Python) | [`reference/python-prototype/`](reference/python-prototype/) |

## Working with AI agents
Start with [`START_HERE.md`](START_HERE.md). Agents: **architect** → **builder** → **qa** → **devops**.
- Claude Code: `.claude/agents/` (rules via `CLAUDE.md` → `AGENTS.md`)
- GitHub Copilot: `.github/agents/`

## License
TBD (decide before making the repository public).
