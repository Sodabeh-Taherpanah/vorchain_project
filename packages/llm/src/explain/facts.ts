import { z } from 'zod';

/**
 * Privacy gate (AGENTS.md §2): the only data a model ever sees about a material. It holds derived
 * numbers and engine codes, never rows or file content. The schema is `.strict()` so an extra key
 * such as `rawRows` is rejected, and free text is a single short line, so a pasted CSV block
 * cannot pass as a "name". V-06 adds prompt-injection and PII checks on top of this.
 */
const SHORT_LINE_MAX = 80;
// No control characters (including newlines and tabs): one line, nothing that looks like a file.
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const NO_CONTROL = /^[^\u0000-\u001f\u007f\u0085\u2028\u2029]*$/;

const shortLine = z.string().min(1).max(SHORT_LINE_MAX).regex(NO_CONTROL);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Mirrors the engine's `ReasonCode` and `ActionCode`; kept in sync by the web mapper's types. */
export const FACT_REASON_CODES = [
  'NO_OPEN_PO',
  'PO_AFTER_CRITICAL',
  'PO_LATE',
  'HIDDEN_ERP_LATER',
  'HIDDEN_ERP_NONE',
  'PO_OVERDUE',
] as const;
export const FACT_ACTION_CODES = [
  'PLACE_ORDER',
  'PULL_FORWARD',
  'EXPEDITE',
  'REVIEW_QTY_OR_DEMAND',
] as const;

const supplierFacts = z
  .object({
    name: shortLine,
    p80DelayDays: z.number().int().min(0).max(365),
    onTimeRate: z.number().min(0).max(1),
    deliveries: z.number().int().min(0),
    reliable: z.boolean(),
  })
  .strict();

export const explanationFactsSchema = z
  .object({
    materialId: shortLine,
    materialName: shortLine,
    severity: z.enum(['CRITICAL', 'WARNING']),
    asOf: isoDate,
    criticalDate: isoDate,
    erpViewDate: isoDate.nullable(),
    daysUntil: z.number().int().min(0),
    minProjectedStock: z.number(),
    safetyStock: z.number(),
    hidden: z.boolean(),
    reasonCodes: z.array(z.enum(FACT_REASON_CODES)).max(20),
    actionCodes: z.array(z.enum(FACT_ACTION_CODES)).max(20),
    supplier: supplierFacts.nullable(),
  })
  .strict();

export type ExplanationFacts = z.infer<typeof explanationFactsSchema>;
