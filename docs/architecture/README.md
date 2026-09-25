# Architecture (initial draft, to be refined by the `architect` agent)

## C4 Level 1: System context
```mermaid
flowchart LR
  planner["👤 Planner / Disponent<br/>(German manufacturer)"]
  buyer["👤 Head of purchasing /<br/>managing director"]
  erp[("Customer ERP<br/>(Business Central, Sage, abas…)")]
  site["Vorchain website + demo<br/>(runs in the browser)"]
  mail["Transactional email /<br/>form service (EU)"]
  analytics["Cookieless analytics (EU)<br/>aggregate events only"]

  erp -- "manual export<br/>CSV / XLSX" --> planner
  planner -- "uploads files<br/>(stay in browser)" --> site
  buyer -- "reads, requests<br/>Engpass-Check" --> site
  site -- "contact form only" --> mail
  site -- "page views, demo_started<br/>(no data)" --> analytics
```

## C4 Level 2: Containers (Phase 1)
```mermaid
flowchart TB
  subgraph Browser
    ui["Next.js pages (React 19)<br/>landing, demo, contact, legal"]
    worker["Analysis Web Worker<br/>(Comlink)"]
    parsers["@vorchain/parsers<br/>CSV/XLSX → zod-validated input"]
    engine["@vorchain/engine<br/>pure TS domain logic"]
    ui -- "File objects" --> worker
    worker --> parsers --> engine
    engine -- "Report JSON" --> worker -- "Report JSON" --> ui
  end
  subgraph Hosting["Static hosting / edge (per ADR-0006)"]
    static["Prerendered HTML, JS, i18n messages"]
    action["Contact form handler<br/>(server action or form service)"]
  end
  static --> ui
  ui -- "form fields only" --> action
```

## Demo data flow
```mermaid
sequenceDiagram
  actor U as Planner
  participant P as Demo page
  participant W as Worker
  participant PR as parsers
  participant E as engine
  U->>P: drop files / "Beispieldaten laden"
  P->>W: analyse(files, {asOf, horizon})
  W->>PR: detectTables + parse + validate
  PR-->>W: DomainInput | DataError[]
  W->>E: analyse(input, options)
  E-->>W: Report {exceptions, supplierStats}
  W-->>P: Report
  P->>U: summary tiles, ranked table, charts
  Note over P,W: No network call carries file content (e2e-tested)
```

## Module dependency rule
```mermaid
flowchart LR
  web["apps/web"] --> parsers["packages/parsers"] --> engine["packages/engine"]
  web --> engine
  web --> sample["packages/sample-data"]
```

## Phase 2 outlook (not built now)
Backend service (FastAPI or Spring Boot) calls the same algorithm on scheduled imports. The engine's JSON-in/JSON-out API is designed so it can be reused, or ported with the same golden parity tests.
