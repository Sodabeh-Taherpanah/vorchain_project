/**
 * Writes the demo e2e fixtures (backlog P1-20) from the prototype's German sample data, so they
 * are reproducible and never contain real customer data.
 *
 * - `privacy/*.csv`: the five sample files with material M0030 renamed to {@link PRIVACY_MARKER}
 *   and its description replaced by one that contains the marker as well. M0030 is a hidden risk
 *   near the top of the ranking, so the marker reaches the table, the drawer and the CSV export.
 * - `date-typo/bestellungen.csv`: `bestellungen.csv` with the letter O in one delivery date.
 * - `wrong-type/bestellungen.pdf` and `.xls`: minimal PDF and Excel 97 (OLE2) files.
 *
 *   node e2e/fixtures/generate.ts          rewrite the fixtures
 *   node e2e/fixtures/generate.ts --check  exit 1 if a fixture is out of date (CI)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/** Unique string the privacy test looks for in every request (ADR-0003, ADR-0008). */
export const PRIVACY_MARKER = 'VORCHAIN-PRIVACY-MARKER-7f3a';
/** The material that carries the marker as its ID. */
export const MARKED_MATERIAL = 'M0030';
/** Description of the marked material: contains the marker, but differs from the ID. */
export const MARKED_DESCRIPTION = `Sensorblock ${PRIVACY_MARKER}-Bezeichnung`;
/** The line of `date-typo/bestellungen.csv` with the typo (the header is line 1). */
export const DATE_TYPO_LINE = 3;
export const DATE_TYPO_VALUE = '24.10.2O26';

const SAMPLE = new URL('../../../../reference/python-prototype/sample_data_de/', import.meta.url);
const HERE = new URL('./', import.meta.url);
const SAMPLE_FILES = [
  'artikel.csv',
  'bedarf.csv',
  'bestellungen.csv',
  'lieferanten.csv',
  'lieferhistorie.csv',
] as const;

const readSample = (name: string) => readFileSync(new URL(name, SAMPLE), 'utf8');

function withMarker(content: string): string {
  return content
    .replace(`Part ${MARKED_MATERIAL}`, MARKED_DESCRIPTION)
    .replaceAll(new RegExp(`\\b${MARKED_MATERIAL}\\b`, 'gu'), PRIVACY_MARKER);
}

function withDateTypo(content: string): string {
  const lines = content.split('\n');
  const line = lines[DATE_TYPO_LINE - 1];
  if (line === undefined || !/24\.10\.2026\r?$/u.test(line)) {
    throw new Error(`bestellungen.csv line ${String(DATE_TYPO_LINE)} changed; update the typo`);
  }
  lines[DATE_TYPO_LINE - 1] = line.replace(/24\.10\.2026(?=\r?$)/u, DATE_TYPO_VALUE);
  return lines.join('\n');
}

/** A one-page PDF with no text: enough for the browser and the parser to see a `.pdf`. */
const MINIMAL_PDF = [
  '%PDF-1.4',
  '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
  '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
  '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj',
  'trailer << /Root 1 0 R >>',
  '%%EOF',
  '',
].join('\n');

/** The OLE2 compound file signature of Excel 97-2003 workbooks, padded to one 512-byte sector. */
function minimalXls(): Uint8Array {
  const bytes = new Uint8Array(512);
  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return bytes;
}

function fixtures(): ReadonlyMap<string, string | Uint8Array> {
  const files = new Map<string, string | Uint8Array>();
  for (const name of SAMPLE_FILES) files.set(`privacy/${name}`, withMarker(readSample(name)));
  files.set('date-typo/bestellungen.csv', withDateTypo(readSample('bestellungen.csv')));
  files.set('wrong-type/bestellungen.pdf', MINIMAL_PDF);
  files.set('wrong-type/bestellungen.xls', minimalXls());
  return files;
}

const toBytes = (content: string | Uint8Array) =>
  typeof content === 'string' ? new TextEncoder().encode(content) : content;

function isUpToDate(path: URL, content: string | Uint8Array): boolean {
  try {
    return Buffer.from(toBytes(content)).equals(readFileSync(path));
  } catch {
    return false;
  }
}

function main(check: boolean): void {
  const stale: string[] = [];
  for (const [name, content] of fixtures()) {
    const path = new URL(name, HERE);
    if (isUpToDate(path, content)) continue;
    stale.push(name);
    if (check) continue;
    mkdirSync(new URL('./', path), { recursive: true });
    writeFileSync(path, toBytes(content));
  }
  if (check && stale.length > 0) {
    console.error(`Out of date: ${stale.join(', ')}. Run: node e2e/fixtures/generate.ts`);
    process.exitCode = 1;
  }
}

if (import.meta.main) main(process.argv.includes('--check'));
