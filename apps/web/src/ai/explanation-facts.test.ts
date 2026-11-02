import { analyse, type SupplierId } from '@vorchain/engine';
import { loadTables, parseFile, type RawTable } from '@vorchain/parsers';
import { sampleDatasets } from '@vorchain/sample-data';
import { describe, expect, it } from 'vitest';

import { toExplanationFacts } from './explanation-facts.ts';

// The same strict schema the llm package enforces before it builds a request.
const FACT_KEYS = [
  'materialId',
  'materialName',
  'severity',
  'asOf',
  'criticalDate',
  'erpViewDate',
  'daysUntil',
  'minProjectedStock',
  'safetyStock',
  'hidden',
  'reasonCodes',
  'actionCodes',
  'supplier',
].sort();

async function report(locale: 'de' | 'en') {
  const dataset = sampleDatasets[locale];
  const tables: RawTable[] = [];
  for (const file of dataset.files) {
    const parsed = await parseFile({
      name: file.name,
      bytes: new TextEncoder().encode(file.content),
    });
    if (!parsed.ok) throw new Error(parsed.error.code);
    tables.push(parsed.value);
  }
  const loaded = loadTables(tables);
  if (loaded.input === null) throw new Error('sample data failed validation');
  return analyse(loaded.input, { asOf: dataset.asOf, horizonDays: 28 });
}

describe.each(['de', 'en'] as const)('toExplanationFacts on the %s sample data', (locale) => {
  it('maps every exception to exactly the facts keys and passes the llm privacy gate', async () => {
    const { explanationFactsSchema } = await import('@vorchain/llm');
    const r = await report(locale);
    expect(r.exceptions.length).toBeGreaterThan(0);
    for (const exception of r.exceptions) {
      const facts = toExplanationFacts(exception, r, (id: SupplierId | string) => String(id));
      expect(Object.keys(facts).sort()).toEqual(FACT_KEYS);
      const parsed = explanationFactsSchema.safeParse(facts);
      expect(
        parsed.success,
        `${exception.materialId}: ${JSON.stringify(parsed.error?.issues)}`,
      ).toBe(true);
    }
  });
});

describe('toExplanationFacts text lines', () => {
  it('cuts control characters and length from file text, so it stays one short line', async () => {
    const r = await report('de');
    const base = r.exceptions[0];
    if (base === undefined) throw new Error('no exception');
    const facts = toExplanationFacts(
      { ...base, description: `Blech\n${'x'.repeat(200)}` },
      r,
      () => 'Lieferant\tAG',
    );
    expect(facts.materialName).not.toMatch(/[\n\t]/);
    expect(facts.materialName.length).toBeLessThanOrEqual(80);
    if (facts.supplier !== null) expect(facts.supplier.name).toBe('Lieferant AG');
  });

  it('falls back to the material id when the description is empty', async () => {
    const r = await report('de');
    const base = r.exceptions[0];
    if (base === undefined) throw new Error('no exception');
    expect(toExplanationFacts({ ...base, description: '  ' }, r, String).materialName).toBe(
      base.materialId,
    );
  });
});
