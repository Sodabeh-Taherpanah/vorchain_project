import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LlmProvider, LlmRequest } from '../types.ts';
import { createAnthropicProvider } from './anthropic.ts';
import type { FetchLike } from './http.ts';
import { createOllamaProvider } from './ollama.ts';
import { createOpenAiCompatibleProvider } from './openai-compatible.ts';

const SECRET_KEY = 'sk-test-secret';
const request: LlmRequest = {
  messages: [
    { role: 'system', content: 'Du bist ein Planer.' },
    { role: 'user', content: 'Warum fehlt Material M-1?' },
  ],
};

interface Case {
  readonly name: string;
  readonly build: (fetch: FetchLike, timeoutMs?: number) => LlmProvider;
  readonly expectedUrl: string;
  /** A valid provider answer carrying `text`. */
  readonly okBody: (text: string) => unknown;
  readonly emptyBody: unknown;
}

const cases: readonly Case[] = [
  {
    name: 'ollama',
    build: (fetch, timeoutMs) =>
      createOllamaProvider({
        baseUrl: 'http://localhost:11434',
        model: 'llama3',
        fetch,
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      }),
    expectedUrl: 'http://localhost:11434/api/chat',
    okBody: (text) => ({
      model: 'llama3',
      message: { role: 'assistant', content: text },
      prompt_eval_count: 11,
      eval_count: 7,
    }),
    emptyBody: { model: 'llama3', message: { content: '' } },
  },
  {
    name: 'openai-compatible',
    build: (fetch, timeoutMs) =>
      createOpenAiCompatibleProvider({
        baseUrl: 'https://llm.example/v1',
        model: 'gpt-x',
        apiKey: SECRET_KEY,
        fetch,
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      }),
    expectedUrl: 'https://llm.example/v1/chat/completions',
    okBody: (text) => ({
      model: 'gpt-x',
      choices: [{ message: { content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    }),
    emptyBody: { model: 'gpt-x', choices: [{ message: { content: null } }] },
  },
  {
    name: 'anthropic',
    build: (fetch, timeoutMs) =>
      createAnthropicProvider({
        baseUrl: 'https://api.anthropic.test',
        model: 'claude-x',
        apiKey: SECRET_KEY,
        fetch,
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      }),
    expectedUrl: 'https://api.anthropic.test/v1/messages',
    okBody: (text) => ({
      model: 'claude-x',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 11, output_tokens: 7 },
    }),
    emptyBody: { model: 'claude-x', content: [] },
  },
];

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The request body; every adapter sends a JSON string. */
const bodyText = (init: RequestInit | undefined): string =>
  typeof init?.body === 'string' ? init.body : '';

/** Fake `fetch` that never answers until its signal aborts, like a hung connection. */
const hangingFetch: FetchLike = (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      reject(new DOMException('aborted', 'AbortError'));
    });
  });

afterEach(() => {
  vi.useRealTimers();
});

describe.each(cases)('$name adapter contract', (c) => {
  it('returns text, model and token usage for a valid answer', async () => {
    const provider = c.build(() => Promise.resolve(json(c.okBody('Lieferverzug 5 Tage'))));
    expect(await provider.complete(request)).toEqual({
      ok: true,
      value: {
        text: 'Lieferverzug 5 Tage',
        model: expect.any(String) as string,
        usage: { inputTokens: 11, outputTokens: 7 },
      },
    });
  });

  it('POSTs JSON to the documented endpoint with the messages and no extra data', async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(json(c.okBody('x'))));
    await c.build(fetch).complete(request);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(c.expectedUrl);
    expect(init?.method).toBe('POST');
    const sent = bodyText(init);
    expect(sent).toContain('Warum fehlt Material M-1?');
    expect(Object.keys(JSON.parse(sent) as object)).not.toContain('files');
  });

  it.each([
    [429, 'RATE_LIMITED'],
    [504, 'TIMEOUT'],
    [408, 'TIMEOUT'],
    [500, 'UNAVAILABLE'],
    [401, 'UNAVAILABLE'],
  ] as const)('maps HTTP %i to %s', async (status, code) => {
    const provider = c.build(() => Promise.resolve(json({ error: 'nope' }, status)));
    expect(await provider.complete(request)).toEqual({
      ok: false,
      error: { code, detail: `HTTP ${String(status)}` },
    });
  });

  it('reports UNAVAILABLE when the network call throws', async () => {
    const provider = c.build(() => Promise.reject(new TypeError('fetch failed')));
    expect(await provider.complete(request)).toEqual({
      ok: false,
      error: { code: 'UNAVAILABLE', detail: 'network error' },
    });
  });

  it.each([
    ['a body that is not JSON', () => Promise.resolve(new Response('<html>oops</html>'))],
    ['JSON of the wrong shape', () => Promise.resolve(json({ hello: 'world' }))],
  ])('reports INVALID_RESPONSE for %s', async (_label, respond) => {
    const result = await c.build(respond).complete(request);
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_RESPONSE' } });
  });

  it('reports INVALID_RESPONSE for an empty answer', async () => {
    const result = await c.build(() => Promise.resolve(json(c.emptyBody))).complete(request);
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_RESPONSE', detail: 'empty answer' },
    });
  });

  it('returns ABORTED without calling the network when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await c.build(hangingFetch).complete({ ...request, signal: controller.signal });
    expect(result).toEqual({ ok: false, error: { code: 'ABORTED' } });
  });

  it('returns ABORTED when the caller cancels an in-flight call', async () => {
    const controller = new AbortController();
    const pending = c.build(hangingFetch).complete({ ...request, signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual({ ok: false, error: { code: 'ABORTED' } });
  });

  it('returns TIMEOUT when the provider does not answer within timeoutMs', async () => {
    vi.useFakeTimers();
    const pending = c.build(hangingFetch, 5_000).complete(request);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toEqual({
      ok: false,
      error: { code: 'TIMEOUT', detail: 'after 5000 ms' },
    });
  });

  it('never leaks the API key or the response body into an error', async () => {
    const provider = c.build(() =>
      Promise.resolve(json({ error: `bad key ${SECRET_KEY} for Warum fehlt Material`, x: 1 }, 500)),
    );
    expect(JSON.stringify(await provider.complete(request))).not.toMatch(/sk-test|Warum fehlt/);
  });
});

describe('provider-specific behaviour', () => {
  const lastBody = (fetch: ReturnType<typeof vi.fn<FetchLike>>): Record<string, unknown> =>
    JSON.parse(bodyText(fetch.mock.calls[0]?.[1])) as Record<string, unknown>;
  const lastHeaders = (fetch: ReturnType<typeof vi.fn<FetchLike>>): Record<string, string> =>
    (fetch.mock.calls[0]?.[1].headers ?? {}) as Record<string, string>;

  it('ollama asks for a non-streamed answer and maps limits to its option names', async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(json(cases[0]?.okBody('x'))));
    await cases[0]?.build(fetch).complete({ ...request, maxTokens: 50, temperature: 0 });
    expect(lastBody(fetch)).toMatchObject({
      stream: false,
      options: { num_predict: 50, temperature: 0 },
    });
  });

  it('ollama omits usage when the server does not report it', async () => {
    const body = { model: 'llama3', message: { content: 'hi' } };
    const result = await cases[0]?.build(() => Promise.resolve(json(body))).complete(request);
    expect(result).toEqual({ ok: true, value: { text: 'hi', model: 'llama3' } });
  });

  it('openai-compatible sends the bearer key only when one is configured', async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(json(cases[1]?.okBody('x'))));
    await cases[1]?.build(fetch).complete({ ...request, maxTokens: 20, temperature: 0.2 });
    expect(lastHeaders(fetch).authorization).toBe(`Bearer ${SECRET_KEY}`);
    expect(lastBody(fetch)).toMatchObject({ max_tokens: 20, temperature: 0.2 });

    const keyless = vi.fn<FetchLike>(() => Promise.resolve(json(cases[1]?.okBody('x'))));
    await createOpenAiCompatibleProvider({
      baseUrl: 'http://localhost:1234/v1',
      model: 'local',
      fetch: keyless,
    }).complete(request);
    expect(lastHeaders(keyless)).not.toHaveProperty('authorization');
  });

  it.each([
    [{ message: { content: null, refusal: 'Kann ich nicht.' }, finish_reason: 'stop' }],
    [{ message: { content: '' }, finish_reason: 'content_filter' }],
  ])('openai-compatible maps a refusal or content filter to REFUSED', async (choice) => {
    const body = { model: 'gpt-x', choices: [choice] };
    const result = await cases[1]?.build(() => Promise.resolve(json(body))).complete(request);
    expect(result).toEqual({ ok: false, error: { code: 'REFUSED' } });
  });

  it('openai-compatible rejects an answer with no choices', async () => {
    const body = { model: 'gpt-x', choices: [] };
    const result = await cases[1]?.build(() => Promise.resolve(json(body))).complete(request);
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_RESPONSE' } });
  });

  it('anthropic moves system text to the top-level field and sets required headers', async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(json(cases[2]?.okBody('x'))));
    await cases[2]?.build(fetch).complete(request);
    const body = lastBody(fetch);
    expect(body.system).toBe('Du bist ein Planer.');
    expect(body.messages).toEqual([{ role: 'user', content: 'Warum fehlt Material M-1?' }]);
    expect(body.max_tokens).toBe(1024);
    expect(lastHeaders(fetch)).toMatchObject({
      'x-api-key': SECRET_KEY,
      'anthropic-version': '2023-06-01',
    });
  });

  it('anthropic omits system when there is none and honours explicit limits', async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(json(cases[2]?.okBody('x'))));
    await cases[2]
      ?.build(fetch)
      .complete({ messages: [{ role: 'user', content: 'Hi' }], maxTokens: 64, temperature: 0 });
    const body = lastBody(fetch);
    expect(body).not.toHaveProperty('system');
    expect(body).toMatchObject({ max_tokens: 64, temperature: 0 });
  });

  it('anthropic joins text blocks, skips other blocks and maps refusal', async () => {
    const mixed = {
      model: 'claude-x',
      content: [{ type: 'text', text: 'A' }, { type: 'tool_use' }, { type: 'text', text: 'B' }],
    };
    const ok = await cases[2]?.build(() => Promise.resolve(json(mixed))).complete(request);
    expect(ok).toEqual({ ok: true, value: { text: 'AB', model: 'claude-x' } });

    const refusal = { model: 'claude-x', content: [], stop_reason: 'refusal' };
    const refused = await cases[2]?.build(() => Promise.resolve(json(refusal))).complete(request);
    expect(refused).toEqual({ ok: false, error: { code: 'REFUSED' } });
  });
});
