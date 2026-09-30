/**
 * Performance benchmark (backlog P1-11, spec §4.2): parse + analyse 20 000 materials and 100 000
 * demand rows. Runs only with `pnpm bench` (Vitest project `bench`). Target 3 s on a laptop; the
 * test fails above 6 s, the CI budget for slower shared runners.
 */
import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import { generateScaleDataset } from '../src/scale.ts';
import { analyseDataset } from './support/pipeline.ts';

const BUDGET_MS = 6000;

describe('scale benchmark', () => {
  it('parses and analyses 20k materials / 100k demand rows within budget', async () => {
    const dataset = generateScaleDataset({ materials: 20_000, demandRows: 100_000, seed: 2026 });

    const start = performance.now();
    const { loaded, report } = await analyseDataset(dataset);
    const elapsed = performance.now() - start;

    console.info(
      `parse + analyse 20k/100k: ${elapsed.toFixed(0)} ms ` +
        `(${String(report.exceptions.length)} exceptions, budget ${String(BUDGET_MS)} ms)`,
    );
    expect(loaded.input?.demand).toHaveLength(100_000);
    expect(report.exceptions.some((e) => e.hidden)).toBe(true);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  }, 60_000);
});
