# Architecture: Vorchain Phase 1

Status: **target architecture for Phase 1**, planned 2026-09-25. Nothing below is built yet; the
backlog (`docs/backlog.md`) builds it step by step. Every PR that changes structure (new package,
new container, new external service, changed data flow) **must update this file in the same PR**.

Related: [glossary](glossary.md) (German ERP terms and code names) · [ADRs](../adr/) · [spec](../spec/phase-1-demo.md)

## 1. Architecture in one paragraph

Vorchain Phase 1 is a statically generated Next.js website with one interactive page (`/demo`).
Customer files are read, parsed and analysed **only inside a Web Worker in the visitor's browser**
([ADR-0003](../adr/0003-client-side-processing-in-web-worker.md)). The domain logic is a pure
TypeScript package (`@vorchain/engine`) that must reproduce the Python prototype exactly
([ADR-0005](../adr/0005-pure-engine-with-python-parity-tests.md)). The only server-side code is the
contact-form Server Action ([ADR-0007](../adr/0007-contact-form-delivery.md)). The site is hosted on
Vercel in the Frankfurt region, with a portable Docker image as the exit path
([ADR-0006](../adr/0006-hosting-and-deployment-target.md)).

## 2. C4 Level 1: System context

```mermaid
C4Context
  title Vorchain Phase 1: system context

  Person(planner, "Planner / Disponent", "Production planner at a German manufacturer (50 to 500 employees)")
  Person(buyer, "Head of purchasing / MD", "Decides whether to request an Engpass-Check")
  Person(reviewer, "Technical reviewer", "Reads repo, docs and CI (portfolio)")

  System(vorchain, "Vorchain website and demo", "Marketing pages plus in-browser shortage analysis")

  System_Ext(erp, "Customer ERP", "Business Central, Sage, abas, SAP B1 ... (manual CSV/XLSX export)")
  System_Ext(mail, "Transactional email (Brevo, EU)", "Delivers contact-form messages to the owner")
  System_Ext(analytics, "Cookieless analytics (EU)", "Aggregate page views and 3 funnel events, no file data")
  System_Ext(github, "GitHub", "Source, CI/CD, releases, container registry")

  Rel(erp, planner, "Exports CSV / XLSX")
  Rel(planner, vorchain, "Uploads files (they stay in the browser)")
  Rel(buyer, vorchain, "Reads, submits contact form")
  Rel(reviewer, github, "Reads code, ADRs, CI results")
  Rel(vorchain, mail, "Contact form fields only", "HTTPS API")
  Rel(vorchain, analytics, "demo_started, demo_completed, contact_submitted", "HTTPS")
```

If the C4 renderer lays this out poorly on GitHub, the same content as a flowchart:

```mermaid
flowchart LR
  planner["Planner / Disponent"]
  buyer["Head of purchasing / MD"]
  erp[("Customer ERP")]
  site["Vorchain website + demo<br/>(analysis runs in the browser)"]
  mail["Brevo transactional email (EU)"]
  analytics["Cookieless analytics (EU)"]

  erp -- "manual export CSV / XLSX" --> planner
  planner -- "files stay in the browser" --> site
  buyer -- "reads, contact form" --> site
  site -- "contact form fields only" --> mail
  site -- "3 aggregate events, no data" --> analytics
```

## 3. C4 Level 2: Containers

```mermaid
flowchart TB
  subgraph browser["Visitor's browser"]
    direction TB
    pages["Next.js pages (React 19)<br/>landing, demo, contact, legal<br/>mostly Server Components, prerendered"]
    worker["Analysis Web Worker<br/>analysis.worker.ts via Comlink<br/>lazy-loaded on /demo only"]
    pages -- "File handles, options (postMessage)" --> worker
    worker -- "LoadResult, Report, ProjectionSeries (JSON)" --> pages
  end

  subgraph host["Vercel, region fra1 (ADR-0006)"]
    cdn["CDN: prerendered HTML, JS chunks,<br/>i18n messages, OG images"]
    action["Server Action: submitContact<br/>(zod, honeypot, rate limit)"]
  end

  brevo["Brevo API (EU)"]
  plaus["Cookieless analytics (EU, ADR-0012)"]

  cdn -- "HTTPS GET" --> pages
  pages -- "form fields only (POST)" --> action
  action -- "HTTPS API" --> brevo
  pages -- "event name only" --> plaus
```

Security boundary: the browser's CSP `connect-src` allows only `'self'` and the analytics origin, so
even a bug in our code cannot post file contents to a third party. The e2e network test proves no
request carries file content (ADR-0003, ADR-0008).

## 4. C4 Level 3: Components

### 4.1 Packages and dependency rule

```mermaid
flowchart LR
  web["apps/web<br/>(Next.js)"] --> parsers["@vorchain/parsers"]
  web --> engine["@vorchain/engine"]
  web --> sample["@vorchain/sample-data"]
  parsers --> engine
  sample -. "devDependency only<br/>(scale generator uses types)" .-> engine
  config["@vorchain/config<br/>tsconfig, eslint, prettier, vitest presets"]
  web -.-> config
  parsers -.-> config
  engine -.-> config
  sample -.-> config
```

Rules (enforced by `eslint-plugin-boundaries` from Task 0 on):
- `engine` imports nothing internal and no platform APIs (no DOM, no Node built-ins, no `Date.now()`).
- `parsers` imports only `engine` (for domain types) plus `papaparse`, `xlsx`, `zod`. It takes
  `{ name, bytes }`, never a DOM `File`, so it also runs in Node (tests, Phase 2 backend).
- `apps/web` is the only package that knows about React, Next.js, i18n and the Worker.

### 4.2 Engine components (`packages/engine`)

```mermaid
flowchart TB
  subgraph engine["@vorchain/engine (pure, deterministic)"]
    types["types.ts<br/>IsoDate, MaterialId, AnalysisInput,<br/>Report, ShortageException, Reason, Action"]
    dates["dates.ts<br/>addDays, diffDays, addWorkdays,<br/>workdaysBetween, weekday"]
    rounding["rounding.ts<br/>pyRound (CPython round semantics)"]
    stats["supplier-stats.ts<br/>percentile, computeSupplierStats,<br/>statsBySupplier"]
    compare["compare.ts<br/>compareCodePoints (Python str order)"]
    daily["daily-quantities.ts<br/>DailyQuantities (qty per day)"]
    receipts["receipts.ts<br/>buildReceipts, realisticReceiptDate,<br/>receiptDelayDays"]
    projection["projection.ts<br/>projectionWindow, projectOverWindow,<br/>projectStock, demandByMaterial,<br/>projectionSeries"]
    ranking["ranking.ts<br/>detectShortage (severity, hidden flag),<br/>shortageScore, rankByScore (stable)"]
    explain["explanations.ts<br/>Reason / Action codes + params"]
    analyse["analyse.ts<br/>public entry: analyse(input, options)"]
  end
  analyse --> stats & receipts & projection & ranking & explain
  receipts --> dates & daily
  stats --> dates & rounding & compare
  ranking --> rounding & dates
  projection --> dates & daily & receipts & stats
```

### 4.3 Parser components (`packages/parsers`)

```mermaid
flowchart LR
  decode["decode.ts<br/>UTF-8 / BOM / Windows-1252"] --> csv["csv.ts<br/>delimiter sniffing, papaparse"]
  xlsx["xlsx.ts<br/>SheetJS, first sheet,<br/>Excel serial dates"] --> rows
  csv --> rows["raw rows<br/>(header + cells)"]
  rows --> detect["detect-table.ts<br/>file-name stem, then header signature"]
  detect --> headers["headers.ts<br/>COLUMN_ALIASES port, normalise"]
  headers --> cells["values.ts<br/>parseNumber, parseDate"]
  cells --> schema["schemas.ts<br/>zod row schemas"]
  schema --> out["ParsedTable | DataError[]<br/>(i18n codes + params, row numbers)"]
```

### 4.4 Web app components (`apps/web`)

```mermaid
flowchart TB
  subgraph web["apps/web/src"]
    routes["app/[locale]/<br/>page, demo, kontakt, impressum, datenschutz,<br/>not-found, error, [...rest] + app/global-not-found"]
    layout["components/layout/<br/>SkipLink, SiteHeader, SiteFooter, LocaleSwitcher,<br/>ThemeToggle, StatusPage, Container"]
    ui["components/ui/ (shadcn copy-ins)<br/>+ lib/ (fonts, theme, utils)"]
    sections["components/sections/<br/>Hero, Problem, HiddenRiskChart (SVG), HowItWorks,<br/>Privacy, Faq, Cta"]
    demo["components/demo/<br/>DataSource, MapCheck, Settings, SummaryTiles,<br/>ExceptionTable, DetailDrawer, SupplierTable, ExportBar"]
    hooks["lib/demo/use-analysis.ts<br/>(state machine, Comlink proxy)"]
    workerf["workers/analysis.worker.ts"]
    i18n["i18n/ + messages/de.json, en.json<br/>renders Reason/Action codes"]
    contact["app/[locale]/kontakt/actions.ts<br/>+ lib/mail/ (MailTransport)"]
  end
  routes --> layout --> ui
  routes --> sections & demo
  demo --> hooks --> workerf
  demo --> i18n
  routes --> contact
```

## 5. Data flow of the demo

```mermaid
flowchart LR
  file["User files<br/>.csv / .xlsx"] -- "File handle<br/>(structured clone,<br/>content not read on main thread)" --> w
  sample["@vorchain/sample-data<br/>(dynamic import in worker)"] --> w
  subgraph w["Web Worker"]
    direction LR
    read["file.arrayBuffer()"] --> p["@vorchain/parsers<br/>decode, detect, map, validate"]
    p -- "AnalysisInput (kept in worker memory)" --> e["@vorchain/engine<br/>analyse(input, {asOf, horizonDays})"]
  end
  p -- "LoadResult: recognised tables,<br/>missing columns, DataErrors" --> ui
  e -- "Report JSON: exceptions (codes),<br/>supplier stats, summary" --> ui["Demo UI<br/>tiles, table, drawer, suppliers"]
  ui -- "getProjection(materialId)" --> e
  ui -- "CSV export (Blob, local download)" --> dl["User's disk"]
```

What crosses the worker boundary back to the page is derived data only (IDs, dates, numbers, codes).
The page never receives raw rows and nothing is ever sent to the network.

## 6. Sequence: upload and analyse

```mermaid
sequenceDiagram
  autonumber
  actor U as Planner
  participant P as Demo page (client component)
  participant H as useAnalysis hook
  participant W as analysis.worker (Comlink)
  participant PR as @vorchain/parsers
  participant E as @vorchain/engine

  U->>P: open /demo
  P->>H: first interaction (lazy)
  H->>W: new Worker(new URL('./analysis.worker.ts', import.meta.url))
  U->>P: drop files (or click "Beispieldaten laden")
  P->>H: load(files)
  H->>W: loadFiles(files)
  loop each file
    W->>W: bytes = await file.arrayBuffer()
    W->>PR: parseFile({ name, bytes })
    PR-->>W: ParsedTable or DataError[]
  end
  W->>PR: assembleInput(tables)
  PR-->>W: AnalysisInput or missing-table errors
  W-->>H: LoadResult {tables, errors, suggestedAsOf}
  H-->>P: show map check (recognised tables, missing columns, fix hints)
  U->>P: confirm settings (asOf, horizon, language)
  P->>H: analyse(options)
  H->>W: analyse({asOf, horizonDays})
  W->>E: analyse(input, options)
  E-->>W: Report
  W-->>H: Report (JSON)
  H-->>P: render tiles, ranked table, supplier table
  U->>P: open row detail
  P->>W: getProjection(materialId)
  W->>E: projectionSeries(input, materialId, options)
  E-->>W: ProjectionSeries (ERP + realistic, daily)
  W-->>P: series -> chart and table alternative
  Note over P,E: No network request carries file content (Playwright network assertion + CSP connect-src)
```

## 7. Engine public API (contract for builder)

The engine API is JSON-in / JSON-out so the same contract can back a Phase 2 service. The types
below are defined in `packages/engine/src/types.ts` (P1-01) with TSDoc on every field; this is a
condensed view (all fields are `readonly` in code). Update this section when the contract changes.

```ts
type IsoDate = Brand<string, 'IsoDate'>;        // 'YYYY-MM-DD', years 0001..9999, no time zone
type MaterialId = Brand<string, 'MaterialId'>;  // likewise SupplierId, PoId (compile-time brand only)
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

interface Material {
  materialId: MaterialId; description: string; mainSupplierId: SupplierId | null;
  onHand: number; safetyStock: number /* 0 if missing */; unit: string | null;
}
interface PurchaseOrder { poId: PoId; materialId: MaterialId; supplierId: SupplierId; qty: number; promisedDate: IsoDate }
interface DemandLine { materialId: MaterialId; date: IsoDate; qty: number }
interface DeliveryRecord { supplierId: SupplierId; promisedDate: IsoDate | null; actualDate: IsoDate | null; poId: PoId | null }
interface Supplier { supplierId: SupplierId; name: string }

interface AnalysisInput {
  materials: Material[];                 // file order matters (tie-break in ranking)
  openPurchaseOrders: PurchaseOrder[];
  demand: DemandLine[];
  supplierHistory: DeliveryRecord[];     // promisedDate / actualDate may be null (skipped)
  suppliers: Supplier[];                 // optional table, may be empty
}
interface AnalysisOptions { asOf: IsoDate; horizonDays: number; minReliableDeliveries?: number /* 3 */ }

function analyse(input: AnalysisInput, options: AnalysisOptions): Report;
function projectionSeries(input: AnalysisInput, materialId: MaterialId, options: AnalysisOptions): ProjectionSeries;

interface Report {
  asOf: IsoDate; horizonDays: number;
  summary: { critical: number; warning: number; hidden: number;
             overduePurchaseOrders: number };  // option B: overduePurchaseOrders.length
  exceptions: ShortageException[];       // sorted by score desc, stable
  supplierStats: SupplierStats[];         // order of first complete history row (prototype dict order)
  overduePurchaseOrders: OverduePurchaseOrder[];  // option B (ADR-0005 item 5), PO-file order
}
interface ShortageException {
  materialId: MaterialId; description: string; mainSupplierId: SupplierId | null;
  severity: 'CRITICAL' | 'WARNING';
  criticalDate: IsoDate; erpViewDate: IsoDate | null; daysUntil: number;
  minProjectedStock: number;             // pyRound(x)
  safetyStock: number;                   // pyRound(x), display only (prototype safety_stock)
  hidden: boolean; score: number;        // pyRound(x, 1)
  reasons: Reason[]; actions: Action[];  // codes + params, never display text
}
type Reason =
  | { code: 'NO_OPEN_PO' }
  | { code: 'PO_AFTER_CRITICAL'; poId: PoId; promisedDate: IsoDate }
  | { code: 'PO_LATE'; poId: PoId; promisedDate: IsoDate; supplierId: SupplierId; delayDays: number;
      onTimeRate: number; lowConfidence: boolean; deliveries: number }
  | { code: 'HIDDEN_ERP_LATER'; erpViewDate: IsoDate }
  | { code: 'HIDDEN_ERP_NONE' }
  | { code: 'PO_OVERDUE'; poId: PoId; promisedDate: IsoDate; supplierId: SupplierId;
      realisticDate: IsoDate };          // option B, after the prototype's reasons
type Action =
  | { code: 'PLACE_ORDER'; supplierId: SupplierId | null }
  | { code: 'PULL_FORWARD'; supplierId: SupplierId; poId: PoId; before: IsoDate }
  | { code: 'EXPEDITE'; poId: PoId; before: IsoDate }
  | { code: 'REVIEW_QTY_OR_DEMAND' };
type ReasonCode = Reason['code']; type ActionCode = Action['code'];

interface OverduePurchaseOrder {          // open PO with promisedDate < asOf (not in the prototype)
  poId: PoId; materialId: MaterialId; supplierId: SupplierId; qty: number; promisedDate: IsoDate;
  realisticDate: IsoDate;                // addWorkdays(promisedDate, p80)
  countedInRealisticView: boolean;       // realisticDate in [asOf, asOf + horizonDays)
  hasException: boolean;                 // the material has an exception in this report
}

interface SupplierStats {                // prototype: mean, p80, on_time_rate, n, reliable_stats
  supplierId: SupplierId; meanDelayDays: number; p80DelayDays: number;
  onTimeRate: number; deliveries: number; reliable: boolean;
}
interface ProjectionSeries {
  materialId: MaterialId; safetyStock: number;
  points: { date: IsoDate; demand: number; erpReceipts: number; realisticReceipts: number;
            erpStock: number; realisticStock: number }[];   // one per day of [asOf, asOf + horizon)
}
```

Helpers exported since P1-01 (`dates.ts`, `rounding.ts`, `result.ts`): `parseIsoDate`,
`isoDateFromParts`, `addDays`, `diffDays`, `weekday` (Mon = 0), `isWorkday`, `addWorkdays`,
`workdaysBetween`, `pyRound(x, ndigits?)`, `ok`, `err`, and the ID brands `materialId`,
`supplierId`, `poId`. Since P1-02: `percentile`, `computeSupplierStats`, `statsBySupplier`.

Building blocks exported since P1-03 (used by `analyse` in P1-04 and the explanations in P1-05):

```ts
type DailyQuantities = ReadonlyMap<IsoDate, number>;   // qty per day, first-appearance order
interface ReceiptSchedule { erp: DailyQuantities; realistic: DailyQuantities }
function receiptDelayDays(supplierId: SupplierId, stats: SupplierStatsMap): number; // p80 or 0
function realisticReceiptDate(po: PurchaseOrder, stats: SupplierStatsMap): IsoDate;
function buildReceipts(pos: PurchaseOrder[], stats: SupplierStatsMap): ReadonlyMap<MaterialId, ReceiptSchedule>;
function demandByMaterial(demand: DemandLine[]): ReadonlyMap<MaterialId, DailyQuantities>;
function projectStock(input: { onHand; demandByDay; receiptsByDay; asOf; horizonDays; safetyStock }):
  { firstStockOut: IsoDate | null; firstBelowSafety: IsoDate | null; minStock: number };
```

Since P1-04: `analyse` and its building blocks in `ranking.ts`. Internally, `analyse` builds the
projection window once per run (`projectionWindow`) and projects every material in both views over
it (`projectOverWindow`); rebuilding it per projection cost ~90 % of the run time at 20k materials.

```ts
interface ShortageFinding { severity: Severity; criticalDate: IsoDate; erpViewDate: IsoDate | null; hidden: boolean }
function detectShortage(erp: StockProjection, realistic: StockProjection): ShortageFinding | null;
function shortageScore(f: { horizonDays; daysUntil; safetyStock; minStock; hidden; severity }): number; // pyRound(x, 1)
function rankByScore<T extends { score: number }>(items: readonly T[]): T[];  // stable, score desc
```

Since P1-05: structured explanations in `explanations.ts` and overdue POs in `overdue.ts`.

```ts
function explainShortage(c: { mainSupplierId; purchaseOrders /* material's, PO-file order */;
  stats: SupplierStatsMap; finding: ShortageFinding }): { reasons: Reason[]; actions: Action[] };
const REASON_CODES: readonly ReasonCode[]; const ACTION_CODES: readonly ActionCode[];
function explanationPoId(entry: Reason | Action): PoId | null;   // exhaustive switch
function findOverduePurchaseOrders(pos, stats, { asOf, horizonDays }, flagged): OverduePurchaseOrder[];
function overdueReasons(pos, stats, asOf): Reason[];              // one PO_OVERDUE per overdue PO
```

Rules, in the prototype's order (ADR-0005 item 8): no open PO -> `NO_OPEN_PO` + `PLACE_ORDER`
(main supplier or `null`); per PO in file order: `promised >= criticalDate` -> `PO_AFTER_CRITICAL`
+ `PULL_FORWARD`, else P80 delay > 0 -> `PO_LATE` (+ `EXPEDITE` if `promised + p80 >= criticalDate`);
hidden -> `HIDDEN_ERP_LATER` / `HIDDEN_ERP_NONE`; no action yet -> `REVIEW_QTY_OR_DEMAND`, so every
exception has at least one action. Then `analyse` appends one `PO_OVERDUE` per overdue PO of the
material.

Supplier names are resolved in the UI (`suppliers` table), not in the engine, so the engine output
stays free of display text.

Known parity quirk (ADR-0005 item 5, backlog Q4): the projection window drops receipts dated
before `asOf`. An overdue PO therefore never arrives in the ERP view, but its realistic date
(`promised + p80`) can fall inside the window, so the realistic view can look *less* alarming than
the ERP view, and a material with an ERP-only stock-out is skipped from the report. Kept for
parity. The owner chose option B on 2026-09-29: `Report.overduePurchaseOrders`,
`summary.overduePurchaseOrders` and the `PO_OVERDUE` reason make overdue POs visible without
changing any number (ADR-0005 item 5); the demo shows the note in P1-17.

## 8. Deployment view

```mermaid
flowchart LR
  dev["Developer / agent<br/>branch + PR"] --> gha["GitHub Actions<br/>lint, typecheck, test, e2e, lhci"]
  gha -- "PR" --> preview["Vercel preview (fra1)<br/>URL posted on PR"]
  gha -- "merge to main" --> rp["release-please<br/>release PR"]
  rp -- "release published" --> prod["Vercel production (fra1)<br/>vorchain domain"]
  rp -- "release published" --> ghcr["GHCR image<br/>ghcr.io/&lt;owner&gt;/vorchain-web:vX.Y.Z<br/>(output: standalone)"]
```

## 9. Phase 2 outlook (designed for, not built)

- A backend (FastAPI or Spring Boot, or Node reusing `@vorchain/engine` directly) runs the same
  algorithm on scheduled imports. The golden JSON files are the shared contract: any port must pass
  the same parity tests.
- `@vorchain/parsers` takes bytes, not DOM `File`s, so a Node service can reuse it unchanged.
- `Report` is JSON-serialisable and contains no display strings, so it can be stored, emailed
  (weekly report) and rendered by any client.
- Hosting: the GHCR image means the web app can move to an EU container host next to the backend
  without a rewrite (ADR-0006).
- Nothing in Phase 1 stores customer data server-side, so Phase 2 needs its own data-protection
  design (DPA, retention, encryption) and its own ADRs.
