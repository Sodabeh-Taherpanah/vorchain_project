/**
 * Everything the demo's Web Worker does, as plain functions (backlog P1-15, ADR-0003). The worker
 * module only exposes this object through Comlink, so the logic is testable without a worker.
 *
 * Privacy: uploaded files are read here, inside the worker. The parsed `AnalysisInput` stays in
 * this closure; the page only receives derived data (table summary, errors, report, projection).
 * Nothing is logged or sent anywhere.
 */
import {
  analyse,
  projectionSeries,
  type AnalysisInput,
  type AnalysisOptions,
  type IsoDate,
  type MaterialId,
  type ProjectionSeries,
  type Report,
} from '@vorchain/engine';
import {
  loadTables,
  MAX_FILE_BYTES,
  parseFile,
  type DataError,
  type LoadResult,
  type RawTable,
  type SourceFile,
} from '@vorchain/parsers';
import type { SampleLocale } from '@vorchain/sample-data';

/** What the page learns from a load: `LoadResult` without the input, which stays in the worker. */
export interface LoadSummary {
  readonly tables: LoadResult['tables'];
  readonly errors: LoadResult['errors'];
  readonly warnings: LoadResult['warnings'];
  /** `true` when a complete input is held in the worker and `analyse` may run. */
  readonly ready: boolean;
  /** The sample's analysis date; `null` for uploads (the user picks the date). */
  readonly asOf: IsoDate | null;
}

export interface AnalysisService {
  readonly loadFiles: (files: readonly File[]) => Promise<LoadSummary>;
  readonly loadSample: (locale: SampleLocale) => Promise<LoadSummary>;
  readonly analyse: (options: AnalysisOptions) => Promise<Report>;
  readonly getProjection: (materialId: MaterialId) => Promise<ProjectionSeries>;
}

/**
 * The soft limit of ADR-0003 applies to all files together and is checked before any byte is
 * read; it shares the parsers' per-file limit so there is one number to document.
 */
export const MAX_TOTAL_BYTES = MAX_FILE_BYTES;

function tooLarge(): LoadResult {
  const error: DataError = {
    code: 'FILE_TOO_LARGE',
    params: { limit: MAX_TOTAL_BYTES, unit: 'bytes' },
  };
  return { tables: [], errors: [error], warnings: [], input: null };
}

async function parseAll(files: readonly SourceFile[]): Promise<LoadResult> {
  const parsed = await Promise.all(files.map(parseFile));
  const tables: RawTable[] = parsed.flatMap((r) => (r.ok ? [r.value] : []));
  const fileErrors = parsed.flatMap((r) => (r.ok ? [] : [r.error]));
  const loaded = loadTables(tables);
  if (fileErrors.length === 0) return loaded;
  return { ...loaded, errors: [...fileErrors, ...loaded.errors], input: null };
}

async function readUploads(files: readonly File[]): Promise<LoadResult> {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_TOTAL_BYTES) return tooLarge();
  const sources = await Promise.all(
    files.map(async (file) => ({ name: file.name, bytes: await file.arrayBuffer() })),
  );
  return parseAll(sources);
}

/** Creates one analysis session; the worker holds exactly one. */
export function createAnalysisService(): AnalysisService {
  let input: AnalysisInput | null = null;
  let lastOptions: AnalysisOptions | null = null;

  const remember = (result: LoadResult, asOf: IsoDate | null): LoadSummary => {
    input = result.input;
    lastOptions = null;
    const { tables, errors, warnings } = result;
    return { tables, errors, warnings, ready: input !== null, asOf };
  };

  const requireInput = (): AnalysisInput => {
    if (input === null) throw new Error('analysis-service: no input loaded');
    return input;
  };

  return {
    async loadFiles(files) {
      return remember(await readUploads(files), null);
    },

    async loadSample(locale) {
      // Loaded on demand so the sample text is only in the worker's lazy chunk.
      const { sampleDatasets } = await import('@vorchain/sample-data');
      const dataset = sampleDatasets[locale];
      const encoder = new TextEncoder();
      const sources = dataset.files.map((f) => ({
        name: f.name,
        bytes: encoder.encode(f.content),
      }));
      return remember(await parseAll(sources), dataset.asOf);
    },

    // eslint-disable-next-line @typescript-eslint/require-await -- Comlink calls are async anyway; a rejected promise is the uniform error channel.
    async analyse(options) {
      const report = analyse(requireInput(), options);
      lastOptions = options;
      return report;
    },

    // eslint-disable-next-line @typescript-eslint/require-await -- see `analyse`.
    async getProjection(materialId) {
      const current = requireInput();
      if (lastOptions === null) throw new Error('analysis-service: call analyse first');
      return projectionSeries(current, materialId, lastOptions);
    },
  };
}
