/**
 * Which logical table an uploaded file holds. The prototype only looks for fixed file names in a
 * folder (`_find_file`); uploads are named freely (`Export_Bestellungen_KW40.csv`, `data1.csv`), so
 * detection extends that rule with contained stems and a header signature (backlog P1-09).
 */
import { err, ok, type Result } from '@vorchain/engine';

import {
  foundHeaders,
  mapHeaders,
  normaliseHeader,
  TABLE_FILE_STEMS,
  TABLE_NAMES,
  type TableName,
} from './columns.ts';
import type { DataError } from './errors.ts';

/**
 * File name without its extension, normalised like a header. NFC first, because macOS hands out
 * decomposed umlauts (`a` + U+0308) in file names.
 */
function normalisedStem(fileName: string): string {
  const stem = fileName.replace(/\.[^.]*$/u, '');
  return normaliseHeader(stem.normalize('NFC'));
}

function tablesWhoseStem(matches: (known: string) => boolean): TableName[] {
  return TABLE_NAMES.filter((table) =>
    TABLE_FILE_STEMS[table].some((known) => matches(normaliseHeader(known))),
  );
}

/** Number of columns a table maps from these headers, or `null` if a required one is missing. */
function mappedColumnCount(table: TableName, headers: readonly string[]): number | null {
  const mapping = mapHeaders(table, headers);
  return mapping.ok ? Object.keys(mapping.value).length : null;
}

/** Among `candidates`, the tables whose required columns all map, with the most mapped columns. */
function bestBySignature(
  candidates: readonly TableName[],
  headers: readonly string[],
): TableName[] {
  let best: TableName[] = [];
  let bestCount = 0;
  for (const table of candidates) {
    const count = mappedColumnCount(table, headers);
    if (count === null || count < bestCount) continue;
    best = count > bestCount ? [table] : [...best, table];
    bestCount = count;
  }
  return best;
}

/**
 * Detects the table of a file, in this order:
 * 1. the normalised file stem equals a known stem (`artikel.csv`, `Open Purchase Orders.csv`);
 * 2. the stem contains the known stems of exactly one table (`Export_Bestellungen_KW40.csv`);
 * 3. the header signature: of the tables whose stems the name contains (or of all tables if it
 *    contains none), those whose required columns all map; the one with most mapped columns wins.
 *
 * @returns `AMBIGUOUS_TABLE` if step 3 ends in a tie (or finds nothing among several named
 *   tables), `UNKNOWN_TABLE` with the found headers if nothing fits.
 */
export function detectTable(
  fileName: string,
  headers: readonly string[],
): Result<TableName, DataError> {
  const stem = normalisedStem(fileName);
  const [exact] = tablesWhoseStem((known) => known === stem);
  if (exact !== undefined) return ok(exact);

  const named = tablesWhoseStem((known) => stem.includes(known));
  const [onlyNamed] = named;
  if (onlyNamed !== undefined && named.length === 1) return ok(onlyNamed);

  const best = bestBySignature(named.length > 0 ? named : TABLE_NAMES, headers);
  const [winner] = best;
  if (winner !== undefined && best.length === 1) return ok(winner);
  if (best.length > 1 || named.length > 1) {
    return err({
      code: 'AMBIGUOUS_TABLE',
      fileName,
      params: { candidates: best.length > 1 ? best : named },
    });
  }
  return err({ code: 'UNKNOWN_TABLE', fileName, params: { found: foundHeaders(headers) } });
}
