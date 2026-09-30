import { createVitestConfig } from '@vorchain/config/vitest';
import { mergeConfig } from 'vitest/config';

// Two projects: `unit` runs with `pnpm test` / `pnpm coverage`; `bench` (the wall-clock check at
// spec scale) only with `pnpm bench`, alone and without coverage instrumentation, so its 3 s
// budget measures `analyse` and not the instrumentation or parallel test workers.
export default mergeConfig(
  createVitestConfig({
    gate: 'engine',
    // `test/` holds the golden-file parity test, which reads files with Node (P1-06).
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  }),
  {
    // Fixed fast-check seed for every property test (ADR-0008); override with FC_SEED.
    test: {
      setupFiles: ['./test/setup/fast-check.ts'],
      projects: [
        { extends: true, test: { name: 'unit', exclude: ['src/**/*.bench.test.ts'] } },
        {
          extends: true,
          // The root `include` (unit tests) is inherited and merged, so narrow it explicitly.
          test: {
            name: 'bench',
            include: ['src/**/*.bench.test.ts'],
            exclude: ['src/**/!(*.bench).test.ts', 'test/**'],
          },
        },
      ],
    },
  },
);
