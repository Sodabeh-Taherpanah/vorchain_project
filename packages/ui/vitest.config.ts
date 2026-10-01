import { createVitestConfig } from '@vorchain/config/vitest';
import { mergeConfig } from 'vitest/config';

export default mergeConfig(
  createVitestConfig({
    gate: 'ui',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    coverageInclude: ['src/**/*.{ts,tsx}'],
  }),
  { test: { setupFiles: ['./vitest.setup.ts'] } },
);
