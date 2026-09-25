# 0010. TypeScript 6.0 and ESLint 9 for Phase 1 (not TypeScript 7 / ESLint 10 yet)

- Status: accepted
- Date: 2026-09-25
- Deciders: Sodabeh Taherpanah

## Context and problem
AGENTS.md asks for TypeScript 7 (native) "if the toolchain supports it" and ESLint 9 flat config.
On 2026-09-25 the registry shows `typescript@7.0.2` and `eslint@10.11.0` as `latest`. We checked the
peer ranges of the tools we depend on:
- `typescript-eslint@8.70.1` peer: `typescript >=4.8.4 <6.1.0`, `eslint ^8.57 || ^9 || ^10`.
- `eslint-plugin-jsx-a11y@6.10.2` peer: `eslint ^3 ... ^9` (no ESLint 10).
- `eslint-config-next@16.3.6` peer: `eslint >=9`.

So TypeScript 7 is not supported by typed linting, and jsx-a11y (required by AGENTS.md) does not
declare ESLint 10 support.

## Options considered
1. **TypeScript 6.0.x + ESLint 9.39.x now; revisit when peers allow.** Pros: every tool officially
   supports the combination; no `--force`/overrides. Cons: not the newest majors; slower `tsc`.
2. **TypeScript 7 for `typecheck` only (`tsgo`), TypeScript 6 for ESLint and Next.** Pros: fast
   type checks. Cons: two compilers can disagree; confusing for reviewers and agents.
3. **TypeScript 7 + ESLint 10 with peer overrides.** Pros: newest. Cons: unsupported combinations,
   risk of subtle lint/type bugs; bad signal in a portfolio.

## Decision
We choose **option 1**: `typescript@~6.0.3` and `eslint@^9.39.5` (flat config), with
`typescript-eslint@8.x`, `eslint-plugin-jsx-a11y@6.x`, `eslint-config-next@16.x`,
`eslint-plugin-boundaries@7.x`, `prettier@3.x` + `prettier-plugin-tailwindcss`. Oxlint is not added
in Phase 1 (ESLint is fast enough at this size).

`tsconfig` base (`packages/config/tsconfig.base.json`): `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
`verbatimModuleSyntax`, `moduleResolution: "bundler"`, `target: "ES2023"`, `isolatedModules`.
The engine package additionally sets `"lib": ["ES2023"]` (no DOM types) so browser APIs cannot be
used by accident; `types: []` keeps Node types out.

Boundaries (`eslint-plugin-boundaries`): element types `engine`, `parsers`, `sample-data`, `web`;
allowed: `web -> parsers, engine, sample-data`; `parsers -> engine`; `sample-data -> engine`
(types only); `engine -> nothing`.

## Consequences
- Positive: supported, boring toolchain; strict typing; boundaries enforced by lint, not only docs.
- Negative / risks: Dependabot will keep proposing TS 7 / ESLint 10; those PRs are closed with a
  link to this ADR until the peer ranges allow them (then a new ADR supersedes this one).
- Follow-ups: Task 0 sets this up; a quarterly check "can we move to TS 7 / ESLint 10?".

## References
- Registry checks on 2026-09-25: `typescript` latest `7.0.2`, newest 6.x `6.0.3`; `eslint` latest `10.11.0`, maintenance `9.39.5`; peer ranges as quoted above.
