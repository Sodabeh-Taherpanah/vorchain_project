/** The real entry point over a real stdio pipe: what an MCP client such as Claude Desktop starts. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, it } from 'vitest';

it('bin.ts serves list_shortages over stdio', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['bin.ts', 'en'],
    cwd: new URL('..', import.meta.url).pathname,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'stdio-test', version: '0.0.0' });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: 'list_shortages', arguments: { limit: 1 } });
    const body = result.structuredContent as { total: number; exceptions: unknown[] };
    expect(body.total).toBeGreaterThan(0);
    expect(body.exceptions).toHaveLength(1);
  } finally {
    await client.close();
  }
}, 30_000);
