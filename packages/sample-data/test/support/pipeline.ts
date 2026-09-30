import { analyse } from '@vorchain/engine';
import { loadTables, parseFile } from '@vorchain/parsers';

import type { SampleDataset } from '../../src/dataset.ts';

/** Parses and analyses a dataset like the demo's worker will; throws on any data error. */
export async function analyseDataset(dataset: SampleDataset, horizonDays = 28) {
  const encoder = new TextEncoder();
  const tables = await Promise.all(
    dataset.files.map(async ({ name, content }) => {
      const result = await parseFile({ name, bytes: encoder.encode(content) });
      if (!result.ok) throw new Error(`${name}: ${result.error.code}`);
      return result.value;
    }),
  );
  const loaded = loadTables(tables);
  if (loaded.input === null) throw new Error(JSON.stringify(loaded.errors));
  return { loaded, report: analyse(loaded.input, { asOf: dataset.asOf, horizonDays }) };
}
