import { createVitestConfig } from '@vorchain/config/vitest';
import { mergeConfig } from 'vitest/config';

export default mergeConfig(
  createVitestConfig({
    gate: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    coverageInclude: ['src/**/*.{ts,tsx}'],
  }),
  {
    test: {
      setupFiles: ['./vitest.setup.ts'],
      // Framework glue that only runs inside Next.js (proxy, request config, type augmentation)
      // is covered by the e2e suite instead.
      coverage: { exclude: ['src/proxy.ts', 'src/i18n/request.ts', 'src/**/*.d.ts'] },
    },
  },
);
