import { describe, expect, it } from 'vitest';

import { cn } from './utils.ts';

describe('cn', () => {
  it('joins truthy class names and drops falsy ones', () => {
    expect(cn('a', false, undefined, null, 'b', { c: true, d: false })).toBe('a b c');
  });

  it('lets the later Tailwind utility win a conflict', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('keeps token colour utilities of different properties side by side', () => {
    expect(cn('bg-background text-foreground', 'text-signal-strong')).toBe(
      'bg-background text-signal-strong',
    );
  });

  it('treats the fluid type steps as font sizes, not colours', () => {
    expect(cn('text-lg', 'text-title')).toBe('text-title');
    expect(cn('text-display text-muted-foreground')).toBe('text-display text-muted-foreground');
  });
});
