/**
 * The bundled datasets are the prototype's sample data, byte for byte, and run through the real
 * pipeline (`parseFile` -> `loadTables` -> `analyse`) to the golden exceptions. The same chain on
 * the reference CSVs themselves is covered by `packages/parsers/test/python-tables.test.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { sampleDatasets } from '../src/index.ts';
import { analyseDataset } from './support/pipeline.ts';

const PROTOTYPE = new URL('../../../reference/python-prototype/', import.meta.url);
const FOLDERS = { de: 'sample_data_de', en: 'sample_data' } as const;

interface GoldenFile {
  readonly asOf: string;
  readonly horizon: number;
  readonly exceptions: readonly unknown[];
}

function readGolden(folder: string): GoldenFile {
  return JSON.parse(
    readFileSync(new URL(`golden/${folder}.json`, PROTOTYPE), 'utf8'),
  ) as GoldenFile;
}

describe.each(['de', 'en'] as const)('sampleDatasets.%s', (locale) => {
  const folder = FOLDERS[locale];
  const dataset = sampleDatasets[locale];
  const golden = readGolden(folder);

  it(`holds every CSV of ${folder}, byte for byte`, () => {
    const dir = new URL(`${folder}/`, PROTOTYPE);
    expect(dataset.files.map((f) => f.name)).toEqual(readdirSync(dir).sort());
    for (const { name, content } of dataset.files) {
      const reference = new Uint8Array(readFileSync(new URL(name, dir)));
      expect(new TextEncoder().encode(content), name).toEqual(reference);
    }
  });

  it('uses the golden asOf', () => {
    expect(dataset.asOf).toBe(golden.asOf);
  });

  it('parsers -> engine gives the golden exceptions, in order', async () => {
    const { loaded, report } = await analyseDataset(dataset, golden.horizon);
    expect(loaded.errors).toEqual([]);
    expect(loaded.warnings).toEqual([]);
    const exceptions = report.exceptions.map((e) => ({
      material_id: e.materialId,
      severity: e.severity,
      critical_date: e.criticalDate,
      days_until: e.daysUntil,
      min_projected_stock: e.minProjectedStock,
      hidden_risk: e.hidden ? 'yes' : 'no',
      erp_view_date: e.erpViewDate ?? 'none',
      score: e.score,
    }));
    expect(golden.exceptions.length).toBeGreaterThan(10);
    expect(exceptions).toEqual(golden.exceptions);
  });
});
