import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { analyse } from '@vorchain/engine';
import { beforeAll, describe, expect, it } from 'vitest';

import { loadDataset, loadSampleData } from './sample.ts';
import { createVorchainServer, DEFAULT_LIMIT, type ServerData } from './server.ts';

interface Listing {
  asOf: string;
  total: number;
  summary: { critical: number; warning: number; hidden: number };
  exceptions: { materialId: string; severity: string; hidden: boolean; score: number }[];
}
interface Series {
  materialId: string;
  points: { date: string; realisticStock: number; erpStock: number }[];
}

let data: ServerData;
let client: Client;

beforeAll(async () => {
  data = await loadSampleData('de');
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createVorchainServer(data).connect(serverSide);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientSide);
});

const call = (name: string, args: Record<string, unknown> = {}) =>
  client.callTool({ name, arguments: args });

describe('tools/list', () => {
  it('exposes exactly list_shortages and get_projection, both read-only', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_projection', 'list_shortages']);
    for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(true);
  });
});

describe('list_shortages', () => {
  it('returns the engine report, ranked, capped at the default limit', async () => {
    const report = analyse(data.input, data.options);
    const result = await call('list_shortages');
    const body = result.structuredContent as Listing;

    expect(result.isError).toBeFalsy();
    expect(body.asOf).toBe(data.options.asOf);
    expect(body.total).toBe(report.exceptions.length);
    expect(body.summary).toEqual(report.summary);
    expect(body.exceptions.map((e) => e.materialId)).toEqual(
      report.exceptions.slice(0, DEFAULT_LIMIT).map((e) => e.materialId),
    );
  });

  it('puts the same JSON in the text content for clients without structured output', async () => {
    const result = await call('list_shortages', { limit: 2 });
    const [block] = result.content as { type: string; text: string }[];
    expect(JSON.parse(block?.text ?? '')).toEqual(result.structuredContent);
  });

  it('filters by hiddenOnly and finds at least one hidden risk', async () => {
    const body = (await call('list_shortages', { hiddenOnly: true, limit: 100 }))
      .structuredContent as Listing;
    expect(body.total).toBeGreaterThan(0);
    expect(body.exceptions.every((e) => e.hidden)).toBe(true);
  });

  it('filters by severity and applies the limit after filtering', async () => {
    const body = (await call('list_shortages', { severity: 'CRITICAL', limit: 3 }))
      .structuredContent as Listing;
    expect(body.exceptions.length).toBeLessThanOrEqual(3);
    expect(body.exceptions.every((e) => e.severity === 'CRITICAL')).toBe(true);
    expect(body.total).toBe(body.summary.critical);
  });

  it.each([{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { severity: 'LOW' }])(
    'rejects invalid arguments %j',
    async (args) => {
      const result = await call('list_shortages', args).catch((e: unknown) => e);
      const failed = result instanceof Error || (result as { isError?: boolean }).isError === true;
      expect(failed).toBe(true);
    },
  );
});

describe('get_projection', () => {
  it('returns one point per day of the window for a listed material', async () => {
    const first = analyse(data.input, data.options).exceptions[0];
    expect(first).toBeDefined();
    const result = await call('get_projection', { materialId: first?.materialId });
    const body = result.structuredContent as Series;

    expect(result.isError).toBeFalsy();
    expect(body.materialId).toBe(first?.materialId);
    expect(body.points).toHaveLength(data.options.horizonDays);
    expect(body.points[0]?.date).toBe(data.options.asOf);
    // The realistic view of a CRITICAL material must go below zero (spec §5.2).
    if (first?.severity === 'CRITICAL') {
      expect(Math.min(...body.points.map((p) => p.realisticStock))).toBeLessThan(0);
    }
  });

  it('reports an unknown material as a tool error, not a crash', async () => {
    const result = await call('get_projection', { materialId: 'NOPE-404' });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Unknown material: NOPE-404');
  });

  it('rejects an empty material id', async () => {
    const result = await call('get_projection', { materialId: '' }).catch((e: unknown) => e);
    const failed = result instanceof Error || (result as { isError?: boolean }).isError === true;
    expect(failed).toBe(true);
  });
});

describe('loadSampleData', () => {
  it('loads the English dataset too', async () => {
    const en = await loadSampleData('en');
    expect(analyse(en.input, en.options).exceptions.length).toBeGreaterThan(0);
  });

  it('throws on a file that does not parse', async () => {
    const bad = { asOf: data.options.asOf, files: [{ name: 'x.pdf', content: '%PDF' }] };
    await expect(loadDataset(bad)).rejects.toThrow('x.pdf failed to parse: UNSUPPORTED_FILE_TYPE');
  });

  it('throws when required tables are missing', async () => {
    const [first] = (await import('@vorchain/sample-data')).sampleDatasets.de.files;
    const partial = { asOf: data.options.asOf, files: first === undefined ? [] : [first] };
    await expect(loadDataset(partial)).rejects.toThrow('Dataset failed validation: MISSING_TABLE');
  });

  it('defaults to German', async () => {
    expect((await loadSampleData()).options.asOf).toBe(data.options.asOf);
  });
});
