import { act, renderHook } from '@testing-library/react';
import { materialId, type IsoDate, type ProjectionSeries, type Report } from '@vorchain/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnalysisConnection } from '../workers/connect-analysis-worker.ts';
import type { AnalysisService, LoadSummary } from '../workers/analysis-service.ts';
import { ANALYSIS_TIMEOUT_MS, useAnalysis } from './use-analysis.ts';

const asOf = '2026-10-05' as IsoDate;
const options = { asOf, horizonDays: 28 };
const loaded: LoadSummary = { tables: [], errors: [], warnings: [], ready: true, asOf };
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
  const connect = vi.fn((): AnalysisConnection => ({ service, terminate }));
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

  it('terminates the worker on unmount', async () => {
    const { hook, terminate } = setup();
    await act(() => hook.result.current.loadSample('de'));

    hook.unmount();

    expect(terminate).toHaveBeenCalledOnce();
  });
});
