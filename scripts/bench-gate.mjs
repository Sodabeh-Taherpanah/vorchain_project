// Benchmark regression gate (backlog V-12). Compares a fresh `measure-scale.ts` report with
// `perf/bench-baseline.json`.
//
//   node scripts/bench-gate.mjs <current.json>            compare, exit 1 on regression
//   node scripts/bench-gate.mjs <current.json> --update   store it as the new baseline
//
// Shared CI runners differ in speed from the machine that recorded the baseline, so every time is
// divided by the report's own calibration time before comparing. The factor is deliberately
// generous (a real regression, e.g. an accidental O(n^2), is 5x or worse, while runner noise stays
// under 2x) and differences below NOISE_FLOOR_MS are ignored, so the gate is not flaky.
import { copyFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DEFAULT_FACTOR = 2.5;
const NOISE_FLOOR_MS = 50;
const BASELINE = new URL('../perf/bench-baseline.json', import.meta.url);

/** @returns {string[]} human-readable failures, empty when the run is within bounds. */
export function compareBenchmarks(baseline, current, factor = DEFAULT_FACTOR) {
  const failures = [];
  for (const base of baseline.results) {
    const now = current.results.find((r) => r.demandRows === base.demandRows);
    if (now === undefined) {
      failures.push(`size ${base.demandRows} is in the baseline but was not measured`);
      continue;
    }
    for (const metric of ['parseMs', 'analyseMs']) {
      const expected = (base[metric] / baseline.calibrationMs) * current.calibrationMs;
      const limit = Math.max(expected * factor, expected + NOISE_FLOOR_MS);
      if (now[metric] > limit) {
        failures.push(
          `${metric.replace('Ms', '')} at ${base.demandRows} rows: ${now[metric]} ms, ` +
            `limit ${Math.round(limit)} ms (baseline ${base[metric]} ms scaled to this machine ` +
            `${Math.round(expected)} ms, factor ${factor})`,
        );
      }
    }
  }
  return failures;
}

function main() {
  const [file, flag] = process.argv.slice(2);
  if (file === undefined) {
    console.error('usage: node scripts/bench-gate.mjs <current.json> [--update]');
    process.exit(2);
  }
  if (flag === '--update') {
    copyFileSync(file, BASELINE);
    console.info('benchmark baseline updated');
    return;
  }
  const failures = compareBenchmarks(
    JSON.parse(readFileSync(BASELINE, 'utf8')),
    JSON.parse(readFileSync(file, 'utf8')),
  );
  if (failures.length > 0) {
    console.error(`Benchmark regression:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.info('Benchmarks within bounds of perf/bench-baseline.json');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
