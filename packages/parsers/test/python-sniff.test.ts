/**
 * `sniffDelimiter` against the prototype on random quote-free samples: the delimiter CPython's
 * `csv.Sniffer` (plus the prototype's `;`/`,` fallback) picks, recorded by
 * `scripts/generate-python-fixtures.py`. Quote-free and under 4096 characters, so none of the
 * deliberate differences listed in `src/sniff.ts` applies and the results must be identical.
 */
import { describe, expect, it } from 'vitest';

import { sniffDelimiter } from '../src/index.ts';
import vectors from './fixtures/python-sniff.json' with { type: 'json' };

describe('sniffDelimiter matches the prototype', () => {
  it('has enough vectors for every delimiter', () => {
    for (const delimiter of [';', ',', '\t']) {
      expect(vectors.cases.filter((c) => c.delimiter === delimiter).length).toBeGreaterThan(20);
    }
  });

  it.each(vectors.cases.map((c, index) => ({ ...c, index })))(
    'vector $index -> $delimiter',
    ({ text, delimiter }) => {
      expect(sniffDelimiter(text)).toBe(delimiter);
    },
  );
});
