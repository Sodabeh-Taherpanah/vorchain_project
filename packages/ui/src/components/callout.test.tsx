import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Callout } from './callout.tsx';

describe('Callout', () => {
  it('is a note with a title, text and decorative icon', () => {
    render(
      <Callout title="Privacy" icon={<svg data-testid="icon" />} tone="ok">
        Your data never leaves the browser.
      </Callout>,
    );
    const note = screen.getByRole('note');
    expect(note.className).toContain('border-ok');
    expect(note.textContent).toContain('Your data never leaves the browser.');
    expect(screen.getByText('Privacy').tagName).toBe('P');
    expect(screen.getByTestId('icon').parentElement?.getAttribute('aria-hidden')).toBe('true');
  });

  it.each([
    ['neutral', 'border-border'],
    ['signal', 'border-signal'],
    ['critical', 'border-critical'],
  ] as const)('has a %s tone without title or icon', (tone, border) => {
    render(<Callout tone={tone}>Text</Callout>);
    expect(screen.getByRole('note').className).toContain(border);
  });
});
