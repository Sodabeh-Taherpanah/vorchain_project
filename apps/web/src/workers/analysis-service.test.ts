// @vitest-environment node
// Node's `File`, `Blob` and `DecompressionStream` match the browser APIs the worker uses.
import { readFileSync } from 'node:fs';

import { materialId, type IsoDate } from '@vorchain/engine';
import { MAX_FILE_BYTES } from '@vorchain/parsers';
import { sampleDatasets } from '@vorchain/sample-data';
import { describe, expect, it, vi } from 'vitest';

import { createAnalysisService } from './analysis-service.ts';

interface GoldenException {
  readonly severity: 'CRITICAL' | 'WARNING';
  readonly hidden_risk: 'yes' | 'no';
}

const golden = JSON.parse(
  readFileSync(
    new URL('../../../../reference/python-prototype/golden/sample_data_de.json', import.meta.url),
    'utf8',
  ),
) as { asOf: IsoDate; horizon: number; exceptions: GoldenException[] };

const goldenSummary = {
  critical: golden.exceptions.filter((e) => e.severity === 'CRITICAL').length,
  warning: golden.exceptions.filter((e) => e.severity === 'WARNING').length,
  hidden: golden.exceptions.filter((e) => e.hidden_risk === 'yes').length,
};

const sampleFiles = (): File[] =>
  sampleDatasets.de.files.map((f) => new File([f.content], f.name, { type: 'text/csv' }));

describe('createAnalysisService', () => {
  it('loads the sample, keeps the input in the worker and returns only derived data', async () => {
    const service = createAnalysisService();

    const load = await service.loadSample('de');

    expect(load.ready).toBe(true);
    expect(load.errors).toEqual([]);
    expect(load.asOf).toBe(golden.asOf);
    expect(load.tables).toHaveLength(5);
    expect(load).not.toHaveProperty('input');
  });

  it('analyses the German sample with the golden summary counts', async () => {
    const service = createAnalysisService();
    await service.loadSample('de');

    const report = await service.analyse({ asOf: golden.asOf, horizonDays: golden.horizon });

    expect(report.summary).toMatchObject(goldenSummary);
  });

  it('reads uploaded files and gives the same result as the sample', async () => {
    const service = createAnalysisService();

    const load = await service.loadFiles(sampleFiles());
    const report = await service.analyse({ asOf: golden.asOf, horizonDays: golden.horizon });

    expect(load.ready).toBe(true);
    expect(load.asOf).toBeNull();
    expect(report.summary).toMatchObject(goldenSummary);
  });

  it('rejects more than 50 MB in total before reading any file', async () => {
    const service = createAnalysisService();
    const half = MAX_FILE_BYTES / 2 + 1;
    const files = [
      new File([new Uint8Array(half)], 'a.csv'),
      new File([new Uint8Array(half)], 'b.csv'),
    ];
    const reads = files.map((f) => vi.spyOn(f, 'arrayBuffer'));

    const load = await service.loadFiles(files);

    expect(load.ready).toBe(false);
    expect(load.errors).toEqual([
      { code: 'FILE_TOO_LARGE', params: { limit: MAX_FILE_BYTES, unit: 'bytes' } },
    ]);
    for (const read of reads) expect(read).not.toHaveBeenCalled();
  });

  it('reports parser errors per file and holds no input afterwards', async () => {
    const service = createAnalysisService();
    await service.loadSample('de');

    const load = await service.loadFiles([new File(['%PDF'], 'bestand.pdf')]);

    expect(load.ready).toBe(false);
    expect(load.errors.map((e) => e.code)).toContain('UNSUPPORTED_FILE_TYPE');
    await expect(service.analyse({ asOf: golden.asOf, horizonDays: 28 })).rejects.toThrow(
      /no input/i,
    );
  });

  it('returns the projection of a material with the options of the last analysis', async () => {
    const service = createAnalysisService();
    await service.loadSample('de');
    await service.analyse({ asOf: golden.asOf, horizonDays: 14 });

    const series = await service.getProjection(materialId('M0011'));

    expect(series.materialId).toBe('M0011');
    expect(series.points).toHaveLength(14);
    expect(series.points[0]?.date).toBe(golden.asOf);
  });

  it('refuses a projection before any analysis', async () => {
    const service = createAnalysisService();
    await service.loadSample('de');

    await expect(service.getProjection(materialId('M0011'))).rejects.toThrow(/analyse/i);
  });
});
