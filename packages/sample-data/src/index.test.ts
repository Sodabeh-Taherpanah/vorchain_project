import { describe, expect, it } from 'vitest';

import { SAMPLE_DATA_PACKAGE_NAME } from './index.ts';

describe('@vorchain/sample-data', () => {
  it('exposes its package name for workspace wiring checks', () => {
    expect(SAMPLE_DATA_PACKAGE_NAME).toBe('@vorchain/sample-data');
  });
});
