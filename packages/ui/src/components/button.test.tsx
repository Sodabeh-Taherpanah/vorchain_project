import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button, buttonVariants } from './button.tsx';

describe('Button', () => {
  it('renders a button with its variant and size as data attributes', () => {
    render(
      <Button variant="outline" size="lg">
        Go
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button.dataset).toMatchObject({ slot: 'button', variant: 'outline', size: 'lg' });
  });

  it('renders its child instead of a button with asChild', () => {
    render(
      <Button asChild>
        <a href="/demo">Demo</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Demo' }).className).toContain('bg-primary');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('lets className override the variant classes', () => {
    expect(buttonVariants({ size: 'lg', className: 'h-11' })).toContain('h-11');
    expect(buttonVariants({ size: 'lg', className: 'h-11' })).not.toContain('h-9');
  });
});
