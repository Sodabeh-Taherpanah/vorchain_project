# Vorchain design guide

How Vorchain looks and how to build pages that look finished. Spec §6 sets the direction:
**industrial and trustworthy, calm neutrals, one amber signal accent, not playful.** The code lives
in [`packages/ui`](../../packages/ui/README.md) (`@vorchain/ui`, [ADR-0013](../adr/0013-modular-ui-package-no-micro-frontends.md));
`apps/web` composes it and owns all copy (next-intl) and data.

## Type
- **IBM Plex Sans** for UI and text, **IBM Plex Mono** for numbers, IDs, dates and eyebrows
  (`font-mono tabular-nums`, so columns line up). Both self-hosted via `next/font`.
- Headings use the **fluid scale** from `theme.css`. Each step grows from 360 px to 1280 px wide
  screens on its own, so headings need no `sm:`/`lg:` size classes:

  | Utility | Size (360 px to 1280 px+) | Use |
  |---|---|---|
  | `text-display` | 36 to 60 px | the page's one `h1` (hero) |
  | `text-title` | 28 to 40 px | section `h2`, page `h1` on inner pages |
  | `text-heading` | 20 to 24 px | card and sub-section `h3` |
  | `text-lead` | 17 to 20 px | intro sentence under a title |
  | `text-base` / `text-sm` | 16 / 14 px | body, labels, table cells (fixed) |
- `text-balance` on headings, `max-w-prose` on running text (about 65 characters).

## Spacing and section rhythm
- Page column: `Container` (max 1152 px, 16 px gutters on phones, 24 px from `sm`). `narrow` for
  legal pages and forms, `wide` for dense tables.
- Sections: `Section` gives `py-16 sm:py-24` (`compact`: `py-10 sm:py-14`). Alternate `default`
  and `muted` tones to separate bands; never two muted bands in a row.
- Inside a section: header, then `mt-8` to `mt-12` to the content; grids use `gap-4` to `gap-6`.
  Stick to Tailwind's 4 px spacing scale; no arbitrary values.

## Colour
All colours are tokens in `theme.css` with light and dark values; a test checks WCAG AA contrast
of every text pair in both themes, and another fails on raw colours (`#fff`, `bg-red-500`).
- **Neutral surfaces** carry the page: `background`, `card`, `muted`, `border`, text in
  `foreground` / `muted-foreground`. Primary actions use `primary` (near-black, near-white in dark).
- **Amber (`signal`) only means "hidden risk".** Do not use it for decoration, links or general
  highlights, or it stops meaning anything. Text on neutrals uses `text-signal-strong`.
- **Severity colours only for severity:** `critical` (red), `warning` (amber), `ok` (green). Never
  colour alone: a badge or label always says the word too (also for the black-and-white print).
- Charts: `chart-1` = ERP view (neutral), `chart-2` = realistic view (signal).

## Radius, borders and elevation
- Radius from `--radius` (8 px): `rounded-lg` for controls, `rounded-xl` for cards and callouts.
- Separate with 1 px `border` first; shadows stay subtle (`shadow-xs` on cards, `shadow-lg` only for
  overlays such as the sheet). No glow, gradients only as a faint background pattern.

## Icons
`lucide-react`, 16 px in buttons and badges, 20 to 24 px in cards and callouts, stroke default.
Icons next to text are decorative (`aria-hidden`); an icon-only button needs an `sr-only` label.

## Motion
CSS only, short (150 to 300 ms), and only via `motion-safe:` (for example
`motion-safe:transition-transform`). `theme.css` also cuts all animation under
`prefers-reduced-motion`. No scroll-jacking, no autoplay.

## Primitives (`@vorchain/ui`)
Import by path: `import { Section } from '@vorchain/ui/components/section'`. All are Server
Components except `sheet`. Text always comes in through props or children.

| Primitive | Use it for | Notes |
|---|---|---|
| `Container` | the page column | `size`: default, narrow, wide |
| `Section` | each full-width band of a page | `tone`: default, muted, inverted; `spacing`; name it with `aria-labelledby` |
| `SectionHeader` | eyebrow, title, lead at the top of a section | `as` h1/h2/h3, `size="display"` for the hero, `align` |
| `Card` (+ Header, Title, Description, Content) | grouped content, comparison panels | `CardTitle as` sets the level |
| `FeatureCard` | a benefit or a step with an icon | lays out side by side when the card is wide (container query) |
| `Stat`, `StatGroup` | key figures (summary tiles) | `dl`/`dt`/`dd`, mono tabular value, `tone` for signal/critical/ok |
| `Callout` | a promise or warning beside the content (privacy) | `role="note"`, `tone`: neutral, ok, signal, critical |
| `CtaBand` | the closing call to action of a page | `tone`: primary, muted; pass `secondary` buttons on primary |
| `Badge` | severity and "hidden risk" labels | `signal` only for hidden risk |
| `Button`, `buttonVariants` | actions; `buttonVariants` styles links as buttons | `className` overrides win |
| `Sheet` | side drawer (`"use client"`) | `closeLabel` is required (translated) |
| `Logo` | header, footer | `variant="mark"` alone is an image named by `name` |

Add new shadcn components into `packages/ui` (its `components.json`), keep them token-only.

## Imagery
No stock photos. Product visuals are **inline SVG or HTML mock-ups built from the real
components** (for example a small exception table with a hidden-risk badge), so they stay sharp,
themeable and translatable. Decorative graphics are `aria-hidden`; a mock-up that carries meaning
gets a text alternative. No raster images above the fold.

## Tailwind rules (ADR-0013)
1. Tokens only: no raw colours, no arbitrary hex; add a token to `theme.css` (with a contrast pair
   in `theme.test.ts`) instead.
2. Utilities in markup; avoid `@apply` (only the few base rules in `theme.css`).
3. Variants with `cva`, never string concatenation; merge with `cn()` so `className` overrides.
4. Container queries (`@container`, `@sm:`) for components that live in different widths.
5. Fluid type from the theme instead of breakpoint font sizes.
6. Animation only behind `motion-safe:`.
7. Class order is sorted by `prettier-plugin-tailwindcss`.
8. Presentational primitives add no client JavaScript; `"use client"` only for interactive ones.
