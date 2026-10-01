import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge.tsx';

describe('Badge', () => {
  it.each([
    [undefined, 'bg-secondary'],
    ['signal', 'bg-signal'],
    ['critical', 'bg-critical'],
    ['warning', 'bg-warning'],
    ['ok', 'bg-ok'],
    ['outline', 'border-border'],
  ] as const)('renders the %s variant', (variant, colour) => {
    render(<Badge {...(variant === undefined ? {} : { variant })}>Label</Badge>);
    const badge = screen.getByText('Label');
    expect(badge.className).toContain(colour);
    expect(badge.dataset.slot).toBe('badge');
  });
});
