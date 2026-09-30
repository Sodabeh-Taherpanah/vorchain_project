/**
 * Public API of the Vorchain sample data (backlog P1-11): the prototype's two sample datasets,
 * bundled so "Beispieldaten laden" runs offline through the real parsers and engine.
 *
 * The seeded scale generator lives in its own entry point, `@vorchain/sample-data/scale`, so the
 * demo bundle never pulls it in.
 */
import type { SampleDataset } from './dataset.ts';
import { de } from './generated/de.ts';
import { en } from './generated/en.ts';

export type { SampleDataset, SampleFile } from './dataset.ts';

/** Locales with a bundled dataset: German ERP export (`;`, `1.234,5`, `DD.MM.YYYY`) and English. */
export type SampleLocale = 'de' | 'en';

/**
 * The prototype's sample data (`reference/python-prototype/sample_data_de` and `sample_data`),
 * byte for byte, with the `asOf` of the matching golden file.
 */
export const sampleDatasets: Readonly<Record<SampleLocale, SampleDataset>> = { de, en };
