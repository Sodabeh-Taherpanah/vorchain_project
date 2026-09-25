# Vorchain

> See the material shortages your ERP doesn't show, before production stops.

Vorchain compares the ERP's *promised* supplier dates with each supplier's *real* delivery history. It then flags materials that will run out even though the ERP says everything is fine. Phase 1 is a website with an in-browser demo, where **your files never leave your browser**.

**Status:** Phase 1 planned (architecture, ADRs, backlog). Code bootstrap follows Task 0 in [`docs/backlog.md`](docs/backlog.md).

## Docs
| | |
|---|---|
| Product spec (Phase 1) | [`docs/spec/phase-1-demo.md`](docs/spec/phase-1-demo.md) |
| Architecture (C4, data flow, glossary) | [`docs/architecture/`](docs/architecture/README.md) · [glossary](docs/architecture/glossary.md) |
| Decisions (ADRs) | [`docs/adr/`](docs/adr/README.md) |
| Backlog (Phase 1 tasks) | [`docs/backlog.md`](docs/backlog.md) |
| Conventions for humans and AI agents | [`AGENTS.md`](AGENTS.md) |
| Reference algorithm (Python) | [`reference/python-prototype/`](reference/python-prototype/) |

## Working with AI agents
Start with [`START_HERE.md`](START_HERE.md). Agents: **architect** → **builder** → **qa** → **devops**.
- Claude Code: `.claude/agents/` (rules via `CLAUDE.md` → `AGENTS.md`)
- GitHub Copilot: `.github/agents/`

## License
TBD (decide before making the repository public).
