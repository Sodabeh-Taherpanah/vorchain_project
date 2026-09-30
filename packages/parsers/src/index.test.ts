import { describe, expect, expectTypeOf, it } from 'vitest';

import * as parsers from './index.ts';
import {
  DATA_ERROR_CODES,
  PARSERS_PACKAGE_NAME,
  type DataError,
  type DataErrorCode,
} from './index.ts';

describe('@vorchain/parsers', () => {
  it('exposes its package name for workspace wiring checks', () => {
    expect(PARSERS_PACKAGE_NAME).toBe('@vorchain/parsers');
  });

  it('exports the P1-07 and P1-08 entry points', () => {
    expect(Object.keys(parsers).sort()).toEqual([
      'DATA_ERROR_CODES',
      'PARSERS_PACKAGE_NAME',
      'SNIFF_SAMPLE_LENGTH',
      'decodeText',
      'detectNonText',
      'parseDate',
      'parseNumber',
      'readCsv',
      'sniffDelimiter',
      'stripPython',
    ]);
  });

  it('lists every DataError code exactly once (the web app keys its messages on this list)', () => {
    expectTypeOf<DataErrorCode>().toEqualTypeOf<DataError['code']>();
    expect(new Set(DATA_ERROR_CODES).size).toBe(DATA_ERROR_CODES.length);
  });
});
