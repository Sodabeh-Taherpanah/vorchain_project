import { createVitestConfig } from '@vorchain/config/vitest';

export default createVitestConfig({
  gate: 'engine',
  // `test/` holds the golden-file parity test, which reads files with Node (P1-06).
  include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
});
