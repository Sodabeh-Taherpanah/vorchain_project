// Conventional Commits with the types and scopes from AGENTS.md §7 (ADR-0009).
// Runs locally via lefthook `commit-msg` and in CI on the PR title (squash-merge commit).
/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'scope-enum': [
      2,
      'always',
      ['engine', 'parsers', 'web', 'demo', 'i18n', 'seo', 'ui', 'ci', 'infra', 'docs', 'deps'],
    ],
  },
};

export default config;
