# 0017. Review agent stops for human approval; sending is a separate step

- Status: accepted
- Date: 2026-11-02
- Deciders: Sodabeh Taherpanah

## Context and problem
An agent that drafts supplier e-mails must never contact a supplier on its own. A prompt rule ("ask first")
is not a control.

## Options considered
1. **Prompt-level approval.** The model could be talked out of it.
2. **Confirmation inside one long-running process.** State is lost on restart; the sender is still reachable.
3. **Two functions with a saved state between them; the first has no sender.**

## Decision
Option 3 in `@vorchain/agent`. `startRun` receives tools, a provider and a store, but no sender, so it cannot
send. It saves `RunState` as validated JSON (versioned) and returns `awaiting_approval`. `resumeRun`, in a later
call, loads the state and sends only proposals a person approved, once each (second decision gives
`ALREADY_DECIDED`). Edits pass the same schema and output guard as model drafts; a bad batch sends nothing; a failed
send is recorded by code and not retried. The agent depends on `llm` only and nothing may import it.

## Consequences
- Positive: the guarantee is structural and tested; state survives restarts and can live in any store.
- Negative: two-step flow needs a UI or CLI for the decision (not built yet).

## References
- `packages/agent/src/agent.test.ts`, `packages/agent/src/resume.ts`
