// Shared ESLint 9 flat config (ADR-0010). The repo root `eslint.config.js` calls
// `createEslintConfig` once; every package's `lint` script (`eslint .`) finds that file.
import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier/flat';
import boundaries from 'eslint-plugin-boundaries';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const WEB_FILES = ['apps/web/**/*.{js,jsx,mjs,ts,tsx}'];
const TEST_FILES = ['**/*.test.{ts,tsx}', '**/e2e/**'];

/** Architecture elements (AGENTS.md §4). Paths are relative to `boundaries/root-path`. */
const ELEMENTS = [
  { type: 'engine', pattern: 'packages/engine' },
  { type: 'parsers', pattern: 'packages/parsers' },
  { type: 'sample-data', pattern: 'packages/sample-data' },
  { type: 'config', pattern: 'packages/config' },
  { type: 'web', pattern: 'apps/web' },
];

const toElements = (/** @type {string[]} */ types) => ({
  to: { element: { types: { anyOf: types } } },
});

/**
 * Dependency rule `web -> parsers -> engine` (ADR-0002, ADR-0010).
 * Default is "allow" so imports inside one element and of declared npm packages keep working;
 * the policies below forbid every edge the architecture does not allow.
 */
const BOUNDARY_POLICIES = [
  // Nothing may depend on the web app.
  { disallow: { to: { module: { source: '@vorchain/web' } } } },
  { from: { element: { type: '!web' } }, disallow: toElements(['web']) },
  // The engine is pure: no internal packages, no npm packages, no Node core modules.
  {
    from: { element: { type: 'engine' } },
    disallow: toElements(['parsers', 'sample-data', 'config', 'web']),
  },
  {
    from: { element: { type: 'engine' } },
    disallow: { to: { module: { origin: { anyOf: ['external', 'core'] } } } },
  },
  {
    from: { element: { type: 'engine' } },
    disallow: { to: { module: { source: '@vorchain/*' } } },
  },
  // parsers -> engine only; sample-data -> engine only.
  {
    from: { element: { type: 'parsers' } },
    disallow: toElements(['sample-data', 'web']),
  },
  {
    from: { element: { type: 'sample-data' } },
    disallow: toElements(['parsers', 'web']),
  },
  {
    from: { element: { types: { anyOf: ['parsers', 'sample-data'] } } },
    disallow: {
      to: { module: { source: { anyOf: ['@vorchain/web', 'react', 'react-dom', 'next'] } } },
    },
  },
];

/**
 * @param {{ rootDir: string }} options `rootDir` is the absolute monorepo root.
 * @returns {import('eslint').Linter.Config[]}
 */
export function createEslintConfig({ rootDir }) {
  return tseslint.config(
    {
      name: 'vorchain/ignores',
      ignores: [
        '**/node_modules/**',
        '**/.next/**',
        '**/.turbo/**',
        '**/coverage/**',
        '**/dist/**',
        '**/playwright-report/**',
        '**/test-results/**',
        '**/next-env.d.ts',
        'reference/**',
      ],
    },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      name: 'vorchain/typescript',
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir: rootDir },
        globals: { ...globals.node },
      },
      linterOptions: { reportUnusedDisableDirectives: 'error' },
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-import-type-side-effects': 'error',
        eqeqeq: ['error', 'always'],
      },
    },
    {
      name: 'vorchain/plain-js',
      files: ['**/*.{js,mjs,cjs}'],
      extends: [tseslint.configs.disableTypeChecked],
    },
    {
      name: 'vorchain/boundaries',
      files: ['apps/*/**/*.{ts,tsx}', 'packages/*/**/*.{ts,tsx}'],
      plugins: { boundaries },
      settings: {
        'boundaries/root-path': rootDir,
        'boundaries/elements': ELEMENTS,
        'boundaries/include': ['apps/**/*', 'packages/**/*'],
        'import/resolver': {
          typescript: {
            alwaysTryTypes: true,
            project: ['apps/*/tsconfig.json', 'packages/*/tsconfig.json'].map(
              (glob) => `${rootDir}/${glob}`,
            ),
          },
        },
      },
      rules: {
        'boundaries/dependencies': ['error', { default: 'allow', policies: BOUNDARY_POLICIES }],
      },
    },
    // Next.js (React, hooks, import, Core Web Vitals) and full jsx-a11y, only for the web app.
    ...nextVitals.map((config) => ({ ...config, files: config.files ?? WEB_FILES })),
    {
      name: 'vorchain/web',
      files: WEB_FILES,
      settings: { next: { rootDir: `${rootDir}/apps/web` } },
      languageOptions: { globals: { ...globals.browser } },
      rules: { ...jsxA11y.flatConfigs.recommended.rules },
    },
    {
      name: 'vorchain/tests',
      files: TEST_FILES,
      rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
    },
    // Must stay last: turns off stylistic rules that Prettier owns.
    prettier,
  );
}
