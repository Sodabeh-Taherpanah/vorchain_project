/**
 * Minimum coverage (lines, branches, functions, statements) per package, in percent.
 * Source: AGENTS.md §6 and ADR-0008. Raising a gate is fine; lowering one needs an ADR.
 */
export const COVERAGE_GATES = {
  engine: 95,
  parsers: 90,
  'sample-data': 80,
  config: 80,
  web: 80,
} as const;

export type PackageWithCoverageGate = keyof typeof COVERAGE_GATES;
