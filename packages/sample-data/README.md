# @vorchain/sample-data

Demo datasets for Vorchain (backlog P1-11, spec §4.1/§4.2). Two entry points, so the demo bundle
only ever contains what it needs:

| Import                        | Export                                          | Used by                                   |
| ----------------------------- | ----------------------------------------------- | ----------------------------------------- |
| `@vorchain/sample-data`       | `sampleDatasets: Record<'de' \| 'en', SampleDataset>` | "Beispieldaten laden" on `/demo` (lazy-loaded) |
| `@vorchain/sample-data/scale` | `generateScaleDataset({ materials, demandRows, seed })` | Benchmark and load tests only             |

A `SampleDataset` is `{ asOf, files: { name, content }[] }`: exactly what the demo's worker gets
from an upload, so the samples run through the real parsers and engine
(`TextEncoder` -> `parseFile` -> `loadTables` -> `analyse`).

## Bundled datasets

`src/generated/{de,en}.ts` are generated from `reference/python-prototype/sample_data_de` and
`sample_data` (read-only) by `scripts/sync-reference.ts`, with `asOf` from the matching golden file.
Each CSV becomes a string literal written in plain ASCII with escapes (`\u{feff}`, `\r\n`, `\u{fc}`),
so git, editors and Prettier cannot change it and `TextEncoder` gives back the reference bytes.

```sh
pnpm --filter @vorchain/sample-data sync    # regenerate after reference/ changes
pnpm --filter @vorchain/sample-data check   # CI: fails if src/generated/ is out of date
```

`test/datasets.test.ts` checks the bytes against `reference/` and that the bundled datasets give the
golden exceptions through parsers and engine.

## Scale generator

German ERP export (UTF-8 BOM, CRLF, `;`, `1.234,5`, `DD.MM.YYYY`) with all five tables. A seeded
Mulberry32 PRNG, no clock and no `Math.random`: the same options give the same bytes (pinned by a
SHA-256 in `test/scale.test.ts`). Every third supplier is 3–10 days late and half of its materials
only bridge to the promised date, so the data contains hidden risks as well as visible shortages.

## Performance benchmark

```sh
pnpm bench   # Vitest project `bench`, not part of `pnpm test`
```

Parses and analyses 20 000 materials / 100 000 demand rows and logs the time.

- **Target:** under **3 s** on a developer laptop (about 1.6 s on an Apple Silicon laptop).
- **CI budget:** the test fails above **6 s**, headroom for slower shared runners.
