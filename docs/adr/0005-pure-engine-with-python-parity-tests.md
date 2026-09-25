# 0005. Engine as a pure TypeScript package with parity tests against the Python prototype

- Status: accepted
- Date: 2026-09-25
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
   before `asOf` are **ignored** (so overdue POs never arrive). This is prototype behaviour; we keep
   it for parity and track the domain question in the backlog's open questions.
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

## References
- Python prototype v0.2 in `reference/python-prototype/` (read 2026-09-25)
- `fast-check@4.10.2` for property tests (checked 2026-09-25)
- CPython `round()` semantics: https://docs.python.org/3/library/functions.html#round
