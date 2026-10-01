import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Logo } from './logo.tsx';

describe('Logo', () => {
  it('shows the decorative mark next to the visible wordmark', () => {
    const { container } = render(<Logo name="Vorchain" />);
    expect(screen.getByText('Vorchain')).toBeDefined();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('is an image named after the brand when only the mark is shown', () => {
    render(<Logo name="Vorchain" variant="mark" size="lg" />);
    const image = screen.getByRole('img', { name: 'Vorchain' });
    expect(image.getAttribute('class')).toContain('size-10');
    expect(screen.queryByText('Vorchain')).toBeNull();
  });
});
