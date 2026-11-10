# Performance

Measured numbers, budgets and the CI gates that protect them (backlog V-12). All numbers come
from the commands below; rerun them after a change that may affect speed.

## Engine and parser throughput

`pnpm bench:update` (script `packages/sample-data/scripts/measure-scale.ts`) generates a seeded
German ERP export (UTF-8 BOM, `;`, `1.234,5`, `DD.MM.YYYY`), parses the five tables, validates them
(`loadTables`) and runs `analyse` with a 28-day horizon. Materials : demand rows is 1 : 5, the
spec ratio. Medians of 3 runs (the 1M size runs once).

Machine: Intel Mac (darwin-x64), Node 24.21.0, single thread, no browser. 2026-11-10.

| Demand rows | Materials | Parse + validate | Analyse | Total | Exceptions |
|---:|---:|---:|---:|---:|---:|
| 10 000 | 2 000 | 82 ms | 11 ms | 0.09 s | 505 |
| 100 000 | 20 000 | 756 ms | 139 ms | 0.9 s | 5 264 |
| 1 000 000 | 200 000 | 8.3 s | 1.7 s | 10 s | 53 200 |

- Spec §3.3 target (20k materials, 100k demand rows in under 3 s): met with a wide margin
  (0.9 s including parsing).
- Scaling is close to linear: 10x rows costs about 10x time (parse) and 12x (analyse). No
  quadratic path at these sizes.
- Peak memory at 1M rows is about 2.2 GB (resident set, Node main thread, all five files as
  strings plus parsed tables). That is the limit for the browser: V-13 (streaming parse, chunked
  worker) has to bring it down before 1M rows are offered in `/demo`.
- Vitest benchmarks in `pnpm bench` keep the older absolute backstops (engine 3 s, parse + analyse
  6 s at 20k/100k) for anything catastrophic.

## Landing page

Lighthouse CI, mobile profile (simulated slow 4G), production build, median of 3 runs, local run
2026-11-10:

| Page | Performance | Accessibility | Best practices | SEO | LCP | CLS |
|---|---:|---:|---:|---:|---:|---:|
| `/de` | 99 | 100 | 96 | 100 | 0.77 s | 0.000 |
| `/en` | 100 | 100 | 96 | 100 | 0.76 s | 0.000 |

First-load JavaScript of `/` (every script the prerendered HTML loads, gzip level 9, `noModule`
polyfills excluded): **180.8 KB** for both locales. The AGENTS.md target is **120 KB**. See
"Known gap" below.

## Budgets and gates

| Check | Limit | Where it fails |
|---|---|---|
| Lighthouse Performance / Accessibility / Best practices / SEO | median of 3 runs >= 90 / 95 / 95 / 100 | CI job `Lighthouse CI` (`lighthouserc.json`, `pnpm lhci`) |
| LCP, CLS | <= 2.0 s, <= 0.05 | same |
| First-load JS of `/` (gzip) | hard ceiling `budgetBytes` in `perf/bundle-baseline.json` (190 000 B today; target 120 000 B) and at most +5 % over the stored baseline | CI job `Performance budgets`, `pnpm budget:bundle` |
| Parse and analyse time at 10k / 100k / 1M rows | at most 2.5x the baseline in `perf/bench-baseline.json`, ignoring differences under 50 ms | same job, `pnpm bench:gate` |

Why the benchmark gate is not flaky: each report carries a calibration time (a fixed integer
loop). The gate scales the baseline by `current calibration / baseline calibration`, so a slower
runner moves the limit with it. The 2.5x factor is far above runner noise (under 2x) and far below
a real regression such as an accidental O(n^2) (5x or worse at 100k rows).

### Updating a baseline
A deliberate change (a feature that adds code, a better algorithm) updates the file in the same PR,
with the reason in the PR description:

```
pnpm build && node scripts/bundle-size.mjs --update   # perf/bundle-baseline.json
pnpm bench:update                                      # perf/bench-baseline.json
```

When the bundle gets smaller, also lower `budgetBytes` by hand. Raising it needs an ADR.

## Known gap: first-load JS is above the 120 KB target
The 180.8 KB is mostly framework: React DOM about 70 KB, the Next.js client runtime about 45 KB,
next-intl and the locale routing about 25 KB, `lucide-react` about 21 KB, the rest app code.
Lighthouse still scores 99 to 100 because the page is static and small, so this is a budget miss,
not a user-visible problem. The gate therefore stops further growth now (ceiling 190 KB, +5 %
over the baseline) and the follow-up is to find about 60 KB: check what the landing page ships
that it does not need (icon imports, client components in sections that could be Server
Components, message payload per locale) and measure with `ANALYZE`-style tooling. Tracked as a
deviation of V-12; P1-27 (hardening) is the natural place.

## Not covered yet
- Browser timings of the worker with large files (UI responsiveness, progress, cancel): V-13.
- Lighthouse runs only the landing pages. `/demo` needs a file upload flow; its budget (worker and
  XLSX lazy-loaded) is checked by the e2e tests.
