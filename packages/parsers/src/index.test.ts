import { describe, expect, expectTypeOf, it } from 'vitest';

import * as parsers from './index.ts';
import {
  DATA_ERROR_CODES,
  DATA_WARNING_CODES,
  PARSERS_PACKAGE_NAME,
  type DataError,
  type DataErrorCode,
  type DataWarning,
  type DataWarningCode,
} from './index.ts';

describe('@vorchain/parsers', () => {
  it('exposes its package name for workspace wiring checks', () => {
    expect(PARSERS_PACKAGE_NAME).toBe('@vorchain/parsers');
  });

  it('exports the P1-07 to P1-10 entry points', () => {
    expect(Object.keys(parsers).sort()).toEqual([
      'COLUMN_ALIASES',
      'DATA_ERROR_CODES',
      'DATA_WARNING_CODES',
      'MAX_FILE_BYTES',
      'MAX_ROW_ERRORS',
      'OPTIONAL',
      'PARSERS_PACKAGE_NAME',
      'REQUIRED',
      'REQUIRED_TABLES',
      'SNIFF_SAMPLE_LENGTH',
      'TABLE_FILE_STEMS',
      'TABLE_NAMES',
      'XLSX_LIMITS',
      'assembleInput',
      'dateFromSerial',
      'decodeText',
      'detectNonText',
      'detectTable',
      'loadTables',
      'mapHeaders',
      'normaliseHeader',
      'parseDate',
      'parseFile',
      'parseNumber',
      'readCsv',
      'readXlsx',
      'sniffDelimiter',
      'stripPython',
      'validateRows',
    ]);
  });

  it('lists every DataError code exactly once (the web app keys its messages on this list)', () => {
    expectTypeOf<DataErrorCode>().toEqualTypeOf<DataError['code']>();
    expect(new Set(DATA_ERROR_CODES).size).toBe(DATA_ERROR_CODES.length);
  });

  it('lists every DataWarning code exactly once', () => {
    expectTypeOf<DataWarningCode>().toEqualTypeOf<DataWarning['code']>();
    expect(new Set(DATA_WARNING_CODES).size).toBe(DATA_WARNING_CODES.length);
  });
});
