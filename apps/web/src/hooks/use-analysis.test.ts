import { act, renderHook } from '@testing-library/react';
import { materialId, type IsoDate, type ProjectionSeries, type Report } from '@vorchain/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnalysisConnection } from '../workers/connect-analysis-worker.ts';
import type { AnalysisService, LoadSummary } from '../workers/analysis-service.ts';
import { ANALYSIS_TIMEOUT_MS, useAnalysis } from './use-analysis.ts';

const asOf = '2026-10-05' as IsoDate;
const options = { asOf, horizonDays: 28 };
const loaded: LoadSummary = {
  tables: [],
  errors: [],
  warnings: [],
  ready: true,
  asOf,
  supplierNames: {},
};
const report = {
  asOf,
  horizonDays: 28,
  summary: { critical: 2, warning: 1, hidden: 1, overduePurchaseOrders: 0 },
} as unknown as Report;
const series = {
  materialId: materialId('M1'),
  safetyStock: 0,
  points: [],
} satisfies ProjectionSeries;

const never = <T>() => new Promise<T>(() => undefined);

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Like Comlink: a released proxy throws on any further access, so a second terminate throws. */
function strictTerminate() {
  let released = false;
  return vi.fn(() => {
    if (released) throw new Error('Proxy has been released and is not useable');
    released = true;
  });
}

function fakeService(overrides: Partial<AnalysisService> = {}): AnalysisService {
  return {
    loadFiles: vi.fn(() => Promise.resolve({ ...loaded, asOf: null })),
    loadSample: vi.fn(() => Promise.resolve(loaded)),
    analyse: vi.fn(() => Promise.resolve(report)),
    getProjection: vi.fn(() => Promise.resolve(series)),
    ...overrides,
  };
}

function setup(service: AnalysisService = fakeService()) {
  const terminate = vi.fn();
  const connect = vi.fn((): AnalysisConnection => {
    const release = strictTerminate();
    return {
      service,
      terminate: () => {
        terminate();
        release();
      },
    };
  });
  const hook = renderHook(() => useAnalysis({ connect }));
  return { hook, connect, terminate, service };
}

describe('useAnalysis', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle and creates no worker before the first use', () => {
    const { hook, connect } = setup();

    expect(hook.result.current.state).toEqual({ status: 'idle' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('walks idle -> loading -> mapped -> analysing -> ready', async () => {
    const { hook, connect } = setup();

    let load: Promise<LoadSummary | null> = Promise.resolve(null);
    act(() => {
      load = hook.result.current.loadSample('de');
    });
    expect(hook.result.current.state).toEqual({ status: 'loading' });
    await act(() => load);
    expect(hook.result.current.state).toEqual({ status: 'mapped', load: loaded });

    let run: Promise<Report | null> = Promise.resolve(null);
    act(() => {
      run = hook.result.current.analyse(options);
    });
    expect(hook.result.current.state).toEqual({ status: 'analysing', load: loaded });
    await act(() => run);

    expect(hook.result.current.state).toEqual({ status: 'ready', load: loaded, report });
    expect(connect).toHaveBeenCalledOnce();
  });

  it('hands File objects to the worker without reading them', async () => {
    const { hook, service } = setup();
    const file = new File(['secret'], 'bestand.csv');
    const read = vi.spyOn(file, 'arrayBuffer');
    const text = vi.spyOn(file, 'text');

    await act(() => hook.result.current.loadFiles([file]));

    expect(service.loadFiles).toHaveBeenCalledWith([file]);
    expect(read).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
  });

  it('does not analyse before a complete input is loaded', async () => {
    const incomplete = { ...loaded, ready: false };
    const { hook, service } = setup(fakeService({ loadSample: () => Promise.resolve(incomplete) }));

    await expect(hook.result.current.analyse(options)).resolves.toBeNull();
    await act(() => hook.result.current.loadSample('de'));
    await act(() => hook.result.current.analyse(options));

    expect(service.analyse).not.toHaveBeenCalled();
    expect(hook.result.current.state).toEqual({ status: 'mapped', load: incomplete });
  });

  it('stops a worker that runs too long and recreates it on the next use', async () => {
    const { hook, connect, terminate } = setup(fakeService({ loadSample: never }));

    act(() => {
      void hook.result.current.loadSample('de');
    });
    await act(() => vi.advanceTimersByTimeAsync(ANALYSIS_TIMEOUT_MS - 1));
    expect(hook.result.current.state).toEqual({ status: 'loading' });
    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(hook.result.current.state).toEqual({ status: 'error', error: 'ANALYSIS_TIMEOUT' });
    expect(terminate).toHaveBeenCalledOnce();

    act(() => {
      void hook.result.current.loadSample('de');
    });
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('reports a crashed worker as WORKER_FAILED', async () => {
    const { hook, terminate } = setup(
      fakeService({ loadSample: () => Promise.reject(new Error('boom')) }),
    );

    await act(() => hook.result.current.loadSample('de'));

    expect(hook.result.current.state).toEqual({ status: 'error', error: 'WORKER_FAILED' });
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('returns projections without changing the state', async () => {
    const { hook } = setup();
    await act(() => hook.result.current.loadSample('de'));

    const result = await act(() => hook.result.current.getProjection(materialId('M1')));

    expect(result).toBe(series);
    expect(hook.result.current.state.status).toBe('mapped');
  });

  it('drops a projection whose data was replaced by a newer load while it ran', async () => {
    const pending = deferred<ProjectionSeries>();
    const { hook } = setup(fakeService({ getProjection: () => pending.promise }));
    await act(() => hook.result.current.loadSample('de'));
    let projection: Promise<ProjectionSeries | null> = Promise.resolve(null);
    act(() => {
      projection = hook.result.current.getProjection(materialId('M1'));
    });

    await act(() => hook.result.current.loadSample('en'));
    pending.resolve(series);

    await expect(projection).resolves.toBeNull();
  });

  it('drops a projection that was running when the files were removed', async () => {
    const pending = deferred<ProjectionSeries>();
    const { hook } = setup(fakeService({ getProjection: () => pending.promise }));
    await act(() => hook.result.current.loadSample('de'));
    let projection: Promise<ProjectionSeries | null> = Promise.resolve(null);
    act(() => {
      projection = hook.result.current.getProjection(materialId('M1'));
    });

    act(() => {
      hook.result.current.reset();
    });
    pending.resolve(series);

    await expect(projection).resolves.toBeNull();
  });

  it('terminates the worker on unmount', async () => {
    const { hook, terminate } = setup();
    await act(() => hook.result.current.loadSample('de'));

    hook.unmount();

    expect(terminate).toHaveBeenCalledOnce();
  });

  it('shows the newest load when an older one finishes later', async () => {
    const older = deferred<LoadSummary>();
    const newer = deferred<LoadSummary>();
    const olderLoad = { ...loaded, ready: false };
    const loads = [older.promise, newer.promise];
    const { hook } = setup(fakeService({ loadFiles: () => loads.shift() ?? never() }));

    let first: Promise<LoadSummary | null> = Promise.resolve(null);
    let second: Promise<LoadSummary | null> = Promise.resolve(null);
    act(() => {
      first = hook.result.current.loadFiles([]);
      second = hook.result.current.loadFiles([]);
    });
    await act(async () => {
      older.resolve(olderLoad);
      await first;
    });
    expect(hook.result.current.state).toEqual({ status: 'loading' });
    await act(async () => {
      newer.resolve(loaded);
      await second;
    });

    expect(hook.result.current.state).toEqual({ status: 'mapped', load: loaded });
    await expect(first).resolves.toBeNull();
  });

  it('shows the newest analysis when the settings change while one is running', async () => {
    const older = deferred<Report>();
    const newer = deferred<Report>();
    const newerReport = { ...report, horizonDays: 7 };
    const runs = [older.promise, newer.promise];
    const { hook } = setup(fakeService({ analyse: () => runs.shift() ?? never() }));
    await act(() => hook.result.current.loadSample('de'));

    let first: Promise<Report | null> = Promise.resolve(null);
    let second: Promise<Report | null> = Promise.resolve(null);
    act(() => {
      first = hook.result.current.analyse(options);
      second = hook.result.current.analyse({ ...options, horizonDays: 7 });
    });
    await act(async () => {
      older.resolve(report);
      await first;
    });
    expect(hook.result.current.state).toEqual({ status: 'analysing', load: loaded });
    await act(async () => {
      newer.resolve(newerReport);
      await second;
    });

    expect(hook.result.current.state).toEqual({
      status: 'ready',
      load: loaded,
      report: newerReport,
    });
    await expect(first).resolves.toBeNull();
  });

  it('drops an analysis of the previous data when new data loads meanwhile', async () => {
    const stale = deferred<Report>();
    const newLoad = { ...loaded, asOf: '2026-11-02' as IsoDate };
    const loads = [loaded, newLoad];
    const { hook } = setup(
      fakeService({
        loadSample: () => Promise.resolve(loads.shift() ?? loaded),
        analyse: () => stale.promise,
      }),
    );
    await act(() => hook.result.current.loadSample('de'));
    let running: Promise<Report | null> = Promise.resolve(null);
    act(() => {
      running = hook.result.current.analyse(options);
    });

    await act(() => hook.result.current.loadSample('en'));
    await act(async () => {
      stale.resolve(report);
      await running;
    });

    // The old report must not be shown as the result of the new data.
    expect(hook.result.current.state).toEqual({ status: 'mapped', load: newLoad });
  });

  it('keeps its functions stable even when `connect` changes on every render', () => {
    const service = fakeService();
    const hook = renderHook(() =>
      useAnalysis({ connect: () => ({ service, terminate: vi.fn() }) }),
    );
    const first = hook.result.current;

    hook.rerender();

    // Callers use `analyse` as an effect dependency; a new identity would re-run the analysis.
    expect(hook.result.current.analyse).toBe(first.analyse);
    expect(hook.result.current.loadSample).toBe(first.loadSample);
    expect(hook.result.current.getProjection).toBe(first.getProjection);
  });

  it('re-runs the analysis from ready without reloading the data', async () => {
    const { hook, service } = setup();
    await act(() => hook.result.current.loadSample('de'));
    await act(() => hook.result.current.analyse(options));
    await act(() => hook.result.current.analyse({ ...options, horizonDays: 7 }));

    expect(service.loadSample).toHaveBeenCalledOnce();
    expect(service.analyse).toHaveBeenLastCalledWith({ asOf, horizonDays: 7 });
    expect(hook.result.current.state).toMatchObject({ status: 'ready' });
  });

  it('resets to idle and ignores a load that finishes after the reset', async () => {
    const pending = deferred<LoadSummary>();
    const { hook, service } = setup(fakeService({ loadFiles: () => pending.promise }));

    let load: Promise<LoadSummary | null> = Promise.resolve(null);
    act(() => {
      load = hook.result.current.loadFiles([]);
    });
    act(() => {
      hook.result.current.reset();
    });
    await act(async () => {
      pending.resolve(loaded);
      await load;
    });

    expect(hook.result.current.state).toEqual({ status: 'idle' });
    await expect(load).resolves.toBeNull();
    await act(async () => {
      await expect(hook.result.current.analyse(options)).resolves.toBeNull();
    });
    expect(service.analyse).not.toHaveBeenCalled();
  });

  it('ignores the timeout of a call that was pending when the page unmounted', async () => {
    const { hook, terminate } = setup(fakeService({ loadSample: never }));
    let pending: Promise<LoadSummary | null> = Promise.resolve(null);
    act(() => {
      pending = hook.result.current.loadSample('de');
    });

    hook.unmount();
    await vi.advanceTimersByTimeAsync(ANALYSIS_TIMEOUT_MS);

    await expect(pending).resolves.toBeNull();
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('stops a hung worker once when two calls time out on it', async () => {
    const { hook, connect, terminate } = setup(
      fakeService({ loadSample: never, getProjection: never }),
    );
    let load: Promise<LoadSummary | null> = Promise.resolve(null);
    let projection: Promise<ProjectionSeries | null> = Promise.resolve(null);
    act(() => {
      load = hook.result.current.loadSample('de');
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    act(() => {
      projection = hook.result.current.getProjection(materialId('M1'));
    });

    await act(() => vi.advanceTimersByTimeAsync(ANALYSIS_TIMEOUT_MS));

    await expect(load).resolves.toBeNull();
    await expect(projection).resolves.toBeNull();
    expect(terminate).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledOnce();
    expect(hook.result.current.state).toEqual({ status: 'error', error: 'ANALYSIS_TIMEOUT' });
  });

  it('does not let a stale failure from a stopped worker replace a newer result', async () => {
    const hung = deferred<ProjectionSeries>();
    let calls = 0;
    const { hook, connect } = setup(
      fakeService({
        loadSample: () => (++calls === 1 ? never() : Promise.resolve(loaded)),
        getProjection: () => hung.promise,
      }),
    );
    let projection: Promise<ProjectionSeries | null> = Promise.resolve(null);
    act(() => {
      void hook.result.current.loadSample('de');
    });
    await act(() => vi.advanceTimersByTimeAsync(ANALYSIS_TIMEOUT_MS - 1000));
    act(() => {
      projection = hook.result.current.getProjection(materialId('M1'));
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(hook.result.current.state).toEqual({ status: 'error', error: 'ANALYSIS_TIMEOUT' });

    await act(() => hook.result.current.loadSample('de'));
    await act(() => vi.advanceTimersByTimeAsync(ANALYSIS_TIMEOUT_MS));

    await expect(projection).resolves.toBeNull();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(hook.result.current.state).toEqual({ status: 'mapped', load: loaded });
  });
});
