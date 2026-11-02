import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

import { createMcpTools, ToolError } from './mcp-tools.ts';

async function connect(
  handler: () => {
    isError?: boolean;
    content: { type: 'text'; text: string }[];
    structuredContent?: Record<string, unknown>;
  },
) {
  const server = new McpServer({ name: 'fake', version: '0.0.0' });
  server.registerTool('list_shortages', { inputSchema: {} }, handler);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(a);
  return createMcpTools(client);
}

const listing = {
  asOf: '2026-10-05',
  exceptions: [
    {
      materialId: 'M-1',
      description: 'Teil',
      mainSupplierId: null,
      severity: 'WARNING',
      criticalDate: '2026-10-12',
      erpViewDate: null,
      daysUntil: 7,
      minProjectedStock: 1,
      safetyStock: 5,
      hidden: false,
      reasons: [{ code: 'NO_OPEN_PO' }],
      actions: [{ code: 'PLACE_ORDER', supplierId: null }],
    },
  ],
};

describe('createMcpTools', () => {
  it('reads list_shortages through a real MCP client', async () => {
    const tools = await connect(() => ({
      content: [{ type: 'text', text: '{}' }],
      structuredContent: listing,
    }));
    await expect(tools.listShortages({ limit: 3 })).resolves.toMatchObject({
      asOf: '2026-10-05',
      exceptions: [{ materialId: 'M-1' }],
    });
  });

  it('throws ToolError on a tool error or an unexpected shape', async () => {
    const failing = await connect(() => ({
      isError: true,
      content: [{ type: 'text', text: 'x' }],
    }));
    await expect(failing.listShortages({ limit: 3 })).rejects.toBeInstanceOf(ToolError);
    const odd = await connect(() => ({
      content: [{ type: 'text', text: '{}' }],
      structuredContent: { asOf: 1 },
    }));
    await expect(odd.listShortages({ limit: 3 })).rejects.toBeInstanceOf(ToolError);
  });
});
