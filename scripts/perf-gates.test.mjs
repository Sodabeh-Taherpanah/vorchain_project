// Unit tests for the pure parts of the CI performance gates. Run with `pnpm test:scripts`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compareBenchmarks } from './bench-gate.mjs';
import { evaluateBundle, scriptPathsFromHtml } from './bundle-size.mjs';

const report = (calibrationMs, results) => ({ calibrationMs, results });
const row = (demandRows, parseMs, analyseMs) => ({ demandRows, parseMs, analyseMs });

test('bench gate passes when current equals baseline', () => {
  const base = report(100, [row(10_000, 100, 10)]);
  assert.deepEqual(compareBenchmarks(base, base, 2.5), []);
});

test('bench gate normalises by calibration: a 2x slower machine is not a regression', () => {
  const base = report(100, [row(10_000, 100, 100)]);
  const slowMachine = report(200, [row(10_000, 200, 200)]);
  assert.deepEqual(compareBenchmarks(base, slowMachine, 2.5), []);
});

test('bench gate fails when the normalised time exceeds the factor', () => {
  const base = report(100, [row(10_000, 100, 100)]);
  const slower = report(100, [row(10_000, 100, 300)]);
  const failures = compareBenchmarks(base, slower, 2.5);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /analyse at 10000/);
});

test('bench gate ignores tiny absolute differences (noise floor)', () => {
  const base = report(100, [row(10_000, 100, 2)]);
  const noisy = report(100, [row(10_000, 100, 12)]);
  assert.deepEqual(compareBenchmarks(base, noisy, 2.5), []);
});

test('bench gate fails when a baseline size is missing from the run', () => {
  const base = report(100, [row(10_000, 100, 10), row(100_000, 700, 100)]);
  const failures = compareBenchmarks(base, report(100, [row(10_000, 100, 10)]), 2.5);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /100000/);
});

test('scriptPathsFromHtml returns unique module scripts in order and skips noModule', () => {
  const html =
    '<script src="/_next/static/chunks/a.js" async=""></script>' +
    '<link rel="preload" as="script" href="/_next/static/chunks/b.js"/>' +
    '<link rel="stylesheet" href="/_next/static/chunks/c.css"/>' +
    '<script src="/_next/static/chunks/a.js"></script>' +
    '<script src="/_next/static/chunks/poly.js" noModule=""></script><script>inline()</script>';
  assert.deepEqual(scriptPathsFromHtml(html), [
    '/_next/static/chunks/a.js',
    '/_next/static/chunks/b.js',
  ]);
});

const bundle = (gzipBytes, baselineBytes) =>
  evaluateBundle({ gzipBytes, budgetBytes: 120_000, baselineBytes, tolerance: 0.05 });

test('bundle gate: over the absolute ceiling fails', () => {
  const failures = bundle(130_000, 130_000);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /budget/);
});

test('bundle gate: growth beyond tolerance over the baseline fails', () => {
  const failures = bundle(100_000, 90_000);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /baseline/);
});

test('bundle gate: within ceiling and tolerance passes', () => {
  assert.deepEqual(bundle(91_000, 90_000), []);
});
