import { describe, expect, it } from 'vitest';

import { createFakeProvider } from './fake-provider.ts';
import type { LlmRequest } from './types.ts';

const request: LlmRequest = { messages: [{ role: 'user', content: 'Hallo' }] };

describe('createFakeProvider', () => {
  it('returns scripted replies in order and repeats the last one', async () => {
    const provider = createFakeProvider({ replies: ['eins', 'zwei'] });
    const texts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const result = await provider.complete(request);
      if (result.ok) texts.push(result.value.text);
    }
    expect(texts).toEqual(['eins', 'zwei', 'zwei']);
  });

  it('reports its name and model', async () => {
    const provider = createFakeProvider({ replies: ['x'], name: 'unit', model: 'm-1' });
    const result = await provider.complete(request);
    expect(provider.name).toBe('unit');
    expect(result).toEqual({ ok: true, value: { text: 'x', model: 'm-1' } });
  });

  it('returns a scripted failure as a typed error, not a rejection', async () => {
    const provider = createFakeProvider({ replies: [{ code: 'RATE_LIMITED', detail: '429' }] });
    expect(await provider.complete(request)).toEqual({
      ok: false,
      error: { code: 'RATE_LIMITED', detail: '429' },
    });
  });

  it('computes a reply from the request', async () => {
    const provider = createFakeProvider({
      replies: [(r) => `n=${String(r.messages.length)}`],
    });
    const result = await provider.complete(request);
    expect(result.ok && result.value.text).toBe('n=1');
  });

  it('lets a function reply fail too', async () => {
    const provider = createFakeProvider({ replies: [() => ({ code: 'REFUSED' })] });
    expect(await provider.complete(request)).toEqual({ ok: false, error: { code: 'REFUSED' } });
  });

  it('records every request, including cancelled ones', async () => {
    const provider = createFakeProvider({ replies: ['ok'] });
    const controller = new AbortController();
    controller.abort();
    const cancelled: LlmRequest = { ...request, signal: controller.signal };

    expect(await provider.complete(cancelled)).toEqual({ ok: false, error: { code: 'ABORTED' } });
    await provider.complete(request);
    expect(provider.calls).toEqual([cancelled, request]);
  });
});
