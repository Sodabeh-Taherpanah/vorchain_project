import { describe, expect, it } from 'vitest';

import { COVERAGE_GATES, createVitestConfig } from './index.ts';

describe('COVERAGE_GATES', () => {
  it('matches the gates in AGENTS.md §6 and ADR-0008', () => {
    expect(COVERAGE_GATES.engine).toBe(95);
    expect(COVERAGE_GATES.parsers).toBe(90);
    expect(COVERAGE_GATES.web).toBe(80);
  });
});

describe('createVitestConfig', () => {
  it('wires the package gate into every coverage threshold', () => {
    const config = createVitestConfig({ gate: 'engine' });

    expect(config.test?.coverage).toMatchObject({
      provider: 'v8',
      thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 },
    });
  });

  it('defaults to the node environment and colocated TS tests', () => {
    const config = createVitestConfig({ gate: 'parsers' });

    expect(config.test?.environment).toBe('node');
    expect(config.test?.include).toEqual(['src/**/*.test.ts']);
  });

  it('accepts a custom environment and globs', () => {
    const config = createVitestConfig({
      gate: 'web',
      environment: 'jsdom',
      include: ['src/**/*.test.tsx'],
      coverageInclude: ['src/**/*.tsx'],
    });

    expect(config.test?.environment).toBe('jsdom');
    expect(config.test?.include).toEqual(['src/**/*.test.tsx']);
    expect(config.test?.coverage).toMatchObject({ include: ['src/**/*.tsx'] });
  });
});
