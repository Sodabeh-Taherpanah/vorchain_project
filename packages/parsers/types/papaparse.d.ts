/**
 * Minimal typings for the part of `papaparse@5.7` the parsers use: synchronous parsing of a string
 * already in memory. Hand-written instead of `@types/papaparse` for two reasons:
 * - `@types/papaparse` references Node's types, which would let Node globals compile in `src`
 *   and defeat `tsconfig.pure.json` (the parsers run in a Web Worker).
 * - Privacy (AGENTS.md §2): only string input is typed, so `download`, remote URLs, `File` input
 *   and Papa's own worker (`worker: true`, a Blob URL) cannot be used by accident.
 *
 * Source of truth: https://www.papaparse.com/docs#config and `papaparse.js` 5.7.0.
 */
declare module 'papaparse' {
  export interface ParseConfig {
    readonly delimiter: string;
    readonly newline: '\n' | '\r\n' | '\r';
    readonly quoteChar: string;
    readonly escapeChar: string;
    readonly header: false;
    readonly skipEmptyLines: false;
    readonly dynamicTyping: false;
  }

  export interface ParseError {
    readonly type: 'Quotes' | 'Delimiter' | 'FieldMismatch';
    readonly code:
      | 'MissingQuotes'
      | 'UndetectableDelimiter'
      | 'TooFewFields'
      | 'TooManyFields'
      | 'InvalidQuotes';
    readonly message: string;
    /** Index of the record (not the line) the error belongs to. */
    readonly row?: number;
    /** Character offset in the input where the problem starts. */
    readonly index?: number;
  }

  export interface ParseResult {
    readonly data: string[][];
    readonly errors: ParseError[];
  }

  export interface PapaStatic {
    parse(input: string, config: ParseConfig): ParseResult;
  }

  const Papa: PapaStatic;
  export default Papa;
}
