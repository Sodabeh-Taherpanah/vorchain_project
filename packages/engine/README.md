# @vorchain/engine

Pure, deterministic domain logic of Vorchain: supplier delay statistics, the day-by-day stock
projection in two views (ERP and realistic), shortage detection, scoring, ranking and structured
explanations. It ports `reference/python-prototype/shortage_radar.py` and must reproduce its
results exactly (ADR-0005).

- **Pure:** no React, DOM, Node or I/O. The package tsconfig has `types: []`, and ESLint rejects
  npm and Node core imports in `src/` (ADR-0010).
- **Deterministic:** `asOf` is an input. Nothing in `src/` reads the clock or draws random numbers
  (lint rules `no-restricted-properties` / `no-restricted-syntax`).
- **No display text:** reasons and actions are codes with parameters; the web app renders them per
  locale via next-intl.
- **Depends on nothing internal:** `apps/web -> parsers -> engine`.

## Public API

Everything is exported from `src/index.ts`; all types are plain JSON-serialisable data, so they can
cross the Web Worker boundary unchanged.

| Export                                                                                                                       | Purpose                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `analyse(input, { asOf, horizonDays, minReliableDeliveries? }): Report`                                                      | One analysis run: ranked `exceptions`, `summary`, `supplierStats`, `overduePurchaseOrders`                           |
| `projectionSeries(input, materialId, options)`                                                                               | Daily points of one material in both views (detail chart and table)                                                 |
| `computeSupplierStats`, `statsBySupplier`, `percentile`                                                                      | Supplier delay statistics (mean, P80, on-time rate, deliveries, reliable)                                            |
| `buildReceipts`, `realisticReceiptDate`, `receiptDelayDays`                                                                  | ERP and realistic receipt schedules (promised date vs. promised date + P80 working days)                             |
| `projectStock`, `demandByMaterial`                                                                                           | Stock projection over `[asOf, asOf + horizonDays)`                                                                   |
| `detectShortage`, `shortageScore`, `rankByScore`                                                                             | Severity, critical date, hidden flag, score and stable ranking                                                       |
| `explainShortage`, `REASON_CODES`, `ACTION_CODES`, `explanationPoId`                                                         | Structured reasons and next actions                                                                                  |
| `findOverduePurchaseOrders`, `overdueReasons`                                                                                | Open POs promised before `asOf` (ADR-0005 item 5, option B; information only)                                        |
| `parseIsoDate`, `isoDateFromParts`, `addDays`, `diffDays`, `addWorkdays`, `workdaysBetween`, `isWorkday`, `weekday`          | Date-only `IsoDate` type and working-day helpers (Mon to Fri, no holidays)                                           |
| `pyRound`                                                                                                                    | Python `round()` (half to even, exact on binary doubles)                                                             |
| `materialId`, `supplierId`, `poId`, `ok`, `err`                                                                              | Branded IDs and the `Result` type                                                                                    |

Input and output types (`AnalysisInput`, `AnalysisOptions`, `Report`, `ShortageException`,
`Reason`, `Action`, `SupplierStats`, ...) are documented field by field in `src/types.ts`.

```ts
import { analyse, parseIsoDate } from '@vorchain/engine';

const asOf = parseIsoDate('2026-10-05');
if (asOf.ok) {
  const report = analyse(input, { asOf: asOf.value, horizonDays: 28 });
  report.exceptions[0]; // highest score first; ties keep the materials-file order
}
```

## Tests

```sh
pnpm --filter @vorchain/engine test       # unit, property, vector and parity tests
pnpm --filter @vorchain/engine coverage   # the same with the coverage gate
```

- **Coverage gate:** 95 % lines, branches, functions and statements on `src/` (see
  `packages/config/src/coverage.ts`). `pnpm coverage` fails below it, and CI runs `pnpm coverage`
  in the "Unit tests (coverage)" job, so a drop blocks the PR.
- **Property tests (fast-check):** always run with a fixed seed, set for every test file by
  `test/setup/fast-check.ts`. Explore other inputs, or reproduce a failure with the seed fast-check
  prints, with `FC_SEED=<32-bit integer> pnpm --filter @vorchain/engine test`. Turborepo includes
  `FC_SEED` in the task hash (`turbo.json`), so a new seed is never served from cache.
- **Test-only code in `test/`:** may use Node (`node:fs`) and has its own `test/tsconfig.json` with
  Node types; `src/` stays pure.

## Parity process

Two layers check the engine against the Python prototype:

1. **Golden files** (`test/parity.test.ts`): `test/support/prototype-sample.ts` reads
   `reference/python-prototype/sample_data/*.csv` (the plain English sample) into an
   `AnalysisInput`, and `analyse(input, { asOf: '2026-10-05', horizonDays: 28 })` must equal
   `reference/python-prototype/golden/sample_data.json` exactly: every exception's material ID,
   rank, severity, critical date, days until, min projected stock, hidden flag, ERP view date and
   score, the summary counts, and every supplier's `mean` and `on_time_rate` (rounded to 4
   decimals like the export), `p80` and `n`. `golden/sample_data_de.json` must be identical (the
   German sample holds the same data in German file format; parsing it end to end is P1-10).
   On a failure the test first reports the first mismatching row, then the full diff.
2. **CPython vectors** (`src/python-vectors.test.ts`): seeded, generated cases for the date and
   rounding helpers, supplier statistics, projection, ranking and the English `why` /
   `next_action` text (rendered from codes by `src/__fixtures__/prototype-text.ts`).

Not compared, because the prototype has no counterpart: `overduePurchaseOrders`,
`summary.overduePurchaseOrders` and `PO_OVERDUE` reasons (ADR-0005 item 5, option B). The vectors
check them against values computed with the prototype's own helpers instead.

The golden files' ordering and encodings are mapped explicitly in `test/support/golden.ts`:
`hidden_risk` `"yes"`/`"no"` becomes a boolean, `erp_view_date` `"none"` becomes `null`, and a
Python `int` or `float` score (`130` vs `128.0`) becomes one JS number. `Report.supplierStats` is in
first-appearance order while the golden files sort by supplier ID, so the test sorts with
`compareCodePoints` (Python's `str` order) first.

### Regenerating the reference data

`reference/` is read-only for agents: regenerate only when the prototype itself changes, in a
dedicated PR that explains why (a changed golden file is a QA trigger, AGENTS.md §10).

```sh
python3 reference/python-prototype/export_golden.py            # golden/*.json
python3 packages/engine/scripts/generate-python-vectors.py      # src/__fixtures__/python-vectors.json
pnpm exec prettier --write packages/engine/src/__fixtures__/python-vectors.json
pnpm --filter @vorchain/engine test
```

Both scripts use a fixed as-of date (2026-10-05); the vector generator is also seeded, so a rerun
without prototype changes gives byte-identical vectors.
