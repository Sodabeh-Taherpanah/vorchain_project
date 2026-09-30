import { releaseProxy, wrap } from 'comlink';

import type { AnalysisService } from './analysis-service.ts';

/** A running analysis worker and the way to stop it. */
export interface AnalysisConnection {
  readonly service: AnalysisService;
  terminate(): void;
}

/**
 * Starts the analysis worker (ADR-0003). The `new URL(..., import.meta.url)` form lets Next.js
 * emit the worker, the parsers and SheetJS as a separate chunk that only loads when this runs.
 * Covered by the e2e suite: jsdom has no `Worker`.
 */
export function connectAnalysisWorker(): AnalysisConnection {
  const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), {
    type: 'module',
    name: 'vorchain-analysis',
  });
  const service = wrap<AnalysisService>(worker);
  return {
    service,
    terminate: () => {
      service[releaseProxy]();
      worker.terminate();
    },
  };
}
