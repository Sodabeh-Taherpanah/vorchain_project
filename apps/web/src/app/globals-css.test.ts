import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * Tailwind skips node_modules, so classes used only inside `@vorchain/ui` reach the built CSS
 * only through the `@source` line in globals.css (ADR-0013). A wrong relative path fails
 * silently (the build passes, the styles are missing), so this pins it to the package source.
 */

const APP_DIR = import.meta.dirname;
const css = readFileSync(join(APP_DIR, 'globals.css'), 'utf8');
const UI_SRC = resolve(APP_DIR, '../../../../packages/ui/src');

function sources(negated: boolean): string[] {
  const pattern = negated ? /@source\s+not\s+'([^']+)'/g : /@source\s+(?!not\s)'([^']+)'/g;
  return [...css.matchAll(pattern)].map((match) => resolve(APP_DIR, match[1] ?? ''));
}

describe('globals.css', () => {
  it('imports Tailwind before the design-system theme', () => {
    const tailwind = css.indexOf("@import 'tailwindcss';");
    const theme = css.indexOf("@import '@vorchain/ui/theme.css';");
    expect(tailwind).toBeGreaterThanOrEqual(0);
    expect(theme).toBeGreaterThan(tailwind);
  });

  it('scans the @vorchain/ui source for class names', () => {
    expect(existsSync(join(UI_SRC, 'components', 'section.tsx'))).toBe(true);
    expect(sources(false)).toEqual([UI_SRC]);
  });

  it('leaves the package tests out of the scan', () => {
    expect(sources(true).map((path) => dirname(dirname(path)))).toEqual([UI_SRC]);
  });
});
