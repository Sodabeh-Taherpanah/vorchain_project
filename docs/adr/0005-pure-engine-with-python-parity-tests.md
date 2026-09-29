# 0005. Engine as a pure TypeScript package with parity tests against the Python prototype

- Status: accepted
- Date: 2026-09-25 (amended 2026-09-29: overdue-PO consequence in item 5; owner chose option B)
- Deciders: Sodabeh Taherpanah

## Context and problem
The shortage logic already exists as a tested Python prototype
(`reference/python-prototype/shortage_radar.py`). The TypeScript version runs in the browser now
and must be reusable by a backend later. Subtle differences (rounding, sorting, date arithmetic)
would silently change which materials a planner sees, so we need proof that the port is exact.

## Options considered
1. **Pure TS package + golden-file parity tests.** The engine is a set of pure functions with
   JSON-serialisable input/output; tests compare its output on the prototype's sample data to
   `reference/python-prototype/golden/*.json`. Pros: exactness is proven in CI; runs anywhere
   (browser, Node, edge); easy to property-test. Cons: must reproduce Python quirks deliberately.
2. **Pure TS package with hand-written unit tests only.** Pros: no dependency on Python artefacts.
   Cons: no proof of equivalence; rounding and tie-order bugs are likely to slip through.
3. **Run Python in the browser (Pyodide) or on a server.** Rejected in ADR-0003.
4. **Generate golden files in CI by running Python.** Pros: always fresh. Cons: Python toolchain in
   CI for a TS repo; the prototype is frozen reference code, so committed golden files are enough.

## Decision
We choose **option 1**, with committed golden files (regenerated only with
`python3 reference/python-prototype/export_golden.py` when the reference intentionally changes).

Engine rules:
- No imports from React, DOM, Node built-ins or internal packages; no clock (`asOf` is an input);
  no randomness; no display strings (explanations are `{ code, ...params }`, see architecture §7).
- Dates are `IsoDate` strings (`YYYY-MM-DD`); arithmetic via UTC-based helpers only (no local time).

Parity requirements (the traps found while reading the prototype):
1. **`pyRound(x, n = 0)` must reproduce CPython `round()`**: correctly rounded on the exact binary
   value of the double, ties to even. Used for `p80` (n = 0), `minProjectedStock` (n = 0) and
   `score` (n = 1). Test vectors: `round(2.5) = 2`, `round(3.5) = 4`, `round(-2.5) = -2`,
   `round(0.125, 2) = 0.12`, `round(2.675, 2) = 2.67`, `round(1.25, 1) = 1.2`, `round(1.35, 1) = 1.4`.
   Hint: `x.toFixed(k)` uses the exact binary value, so a decimal-string implementation with
   explicit half-even tie handling is feasible; `Math.round(x * 10) / 10` is **not** acceptable.
2. **Stable sort by score descending**; ties keep materials-file order (`Array.prototype.sort` is
   stable since ES2019; compare `b.score - a.score` only).
3. **Numeric sort for percentiles** (`(a, b) => a - b`; the JS default sort is lexicographic).
   Percentile: `k = (n - 1) * p`, `lo = floor(k)`, `hi = min(lo + 1, n - 1)`, linear interpolation.
4. **Working days**: `workdaysBetween(a, b)` counts weekdays in `(min, max]`, signed. History dates
   may fall on weekends (the sample data has such rows), so test weekend endpoints explicitly.
   `addWorkdays(d, 0)` returns `d` even on a weekend.
5. **Projection window** is `[asOf, asOf + horizon)` in calendar days. Receipts and demand dated
   before `asOf` are **ignored**. This is prototype behaviour; we keep it for parity and track the
   domain question as open question Q4 in `docs/backlog.md`.
   **Consequence for overdue POs** (found in the P1-03 QA review, confirmed with the prototype's
   `project` in python3): a PO promised before `asOf` is dropped from the ERP view, but with a
   late supplier `addWorkdays(promised, p80)` can move it into the window, so it arrives **only in
   the realistic view**. The realistic view can then look *less* alarming than the ERP view.
   Example: `asOf` 2026-10-05, on hand 0, demand 1 on 2026-10-06, PO 50 promised 2026-10-02,
   supplier P80 = 2 -> ERP view stock-out on 2026-10-06 (min -1), realistic view receipt on
   2026-10-06 and no stock-out. Because spec §5.2 step 5 skips a material when the realistic view
   is clean, such a material does **not appear in the report at all**, although the ERP view shows
   a stock-out. When both views still show a problem, the ERP date is earlier, so `hidden` is
   `false`. We keep this for parity (the golden files encode it). Tests pin it:
   `packages/engine/src/projection.test.ts` ("a receipt before asOf never arrives"), and the
   "realistic view is never better than ERP view" property in ADR-0008 is restricted to POs
   promised on or after `asOf`.
   **Decision (owner, 2026-09-29): option B** ("inform, don't change the numbers", see the options
   below). Since P1-05 the engine reports overdue POs next to the unchanged results:
   - `Report.overduePurchaseOrders`: one entry per open PO with `promisedDate < asOf`, in PO-file
     order: `poId`, `materialId`, `supplierId`, `qty`, `promisedDate`, `realisticDate`
     (`addWorkdays(promisedDate, p80)`), `countedInRealisticView` (`realisticDate` inside
     `[asOf, asOf + horizonDays)`) and `hasException` (the material has an exception in the
     report). This list is the only way to show a material that dropped out of the report, like
     the one in the example above (`hasException: false`, `countedInRealisticView: true`).
   - `summary.overduePurchaseOrders`: the length of that list.
   - Reason `PO_OVERDUE { poId, promisedDate, supplierId, realisticDate }` on the exception of a
     material with an overdue PO, one per PO, appended **after** the prototype's reasons. No new
     action, so the default action rule is unchanged.
   Nothing else changes: numbers, severity, score, order and the prototype's reasons and actions
   stay bit-identical. The P1-05 parity test skips `PO_OVERDUE` explicitly when it compares the
   codes with the prototype's `why` text; the overdue list is checked against values computed in
   python3 from the prototype's `supplier_stats` and `add_workdays` on every vector dataset,
   including this example. The demo shows the note in the summary (P1-17). Options C and D remain
   possible later as a versioned behaviour change.
6. Demand is summed per `(material, date)` as floats; the score uses the **unrounded** minimum stock.
7. `hidden = erpViewDate === null || erpViewDate > criticalDate`; `erpViewDate` is the ERP-view
   date of the **same kind** (stock-out if realistic is CRITICAL, else below-safety).
8. Explanations iterate POs in PO-file order; the "PO after critical date" check uses
   `promised >= critical` and applies even when the PO lies beyond the horizon.
9. Unknown supplier: delay 0, `onTimeRate` 0, `reliable` true (mirrors `dict.get` defaults).
10. Duplicate material rows are processed independently (no dedupe in the engine; parsers warn).

Golden comparison: `materialId`, order, `severity`, `criticalDate`, `daysUntil`,
`minProjectedStock`, `hidden` (`'yes'/'no'` in the golden file), `erpViewDate` (`'none'` = `null`),
`score` (numeric equality); supplier `mean` and `onTimeRate` compared after rounding to 4 decimals,
`p80` and `n` exactly.

Two parity levels:
- **P1-06 (engine only):** a test-only loader reads the plain English `sample_data/*.csv` (comma,
  ISO dates) so the engine is proven before parsers exist.
- **P1-10 (end to end):** `parsers -> engine` on both `sample_data` and `sample_data_de` must equal
  the golden files (both golden files are identical, which itself proves the German parsing).

## Consequences
- Positive: exactness is a CI gate; the same golden files can validate a Phase 2 backend port;
  explanation codes keep the engine locale-free.
- Negative / risks: we knowingly copy prototype quirks (item 5, number parsing of `1.234`);
  changing them later is a deliberate, versioned behaviour change (new golden files + ADR).
- Follow-ups: P1-01 to P1-06, P1-10. Coverage gate 95 % lines/branches on `packages/engine`.

### Options for the owner: overdue POs (item 5, Q4)
**Decided 2026-09-29: option B** (see item 5 for what the engine provides). Kept for the record.
Options A and B keep parity; C and D change behaviour.
- **A. Do nothing in Phase 1.** Pure parity. Risk: a planner may miss a material the ERP already
  flags, and the realistic view can look better than the ERP view without any hint why.
- **B. Inform, don't change the numbers (parity-safe).** The UI or report shows a note such as
  "n open POs are overdue (promised before the as-of date) and are not counted in the ERP view".
  Could be a report-level count computed outside the golden comparison (e.g. a new
  `Report.overduePurchaseOrders` field or a UI-side count over the parsed POs), a demo hint in
  P1-17 (summary area) and/or P1-18 (drawer, PO markers before `asOf`). A per-exception reason
  code (e.g. `PO_OVERDUE`) in P1-05 would change `reasons`; it is parity-safe only if the P1-05
  test that maps codes to the prototype's `TXT['en']` strings skips it (the golden comparison
  covers no explanation text).
- **C. Treat overdue POs as arriving on `asOf` in the ERP view** (realistic view unchanged or
  `max(asOf, promised + p80)`). Removes the "less alarming" inversion. Breaks parity: needs a
  versioned behaviour change, new golden files from a changed prototype and a new ADR.
- **D. Surface ERP-only stock-outs** (materials skipped by step 5 although the ERP view has a
  problem) as a separate list. Also a behaviour change beyond the prototype; same cost as C.

## References
- Python prototype v0.2 in `reference/python-prototype/` (read 2026-09-25)
- `fast-check@4.10.2` for property tests (checked 2026-09-25)
- CPython `round()` semantics: https://docs.python.org/3/library/functions.html#round
