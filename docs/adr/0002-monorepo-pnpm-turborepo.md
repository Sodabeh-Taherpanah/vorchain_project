# 0002. Monorepo with pnpm workspaces and Turborepo

- Status: accepted
- Date: 2026-09-25
- Deciders: Sodabeh Taherpanah

## Context and problem
Phase 1 has one web app and three libraries with a strict dependency direction
(`apps/web -> parsers -> engine`). The engine must stay reusable for a Phase 2 backend. We need:
fast installs, strict dependency isolation (no phantom dependencies), task caching so CI stays fast,
and a layout that a reviewer understands in seconds.

## Options considered
1. **pnpm workspaces + Turborepo.** Pros: pnpm's strict `node_modules` catches undeclared imports;
   content-addressed store makes installs fast; Turborepo adds a task graph (`build` depends on
   `^build`) and local/remote caching with little config; both are widely used with Next.js.
   Cons: two tools to learn; Turborepo remote cache needs a token in CI.
2. **pnpm workspaces only** (`pnpm -r run`). Pros: one tool. Cons: no caching, no task graph
   awareness, CI re-runs everything.
3. **Nx.** Pros: powerful generators, affected-graph, module-boundary lint rule built in.
   Cons: heavier, more opinionated config, more to explain for a small repo.
4. **Single package (no monorepo).** Pros: simplest. Cons: the engine's purity and the
   `web -> parsers -> engine` rule can only be enforced by convention; harder to reuse in Phase 2.

## Decision
We choose **pnpm workspaces + Turborepo**.
- Layout: `apps/web`, `packages/{engine,parsers,sample-data,config}` (see AGENTS.md §4).
- Package names: `@vorchain/engine`, `@vorchain/parsers`, `@vorchain/sample-data`,
  `@vorchain/config`, `@vorchain/web`.
- Internal packages are consumed **as TypeScript source** ("just-in-time" packages:
  `exports` points to `src/index.ts`, Next.js uses `transpilePackages`). No separate library build
  step in Phase 1. If Phase 2 needs a published build, add `tsdown`/`tsc` emit then.
- Root `package.json` pins `"packageManager": "pnpm@12.6.0"` and `"engines": { "node": ">=24 <25" }`;
  `.nvmrc` = `24`. Node 24 is the active LTS (v24.21.0, "Krypton"); Node 26 is current but not LTS
  until late October 2026. Revisit then with a new ADR or a dependency PR.
- Module boundaries are enforced with `eslint-plugin-boundaries` (see ADR-0010).
- Turborepo remote caching is optional; CI uses `actions/cache` for `.turbo` first.

## Consequences
- Positive: strict, fast installs; cached `lint/typecheck/test/build`; the package boundaries make
  the architecture visible in the file tree.
- Negative / risks: consuming TS source means every consumer type-checks the libraries too
  (acceptable at this size). pnpm 12 is recent; if a tool breaks with it, pin a working 11.x in
  `packageManager` and note it here.
- Follow-ups: Task 0 creates the workspace; `turbo.json` defines `build`, `lint`, `typecheck`,
  `test`, `test:e2e`, `coverage`.

## References
- `turbo@2.11.4`, `pnpm@12.6.0`, Node `v24.21.0` LTS (checked 2026-09-25 via registry.npmjs.org and nodejs.org/dist/index.json)
- https://turborepo.com/docs/core-concepts/internal-packages
