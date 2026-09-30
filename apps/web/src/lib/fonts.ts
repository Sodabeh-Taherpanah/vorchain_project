import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

/*
 * `next/font/google` downloads the font files at build time and serves them from our own origin,
 * so browsers never contact Google (a runtime Google Fonts request breaks GDPR, LG München I,
 * 3 O 17493/20). The e2e suite asserts that pages make no third-party requests.
 */

/** Sturdy UI sans (variable weight). Preloaded because every page uses it above the fold. */
export const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: 'variable',
  display: 'swap',
  variable: '--font-plex-sans',
});

/**
 * Mono for material IDs and figures: every glyph has the same width, so columns of numbers line
 * up. Not preloaded: only tables and charts use it, and most pages have none above the fold.
 */
export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  preload: false,
  variable: '--font-plex-mono',
});

/** Class names that expose both families as the CSS variables used by `globals.css`. */
export const fontVariables = `${plexSans.variable} ${plexMono.variable}`;
