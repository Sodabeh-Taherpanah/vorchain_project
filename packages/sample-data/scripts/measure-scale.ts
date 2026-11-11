/**
 * Measures parse and analyse wall-clock time at 10k, 100k and 1M demand rows (backlog V-12) and
 * prints a JSON report. Numbers feed `docs/performance.md`; the CI gate (`scripts/bench-gate.mjs`)
 * compares them to `perf/bench-baseline.json`.
 *
 * Runs on Node in the main thread, which is the worst case for the demo's worker (no UI thread
 * contention, but the same JS engine). Each size is the median of `--runs` runs (default 3; the
 * 1M size runs once unless `--runs-large` says otherwise) to damp noise.
 *
 *   node scripts/measure-scale.ts [--sizes 10000,100000] [--runs 3] [--out file.json]
 *
 * Also times a fixed CPU workload ("calibration") so the gate can compare machines of different
 * speed: a slower runner makes the calibration slower by roughly the same factor.
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { analyse } from '@vorchain/engine';
import { loadTables, parseFile } from '@vorchain/parsers';

import { generateScaleDataset } from '../src/scale.ts';

/** Materials per demand row, the spec's ratio (20 000 materials : 100 000 demand rows). */
const ROWS_PER_MATERIAL = 5;
const DEFAULT_SIZES = [10_000, 100_000, 1_000_000];

interface SizeResult {
  readonly demandRows: number;
  readonly materials: number;
  readonly parseMs: number;
  readonly analyseMs: number;
  readonly exceptions: number;
  readonly runs: number;
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/** Fixed integer workload; its duration is the unit the gate normalises by. */
function calibrationMs(): number {
  const samples: number[] = [];
  for (let run = 0; run < 5; run += 1) {
    const start = performance.now();
    let acc = 0;
    for (let i = 0; i < 200_000_000; i += 1) acc = (Math.imul(acc, 31) + i) | 0;
    samples.push(performance.now() - start + (acc === 0.5 ? 1 : 0)); // keep `acc` live
  }
  return median(samples);
}

async function measureOnce(demandRows: number) {
  const materials = Math.max(1, Math.round(demandRows / ROWS_PER_MATERIAL));
  const dataset = generateScaleDataset({ materials, demandRows, seed: 2026 });
  const encoder = new TextEncoder();

  const parseStart = performance.now();
  const tables = await Promise.all(
    dataset.files.map(async ({ name, content }) => {
      const result = await parseFile({ name, bytes: encoder.encode(content) });
      if (!result.ok) throw new Error(`${name}: ${result.error.code}`);
      return result.value;
    }),
  );
  const loaded = loadTables(tables);
  const parseMs = performance.now() - parseStart;
  if (loaded.input === null) throw new Error(JSON.stringify(loaded.errors));

  const analyseStart = performance.now();
  const report = analyse(loaded.input, { asOf: dataset.asOf, horizonDays: 28 });
  const analyseMs = performance.now() - analyseStart;
  return { materials, parseMs, analyseMs, exceptions: report.exceptions.length };
}

async function measureSize(demandRows: number, runs: number): Promise<SizeResult> {
  const samples = [];
  for (let run = 0; run < runs; run += 1) samples.push(await measureOnce(demandRows));
  const first = samples[0];
  if (first === undefined) throw new Error('runs must be at least 1');
  return {
    demandRows,
    materials: first.materials,
    parseMs: Math.round(median(samples.map((s) => s.parseMs))),
    analyseMs: Math.round(median(samples.map((s) => s.analyseMs))),
    exceptions: first.exceptions,
    runs,
  };
}

const sizes = (argValue('--sizes')?.split(',').map(Number) ?? DEFAULT_SIZES).filter(
  Number.isFinite,
);
const runs = Number(argValue('--runs') ?? 3);
const results: SizeResult[] = [];
for (const size of sizes) results.push(await measureSize(size, size >= 1_000_000 ? 1 : runs));

const report = {
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  calibrationMs: Math.round(calibrationMs()),
  results,
};
const json = `${JSON.stringify(report, null, 2)}\n`;
const out = argValue('--out');
if (out === undefined) process.stdout.write(json);
else writeFileSync(out, json);
