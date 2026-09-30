/**
 * `parseNumber` / `parseDate` against the prototype's `parse_number` / `parse_date` on hand-picked
 * and seeded random cell values, recorded by `scripts/generate-python-fixtures.py`.
 *
 * `parity: false` cases are the deliberate deviations listed in `src/values.ts` (NaN/Infinity and
 * non-ASCII digits are rejected); they must really be rejected, so the list cannot go stale.
 */
import { describe, expect, it } from 'vitest';

import { parseDate, parseNumber } from '../src/index.ts';
import vectors from './fixtures/python-values.json' with { type: 'json' };

interface ValueCase {
  readonly kind: 'number' | 'date';
  readonly input: string;
  readonly parity: boolean;
  readonly python: { readonly value?: number | string | null; readonly error?: boolean };
}

const cases = (vectors.cases as readonly ValueCase[]).map((c, index) => ({ ...c, index }));

function parse({ kind, input }: ValueCase): unknown {
  const result = kind === 'number' ? parseNumber(input) : parseDate(input);
  return result.ok ? { value: result.value } : { error: true };
}

describe('value parsing matches the prototype', () => {
  it('has enough accepted and rejected vectors of each kind', () => {
    for (const kind of ['number', 'date'] as const) {
      const ofKind = cases.filter((c) => c.kind === kind && c.parity);
      expect(ofKind.filter((c) => c.python.error === true).length).toBeGreaterThan(100);
      expect(ofKind.filter((c) => c.python.error !== true).length).toBeGreaterThan(100);
    }
  });

  it.each(cases.filter((c) => c.parity))('$kind vector $index: $input', (c) => {
    expect(parse(c)).toEqual(c.python);
  });

  it.each(cases.filter((c) => !c.parity))('$kind deviation $index: $input is rejected', (c) => {
    expect(c.python.error).toBeUndefined();
    expect(parse(c)).toEqual({ error: true });
  });
});
