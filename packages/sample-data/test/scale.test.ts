import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { SampleDataset } from '../src/dataset.ts';
import { generateScaleDataset } from '../src/scale.ts';
import { analyseDataset } from './support/pipeline.ts';

const sha256 = (dataset: SampleDataset) =>
  createHash('sha256').update(JSON.stringify(dataset)).digest('hex');

const lines = (dataset: SampleDataset, name: string) =>
  dataset.files
    .find((f) => f.name === name)
    ?.content.split('\r\n')
    .filter((line) => line !== '') ?? [];

describe('generateScaleDataset', () => {
  const small = generateScaleDataset({ materials: 300, demandRows: 1500, seed: 42 });

  it('returns the same bytes for the same seed, pinned by hash', () => {
    const again = generateScaleDataset({ materials: 300, demandRows: 1500, seed: 42 });
    expect(sha256(again)).toBe(sha256(small));
    expect(sha256(small)).toBe('09e5907e26f6525e6ca0ee10c51c4acc5704fd10c9b63804977cb95407a56416');
  });

  it('returns different data for a different seed', () => {
    const other = generateScaleDataset({ materials: 300, demandRows: 1500, seed: 43 });
    expect(sha256(other)).not.toBe(sha256(small));
  });

  it('writes the five tables as a German ERP export with the requested row counts', () => {
    expect(small.files.map((f) => f.name)).toEqual([
      'artikel.csv',
      'bedarf.csv',
      'bestellungen.csv',
      'lieferanten.csv',
      'lieferhistorie.csv',
    ]);
    expect(lines(small, 'artikel.csv')).toHaveLength(301);
    expect(lines(small, 'bedarf.csv')).toHaveLength(1501);
    const [header, ...rows] = lines(small, 'bedarf.csv');
    expect(header).toBe('\u{feff}Artikelnummer;Bedarfsdatum;Menge');
    for (const row of rows) expect(row).toMatch(/^M\d{6};\d{2}\.\d{2}\.\d{4};\d+,\d$/u);
    expect(lines(small, 'artikel.csv').join('\n')).toMatch(/;\d{1,3}(\.\d{3})+,\d;/u);
  });

  it('parses and analyses end to end, with visible and hidden risks', async () => {
    const { loaded, report } = await analyseDataset(small);
    expect(loaded.errors).toEqual([]);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.input?.materials).toHaveLength(300);
    const hidden = report.exceptions.filter((e) => e.hidden);
    expect(hidden.length).toBeGreaterThan(5);
    expect(report.exceptions.length - hidden.length).toBeGreaterThan(5);
    expect(report.exceptions.length).toBeLessThan(150);
  });

  it.each([
    { demandRows: 0, perMaterial: [0, 0, 0] },
    { demandRows: 7, perMaterial: [3, 2, 2] },
  ])('spreads $demandRows demand rows round-robin', ({ demandRows, perMaterial }) => {
    const dataset = generateScaleDataset({ materials: 3, demandRows, seed: 7 });
    const ids = lines(dataset, 'bedarf.csv')
      .slice(1)
      .map((row) => row.split(';')[0]);
    expect(
      ['M000001', 'M000002', 'M000003'].map((id) => ids.filter((x) => x === id).length),
    ).toEqual(perMaterial);
  });

  it.each([
    { materials: 0, demandRows: 10, seed: 1 },
    { materials: 10, demandRows: -1, seed: 1 },
    { materials: 1.5, demandRows: 10, seed: 1 },
    { materials: 10, demandRows: 10, seed: 0.5 },
  ])('rejects invalid options %o', (options) => {
    expect(() => generateScaleDataset(options)).toThrow(RangeError);
  });
});
