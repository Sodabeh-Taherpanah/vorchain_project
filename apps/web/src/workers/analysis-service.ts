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
  chunkSourceFromBytes,
  loadSources,
  MAX_FILE_BYTES,
  type ChunkSource,
  type DataError,
  type LoadResult,
} from '@vorchain/parsers';
import type { SampleLocale } from '@vorchain/sample-data';
import { releaseProxy } from 'comlink';

/** What the page learns from a load: `LoadResult` without the input, which stays in the worker. */
export interface LoadSummary {
  readonly tables: LoadResult['tables'];
  readonly errors: LoadResult['errors'];
  readonly warnings: LoadResult['warnings'];
  /** `true` when a complete input is held in the worker and `analyse` may run. */
  readonly ready: boolean;
  /** The sample's analysis date; `null` for uploads (the user picks the date). */
  readonly asOf: IsoDate | null;
  /**
   * Supplier ID to name from the optional suppliers table, for the explanations (the engine's
   * output stays ID-based). Empty when the table is missing or the load failed.
   */
  readonly supplierNames: Readonly<Record<string, string>>;
}

/** How far a load is; counts only, never file content (AGENTS.md section 2). */
export interface LoadProgress {
  readonly bytesRead: number;
  readonly totalBytes: number;
}

/** The page's callback; it reaches the worker as a Comlink proxy. */
export type ProgressListener = (progress: LoadProgress) => void;

export interface AnalysisService {
  /**
   * Reads the files in chunks inside the worker. `onProgress` is called at most about ten times a
   * second. A load that was cancelled or replaced resolves with `ready: false` and no tables.
   */
  readonly loadFiles: (
    files: readonly File[],
    onProgress?: ProgressListener,
  ) => Promise<LoadSummary>;
  /** Stops the load that is running (if any), drops what it read and frees its memory. */
  readonly cancel: () => Promise<void>;
  readonly loadSample: (locale: SampleLocale) => Promise<LoadSummary>;
  readonly analyse: (options: AnalysisOptions) => Promise<Report>;
  readonly getProjection: (materialId: MaterialId) => Promise<ProjectionSeries>;
}

/**
 * The soft limit of ADR-0003 applies to all files together and is checked before any byte is
 * read; it shares the parsers' per-file limit so there is one number to document.
 */
export const MAX_TOTAL_BYTES = MAX_FILE_BYTES;

function namesOf(input: AnalysisInput | null): Readonly<Record<string, string>> {
  // `fromEntries` defines own properties, so an ID such as `__proto__` is kept as a name.
  return Object.fromEntries(
    (input?.suppliers ?? []).map(({ supplierId, name }) => [supplierId, name]),
  );
}

function tooLarge(): LoadResult {
  const error: DataError = {
    code: 'FILE_TOO_LARGE',
    params: { limit: MAX_TOTAL_BYTES, unit: 'bytes' },
  };
  return { tables: [], errors: [error], warnings: [], input: null };
}

/**
 * The page's progress callback arrives as a Comlink proxy that holds a message port; releasing it
 * closes the port. A plain function (tests, no Comlink) has nothing to release.
 */
function releaseListener(listener: ProgressListener | undefined): void {
  const release = (listener as Partial<Record<typeof releaseProxy, () => void>> | undefined)?.[
    releaseProxy
  ];
  release?.();
}

/** Thrown inside a load that was cancelled or replaced; never leaves this module. */
class LoadStopped extends Error {}

/** Progress is sent at most this often; every chunk still checks whether the load was stopped. */
export const PROGRESS_INTERVAL_MS = 100;

const nextTask = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * Reads a `File` chunk by chunk (`File.stream()`); the bytes of one chunk are garbage once the
 * parser has used them. Can be opened again, as the parsers need two passes for the encoding.
 */
function chunkSourceFromFile(file: File): ChunkSource {
  return {
    name: file.name,
    size: file.size,
    async *open() {
      const reader = file.stream().getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        // Also runs when the parser stops early (peeking at the first bytes, cancel, an error).
        await reader.cancel().catch(() => undefined);
      }
    },
  };
}

async function loadAll(
  sources: readonly ChunkSource[],
  isCurrent: () => boolean,
  onProgress: ProgressListener | undefined,
): Promise<LoadResult> {
  let lastSent = Number.NEGATIVE_INFINITY;
  try {
    return await loadSources(sources, {
      async onProgress(bytesRead, totalBytes) {
        if (!isCurrent()) throw new LoadStopped();
        const now = performance.now();
        if (now - lastSent < PROGRESS_INTERVAL_MS) return;
        lastSent = now;
        // A real task boundary, so a `cancel()` message can be handled during a long load.
        await nextTask();
        if (!isCurrent()) throw new LoadStopped();
        onProgress?.({ bytesRead, totalBytes });
      },
    });
  } catch (error) {
    if (error instanceof LoadStopped) return { tables: [], errors: [], warnings: [], input: null };
    throw error;
  }
}

/** Creates one analysis session; the worker holds exactly one. */
export function createAnalysisService(): AnalysisService {
  let input: AnalysisInput | null = null;
  let lastOptions: AnalysisOptions | null = null;
  // Loads await file reads, so an older load can finish after a newer one; only the newest counts.
  let latestLoad = 0;
  // The load that is reading right now, so `cancel` knows whether there is anything to stop.
  let reading: number | null = null;

  const remember = (load: number, result: LoadResult, asOf: IsoDate | null): LoadSummary => {
    const { tables, errors, warnings } = result;
    if (load !== latestLoad) {
      return { tables, errors, warnings, ready: false, asOf, supplierNames: {} };
    }
    input = result.input;
    lastOptions = null;
    return { tables, errors, warnings, ready: input !== null, asOf, supplierNames: namesOf(input) };
  };

  const requireInput = (): AnalysisInput => {
    if (input === null) throw new Error('analysis-service: no input loaded');
    return input;
  };

  return {
    async loadFiles(files, onProgress) {
      const load = ++latestLoad;
      const total = files.reduce((sum, file) => sum + file.size, 0);
      if (total > MAX_TOTAL_BYTES) return remember(load, tooLarge(), null);
      reading = load;
      try {
        const result = await loadAll(
          files.map(chunkSourceFromFile),
          () => load === latestLoad,
          onProgress,
        );
        return remember(load, result, null);
      } finally {
        if (reading === load) reading = null;
        releaseListener(onProgress);
      }
    },

    // eslint-disable-next-line @typescript-eslint/require-await -- see `analyse`.
    async cancel() {
      if (reading === null) return;
      latestLoad += 1;
      reading = null;
      input = null;
      lastOptions = null;
    },

    async loadSample(locale) {
      const load = ++latestLoad;
      // Loaded on demand so the sample text is only in the worker's lazy chunk.
      const { sampleDatasets } = await import('@vorchain/sample-data');
      const dataset = sampleDatasets[locale];
      const encoder = new TextEncoder();
      const sources = dataset.files.map((f) =>
        chunkSourceFromBytes(f.name, encoder.encode(f.content)),
      );
      return remember(
        load,
        await loadAll(sources, () => load === latestLoad, undefined),
        dataset.asOf,
      );
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
