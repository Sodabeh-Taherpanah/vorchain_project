import { defineConfig, type ViteUserConfig } from 'vitest/config';

import { COVERAGE_GATES, type PackageWithCoverageGate } from './coverage.ts';

export interface VitestPresetOptions {
  /** Package whose coverage gate applies (see `COVERAGE_GATES`). */
  readonly gate: PackageWithCoverageGate;
  /** Test environment; packages are pure, so the default is `node`. */
  readonly environment?: 'node' | 'jsdom';
  /** Globs of test files, relative to the package root. */
  readonly include?: readonly string[];
  /** Globs of source files measured for coverage, relative to the package root. */
  readonly coverageInclude?: readonly string[];
}

/**
 * Shared Vitest config: deterministic, no globals, V8 coverage with the package's gate.
 * Each package calls this from its own `vitest.config.ts`.
 */
export function createVitestConfig(options: VitestPresetOptions): ViteUserConfig {
  const threshold = COVERAGE_GATES[options.gate];
  return defineConfig({
    test: {
      environment: options.environment ?? 'node',
      include: [...(options.include ?? ['src/**/*.test.ts'])],
      restoreMocks: true,
      unstubEnvs: true,
      unstubGlobals: true,
      coverage: {
        provider: 'v8',
        include: [...(options.coverageInclude ?? ['src/**/*.ts'])],
        exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
        reporter: ['text', 'html', 'lcov', 'json-summary'],
        thresholds: {
          lines: threshold,
          branches: threshold,
          functions: threshold,
          statements: threshold,
        },
      },
    },
  });
}
