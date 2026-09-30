import type { NonTextKind } from './decode.ts';

/**
 * Every error code the parsers can return. The web app keeps one `de` and one `en` message per
 * code and a test checks it against this list (backlog P1-16), so add new codes here first.
 */
export const DATA_ERROR_CODES = [
  'EMPTY_FILE',
  'NOT_TEXT',
  'UNCLOSED_QUOTE',
  'MALFORMED_QUOTE',
] as const;

/** Machine-readable reason a file could not be read; the UI turns it into a localized fix hint. */
export type DataErrorCode = (typeof DATA_ERROR_CODES)[number];

/** Parameters for codes whose message needs nothing beyond file, row and column. */
export type NoParams = Readonly<Record<string, never>>;

interface DataErrorOf<Code extends DataErrorCode, Params> {
  readonly code: Code;
  /** Name of the uploaded file, as the user chose it. */
  readonly fileName?: string;
  /** Physical line number in the file (the header is line 1). */
  readonly row?: number;
  /** Column header as found in the file. */
  readonly column?: string;
  /** Values for the message placeholders. Never contains cell contents beyond a fix hint. */
  readonly params: Params;
}

/**
 * Expected data problem, as codes and parameters only (no display text, AGENTS.md §5). Only file
 * names, line numbers and column headers appear here, never whole rows (privacy, AGENTS.md §2).
 */
export type DataError =
  /** The file has no bytes, or only a BOM, whitespace and blank lines. */
  | DataErrorOf<'EMPTY_FILE', NoParams>
  /** The bytes are not a UTF-8 or Windows-1252 text file (e.g. `.xlsx` renamed to `.csv`). */
  | DataErrorOf<'NOT_TEXT', { readonly detected: NonTextKind }>
  /** A quoted field starting on `row` is never closed, so the rest of the file would be one cell. */
  | DataErrorOf<'UNCLOSED_QUOTE', NoParams>
  /** A quoted field starting on `row` has text after its closing quote (e.g. `"12" Zoll"`). */
  | DataErrorOf<'MALFORMED_QUOTE', NoParams>;
