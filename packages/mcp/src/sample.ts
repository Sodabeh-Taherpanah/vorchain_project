/** Loads a demo dataset through the real parsers, for the stdio entry point and tests. */
import { loadTables, parseFile, type RawTable } from '@vorchain/parsers';
import { sampleDatasets, type SampleDataset, type SampleLocale } from '@vorchain/sample-data';

import type { ServerData } from './server.ts';

/** Same horizon as the demo UI default. */
export const SAMPLE_HORIZON_DAYS = 28;

/** @throws Error if the dataset does not parse: for bundled data that is a packaging bug. */
export async function loadDataset(dataset: SampleDataset): Promise<ServerData> {
  const tables: RawTable[] = [];
  for (const file of dataset.files) {
    const bytes = new TextEncoder().encode(file.content);
    const parsed = await parseFile({ name: file.name, bytes });
    if (!parsed.ok) throw new Error(`${file.name} failed to parse: ${parsed.error.code}`);
    tables.push(parsed.value);
  }
  const loaded = loadTables(tables);
  if (loaded.input === null) {
    throw new Error(`Dataset failed validation: ${loaded.errors.map((e) => e.code).join(', ')}`);
  }
  return { input: loaded.input, options: { asOf: dataset.asOf, horizonDays: SAMPLE_HORIZON_DAYS } };
}

export const loadSampleData = (locale: SampleLocale = 'de'): Promise<ServerData> =>
  loadDataset(sampleDatasets[locale]);
