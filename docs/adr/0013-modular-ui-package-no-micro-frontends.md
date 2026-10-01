# 0013. Modular UI: a shared `@vorchain/ui` design-system package, no micro-frontends

- Status: accepted
- Date: 2026-10-01
- Deciders: Sodabeh Taherpanah

## Context and problem
The owner wants a modern, modular UI built with Tailwind CSS and asked whether micro-frontends
are needed. Phase 1 is one Next.js app with about six routes (landing, demo, contact, legal),
built by one team, deployed as one Docker image. Hard limits: `/` JS < 120 KB gzip (already
tight at ~167 KB, see P1-27), LCP < 2 s, and the privacy promise (demo files never leave the
browser). Phase 2 adds a logged-in product (Postgres, P2-01) that may become a second app.

## Options considered
1. **Micro-frontends (Module Federation or runtime-loaded remotes).** Pros: independent deploys
   per team. Cons: no team split to serve; Module Federation is not supported by Next.js App
   Router / Turbopack; duplicated React runtime and remote loading cost JS and LCP; more surfaces
   to audit for the privacy promise; more CI/deploy complexity for one developer.
2. **Next.js Multi-Zones (several Next apps under one domain).** Pros: officially supported,
   each zone deploys alone. Cons: hard navigation between zones, duplicated shell; no benefit
   while there is one app.
3. **Modular monolith: one app + a shared `packages/ui` design-system package + feature folders,
   with boundaries enforced by ESLint.** Pros: one runtime, smallest JS, Server Components keep
   working, modules are already isolated (engine, parsers, sample-data); the UI package can be
   reused by a Phase 2 app. Cons: one deploy unit.

## Decision
We choose **option 3**, and keep option 2 (Multi-Zones) as the upgrade path if Phase 2 adds a
separate app or team. No micro-frontends.

- `packages/ui` (`@vorchain/ui`): Tailwind 4 theme (`@theme` tokens, light/dark CSS variables,
  `@custom-variant dark`), shadcn/ui primitives (button, card, badge, sheet, table, ...), variants
  via `class-variance-authority`, `cn()` (clsx + tailwind-merge), layout and section primitives,
  logo. Consumed as TS source (ADR-0002); `apps/web` includes it with Tailwind `@source`.
- Rules for `@vorchain/ui`: presentational only, no `next-intl`, no app routes, no data or worker
  code; text comes in via props, so it stays reusable and testable. Server-Component-safe by
  default; `"use client"` only in interactive primitives.
- `apps/web` stays organised by feature (`components/sections`, `components/demo`, `layout`);
  features compose `@vorchain/ui` and own their copy and data.
- Dependency rule becomes `web -> ui` and `web -> parsers -> engine`; `ui` depends on nothing
  internal. Enforced in `packages/config/eslint.config.js` (eslint-plugin-boundaries).
- Tailwind best practices: tokens only in the theme (no raw colours, no arbitrary hex), utilities
  in markup, `@apply` avoided, class order by `prettier-plugin-tailwindcss`, variants in `cva`
  instead of string concatenation, container queries for components that live in different
  widths, fluid type with `clamp()` in the theme, `motion-safe:` for animation.

## Consequences
- Positive: modern, consistent look from one source; small JS; easy reuse in Phase 2; reviewers
  see a clear module structure.
- Negative / risks: moving existing components into the package touches many imports (done in
  one mechanical commit in P1-29).
- Follow-ups: P1-29 creates the package and design guide; P1-30..32 use it; revisit Multi-Zones
  when Phase 2 is planned.

## References
- Next.js Multi-Zones guide (nextjs.org/docs/app/guides/multi-zones), checked 2026-10-01
- `tailwindcss@4.3.x`, `class-variance-authority@0.7.x` (versions in `apps/web/package.json`)
