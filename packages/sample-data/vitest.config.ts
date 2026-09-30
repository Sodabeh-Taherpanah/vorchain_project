import { createVitestConfig } from '@vorchain/config/vitest';
import { mergeConfig } from 'vitest/config';

// Two projects: `unit` runs with `pnpm test`; `bench` (the 20k/100k parse + analyse timing) only
// with `pnpm bench`, so the everyday test run stays fast.
export default mergeConfig(
  createVitestConfig({ gate: 'sample-data', include: ['test/**/*.test.ts'] }),
  {
    test: {
      projects: [
        { extends: true, test: { name: 'unit' } },
        {
          extends: true,
          // The root `include` (unit tests) is inherited and merged, so exclude it explicitly.
          test: { name: 'bench', include: ['test/**/*.bench.ts'], exclude: ['test/**/*.test.ts'] },
        },
      ],
    },
  },
);
