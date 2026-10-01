import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FeatureCard } from './feature-card.tsx';

describe('FeatureCard', () => {
  it('shows a decorative icon, an h3 title and the text', () => {
    render(
      <FeatureCard icon={<svg data-testid="icon" />} title="Real delays">
        P80 per supplier
      </FeatureCard>,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Real delays' })).toBeDefined();
    expect(screen.getByText('P80 per supplier')).toBeDefined();
    expect(screen.getByTestId('icon').parentElement?.getAttribute('aria-hidden')).toBe('true');
  });

  it('can use another heading level, a highlighted tone and no icon', () => {
    render(<FeatureCard title="Hidden risk" headingLevel="h4" tone="signal" />);
    const heading = screen.getByRole('heading', { level: 4, name: 'Hidden risk' });
    expect(heading.closest('[data-slot="card"]')?.className).toContain('border-signal');
  });
});
