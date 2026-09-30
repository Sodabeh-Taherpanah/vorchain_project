import base from '@vorchain/config/prettier';

/**
 * Shared settings plus Tailwind class sorting. The plugin reads the Tailwind 4 entry stylesheet
 * (there is no tailwind.config file), so it lives here, next to the path it needs.
 * @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions}
 */
const config = {
  ...base,
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindStylesheet: './apps/web/src/app/globals.css',
  tailwindFunctions: ['cn', 'cva'],
};

export default config;
