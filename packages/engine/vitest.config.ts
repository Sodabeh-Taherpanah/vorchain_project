import { createVitestConfig } from '@vorchain/config/vitest';
import { mergeConfig } from 'vitest/config';

export default mergeConfig(
  createVitestConfig({
    gate: 'engine',
    // `test/` holds the golden-file parity test, which reads files with Node (P1-06).
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  }),
  // Fixed fast-check seed for every property test (ADR-0008); override with FC_SEED.
  { test: { setupFiles: ['./test/setup/fast-check.ts'] } },
);
