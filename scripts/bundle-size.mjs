// Bundle-size gate (backlog V-12, AGENTS.md §5: JS for `/` < 120 KB gzip).
// Measures the JavaScript a modern browser downloads for the landing page: every script the
// prerendered `/de` and `/en` HTML references (including preloads), each file gzipped once. The
// `noModule` polyfill bundle is skipped: browsers that run ES modules never fetch it.
//
//   node scripts/bundle-size.mjs            check against budget + perf/bundle-baseline.json
//   node scripts/bundle-size.mjs --update   store the current size as the new baseline
//
// Two checks: a hard ceiling, and growth of more than TOLERANCE over the baseline, which catches
// a regression long before the ceiling is reached. The AGENTS.md target is TARGET_BYTES; the
// enforced ceiling (`budgetBytes` in the baseline file) is higher until the gap is closed, see
// docs/performance.md. Lower it whenever the bundle shrinks; never raise it without an ADR.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const TARGET_BYTES = 120 * 1000;
export const TOLERANCE = 0.05;
const NEXT = new URL('../apps/web/.next/', import.meta.url);
const BASELINE = new URL('../perf/bundle-baseline.json', import.meta.url);
const PAGES = ['de', 'en'];

/** Script URLs in document order, without duplicates (`<script src>` and script preloads). */
export function scriptPathsFromHtml(html) {
  const paths = [];
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+\.js)"[^>]*>/gu)) {
    const tag = match[0];
    if (tag.startsWith('<link') && !/as="script"/u.test(tag)) continue;
    if (/\bnoModule\b/iu.test(tag)) continue;
    if (!paths.includes(match[1])) paths.push(match[1]);
  }
  return paths;
}

/** @returns {string[]} failures, empty when within budget and tolerance. */
export function evaluateBundle({ gzipBytes, budgetBytes, baselineBytes, tolerance }) {
  const failures = [];
  if (gzipBytes > budgetBytes) {
    failures.push(`${gzipBytes} B gzip exceeds the budget of ${budgetBytes} B`);
  }
  if (baselineBytes !== undefined && gzipBytes > baselineBytes * (1 + tolerance)) {
    failures.push(
      `${gzipBytes} B gzip is more than ${tolerance * 100}% above the baseline of ${baselineBytes} B`,
    );
  }
  return failures;
}

function gzipSizeOfPage(page) {
  const html = readFileSync(new URL(`server/app/${page}.html`, NEXT), 'utf8');
  return scriptPathsFromHtml(html).reduce((sum, path) => {
    const file = new URL(path.replace(/^\/_next\//u, ''), NEXT);
    return sum + gzipSync(readFileSync(file), { level: 9 }).length;
  }, 0);
}

function main() {
  const sizes = Object.fromEntries(PAGES.map((page) => [page, gzipSizeOfPage(page)]));
  const gzipBytes = Math.max(...Object.values(sizes));
  console.info(`First-load JS gzip for /: ${JSON.stringify(sizes)} (target ${TARGET_BYTES} B)`);
  if (process.argv.includes('--update')) {
    // Keeps the stored ceiling; edit `budgetBytes` by hand when the bundle shrinks.
    const stored = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const next = { gzipBytes, pages: sizes, budgetBytes: stored.budgetBytes ?? TARGET_BYTES };
    writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
    console.info('bundle baseline updated');
    return;
  }
  const { gzipBytes: baselineBytes, budgetBytes } = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const failures = evaluateBundle({ gzipBytes, budgetBytes, baselineBytes, tolerance: TOLERANCE });
  if (failures.length > 0) {
    console.error(`Bundle size regression:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
