import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';

import type { ShortageListing, ShortageTools } from './ports.ts';

const code = z.object({ code: z.string() });
const listingSchema = z.object({
  asOf: z.string(),
  exceptions: z.array(
    z.object({
      materialId: z.string(),
      description: z.string(),
      mainSupplierId: z.string().nullable(),
      severity: z.enum(['CRITICAL', 'WARNING']),
      criticalDate: z.string(),
      erpViewDate: z.string().nullable(),
      daysUntil: z.number(),
      minProjectedStock: z.number(),
      safetyStock: z.number(),
      hidden: z.boolean(),
      reasons: z.array(code),
      actions: z.array(code),
    }),
  ),
});

/** Thrown for a broken tool, not a business outcome: the run cannot start without its data. */
export class ToolError extends Error {
  override readonly name = 'ToolError';
}

/** Adapts an MCP client to the one read-only tool the agent uses. */
export function createMcpTools(client: Pick<Client, 'callTool'>): ShortageTools {
  return {
    async listShortages(args): Promise<ShortageListing> {
      const result = await client.callTool({ name: 'list_shortages', arguments: { ...args } });
      if (result.isError === true) throw new ToolError('list_shortages returned an error');
      const parsed = listingSchema.safeParse(result.structuredContent);
      if (!parsed.success) throw new ToolError('list_shortages returned an unexpected shape');
      return parsed.data;
    },
  };
}
