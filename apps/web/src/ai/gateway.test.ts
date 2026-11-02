import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FactsForModel } from './explanation-facts.ts';
import { explainWithAi, hostOf } from './gateway.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hostOf', () => {
  it('local accepts only loopback addresses, so "local" can never name a foreign host', () => {
    expect(hostOf('http://localhost:11434', 'local')).toBe('localhost:11434');
    expect(hostOf('http://127.0.0.1:11434', 'local')).toBe('127.0.0.1:11434');
    expect(hostOf('http://[::1]:11434', 'local')).toBe('[::1]:11434');
    expect(hostOf('http://evil.example.com', 'local')).toBeNull();
    expect(hostOf('http://localhost.evil.example.com', 'local')).toBeNull();
    expect(hostOf('http://192.168.1.5:11434', 'local')).toBeNull();
  });

  it('remote needs https, no credentials, and a parseable URL', () => {
    expect(hostOf('https://api.example.com/v1')).toBe('api.example.com');
    expect(hostOf('http://api.example.com/v1')).toBeNull();
    expect(hostOf('https://user:pw@api.example.com/v1')).toBeNull();
    expect(hostOf('ftp://api.example.com')).toBeNull();
    expect(hostOf('not a url')).toBeNull();
    expect(hostOf('')).toBeNull();
  });
});

describe('explainWithAi transport', () => {
  const facts: FactsForModel = {
    materialId: 'M-1',
    materialName: 'Blech',
    severity: 'CRITICAL',
    asOf: '2026-10-05',
    criticalDate: '2026-10-13',
    erpViewDate: null,
    daysUntil: 8,
    minProjectedStock: -4,
    safetyStock: 5,
    hidden: true,
    reasonCodes: ['HIDDEN_ERP_NONE'],
    actionCodes: ['EXPEDITE'],
    supplier: null,
  };

  it('refuses redirects and sends no cookies or referrer, so the facts go to the chosen host only', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('redirect refused'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await explainWithAi(
      facts,
      { kind: 'local', baseUrl: 'http://localhost:11434', model: 'm' },
      'de',
    );
    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(init).toMatchObject({
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  });
});
