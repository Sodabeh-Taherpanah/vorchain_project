import { createVitestConfig } from '@vorchain/config/vitest';
import { mergeConfig } from 'vitest/config';

export default mergeConfig(
  createVitestConfig({
    gate: 'parsers',
    // `test/` holds the Python comparison tests, which read fixture files with Node.
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  }),
  // Fixed fast-check seed for every property test (ADR-0008); override with FC_SEED.
  { test: { setupFiles: ['./test/setup/fast-check.ts'] } },
);
