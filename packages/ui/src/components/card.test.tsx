import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card.tsx';

describe('Card', () => {
  it('composes header, title, description and content', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>ERP view</CardTitle>
          <CardDescription>Promised dates</CardDescription>
        </CardHeader>
        <CardContent>OK</CardContent>
      </Card>,
    );
    const title = screen.getByRole('heading', { level: 3, name: 'ERP view' });
    expect(title.closest('[data-slot="card"]')?.className).toContain('bg-card');
    expect(screen.getByText('Promised dates').dataset.slot).toBe('card-description');
    expect(screen.getByText('OK').dataset.slot).toBe('card-content');
  });

  it('renders the title as another heading level', () => {
    render(<CardTitle as="h2">Summary</CardTitle>);
    expect(screen.getByRole('heading', { level: 2, name: 'Summary' })).toBeDefined();
  });
});
