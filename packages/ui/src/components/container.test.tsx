import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Container } from './container.tsx';

describe('Container', () => {
  it('centres the content with the site gutters at the default width', () => {
    render(<Container data-testid="c" className="py-4" />);
    expect(screen.getByTestId('c').className.split(' ')).toEqual(
      expect.arrayContaining(['mx-auto', 'max-w-6xl', 'px-4', 'py-4']),
    );
  });

  it.each([
    ['narrow', 'max-w-3xl'],
    ['wide', 'max-w-7xl'],
  ] as const)('has a %s size', (size, width) => {
    render(<Container data-testid="c" size={size} />);
    expect(screen.getByTestId('c').className).toContain(width);
  });
});
