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
- Peak memory at 1M rows: see "Memory and streaming" below. The 2.2 GB measured in V-12 included
  the generator holding the dataset; the real whole-file load peaks at about 1.7 GB.
- Vitest benchmarks in `pnpm bench` keep the older absolute backstops (engine 3 s, parse + analyse
  6 s at 20k/100k) for anything catastrophic.

## Memory and streaming

V-13a reads CSV files as byte chunks and validates row by row (`loadSources`), so the decoded text,
Papa's record array and the raw rows are never held at once. XLSX files are still read whole
(SheetJS cannot stream; `XLSX_LIMITS` bounds them). 1M demand rows are 42 MB of CSV in total, under
the 50 MB limit of ADR-0003, so the limit stays.

Peak resident set (`process.resourceUsage().maxRSS`), one process per run, files read from disk,
Node 24.21.0, Intel Mac, 2026-11-11, two runs each:

| Strategy | After load | After analyse | Load time |
|---|---:|---:|---:|
| Whole file (`parseFile` + `loadTables`) | 1 626 to 1 666 MB | 1 666 to 1 787 MB | 8.9 to 9.6 s |
| Streamed (`loadSources`, 64 KB chunks) | 645 to 662 MB | 885 to 888 MB | 6.2 to 6.7 s |

About 60 % less at load and 50 % less overall, and faster, because the 1M-row `RawRow` copies and
the text never exist. The rest is the validated `AnalysisInput` itself plus the report.

```
node packages/sample-data/scripts/measure-memory.ts prepare <dir> 1000000
node packages/sample-data/scripts/measure-memory.ts whole <dir>
node packages/sample-data/scripts/measure-memory.ts stream <dir>
```

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
