'use client';

import type { DataError, DataWarning } from '@vorchain/parsers';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/** A parsers error or warning, as shown in the map check. */
export type DataIssue = DataError | DataWarning;

/**
 * Longest cell value or header shown in a message. Cells come from the user's own file, but a
 * whole pasted paragraph would break the layout; the location still points to the full value.
 */
export const MAX_SHOWN_VALUE_LENGTH = 40;

export function shortenValue(value: string): string {
  const chars = Array.from(value);
  return chars.length <= MAX_SHOWN_VALUE_LENGTH
    ? value
    : `${chars.slice(0, MAX_SHOWN_VALUE_LENGTH - 1).join('')}…`;
}

const bold = (chunks: ReactNode) => <strong className="font-semibold">{chunks}</strong>;

/**
 * One localized sentence per data problem: where it is (file, line, column) and how to fix it.
 * Every code has a `de` and `en` message (`data-issue-text.test.tsx` checks the parsers' lists).
 */
export function DataIssueText({ issue }: { readonly issue: DataIssue }) {
  const t = useTranslations('demo');
  const format = useFormatter();
  const list = (items: readonly string[]) => format.list(items.map(shortenValue));

  const location = [
    issue.fileName === undefined ? null : t('location.file', { file: issue.fileName }),
    issue.row === undefined ? null : t('location.row', { row: String(issue.row) }),
    issue.column === undefined
      ? null
      : t('location.column', { column: shortenValue(issue.column) }),
  ].filter((part) => part !== null);

  const message = (() => {
    switch (issue.code) {
      case 'NOT_TEXT':
        return t.rich('errors.NOT_TEXT', {
          detected: issue.params.detected === 'utf-16' ? 'utf16' : issue.params.detected,
        });
      case 'INVALID_NUMBER':
      case 'INVALID_DATE':
        return t.rich(`errors.${issue.code}`, { value: shortenValue(issue.params.value) });
      case 'UNKNOWN_TABLE':
        return t.rich('errors.UNKNOWN_TABLE', { found: list(issue.params.found) });
      case 'AMBIGUOUS_TABLE':
        return t.rich('errors.AMBIGUOUS_TABLE', {
          candidates: list(issue.params.candidates.map((c) => t(`tables.${c}`))),
        });
      case 'MISSING_COLUMNS':
        return t.rich('errors.MISSING_COLUMNS', {
          b: bold,
          count: issue.params.missing.length,
          missing: list(issue.params.missing.map((c) => t(`columns.${c}`))),
          found: list(issue.params.found),
        });
      case 'TOO_MANY_ERRORS':
        return t.rich('errors.TOO_MANY_ERRORS', { limit: issue.params.limit });
      case 'DUPLICATE_TABLE':
        return t.rich('errors.DUPLICATE_TABLE', {
          table: t(`tables.${issue.params.table}`),
          other: issue.params.other,
        });
      case 'MISSING_TABLE':
        return t.rich('errors.MISSING_TABLE', {
          table: t(`tables.${issue.params.table}`),
          example: t(`tableExamples.${issue.params.table}`),
        });
      case 'UNSUPPORTED_FILE_TYPE':
        return t.rich('errors.UNSUPPORTED_FILE_TYPE', {
          extension: issue.params.extension === '' ? 'none' : issue.params.extension,
        });
      case 'FILE_TOO_LARGE': {
        const { limit, unit } = issue.params;
        return t.rich('errors.FILE_TOO_LARGE', {
          unit,
          limit: unit === 'rows' ? limit : Math.round(limit / (1024 * 1024)),
        });
      }
      case 'DUPLICATE_MATERIAL':
        return t.rich('warnings.DUPLICATE_MATERIAL', {
          value: shortenValue(issue.params.value),
          firstRow: String(issue.params.firstRow),
        });
      case 'EMPTY_FILE':
      case 'UNCLOSED_QUOTE':
      case 'MALFORMED_QUOTE':
      case 'MISSING_VALUE':
      case 'PASSWORD_PROTECTED':
      case 'CORRUPT_FILE':
        return t.rich(`errors.${issue.code}`);
    }
  })();

  return (
    <>
      {location.length > 0 && `${location.join(', ')}: `}
      {message}
    </>
  );
}
