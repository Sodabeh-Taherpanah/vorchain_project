import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * The app's components use the theme tokens from `@vorchain/ui` instead of raw colour values
 * (AGENTS.md §5, ADR-0013). The token contrast checks live with the theme in packages/ui.
 */

const SRC_DIR = join(import.meta.dirname, '..', '/');

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

describe('app components', () => {
  const files = componentFiles(SRC_DIR);

  it('are found by the scan', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((file) => [file.slice(SRC_DIR.length)]))(
    '%s uses design tokens, not raw colours',
    (file) => {
      expect(readFileSync(join(SRC_DIR, file), 'utf8')).not.toMatch(RAW_COLOUR);
    },
  );
});
