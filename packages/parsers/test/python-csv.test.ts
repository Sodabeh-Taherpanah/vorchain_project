/**
 * `readCsv` against the prototype (`loaders.py` `_read_csv_rows` + the blank-row skip and strip of
 * `load_table`) on the committed fixtures and the prototype's own sample files. The expectations in
 * `fixtures/python-csv.json` come from running the prototype (`scripts/generate-python-fixtures.py`).
 *
 * `parity: false` cases are intended differences (see `deviation` in the JSON and the package
 * README); they must really differ, so the list cannot go stale silently. Their exact TS behaviour
 * is pinned by the unit tests in `src/csv.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readCsv } from '../src/index.ts';
import expectations from './fixtures/python-csv.json' with { type: 'json' };

const FIXTURES = new URL('./fixtures/', import.meta.url);
const REPO_ROOT = new URL('../../../', import.meta.url);

function bytesOf(file: string): Uint8Array {
  const base = file.startsWith('reference/') ? REPO_ROOT : FIXTURES;
  return new Uint8Array(readFileSync(fileURLToPath(new URL(file, base))));
}

function readAsPrototypeShape(file: string): unknown {
  const result = readCsv({ name: basename(file), bytes: bytesOf(file) });
  if (!result.ok) return { error: result.error.code };
  const { encoding, delimiter, headers, rows } = result.value;
  return { encoding, delimiter, headers, rows };
}

const parityCases = expectations.cases.filter((c) => c.parity);
const deviationCases = expectations.cases.filter((c) => !c.parity);

describe('readCsv matches the prototype', () => {
  it('covers both prototype sample datasets (10 files)', () => {
    expect(parityCases.filter((c) => c.file.startsWith('reference/')).length).toBe(10);
  });

  it.each(parityCases)('$file', ({ file, python }) => {
    expect(readAsPrototypeShape(file)).toEqual(python);
  });
});

describe('readCsv differs from the prototype where intended', () => {
  it.each(deviationCases)('$file: $deviation', ({ file, python }) => {
    expect(readAsPrototypeShape(file)).not.toEqual(python);
  });
});
