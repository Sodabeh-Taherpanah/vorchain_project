import type { IsoDate } from '@vorchain/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  csvFileName,
  csvSeparator,
  downloadFile,
  exceptionCsvRows,
  guardFormula,
  toCsv,
  type ExceptionCsvText,
} from './csv-export.ts';
import { exception } from './test-report.ts';

const BOM = '\uFEFF';

describe('csvSeparator', () => {
  it('uses a semicolon for German (decimal comma) and a comma for English', () => {
    expect(csvSeparator('de')).toBe(';');
    expect(csvSeparator('en')).toBe(',');
  });
});

describe('guardFormula (CSV injection, OWASP)', () => {
  it.each(['=SUM(A1)', '+1', '-1+2', '@cmd', '\tx', '\rx'])(
    'prefixes %j with an apostrophe',
    (value) => {
      expect(guardFormula(value)).toBe(`'${value}`);
    },
  );

  it.each(['M0011', 'Teil = Schraube', '', "'already"])('leaves %j unchanged', (value) => {
    expect(guardFormula(value)).toBe(value);
  });
});

describe('toCsv', () => {
  it('starts with a UTF-8 BOM and ends every record with CRLF', () => {
    expect(
      toCsv(
        [
          ['a', 'b'],
          ['c', 'd'],
        ],
        'en',
      ),
    ).toBe(`${BOM}a,b\r\nc,d\r\n`);
  });

  it('writes numbers with a decimal comma and no grouping for German', () => {
    expect(toCsv([[-1380.5, 1234567, 3]], 'de')).toBe(`${BOM}-1380,5;1234567;3\r\n`);
  });

  it('writes numbers with a decimal point for English', () => {
    expect(toCsv([[-1380.5, 0.25]], 'en')).toBe(`${BOM}-1380.5,0.25\r\n`);
  });

  it('quotes cells with the separator, quotes or line breaks (RFC 4180)', () => {
    const csv = toCsv([['a;b', 'say "hi"', 'line 1\nline 2', 'cr\r', 'x,y']], 'de');
    expect(csv).toBe(`${BOM}"a;b";"say ""hi""";"line 1\nline 2";"cr\r";x,y\r\n`);
  });

  it('quotes a comma for English', () => {
    expect(toCsv([['x,y']], 'en')).toBe(`${BOM}"x,y"\r\n`);
  });

  it('guards text cells against formulas but not numbers it formats itself', () => {
    expect(toCsv([['=HYPERLINK("x")', -5]], 'de')).toBe(`${BOM}"'=HYPERLINK(""x"")";-5\r\n`);
  });
});

describe('csvFileName', () => {
  it('names the file after the analysis date', () => {
    expect(csvFileName('2026-10-05' as IsoDate)).toBe('vorchain-engpaesse-2026-10-05.csv');
  });
});

describe('exceptionCsvRows', () => {
  const text: ExceptionCsvText = {
    headers: ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9'],
    severity: (severity) => `sev:${severity}`,
    date: (date) => `d:${date}`,
    hidden: (hidden) => (hidden ? 'yes' : 'no'),
    reason: (reason) => `why:${reason.code}`,
    action: (action) => `do:${action.code}`,
  };

  it('writes a header row and one row per exception with rendered text', () => {
    const rows = exceptionCsvRows(
      [
        exception('M1', {
          hidden: true,
          reasons: [{ code: 'NO_OPEN_PO' }, { code: 'NO_OPEN_PO' }, { code: 'HIDDEN_ERP_NONE' }],
          actions: [{ code: 'REVIEW_QTY_OR_DEMAND' }],
        }),
      ],
      text,
    );

    expect(rows).toEqual([
      text.headers,
      [
        'sev:WARNING',
        'M1',
        'Teil M1',
        'd:2026-10-20',
        15,
        5,
        'yes',
        'why:NO_OPEN_PO\nwhy:HIDDEN_ERP_NONE',
        'do:REVIEW_QTY_OR_DEMAND',
      ],
    ]);
  });
});

describe('CSV injection through user data', () => {
  it('guards material IDs, descriptions and rendered sentences from user files', () => {
    const rows = exceptionCsvRows(
      [exception('=cmd|"/c calc"!A1', { description: '@SUM(1+1)', minProjectedStock: -7.5 })],
      {
        headers: ['H'],
        severity: () => 'Kritisch',
        date: (date) => date,
        hidden: () => 'Nein',
        // A sentence that starts with a user-supplied supplier name.
        reason: () => '+Evil Supplier liefert spät',
        action: () => '-Evil Supplier anrufen',
      },
    );

    const record = toCsv(rows, 'de').split('\r\n')[1];

    expect(record).toBe(
      `Kritisch;"'=cmd|""/c calc""!A1";'@SUM(1+1);2026-10-20;15;-7,5;Nein;` +
        `'+Evil Supplier liefert spät;'-Evil Supplier anrufen`,
    );
  });
});

describe('downloadFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('saves the content through a temporary object URL, without any request', async () => {
    vi.useFakeTimers();
    const blobs: Blob[] = [];
    const create = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:vorchain/1';
    });
    const revoke = vi.fn();
    // jsdom has no object URLs; the test file runs in its own environment.
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      const link = click.mock.contexts.at(-1) as HTMLAnchorElement;
      expect(link.download).toBe('report.csv');
      expect(link.href).toBe('blob:vorchain/1');
    });

    downloadFile(`${BOM}a;b\r\n`, 'report.csv', 'text/csv;charset=utf-8');

    expect(click).toHaveBeenCalledOnce();
    expect(blobs[0]?.type).toBe('text/csv;charset=utf-8');
    expect(document.querySelector('a[download]')).toBeNull();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:vorchain/1');
    const bytes = new Uint8Array((await blobs[0]?.arrayBuffer()) ?? new ArrayBuffer(0));
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
  });
});
