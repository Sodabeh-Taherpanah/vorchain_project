import { describe, expect, it } from 'vitest';

import { addFiles, removeFileAt } from './file-selection.ts';

const file = (name: string, content = '') => new File([content], name);
const names = (files: readonly File[]) => files.map((f) => f.name);

describe('addFiles', () => {
  it('appends new files in the order they were chosen', () => {
    const result = addFiles([file('artikel.csv')], [file('bedarf.csv'), file('bestellungen.csv')]);

    expect(names(result)).toEqual(['artikel.csv', 'bedarf.csv', 'bestellungen.csv']);
  });

  it('replaces a selected file of the same name with the new one', () => {
    const corrected = file('artikel.csv', 'fixed');
    const result = addFiles([file('artikel.csv'), file('bedarf.csv')], [corrected]);

    expect(names(result)).toEqual(['bedarf.csv', 'artikel.csv']);
    expect(result[1]).toBe(corrected);
  });

  it('keeps only the last of several added files with the same name', () => {
    const last = file('bedarf.csv', 'last');
    const result = addFiles([], [file('bedarf.csv', 'first'), last]);

    expect(result).toEqual([last]);
  });
});

describe('removeFileAt', () => {
  it('removes only the file at the index', () => {
    const files = [file('a.csv'), file('b.csv'), file('c.csv')];

    expect(names(removeFileAt(files, 1))).toEqual(['a.csv', 'c.csv']);
  });
});
