import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import { PRIVACY_TEST_URL } from '../../lib/site.ts';
import HomePage from './page.tsx';

const catalogs = { de, en } as const;

function renderHome(locale: 'de' | 'en') {
  const { container } = render(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
      <HomePage />
    </NextIntlClientProvider>,
  );
  return { m: catalogs[locale].home, container };
}

describe.each([
  ['de', '/de/demo', '/de/kontakt'],
  ['en', '/en/demo', '/en/contact'],
] as const)('landing page (%s)', (locale, demoHref, contactHref) => {
  it('keeps a logical heading outline: one h1, then one h2 per section', () => {
    const { m } = renderHome(locale);

    const outline = screen
      .getAllByRole('heading')
      .map((heading) => `${heading.tagName}:${heading.textContent}`);

    expect(outline).toEqual([
      `H1:${m.title}`,
      `H2:${m.problem.title}`,
      `H2:${m.howItWorks.title}`,
      `H3:${m.howItWorks.steps.export.title}`,
      `H3:${m.howItWorks.steps.analyse.title}`,
      `H3:${m.howItWorks.steps.act.title}`,
      `H2:${m.privacy.title}`,
      `H2:${m.faq.title}`,
      `H2:${m.cta.title}`,
    ]);
  });

  it('exposes every content section as a labelled region', () => {
    const { m } = renderHome(locale);

    for (const name of [
      m.title,
      m.problem.title,
      m.howItWorks.title,
      m.privacy.title,
      m.faq.title,
      m.cta.title,
    ]) {
      expect(screen.getByRole('region', { name })).toBeDefined();
    }
  });

  it('leads from the hero to the demo with a localized link', () => {
    const { m } = renderHome(locale);

    const hero = within(screen.getByRole('region', { name: m.title }));
    expect(hero.getByRole('link', { name: m.hero.cta }).getAttribute('href')).toBe(demoHref);
    expect(hero.getByRole('link', { name: m.hero.secondary }).getAttribute('href')).toBe(
      '#how-it-works',
    );
  });

  it('ends with a call to action that links the localized contact page', () => {
    const { m } = renderHome(locale);

    const cta = within(screen.getByRole('region', { name: m.cta.title }));
    expect(cta.getByRole('link', { name: m.cta.button }).getAttribute('href')).toBe(contactHref);
  });

  it('states the privacy promise and links to the test that proves it', () => {
    const { m } = renderHome(locale);

    const privacy = within(screen.getByRole('region', { name: m.privacy.title }));
    const proof = privacy.getByRole('link', { name: new RegExp(m.privacy.proofLink) });
    expect(proof.getAttribute('href')).toBe(PRIVACY_TEST_URL);
    expect(proof.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders the FAQ as native, closed disclosures (no client JS)', () => {
    const { m } = renderHome(locale);

    const faq = screen.getByRole('region', { name: m.faq.title });
    const items = faq.querySelectorAll('details');
    const questions = Object.values(m.faq.items).map((item) => item.question);

    expect(items).toHaveLength(questions.length);
    expect([...items].map((item) => item.querySelector('summary')?.textContent)).toEqual(questions);
    expect([...items].every((item) => !item.open)).toBe(true);
  });
});

describe('hidden-risk chart slot', () => {
  it('reserves its box with a fixed aspect ratio so P1-22 adds no layout shift', () => {
    const { container } = renderHome('de');

    const slot = container.querySelector('[data-testid="hidden-risk-chart-slot"]');
    expect(slot?.className).toMatch(/aspect-\[/);
    expect(slot?.getAttribute('aria-hidden')).toBe('true');
  });
});
