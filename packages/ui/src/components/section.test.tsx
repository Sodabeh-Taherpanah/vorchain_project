import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Section } from './section.tsx';
import { SectionHeader } from './section-header.tsx';

describe('Section', () => {
  it('is a region landmark labelled by its header title', () => {
    render(
      <Section id="faq" aria-labelledby="faq-title">
        <SectionHeader titleId="faq-title" title="Questions" />
      </Section>,
    );
    const region = screen.getByRole('region', { name: 'Questions' });
    expect(region.id).toBe('faq');
    expect(region.className).toContain('scroll-mt-20');
  });

  it.each([
    ['muted', 'bg-muted'],
    ['inverted', 'bg-primary'],
  ] as const)('has a %s tone', (tone, background) => {
    render(<Section aria-label="x" tone={tone} />);
    expect(screen.getByRole('region').className).toContain(background);
  });

  it('can be compact and use a narrow column', () => {
    render(<Section aria-label="x" spacing="compact" size="narrow" />);
    const region = screen.getByRole('region');
    expect(region.className).toContain('py-10');
    expect(region.firstElementChild?.className).toContain('max-w-3xl');
  });
});

describe('SectionHeader', () => {
  it('renders eyebrow, an h2 title and the description', () => {
    render(<SectionHeader eyebrow="Step 1" title="Upload" description="Your files stay here." />);
    expect(screen.getByRole('heading', { level: 2, name: 'Upload' }).className).toContain(
      'text-title',
    );
    expect(screen.getByText('Step 1').className).toContain('font-mono');
    expect(screen.getByText('Your files stay here.').className).toContain('text-lead');
  });

  it('renders the page title as a display-size h1, centred', () => {
    render(<SectionHeader as="h1" size="display" align="center" title="Vorchain" />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Vorchain' });
    expect(heading.className).toContain('text-display');
    expect(heading.parentElement?.className).toContain('text-center');
  });
});
