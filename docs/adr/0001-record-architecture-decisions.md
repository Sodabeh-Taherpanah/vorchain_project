# 0001. Record architecture decisions in MADR format

- Status: accepted
- Date: 2026-09-25
- Deciders: Sodabeh Taherpanah

## Context and problem
Vorchain is built by one founder working with several AI agents (architect, builder, qa, devops)
across many short sessions. Agents start without memory of earlier sessions, and the repo is also
a portfolio that reviewers read. Decisions such as "why a Web Worker", "why Vercel" or "why
TypeScript 6 and not 7" must be findable, reviewable and changeable without archaeology.

## Options considered
1. **MADR files in `docs/adr/`** (Markdown Any Decision Records): plain Markdown, one file per
   decision, reviewed in PRs like code. Pros: versioned with the code, readable on GitHub, easy for
   agents to read. Cons: needs discipline to keep status up to date.
2. **Nygard-style ADRs** (Context / Decision / Consequences only). Pros: shorter. Cons: no explicit
   "options considered", which is exactly what reviewers and future agents need.
3. **Wiki or Notion pages.** Pros: rich editing. Cons: not versioned with code, invisible to agents
   working in the repo, drifts from reality.
4. **No formal records, only PR descriptions.** Pros: zero overhead. Cons: decisions are scattered
   and hard to find.

## Decision
We choose **MADR in `docs/adr/`**, using the lean template in `0000-template.md`:
- File name `NNNN-kebab-title.md`, numbers never reused.
- One decision per ADR, at least two options, a clear decision and consequences.
- Status: `proposed` (needs owner confirmation), `accepted`, or `superseded by NNNN`. An accepted ADR
  is never rewritten; a change of mind is a new ADR that supersedes it.
- Library versions checked at decision time are listed under "References".
- Any PR that makes a non-obvious technical choice adds an ADR in the same PR.

## Consequences
- Positive: decisions are reviewable in PRs, discoverable by agents and reviewers, and the
  "options considered" section prevents re-litigating settled questions.
- Negative / risks: small overhead per decision; ADRs can go stale if statuses are not updated.
- Follow-ups: the PR template (Task 0) gets a checkbox "ADR added or updated if a decision was made".

## References
- MADR: https://adr.github.io/madr/ (checked 2026-09-25)
