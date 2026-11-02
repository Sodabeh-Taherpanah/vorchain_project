import { describe, expect, it } from 'vitest';

import { hostOf } from './gateway.ts';

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
