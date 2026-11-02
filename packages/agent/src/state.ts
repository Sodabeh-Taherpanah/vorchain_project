import { supplierEmailSchema } from '@vorchain/llm';
import { z } from 'zod';

/** Bump when the saved shape changes; an old file is refused, not guessed at. */
export const STATE_VERSION = 1;

const line = z.string().min(1).max(200);

export const proposalSchema = z
  .object({
    id: line,
    materialId: line,
    supplierId: line,
    severity: z.enum(['CRITICAL', 'WARNING']),
    hidden: z.boolean(),
    criticalDate: z.string(),
    draft: supplierEmailSchema,
    /** `sent` and `failed` only ever follow an explicit human approval. */
    status: z.enum(['pending', 'rejected', 'sent', 'failed']),
    /** Error code of a failed send; never the message text. */
    failure: z.string().max(80).optional(),
  })
  .strict();
export type Proposal = z.infer<typeof proposalSchema>;

export const skippedSchema = z.object({ materialId: line, reason: z.string().max(80) }).strict();

/** Everything needed to continue after the interrupt. Plain JSON: it can live in any store. */
export const runStateSchema = z
  .object({
    version: z.literal(STATE_VERSION),
    runId: line,
    asOf: z.string(),
    status: z.enum(['awaiting_approval', 'completed']),
    proposals: z.array(proposalSchema),
    skipped: z.array(skippedSchema),
  })
  .strict();
export type RunState = z.infer<typeof runStateSchema>;
