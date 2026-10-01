# @vorchain/ui

Vorchain's design system (ADR-0013): the Tailwind 4 theme, `cn()` and presentational React
primitives. How to use them is in the [design guide](../../docs/design/README.md).

- **Presentational only:** no `next-intl`, Next.js, routing, data or worker code; text comes in
  through props. Server-Component-safe; only `sheet` is a Client Component.
- **Consumed as TypeScript source** (ADR-0002), imported by path:
  `@vorchain/ui/components/<name>`, `@vorchain/ui/lib/utils`, `@vorchain/ui/theme.css`.
- **App setup** (`apps/web/src/app/globals.css`): `@import 'tailwindcss'`, then
  `@import '@vorchain/ui/theme.css'`, and `@source` pointing at `packages/ui/src` because Tailwind
  skips `node_modules`. `next.config.ts` lists the package in `transpilePackages`.
- **Boundaries** (`packages/config/eslint.config.js`): only `apps/web` may import this package;
  it imports no workspace package and no Node core module.
- **Tests:** `pnpm --filter @vorchain/ui test`; coverage gate 90 %. `theme.test.ts` checks WCAG
  contrast of the tokens in both themes and that components use no raw colours.
- **New shadcn components:** run the shadcn CLI with this package's `components.json`.
