import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CtaBand } from './cta-band.tsx';

describe('CtaBand', () => {
  it('is a full-width region named by its h2, with text and actions', () => {
    render(
      <CtaBand
        id="contact"
        title="Try it"
        description="Ten minutes."
        actions={<a href="/demo">Start</a>}
      />,
    );
    const region = screen.getByRole('region', { name: 'Try it' });
    expect(region.id).toBe('contact');
    expect(region.className).toContain('bg-primary');
    expect(screen.getByText('Ten minutes.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Start' })).toBeDefined();
  });

  it('has a muted tone', () => {
    render(<CtaBand id="cta" title="Try it" tone="muted" />);
    expect(screen.getByRole('region').className).toContain('bg-muted');
  });
});
