# Phase 1 Spec: Website + In-Browser Demo

Status: ready for planning · Owner: Sodabeh Taherpanah · Target: ~3 weeks part-time

## 1. Goal
Give a German production planner or purchasing manager **one link** that, within 2 minutes:
1. explains the problem (shortages the ERP doesn't show),
2. proves it with an interactive demo on sample data or on their own export,
3. makes it easy to request a free "Engpass-Check".

The site is also the founder's credibility asset and technical portfolio.

**Success metrics (tracked with privacy-friendly analytics, aggregate only):** demo started, demo completed, contact form submitted.

## 2. Users
| Persona | Needs |
|---|---|
| **Disponent / planner** (primary) | Quickly sees "which parts will run out and why" in familiar German ERP terms |
| **Head of purchasing / managing director** (buyer) | Trust (privacy, Impressum, who is behind it), clear value, low-risk next step |
| **Technical reviewer / recruiter** (portfolio) | Clean repo, architecture docs, tests, CI badges |

## 3. Pages (all under `/[locale]`, `de` default, `en` second)
| Route | Content |
|---|---|
| `/` | Hero (problem in one line + CTA "Demo starten"), "Das Problem" (ERP trusts promised dates), animated **hidden-risk chart** (ERP view vs realistic view, see §5), how it works (3 steps), privacy promise, FAQ, CTA to contact |
| `/demo` | The interactive demo (§4) |
| `/kontakt` | Form: name, company, role, email, message, consent checkbox. Phase 1 delivery per ADR (server action + transactional email, or a GDPR-compliant form service) |
| `/impressum`, `/datenschutz` | Legal pages (content provided by owner; use placeholders clearly marked `TODO(owner)`) |
| `404`, error boundary | Branded, localized |

## 4. Demo requirements
### 4.1 Flow
1. **Choose data:** "Beispieldaten laden" (bundled sample, German format) **or** upload files (drag and drop, multiple files, `.csv` / `.xlsx`).
2. **Map check:** show which tables were recognised (materials, open POs, demand, delivery history, suppliers) and any missing columns, with fix hints.
3. **Settings:** as-of date (default: sample's date or today), horizon in days (default 28), language of report.
4. **Results:**
   - Summary tiles: # critical, # warnings, # hidden risks
   - Ranked table (top 10 by default, expandable): severity pill, material, critical date, days until, min projected stock, hidden-risk badge, why, next action
   - Row detail drawer: stock projection chart for that material (ERP view dashed, realistic view solid, stock-out area shaded, PO markers)
   - Supplier reliability table: on-time %, mean delay, P80 delay, deliveries, low-confidence flag
5. **Export:** download exceptions as CSV (`;`-separated for `de`) and a printable report view.

### 4.2 Non-functional
- All parsing and analysis runs in a **Web Worker**. The UI stays responsive with 20k materials + 100k demand rows (target: < 3 s on a mid-range laptop).
- **No network request may carry file contents.** This is covered by an e2e test.
- Error states are specific and localized (wrong file type, missing column, bad date format with row number).
- Fully keyboard accessible; charts have text alternatives (table view).

## 5. Domain logic (port from `reference/python-prototype/shortage_radar.py` + `loaders.py`)
### 5.1 Input tables (canonical names; German/English header aliases per `loaders.py` `COLUMN_ALIASES`)
| Table | Required | Optional |
|---|---|---|
| materials | material_id, on_hand | description, main_supplier_id, safety_stock, unit |
| open_purchase_orders | po_id, material_id, supplier_id, qty, promised_date | |
| demand | material_id, date, qty | |
| supplier_history | supplier_id, promised_date, actual_date | po_id |
| suppliers (optional) | supplier_id, name | |

Parsing rules: delimiter sniffing (`;` `,` tab), UTF-8 / UTF-8-BOM / Windows-1252, numbers `1234.5` `1.234,5` `1,234.5`, dates `YYYY-MM-DD` `DD.MM.YYYY` `DD.MM.YY` `DD/MM/YYYY` + Excel date cells, blank rows skipped.

### 5.2 Algorithm
1. **Supplier stats:** for each history row with both dates, delay = **signed working days** (Mon–Fri) from promised to actual. Per supplier: mean, P80 (linear interpolation, `max(0, round(p80))`), on-time rate (delay ≤ 0), n. `reliable = n ≥ 3`.
2. **Receipts:** for each open PO, ERP receipt date = promised date; realistic receipt date = promised + P80 **working days** of that PO's supplier (0 if unknown).
3. **Projection** (per material, day by day for `horizon` calendar days from `asOf`): `stock += receipts(day); stock -= demand(day)`. Record the first day stock < 0 (stock-out), the first day stock < safety stock, and the minimum stock.
4. Run the projection twice (ERP view, realistic view).
5. Skip the material if the realistic view has neither a stock-out nor a below-safety day.
6. `severity = CRITICAL` if a realistic stock-out exists, else `WARNING`. `criticalDate` = stock-out date or first below-safety date. `erpDate` = the ERP-view date of the same kind.
7. `hidden = erpDate is null OR erpDate > criticalDate`.
8. **Score** = `(horizon − daysUntil) × 3 + min(max(safety − minStock, 0) / max(safety, 1) × 10, 30) + (hidden ? 15 : 0) + (CRITICAL ? 25 : 0)`, rounded to 1 decimal. Sort descending.
9. **Explanations** (structured, then rendered via i18n): no open PO → "place order with main supplier"; PO promised on/after critical date → "ask supplier to pull PO forward before {date} or source elsewhere"; PO with delay > 0 → "PO promised {date}, supplier typically {n} working days late (on-time {r}%)" (+ low-confidence note) and, if its realistic date ≥ critical date, "expedite / ask for partial delivery before {date}"; hidden → "ERP view shows the problem only from {date} / not at all"; fallback → "increase order quantity or check demand plan".

Keep explanation **codes + params** in the engine (e.g. `{ code: 'PO_LATE', poId, promised, supplierId, delayDays, onTimeRate }`). The web app renders them. The engine never contains display strings.

### 5.3 Parity
Generate `reference/python-prototype/golden/*.json` by running the Python prototype on both sample datasets with `--as-of 2026-10-05 --horizon 28` (script: `reference/python-prototype/export_golden.py`, already provided). The TS engine must match exactly: materials, order, severity, dates, hidden flag, min stock, score.
Pitfalls: Python `round()` uses banker's rounding (round-half-to-even), so implement the same helper. The sort is **stable** by score descending, and ties keep the materials-file order. Dates are plain calendar dates (no time zones), so use a date-only type.

## 6. Design direction
- Industrial and trustworthy: calm neutrals, one signal accent (amber for "hidden risk"), semantic red/amber/green for severity. Not playful.
- Typography: a sturdy sans for UI plus a mono for numbers/IDs (tabular numbers).
- Responsive from 360px. Dark mode supported.
- The hidden-risk chart on `/` is the visual signature: show the same material with ERP view vs realistic view.

## 7. Out of scope (Phase 1)
Accounts/login, server-side storage of customer data, ERP connectors, LLM summaries, payments, BOM explosion, public holidays, lot sizes.

## 8. Phase 2 preview (design for it, don't build it)
Authenticated workspace, scheduled imports (SFTP/connector), backend service (FastAPI or Spring Boot) reusing the same algorithm, weekly email report. The **engine package API** should be stable enough to be called from a backend later (pure functions, JSON-serialisable input/output).
