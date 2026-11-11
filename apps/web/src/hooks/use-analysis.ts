import type { AnalysisOptions, MaterialId, ProjectionSeries, Report } from '@vorchain/engine';
import type { SampleLocale } from '@vorchain/sample-data';
import { proxy } from 'comlink';
import { useCallback, useEffect, useReducer, useRef } from 'react';

import type { AnalysisService, LoadProgress, LoadSummary } from '../workers/analysis-service.ts';
import {
  connectAnalysisWorker,
  type AnalysisConnection,
} from '../workers/connect-analysis-worker.ts';

/**
 * Longest a worker call may stay silent before the worker is stopped. Defence in depth against
 * huge but valid sheets that the parsers' limits let through (P1-10 QA). A load that reports
 * progress restarts the clock with every report, so a slow but healthy read of a large file is
 * not cut off.
 */
export const ANALYSIS_TIMEOUT_MS = 30_000;

/** Failures of the worker itself; data problems arrive in `LoadSummary.errors` instead. */
export type AnalysisErrorCode = 'ANALYSIS_TIMEOUT' | 'WORKER_FAILED';

export type AnalysisState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly progress: LoadProgress | null }
  | { readonly status: 'cancelled' }
  | { readonly status: 'mapped'; readonly load: LoadSummary }
  | { readonly status: 'analysing'; readonly load: LoadSummary }
  | { readonly status: 'ready'; readonly load: LoadSummary; readonly report: Report }
  | { readonly status: 'error'; readonly error: AnalysisErrorCode };

type AnalysisEvent =
  | { readonly type: 'reset' }
  | { readonly type: 'load' }
  | { readonly type: 'progress'; readonly progress: LoadProgress }
  | { readonly type: 'cancel' }
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
      return { status: 'loading', progress: null };
    case 'progress':
      return state.status === 'loading' ? { status: 'loading', progress: event.progress } : state;
    case 'cancel':
      return state.status === 'loading' ? { status: 'cancelled' } : state;
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

/**
 * Rejects when `run` stays silent for `ms`; `run` calls the `touch` it is given to say it is still
 * alive.
 */
function withIdleTimeout<T>(run: (touch: () => void) => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expire: (error: Error) => void = () => undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    expire = reject;
  });
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      expire(new AnalysisTimeoutError());
    }, ms);
  };
  touch();
  return Promise.race([run(touch), timeout]).finally(() => {
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
  /** Stops a load that is running: the worker drops what it read; the state becomes `cancelled`. */
  readonly cancel: () => void;
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
  // The generation of the load that has not finished yet, so `cancel` knows what it may stop.
  const pendingLoad = useRef<number | null>(null);
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
    async <T>(
      task: (service: AnalysisService, touch: () => void) => Promise<T>,
    ): Promise<T | null> => {
      connection.current ??= connectRef.current();
      const current = connection.current;
      try {
        return await withIdleTimeout((touch) => task(current.service, touch), ANALYSIS_TIMEOUT_MS);
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
    async (
      task: (
        service: AnalysisService,
        onProgress: (progress: LoadProgress) => void,
      ) => Promise<LoadSummary>,
    ) => {
      const generation = ++loadGeneration.current;
      pendingLoad.current = generation;
      loaded.current = null;
      dispatch({ type: 'load' });
      const result = await call((service, touch) =>
        task(service, (progress) => {
          touch();
          if (generation === loadGeneration.current) dispatch({ type: 'progress', progress });
        }),
      );
      if (generation !== loadGeneration.current) return null;
      pendingLoad.current = null;
      if (result !== null) {
        loaded.current = result;
        dispatch({ type: 'loaded', load: result });
      }
      return result;
    },
    [call],
  );

  const loadFiles = useCallback(
    (files: readonly File[]) =>
      load((service, onProgress) => service.loadFiles(files, proxy(onProgress))),
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
    pendingLoad.current = null;
    loaded.current = null;
    dispatch({ type: 'reset' });
  }, []);

  const cancel = useCallback(() => {
    const running = connection.current;
    if (running === null || pendingLoad.current === null) return;
    pendingLoad.current = null;
    // The pending load resolves `ready: false` and is ignored by its generation.
    loadGeneration.current += 1;
    loaded.current = null;
    dispatch({ type: 'cancel' });
    // Fire and forget: the worker stops at its next chunk; a dead worker needs no cancel.
    void running.service.cancel().catch(() => undefined);
  }, []);

  return { state, loadFiles, loadSample, analyse, getProjection, reset, cancel };
}
