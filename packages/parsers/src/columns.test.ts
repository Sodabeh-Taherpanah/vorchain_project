import { describe, expect, it } from 'vitest';

import {
  COLUMN_ALIASES,
  mapHeaders,
  normaliseHeader,
  OPTIONAL,
  REQUIRED,
  TABLE_NAMES,
} from './columns.ts';

describe('normaliseHeader', () => {
  it.each([
    ['Artikelnummer', 'artikelnummer'],
    ['  Offene Menge ', 'offenemenge'],
    ['offene_menge', 'offenemenge'],
    ['OFFENE-MENGE', 'offenemenge'],
    ['Bestell.-Nr.', 'bestellnr'],
    ['Bestätigter Termin', 'bestätigtertermin'],
    ['', ''],
  ])('%j -> %j', (header, expected) => {
    expect(normaliseHeader(header)).toBe(expected);
  });
});

describe('mapHeaders', () => {
  it('maps German headers to canonical columns', () => {
    const headers = [
      'Artikelnummer',
      'Bezeichnung',
      'Hauptlieferant',
      'Lagerbestand',
      'Sicherheitsbestand',
      'ME',
    ];
    expect(mapHeaders('materials', headers)).toEqual({
      ok: true,
      value: {
        material_id: 0,
        description: 1,
        main_supplier_id: 2,
        on_hand: 3,
        safety_stock: 4,
        unit: 5,
      },
    });
  });

  it('takes the first alias in alias order, and the leftmost of duplicate headers', () => {
    // `material_id` lists `material` before `artikel`; `Menge` appears twice.
    const headers = ['Artikel', 'Material', 'Datum', 'Menge', 'Menge'];
    expect(mapHeaders('demand', headers)).toEqual({
      ok: true,
      value: { material_id: 1, date: 2, qty: 3 },
    });
  });

  it('reports missing required columns with the headers found (prototype test_missing_column_message)', () => {
    expect(mapHeaders('materials', ['Artikelnummer', 'Farbe', ''])).toEqual({
      ok: false,
      error: {
        code: 'MISSING_COLUMNS',
        params: { table: 'materials', missing: ['on_hand'], found: ['Artikelnummer', 'Farbe'] },
      },
    });
  });

  it('ignores optional columns that are absent', () => {
    expect(mapHeaders('supplier_history', ['Lieferant', 'Liefertermin', 'Wareneingang'])).toEqual({
      ok: true,
      value: { supplier_id: 0, promised_date: 1, actual_date: 2 },
    });
  });

  it('never lets one table want two columns with a common alias, so column order cannot matter', () => {
    // The prototype iterates a Python set (hash order); this invariant makes that order irrelevant.
    for (const table of TABLE_NAMES) {
      const aliases = [...REQUIRED[table], ...OPTIONAL[table]].flatMap((column) => [
        ...new Set(COLUMN_ALIASES[column].map(normaliseHeader)),
      ]);
      expect(new Set(aliases).size, table).toBe(aliases.length);
    }
  });
});
