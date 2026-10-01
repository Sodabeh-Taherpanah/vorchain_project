import type { AnalysisOptions, MaterialId, ProjectionSeries, Report } from '@vorchain/engine';
import type { SampleLocale } from '@vorchain/sample-data';
import { useCallback, useEffect, useReducer, useRef } from 'react';

import type { AnalysisService, LoadSummary } from '../workers/analysis-service.ts';
import {
  connectAnalysisWorker,
  type AnalysisConnection,
} from '../workers/connect-analysis-worker.ts';

/**
 * Longest a single worker call may take before the worker is stopped. Defence in depth against
 * huge but valid sheets that the parsers' limits let through (P1-10 QA).
 */
export const ANALYSIS_TIMEOUT_MS = 30_000;

/** Failures of the worker itself; data problems arrive in `LoadSummary.errors` instead. */
export type AnalysisErrorCode = 'ANALYSIS_TIMEOUT' | 'WORKER_FAILED';

export type AnalysisState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'mapped'; readonly load: LoadSummary }
  | { readonly status: 'analysing'; readonly load: LoadSummary }
  | { readonly status: 'ready'; readonly load: LoadSummary; readonly report: Report }
  | { readonly status: 'error'; readonly error: AnalysisErrorCode };

type AnalysisEvent =
  | { readonly type: 'reset' }
  | { readonly type: 'load' }
  | { readonly type: 'loaded'; readonly load: LoadSummary }
  | { readonly type: 'analyse' }
  | { readonly type: 'analysed'; readonly report: Report }
  | { readonly type: 'failed'; readonly error: AnalysisErrorCode };

const IDLE: AnalysisState = { status: 'idle' };

function canAnalyse(state: AnalysisState): state is Extract<AnalysisState, { load: LoadSummary }> {
  return 'load' in state && state.load.ready;
}

/** The state machine; events that do not fit the current state are ignored. */
function transition(state: AnalysisState, event: AnalysisEvent): AnalysisState {
  switch (event.type) {
    case 'reset':
      return IDLE;
    case 'load':
      return { status: 'loading' };
    case 'loaded':
      return state.status === 'loading' ? { status: 'mapped', load: event.load } : state;
    case 'analyse':
      return canAnalyse(state) ? { status: 'analysing', load: state.load } : state;
    case 'analysed':
      return state.status === 'analysing'
        ? { status: 'ready', load: state.load, report: event.report }
        : state;
    case 'failed':
      return { status: 'error', error: event.error };
  }
}

class AnalysisTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new AnalysisTimeoutError());
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

export interface UseAnalysisOptions {
  /** Starts the worker; tests pass a fake service. */
  readonly connect?: () => AnalysisConnection;
}

export interface UseAnalysis {
  readonly state: AnalysisState;
  /**
   * Hands the `File` objects to the worker; this thread never reads their content. Loads resolve
   * `null` when the worker failed or a newer load replaced them.
   */
  readonly loadFiles: (files: readonly File[]) => Promise<LoadSummary | null>;
  readonly loadSample: (locale: SampleLocale) => Promise<LoadSummary | null>;
  /**
   * Runs only after a complete load; resolves `null` otherwise. May run again with new settings
   * (also while one runs): only the newest run reaches the state, older ones resolve `null`.
   */
  readonly analyse: (options: AnalysisOptions) => Promise<Report | null>;
  /**
   * One material's projection for the latest analysis' options. Resolves `null` when the worker
   * failed or a newer load replaced the data meanwhile, so a stale series never reaches the page.
   */
  readonly getProjection: (materialId: MaterialId) => Promise<ProjectionSeries | null>;
  /** Forgets the last load (e.g. the user removed every file); a pending load is ignored. */
  readonly reset: () => void;
}

/**
 * The demo's bridge to the analysis worker: an explicit state machine
 * (`idle -> loading -> mapped -> analysing -> ready | error`). The worker starts on first use,
 * is stopped after {@link ANALYSIS_TIMEOUT_MS} or on unmount, and is recreated when needed.
 */
export function useAnalysis({
  connect = connectAnalysisWorker,
}: UseAnalysisOptions = {}): UseAnalysis {
  const [state, dispatch] = useReducer(transition, IDLE);
  const connection = useRef<AnalysisConnection | null>(null);
  // The latest `connect`, so the returned functions keep their identity: the production bundle
  // hands in a new `connect` on every render, and callers use `analyse` as an effect dependency.
  const connectRef = useRef(connect);
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);
  // The last load, readable right after `await loadSample()` in the same event handler, where
  // `state` from the closure is still the old one.
  const loaded = useRef<LoadSummary | null>(null);
  // Counts loads so that only the newest one reaches the state; an older load may finish later.
  const loadGeneration = useRef(0);
  // The same for analyses: the settings may change while an analysis is still running.
  const analyseGeneration = useRef(0);

  useEffect(
    () => () => {
      connection.current?.terminate();
      connection.current = null;
    },
    [],
  );

  const call = useCallback(
    async <T>(task: (service: AnalysisService) => Promise<T>): Promise<T | null> => {
      connection.current ??= connectRef.current();
      const current = connection.current;
      try {
        return await withTimeout(task(current.service), ANALYSIS_TIMEOUT_MS);
      } catch (error) {
        // Unmount or another call already stopped this worker (a second release would throw);
        // a stale failure must not replace the state of a newer worker either.
        if (connection.current !== current) return null;
        connection.current = null;
        current.terminate();
        loaded.current = null;
        const code = error instanceof AnalysisTimeoutError ? 'ANALYSIS_TIMEOUT' : 'WORKER_FAILED';
        dispatch({ type: 'failed', error: code });
        return null;
      }
    },
    [],
  );

  const load = useCallback(
    async (task: (service: AnalysisService) => Promise<LoadSummary>) => {
      const generation = ++loadGeneration.current;
      loaded.current = null;
      dispatch({ type: 'load' });
      const result = await call(task);
      if (generation !== loadGeneration.current) return null;
      if (result !== null) {
        loaded.current = result;
        dispatch({ type: 'loaded', load: result });
      }
      return result;
    },
    [call],
  );

  const loadFiles = useCallback(
    (files: readonly File[]) => load((service) => service.loadFiles(files)),
    [load],
  );
  const loadSample = useCallback(
    (locale: SampleLocale) => load((service) => service.loadSample(locale)),
    [load],
  );

  const analyse = useCallback(
    async (options: AnalysisOptions) => {
      if (loaded.current?.ready !== true) return null;
      const generation = ++analyseGeneration.current;
      dispatch({ type: 'analyse' });
      const report = await call((service) => service.analyse(options));
      if (generation !== analyseGeneration.current) return null;
      if (report !== null) dispatch({ type: 'analysed', report });
      return report;
    },
    [call],
  );

  const getProjection = useCallback(
    async (materialId: MaterialId) => {
      const generation = loadGeneration.current;
      const series = await call((service) => service.getProjection(materialId));
      // The data it was computed from was replaced meanwhile (new files, sample or reset).
      return generation === loadGeneration.current ? series : null;
    },
    [call],
  );

  const reset = useCallback(() => {
    loadGeneration.current += 1;
    loaded.current = null;
    dispatch({ type: 'reset' });
  }, []);

  return { state, loadFiles, loadSample, analyse, getProjection, reset };
}
