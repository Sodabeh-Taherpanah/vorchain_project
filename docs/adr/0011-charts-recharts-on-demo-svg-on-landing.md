# 0011. Charts: Recharts on `/demo`, server-rendered SVG on the landing page

- Status: accepted
- Date: 2026-09-25
- Deciders: Sodabeh Taherpanah

## Context and problem
Two charts matter: the **hidden-risk chart** on `/` (the visual signature: one material, ERP view
dashed vs realistic view solid, animated) and the **projection chart** in the demo's detail drawer
(any material, PO markers, stock-out area, tooltips). The landing page has a hard budget of
< 120 KB gzip JS and LCP < 2 s. AGENTS.md names Recharts 3.

## Options considered
1. **Recharts everywhere.** Pros: one chart API. Cons: Recharts is a client component with a
   sizeable bundle (plus d3 modules); on `/` it would consume a large part of the 120 KB budget and
   delay LCP/hydration for a chart that is not interactive.
2. **Recharts on `/demo`, hand-built SVG Server Component on `/`.** Pros: landing chart ships zero
   JS (CSS `stroke-dashoffset` animation, disabled under `prefers-reduced-motion`); its data is
   computed at build time by the real engine on the sample data, so the marketing chart is honest.
   Cons: two chart implementations to style consistently.
3. **visx everywhere.** Pros: lower-level, tree-shakable. Cons: more code to write for tooltips,
   axes and responsiveness; no clear gain for Phase 1.

## Decision
We choose **option 2**.
- `/demo` detail drawer: `recharts@3.10.x`, loaded with `next/dynamic` inside the drawer so it is
  not in the initial `/demo` bundle either. Every chart has a table alternative (spec §4.2).
- `/`: `HiddenRiskChart` Server Component renders an inline SVG from a `ProjectionSeries` computed at
  build time via `@vorchain/engine` + `@vorchain/sample-data` (material chosen in P1-22, a hidden
  CRITICAL one such as `M0030`). Shared colour tokens (CSS variables) keep both charts consistent.

## Consequences
- Positive: landing page stays within budget; marketing visual uses real engine output.
- Negative / risks: two chart code paths; mitigated by shared tokens and a shared `ProjectionSeries` type.
- Follow-ups: P1-18 (Recharts drawer), P1-22 (SVG landing chart), P1-27 (bundle budget check).

## References
- `recharts@3.10.1` (checked 2026-09-25)
