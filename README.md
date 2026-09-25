# Vorchain

> See the material shortages your ERP doesn't show, before production stops.

Vorchain compares the ERP's *promised* supplier dates with each supplier's *real* delivery history. It then flags materials that will run out even though the ERP says everything is fine. Phase 1 is a website with an in-browser demo, where **your files never leave your browser**.

**Status:** Phase 1 planning. Code bootstrap follows Task 0 in `docs/backlog.md`.

## Docs
| | |
|---|---|
| Product spec (Phase 1) | [`docs/spec/phase-1-demo.md`](docs/spec/phase-1-demo.md) |
| Architecture (C4, data flow) | [`docs/architecture/`](docs/architecture/README.md) |
| Decisions | [`docs/adr/`](docs/adr/) |
| Backlog | `docs/backlog.md` (created by the architect agent) |
| Conventions for humans and AI agents | [`AGENTS.md`](AGENTS.md) |
| Reference algorithm (Python) | [`reference/python-prototype/`](reference/python-prototype/) |

## Working with AI agents
Start with [`START_HERE.md`](START_HERE.md). Agents: **architect** → **builder** → **qa** → **devops**.
- Claude Code: `.claude/agents/` (rules via `CLAUDE.md` → `AGENTS.md`)
- GitHub Copilot: `.github/agents/`

## License
TBD (decide before making the repository public).
