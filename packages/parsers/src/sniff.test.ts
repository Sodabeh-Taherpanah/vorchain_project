import { describe, expect, it } from 'vitest';

import { sniffDelimiter, SNIFF_SAMPLE_LENGTH } from './sniff.ts';

const lines = (...rows: string[]): string => rows.join('\n');

describe('sniffDelimiter', () => {
  it.each([
    { name: 'semicolon', text: lines('a;b;c', '1;2;3'), expected: ';' },
    { name: 'comma', text: lines('a,b,c', '1,2,3'), expected: ',' },
    { name: 'tab', text: lines('a\tb', '1\t2'), expected: '\t' },
    {
      name: 'semicolon with German decimal commas',
      text: lines('Artikel;Bestand;Sicherheit', 'M1;15,0;25,0', 'M2;1,5;2'),
      expected: ';',
    },
    { name: 'tab with decimal commas', text: lines('a\tb\tc', '1\t2,5\t3'), expected: '\t' },
    {
      name: 'semicolon with quoted commas (ignored inside quotes)',
      text: lines('id;name', '1;"Weber, Elektronik"', '2;"Krüger, Metall"'),
      expected: ';',
    },
    {
      name: 'comma with quoted semicolons (ignored inside quotes)',
      text: lines('id,name', '1,"a;b"', '2,"c;d;e"'),
      expected: ',',
    },
    {
      name: 'quoted field spanning lines counts as one record',
      text: lines('id;name', '1;"line one', 'line, two"', '2;x'),
      expected: ';',
    },
    {
      name: 'escaped quotes inside a quoted field',
      text: lines('id;name', '1;"12"" Rohr, verzinkt"', '2;x'),
      expected: ';',
    },
    {
      name: 'a quote inside an unquoted field is a plain character',
      text: lines('id;name', '1;12" Zoll', '2;x'),
      expected: ';',
    },
    {
      name: 'both consistent: Python csv.Sniffer prefers the comma',
      text: lines('a,b;c', '1,2;3'),
      expected: ',',
    },
    { name: 'CRLF line endings', text: 'a;b\r\n1;2\r\n3;4\r\n', expected: ';' },
    {
      name: 'blank lines are ignored',
      text: lines('a;b', '', '1;2', '', '3;4', ''),
      expected: ';',
    },
    { name: 'CRLF blank lines are ignored', text: 'a\tb\r\n\r\n1\t2\r\n', expected: '\t' },
    // No consistent delimiter: the prototype's fallback (`;` if more `;` than `,`, else `,`).
    { name: 'fallback: ragged semicolons', text: lines('a;b;c', '1;2', '1;2;3;4'), expected: ';' },
    { name: 'fallback: ragged commas', text: lines('a,b,c', '1,2', '1,2,3,4'), expected: ',' },
    { name: 'fallback: single column', text: lines('a', '1', '2'), expected: ',' },
    { name: 'fallback: empty text', text: '', expected: ',' },
    { name: 'fallback: whitespace only', text: '  \n \n', expected: ',' },
    {
      name: 'fallback counts only delimiters outside quotes',
      text: lines('a;b;c', '"x,y,z,w";2', '1'),
      expected: ';',
    },
    {
      name: 'fallback never picks tab (prototype rule)',
      text: lines('a\tb\tc', '1\t2', '1'),
      expected: ',',
    },
  ])('$name -> $expected', ({ text, expected }) => {
    expect(sniffDelimiter(text)).toBe(expected);
  });

  it('looks only at the first 4096 characters', () => {
    const head = 'a;b\n' + '1;2\n'.repeat(SNIFF_SAMPLE_LENGTH / 4);
    const tail = 'x,y,z,w\n'.repeat(SNIFF_SAMPLE_LENGTH);
    expect(sniffDelimiter(tail)).toBe(',');
    expect(sniffDelimiter(head + tail)).toBe(';');
  });

  it('ignores a line cut off at the end of the sample (wide exports)', () => {
    // 540-character lines: the sample holds seven complete lines plus a partial one with fewer tabs.
    // Python's csv.Sniffer counts the partial line, finds no consistent delimiter and falls back to
    // ',' here; dropping the cut-off line detects the tab.
    const row = Array.from({ length: 60 }, (_, i) => `c${String(i).padStart(7, '0')}`).join('\t');
    const text = Array.from({ length: 12 }, () => row).join('\n');
    expect(text.length).toBeGreaterThan(SNIFF_SAMPLE_LENGTH);
    expect(sniffDelimiter(text)).toBe('\t');
  });

  it('keeps a single long line even when it is cut off', () => {
    expect(sniffDelimiter('a;b;'.repeat(SNIFF_SAMPLE_LENGTH))).toBe(';');
  });
});
