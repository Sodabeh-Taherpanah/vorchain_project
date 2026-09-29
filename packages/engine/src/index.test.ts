import { describe, expect, it } from 'vitest';

import { ENGINE_PACKAGE_NAME } from './index.ts';

describe('@vorchain/engine', () => {
  it('exposes its package name for workspace wiring checks', () => {
    expect(ENGINE_PACKAGE_NAME).toBe('@vorchain/engine');
  });
});
