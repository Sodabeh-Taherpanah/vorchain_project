import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * Guards for the design tokens in globals.css (P1-13): every text/background pair meets WCAG AA
 * in both themes, and components use tokens instead of raw colour values (AGENTS.md §5).
 */

const SRC_DIR = join(import.meta.dirname, '..', '/');
const css = readFileSync(join(SRC_DIR, 'app', 'globals.css'), 'utf8');

type Tokens = ReadonlyMap<string, string>;

function declarations(block: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) tokens.set(name, value.trim());
  }
  return tokens;
}

/** Light tokens are the `:root` block; dark tokens override them inside `@variant dark`. */
function themeTokens(): { light: Tokens; dark: Tokens } {
  const rootStart = css.indexOf(':root {');
  const darkStart = css.indexOf('@variant dark {', rootStart);
  const darkEnd = css.indexOf('}', darkStart);
  const light = declarations(css.slice(rootStart, darkStart));
  const dark = new Map([...light, ...declarations(css.slice(darkStart, darkEnd))]);
  return { light, dark };
}

function resolve(tokens: Tokens, name: string): string {
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`token --${name} is not defined`);
  const reference = /^var\(--([\w-]+)\)$/.exec(value);
  return reference?.[1] === undefined ? value : resolve(tokens, reference[1]);
}

/** OKLCH (CSS Color 4) -> relative luminance (WCAG 2.x), via OKLab and linear sRGB. */
function luminance(oklch: string): number {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(oklch);
  if (match === null) throw new Error(`expected an opaque oklch() colour, got ${oklch}`);
  const [lightness, chroma, hue] = match.slice(1).map(Number) as [number, number, number];
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel));
  const red = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(tokens: Tokens, foreground: string, background: string): number {
  const [lighter, darker] = [
    luminance(resolve(tokens, foreground)),
    luminance(resolve(tokens, background)),
  ].toSorted((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Text on its surface: WCAG 1.4.3 (AA, normal text) needs 4.5:1. */
const TEXT_PAIRS = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'muted'],
  ['muted-foreground', 'background'],
  ['accent-foreground', 'accent'],
  ['signal-foreground', 'signal'],
  ['signal-strong', 'background'],
  ['signal-strong', 'card'],
  ['critical-foreground', 'critical'],
  ['critical', 'background'],
  ['warning-foreground', 'warning'],
  ['ok-foreground', 'ok'],
  ['ok', 'background'],
] as const;

/** Focus rings, input borders and chart marks: WCAG 1.4.11 needs 3:1. */
const NON_TEXT_PAIRS = [
  ['ring', 'background'],
  ['input', 'background'],
  ['chart-1', 'background'],
  ['chart-2', 'background'],
] as const;

const themes = Object.entries(themeTokens());

describe.each(themes)('%s theme tokens', (_theme, tokens) => {
  it.each(TEXT_PAIRS)('%s on %s reaches 4.5:1', (foreground, background) => {
    expect(contrast(tokens, foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)('%s on %s reaches 3:1', (foreground, background) => {
    expect(contrast(tokens, foreground, background)).toBeGreaterThanOrEqual(3);
  });
});

describe('dark theme', () => {
  it('overrides every neutral surface of the light theme', () => {
    const { light, dark } = themeTokens();
    for (const name of ['background', 'foreground', 'card', 'primary', 'muted', 'border']) {
      expect.soft(dark.get(name), name).not.toBe(light.get(name));
    }
  });
});

function componentFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return componentFiles(path);
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [path] : [];
  });
}

/** Hex/rgb/hsl/oklch literals and Tailwind's built-in palette (`bg-red-500`, `text-black`). */
const RAW_COLOUR =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(|\b(?:bg|text|border|ring|outline|fill|stroke|from|to|via|decoration|shadow|accent|caret)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|black|white)\b/i;

describe('components', () => {
  const files = componentFiles(SRC_DIR);

  it('are found by the scan', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(['#fff', 'bg-red-500', 'text-white', 'rgb(0 0 0)', 'oklch(0.5 0 0)'])(
    'the scan flags %s',
    (raw) => {
      expect(`className="${raw}"`).toMatch(RAW_COLOUR);
    },
  );

  it.each(['bg-background', 'text-signal-strong', 'bg-destructive/10', 'border-input'])(
    'the scan allows the token utility %s',
    (token) => {
      expect(`className="${token}"`).not.toMatch(RAW_COLOUR);
    },
  );

  it.each(files.map((file) => [file.slice(SRC_DIR.length)]))(
    '%s uses design tokens, not raw colours',
    (file) => {
      expect(readFileSync(join(SRC_DIR, file), 'utf8')).not.toMatch(RAW_COLOUR);
    },
  );
});
