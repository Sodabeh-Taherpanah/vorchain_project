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
    // Resolves the `@/*` alias from tsconfig.json (used by shadcn/ui components).
    resolve: { tsconfigPaths: true },
    test: {
      setupFiles: ['./vitest.setup.ts'],
      // next-intl's navigation imports `next/navigation` without a file extension, which Node's ESM
      // resolver rejects (`next` has no exports map). Inlining lets Vite resolve it.
      server: { deps: { inline: ['next-intl'] } },
      // Framework glue that only runs inside Next.js (proxy, request config, type augmentation)
      // is covered by the e2e suite instead.
      coverage: {
        exclude: [
          'src/proxy.ts',
          'src/i18n/request.ts',
          'src/**/*.d.ts',
          // jsdom has no Worker: the worker entry and its launcher are covered by the e2e suite.
          'src/workers/analysis.worker.ts',
          'src/workers/connect-analysis-worker.ts',
        ],
      },
    },
  },
);
