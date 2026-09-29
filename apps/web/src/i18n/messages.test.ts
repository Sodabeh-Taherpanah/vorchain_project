import { describe, expect, it } from 'vitest';

import de from '../../messages/de.json';
import en from '../../messages/en.json';

/** Flattens nested messages to `[dotted.key, value]` pairs so both files compare key by key. */
function flatten(messages: unknown, prefix = ''): [string, unknown][] {
  if (typeof messages !== 'object' || messages === null) {
    return [[prefix, messages]];
  }
  return Object.entries(messages).flatMap(([key, value]) =>
    flatten(value, prefix === '' ? key : `${prefix}.${key}`),
  );
}

describe('message catalogs', () => {
  it('have identical key sets in German and English', () => {
    const deKeys = flatten(de).map(([key]) => key);
    const enKeys = flatten(en).map(([key]) => key);

    expect(enKeys.toSorted()).toEqual(deKeys.toSorted());
  });

  it.each([
    ['de', de],
    ['en', en],
  ] as const)('%s has only non-empty string values', (_locale, messages) => {
    for (const [key, value] of flatten(messages)) {
      expect.soft(typeof value, key).toBe('string');
      expect.soft(String(value).trim(), key).not.toBe('');
    }
  });
});
