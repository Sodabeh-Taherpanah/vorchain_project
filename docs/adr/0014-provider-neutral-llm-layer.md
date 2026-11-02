# 0014. Provider-neutral LLM layer with no vendor SDKs

- Status: accepted
- Date: 2026-11-02
- Deciders: Sodabeh Taherpanah

## Context and problem
Vorchain wants AI-written explanations and supplier e-mail drafts. German Mittelstand customers may
require a local model, others accept a cloud API. The engine must stay pure (ADR-0005) and tests must be
deterministic and offline.

## Options considered
1. **One vendor SDK.** Simple, but locks in a provider and pulls a large dependency into the repo.
2. **Framework (LangChain-style).** Many features we do not need; hides what is sent.
3. **Own small port (`LlmProvider.complete`) with plain-HTTP adapters and a fake.** Full control of what leaves the process.

## Decision
Option 3 in `@vorchain/llm`. Adapters for Ollama (local), OpenAI-compatible and Anthropic speak plain
HTTP through an injected `fetch`. Expected failures are returned values (`ok: false` + code), not exceptions.
All adapters pass one shared contract suite; a scripted fake provider is used in tests and CI. The package
depends on no workspace package, and the engine never imports it (ESLint `boundaries`).

## Consequences
- Positive: switch or add a provider without touching callers; no network in CI; errors never echo keys or bodies.
- Negative: we maintain three small HTTP clients and must track API changes ourselves.
- Follow-up: a real-model evaluation is run by hand only (ADR-0015, V-07).

## References
- `packages/llm/src/types.ts`, `packages/llm/src/adapters/contract.test.ts`
