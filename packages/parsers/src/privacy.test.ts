/**
 * Privacy guarantee of `loadTables` (AGENTS.md §2): errors and warnings name the file, line and
 * column header and hold at most the one offending cell, never whole rows. Every cell is a unique
 * token, so any token found in an error or warning can be traced back to where it came from.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { loadTables } from './assemble.ts';
import { COLUMN_ALIASES, OPTIONAL, REQUIRED, TABLE_FILE_STEMS, TABLE_NAMES } from './columns.ts';
import type { RawTable } from './csv.ts';

const ALLOWED_KEYS = new Set(['code', 'fileName', 'row', 'column', 'params']);
const TOKEN = /§f(\d+)r(\d+)c(\d+)§/gu;

/** A cell kind; `token` becomes a unique, unparseable value marking its file, line and column. */
const cellKind = fc.constantFrom('token', '', '5', '2026-10-05', 'M1');

const fileSpec = fc.record({
  table: fc.constantFrom(...TABLE_NAMES),
  // Dropping columns provokes MISSING_COLUMNS; the extra column is never mapped.
  keep: fc.array(fc.boolean(), { minLength: 7, maxLength: 7 }),
  extraColumn: fc.boolean(),
  rows: fc.array(fc.array(cellKind, { minLength: 7, maxLength: 7 }), { maxLength: 25 }),
});

function buildFile(
  index: number,
  spec: typeof fileSpec extends fc.Arbitrary<infer S> ? S : never,
): RawTable {
  const columns = [...REQUIRED[spec.table], ...OPTIONAL[spec.table]];
  const headers: string[] = columns
    .filter((_, i) => spec.keep[i] !== false)
    .map((column) => COLUMN_ALIASES[column][0]);
  if (spec.extraColumn) headers.push('Bemerkung');
  const rows = spec.rows.map((kinds, r) => ({
    rowNumber: r + 2,
    cells: headers.map((_, c) => {
      const kind = kinds[c] ?? '';
      return kind === 'token' ? `§f${String(index)}r${String(r + 2)}c${String(c)}§` : kind;
    }),
  }));
  const stem = TABLE_FILE_STEMS[spec.table][0] ?? spec.table;
  return {
    fileName: `${stem}_${String(index)}.csv`,
    headers,
    rows,
    encoding: 'utf-8',
    delimiter: ';',
  };
}

describe('loadTables privacy', () => {
  it('puts at most the one offending cell of the reported line and column into each issue', () => {
    fc.assert(
      fc.property(fc.array(fileSpec, { maxLength: 7 }), (specs) => {
        const files = specs.map((spec, i) => buildFile(i, spec));
        const result = loadTables(files);
        for (const issue of [...result.errors, ...result.warnings]) {
          for (const key of Object.keys(issue)) expect(ALLOWED_KEYS.has(key), key).toBe(true);
          const file = files.find((f) => f.fileName === issue.fileName);
          if (issue.column !== undefined) expect(file?.headers).toContain(issue.column);

          const tokens = [...JSON.stringify(issue).matchAll(TOKEN)];
          expect(tokens.length, JSON.stringify(issue)).toBeLessThanOrEqual(1);
          const [token] = tokens;
          if (token === undefined) continue;
          const [, fileIndex, row, col] = token.map(Number);
          expect(files[fileIndex ?? -1]?.fileName).toBe(issue.fileName);
          expect(row).toBe(issue.row);
          if (issue.column !== undefined) expect(file?.headers[col ?? -1]).toBe(issue.column);
        }
      }),
      { seed: 20260930, numRuns: 300 },
    );
  });
});
