import { describe, expect, it } from 'vitest';

import { PARSERS_PACKAGE_NAME } from './index.ts';

describe('@vorchain/parsers', () => {
  it('exposes its package name for workspace wiring checks', () => {
    expect(PARSERS_PACKAGE_NAME).toBe('@vorchain/parsers');
  });
});
