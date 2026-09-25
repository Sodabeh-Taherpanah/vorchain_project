import { createVitestConfig } from '@vorchain/config/vitest';

export default createVitestConfig({
  gate: 'web',
  include: ['src/**/*.test.{ts,tsx}'],
  coverageInclude: ['src/**/*.{ts,tsx}'],
});
