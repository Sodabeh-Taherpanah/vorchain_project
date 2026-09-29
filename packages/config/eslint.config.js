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

/**
 * Architecture elements (AGENTS.md §4), relative to `boundaries/root-path`. Only `src` counts:
 * package-level tool config (e.g. `vitest.config.ts`) may use the shared presets.
 */
const ELEMENTS = [
  { type: 'engine', pattern: 'packages/engine/src' },
  { type: 'parsers', pattern: 'packages/parsers/src' },
  { type: 'sample-data', pattern: 'packages/sample-data/src' },
  { type: 'config', pattern: 'packages/config/src' },
  { type: 'web', pattern: 'apps/web/src' },
];

const toElements = (/** @type {string[]} */ types) => ({
  to: { element: { types: { anyOf: types } } },
});

/**
 * Dependency rule `web -> parsers -> engine` (ADR-0002, ADR-0010).
 * Default is "allow" so imports inside one element and of declared npm packages keep working;
 * the policies forbid every edge the architecture does not allow. Module selectors take plain
 * micromatch strings or arrays (`{ anyOf }` is only valid for element types and file categories).
 */
const BOUNDARY_POLICIES = [
  // Nothing may depend on the web app, resolved or not.
  { disallow: { to: { module: { source: '@vorchain/web' } } } },
  { from: { element: { type: '!web' } }, disallow: toElements(['web']) },
  // The engine depends on no other workspace package.
  {
    from: { element: { type: 'engine' } },
    disallow: toElements(['parsers', 'sample-data', 'config', 'web']),
  },
  {
    from: { element: { type: 'engine' } },
    disallow: { to: { module: { source: '@vorchain/*' } } },
  },
  // parsers -> engine; sample-data -> engine. Neither may use UI frameworks.
  { from: { element: { type: 'parsers' } }, disallow: toElements(['sample-data', 'config']) },
  { from: { element: { type: 'sample-data' } }, disallow: toElements(['parsers', 'config']) },
  {
    from: { element: { types: { anyOf: ['parsers', 'sample-data'] } } },
    disallow: { to: { module: { source: ['react', 'react-dom', 'next', 'next/**'] } } },
  },
];

/**
 * Engine production code is pure (AGENTS.md §2): no npm packages and no Node core modules.
 * Engine tests may import test tooling (vitest, fast-check), so this skips test files.
 */
const ENGINE_PURITY_POLICY = {
  from: { element: { type: 'engine' } },
  disallow: { to: { module: { origin: ['external', 'core'] } } },
};

/**
 * The engine is deterministic (AGENTS.md §2, ADR-0005): `asOf` is an input, so nothing in
 * `packages/engine/src` (tests included, which must be reproducible too) may read the clock or
 * draw random numbers. `new Date(x)` with an argument stays allowed for the UTC helpers in
 * `dates.ts`.
 */
const ENGINE_DETERMINISM_RULES = {
  'no-restricted-properties': [
    'error',
    {
      object: 'Date',
      property: 'now',
      message: 'The engine never reads the clock: pass `asOf` in (AGENTS.md §2).',
    },
    {
      object: 'Math',
      property: 'random',
      message: 'The engine is deterministic: no randomness (use seeded fast-check in tests).',
    },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date'][arguments.length=0]",
      message: '`new Date()` reads the clock; the engine takes `asOf` as input (AGENTS.md §2).',
    },
    {
      selector: "CallExpression[callee.name='Date']",
      message: '`Date()` returns the current time as a string; the engine never reads the clock.',
    },
  ],
};

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
    // Next.js (React, hooks, import, Core Web Vitals) and full jsx-a11y, only for the web app.
    ...nextVitals.map((config) => ({ ...config, files: WEB_FILES })),
    {
      name: 'vorchain/web',
      files: WEB_FILES,
      settings: { next: { rootDir: `${rootDir}/apps/web` } },
      languageOptions: { globals: { ...globals.browser } },
      rules: { ...jsxA11y.flatConfigs.recommended.rules },
    },
    {
      name: 'vorchain/boundaries',
      files: ['apps/*/**/*.{ts,tsx}', 'packages/*/**/*.{ts,tsx}'],
      plugins: { boundaries },
      settings: {
        'boundaries/root-path': rootDir,
        'boundaries/elements': ELEMENTS,
        'import/resolver': {
          typescript: {
            alwaysTryTypes: true,
            noWarnOnMultipleProjects: true,
            project: [`${rootDir}/apps/*/tsconfig.json`, `${rootDir}/packages/*/tsconfig.json`],
          },
        },
      },
      rules: {
        'boundaries/dependencies': [
          'error',
          { default: 'allow', checkAllOrigins: true, policies: BOUNDARY_POLICIES },
        ],
      },
    },
    {
      name: 'vorchain/boundaries/engine-purity',
      files: ['packages/engine/src/**/*.ts'],
      ignores: TEST_FILES,
      rules: {
        'boundaries/dependencies': [
          'error',
          {
            default: 'allow',
            checkAllOrigins: true,
            policies: [...BOUNDARY_POLICIES, ENGINE_PURITY_POLICY],
          },
        ],
      },
    },
    {
      name: 'vorchain/engine-determinism',
      files: ['packages/engine/src/**/*.ts'],
      rules: ENGINE_DETERMINISM_RULES,
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
