# 0003. Client-side processing in a Web Worker (privacy promise)

- Status: accepted
- Date: 2026-09-25
- Deciders: Sodabeh Taherpanah

## Context and problem
The product promise is "Ihre Daten verlassen nie Ihren Browser". German Mittelstand buyers are
cautious about sharing ERP exports (stock, suppliers, prices) with an unknown startup. The demo must
also stay responsive with 20k materials and 100k demand rows (< 3 s on a mid-range laptop) and
handle XLSX, whose parser (SheetJS) is large and CPU-heavy.

## Options considered
1. **Parse and analyse in a dedicated Web Worker (Comlink bridge).** Pros: files never leave the
   device; UI thread stays responsive; the worker is lazy-loaded so the landing page does not pay
   for SheetJS; privacy can be tested. Cons: worker bundling and debugging are a bit harder;
   data crossing the boundary must be structured-clonable.
2. **Parse and analyse on the main thread.** Pros: simplest. Cons: large files freeze the UI
   (fails the 3 s responsiveness requirement); XLSX parser in the main bundle.
3. **Upload to a server and analyse there.** Pros: easy to reuse in Phase 2; no browser limits.
   Cons: breaks the privacy promise, needs a DPA with every prospect, storage and deletion policy;
   out of scope for Phase 1.
4. **WebAssembly port of the Python prototype (Pyodide).** Pros: literally the same code.
   Cons: 10+ MB download, slow start, poor portfolio signal for a TS stack.

## Decision
We choose **option 1**.
- `apps/web/src/workers/analysis.worker.ts`, created with
  `new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })` on the first
  demo interaction; exposed via **Comlink** (`comlink@4.4.2`).
- The page passes `File` objects (structured clone) to the worker; the **main thread never reads
  file content**. The worker keeps the parsed `AnalysisInput` in memory and returns only derived
  data (`LoadResult`, `Report`, `ProjectionSeries`).
- Sample data takes the same path: the worker dynamically imports `@vorchain/sample-data` and runs
  it through the parsers, so the demo shows the real pipeline.
- **Defence in depth:**
  1. CSP `connect-src 'self' <analytics-origin>`; no third-party scripts on `/demo`.
  2. Analytics events carry only an event name, never file names, counts or results (ADR-0012).
  3. Error reporting (if added later) must scrub file data; no session replay tools.
  4. Playwright e2e test records all requests during upload and analysis and fails if any request
     body or URL contains a marker string from the uploaded fixture (ADR-0008).
- CSV export uses a local `Blob` + object URL; the printable report is a client-side route state.

## Consequences
- Positive: the privacy claim is architectural and tested, not just a policy; the UI stays
  responsive; the parser and engine run unchanged in Node for tests and Phase 2.
- Negative / risks: the browser's memory limits bound file size (document a soft limit of ~50 MB
  total and show a friendly error above it); Safari/Firefox module-worker support must be covered by
  e2e (Playwright WebKit + Firefox projects on the demo spec).
- Follow-ups: P1-15 (worker bridge), P1-20 (network assertion e2e), P1-27 (CSP).

## References
- `comlink@4.4.2`, `papaparse@5.7.0`, SheetJS `xlsx@0.20.3` from https://cdn.sheetjs.com (checked 2026-09-25)
- https://nextjs.org/docs/app/api-reference/config/next-config-js (worker bundling via `new URL`)
