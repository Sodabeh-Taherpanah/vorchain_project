/**
 * Shared Prettier config. The root `prettier.config.js` adds `prettier-plugin-tailwindcss`.
 * @type {import('prettier').Config}
 */
const config = {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all',
  semi: true,
  arrowParens: 'always',
  endOfLine: 'lf',
};

export default config;
