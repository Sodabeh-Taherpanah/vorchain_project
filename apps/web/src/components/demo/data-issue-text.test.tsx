import { render } from '@testing-library/react';
import {
  DATA_ERROR_CODES,
  DATA_WARNING_CODES,
  type DataError,
  type DataErrorCode,
  type DataWarning,
  type DataWarningCode,
} from '@vorchain/parsers';
import { NextIntlClientProvider, type IntlError } from 'next-intl';
import { describe, expect, it } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import type { AnalysisErrorCode } from '../../hooks/use-analysis.ts';
import { DataIssueText, MAX_SHOWN_VALUE_LENGTH, shortenValue } from './data-issue-text.tsx';

const at = { fileName: 'bedarf.csv', row: 7, column: 'Bedarfsdatum' } as const;

/** One example per code; the `Record` type makes a new parsers code fail to compile here. */
const ERRORS: Record<DataErrorCode, DataError> = {
  EMPTY_FILE: { code: 'EMPTY_FILE', fileName: 'bedarf.csv', params: {} },
  NOT_TEXT: { code: 'NOT_TEXT', fileName: 'bedarf.csv', params: { detected: 'utf-16' } },
  UNCLOSED_QUOTE: { code: 'UNCLOSED_QUOTE', fileName: 'bedarf.csv', row: 3, params: {} },
  MALFORMED_QUOTE: { code: 'MALFORMED_QUOTE', fileName: 'bedarf.csv', row: 3, params: {} },
  INVALID_NUMBER: { code: 'INVALID_NUMBER', ...at, params: { value: '12x' } },
  INVALID_DATE: { code: 'INVALID_DATE', ...at, params: { value: '31.02.2026' } },
  UNKNOWN_TABLE: { code: 'UNKNOWN_TABLE', fileName: 'x.csv', params: { found: ['A', 'B'] } },
  AMBIGUOUS_TABLE: {
    code: 'AMBIGUOUS_TABLE',
    fileName: 'x.csv',
    params: { candidates: ['demand', 'materials'] },
  },
  MISSING_COLUMNS: {
    code: 'MISSING_COLUMNS',
    fileName: 'bestellungen.csv',
    params: {
      table: 'open_purchase_orders',
      missing: ['promised_date'],
      found: ['Bestellnummer', 'Artikelnummer', 'Termin_neu'],
    },
  },
  MISSING_VALUE: {
    code: 'MISSING_VALUE',
    fileName: 'artikel.csv',
    row: 42,
    column: 'Artikelnummer',
    params: {},
  },
  TOO_MANY_ERRORS: { code: 'TOO_MANY_ERRORS', fileName: 'bedarf.csv', params: { limit: 50 } },
  DUPLICATE_TABLE: {
    code: 'DUPLICATE_TABLE',
    fileName: 'bedarf2.csv',
    params: { table: 'demand', other: 'bedarf.csv' },
  },
  MISSING_TABLE: { code: 'MISSING_TABLE', params: { table: 'supplier_history' } },
  UNSUPPORTED_FILE_TYPE: {
    code: 'UNSUPPORTED_FILE_TYPE',
    fileName: 'bedarf.xls',
    params: { extension: 'xls' },
  },
  PASSWORD_PROTECTED: { code: 'PASSWORD_PROTECTED', fileName: 'bedarf.xlsx', params: {} },
  CORRUPT_FILE: { code: 'CORRUPT_FILE', fileName: 'bedarf.xlsx', params: {} },
  FILE_TOO_LARGE: { code: 'FILE_TOO_LARGE', params: { limit: 50 * 1024 * 1024, unit: 'bytes' } },
};

const WARNINGS: Record<DataWarningCode, DataWarning> = {
  DUPLICATE_MATERIAL: {
    code: 'DUPLICATE_MATERIAL',
    fileName: 'artikel.csv',
    row: 9,
    params: { value: 'M0001', firstRow: 2 },
  },
};

const WORKER_ERRORS: readonly AnalysisErrorCode[] = ['ANALYSIS_TIMEOUT', 'WORKER_FAILED'];
const catalogs = { de, en } as const;

function renderIssue(locale: keyof typeof catalogs, issue: DataError | DataWarning) {
  const errors: IntlError[] = [];
  const { container } = render(
    <NextIntlClientProvider
      locale={locale}
      messages={catalogs[locale]}
      onError={(error) => errors.push(error)}
    >
      <DataIssueText issue={issue} />
    </NextIntlClientProvider>,
  );
  expect(errors, `${locale} ${issue.code}`).toEqual([]);
  return container;
}

describe('data error messages', () => {
  it('have an example for exactly the codes the parsers export', () => {
    expect(Object.keys(ERRORS).toSorted()).toEqual([...DATA_ERROR_CODES].toSorted());
    expect(Object.keys(WARNINGS).toSorted()).toEqual([...DATA_WARNING_CODES].toSorted());
  });

  it.each(['de', 'en'] as const)(
    'exist in %s for every error, warning and worker code',
    (locale) => {
      const { errors, warnings } = catalogs[locale].demo;
      for (const code of [...DATA_ERROR_CODES, ...WORKER_ERRORS]) {
        expect.soft(Object.keys(errors), code).toContain(code);
      }
      for (const code of DATA_WARNING_CODES)
        expect.soft(Object.keys(warnings), code).toContain(code);
    },
  );

  const cases = (['de', 'en'] as const).flatMap((locale) =>
    [...Object.values(ERRORS), ...Object.values(WARNINGS)].map((issue) => ({ locale, issue })),
  );

  it.each(cases)('$locale $issue.code renders without a formatting error', ({ locale, issue }) => {
    const text = renderIssue(locale, issue).textContent;

    expect(text).not.toContain('demo.');
    if (issue.fileName !== undefined) expect(text).toContain(issue.fileName);
  });

  it('names file, line and column of a missing value and hints at ERP totals rows (AC6)', () => {
    expect(renderIssue('de', ERRORS.MISSING_VALUE).textContent).toBe(
      'artikel.csv, Zeile 42, Spalte „Artikelnummer“: Pflichtwert fehlt. Summenzeilen aus dem ERP ' +
        '(z. B. „Summe;;1.234“ ohne ID) bitte vor dem Einlesen aus der Datei löschen.',
    );
    expect(renderIssue('en', ERRORS.MISSING_VALUE).textContent).toBe(
      'artikel.csv, line 42, column “Artikelnummer”: A required value is missing. Please delete ' +
        'ERP totals rows (e.g. “Summe;;1.234” without an ID) from the file before loading it.',
    );
  });

  it('names the missing column in the user’s language and lists the columns found', () => {
    const container = renderIssue('de', ERRORS.MISSING_COLUMNS);

    expect(container.textContent).toBe(
      'bestellungen.csv: Spalte Liefertermin nicht gefunden – gefundene Spalten: Bestellnummer, ' +
        'Artikelnummer und Termin_neu. Bitte benennen Sie die Spalte in der Kopfzeile entsprechend um.',
    );
    expect(container.querySelector('strong')?.textContent).toBe('Liefertermin');
  });

  it('shows the row number and the offending value of a bad date', () => {
    expect(renderIssue('de', ERRORS.INVALID_DATE).textContent).toContain(
      'bedarf.csv, Zeile 7, Spalte „Bedarfsdatum“: „31.02.2026“ ist kein gültiges Datum.',
    );
  });

  it('gives limits in MB and names a missing table with an example file', () => {
    expect(renderIssue('en', ERRORS.FILE_TOO_LARGE).textContent).toContain('larger than 50 MB');
    expect(renderIssue('de', ERRORS.MISSING_TABLE).textContent).toBe(
      'Die Tabelle Lieferhistorie fehlt. Bitte fügen Sie eine Datei hinzu, z. B. lieferhistorie.csv.',
    );
  });
});

describe('shortenValue', () => {
  it('keeps short values and cuts long ones with an ellipsis', () => {
    const long = 'x'.repeat(100);

    expect(shortenValue('31.02.2026')).toBe('31.02.2026');
    expect(shortenValue(long)).toBe(`${'x'.repeat(MAX_SHOWN_VALUE_LENGTH - 1)}…`);
    expect(Array.from(shortenValue('🙂'.repeat(50)))).toHaveLength(MAX_SHOWN_VALUE_LENGTH);
  });
});
