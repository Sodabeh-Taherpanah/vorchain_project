import { render, screen, within } from '@testing-library/react';
import type * as NextNavigation from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import { GITHUB_URL } from '../../lib/site.ts';
import { SiteFooter } from './site-footer.tsx';
import { SiteHeader } from './site-header.tsx';
import { MAIN_CONTENT_ID, SkipLink } from './skip-link.tsx';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof NextNavigation>()),
  usePathname: () => '/de',
}));

const catalogs = { de, en } as const;

function renderWith(locale: 'de' | 'en', ui: ReactNode) {
  render(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
      {ui}
    </NextIntlClientProvider>,
  );
  return catalogs[locale];
}

describe('SkipLink', () => {
  it.each(['de', 'en'] as const)('jumps to the main content (%s)', (locale) => {
    const m = renderWith(locale, <SkipLink />);

    const link = screen.getByRole('link', { name: m.layout.skipLink });
    expect(link.getAttribute('href')).toBe(`#${MAIN_CONTENT_ID}`);
  });
});

describe('SiteHeader', () => {
  it.each([
    ['de', '/de/demo', '/de/kontakt'],
    ['en', '/en/demo', '/en/contact'],
  ] as const)('links the home page and the main routes with %s slugs', (locale, demo, contact) => {
    const m = renderWith(locale, <SiteHeader />);

    const banner = within(screen.getByRole('banner'));
    expect(banner.getByRole('link', { name: m.site.home }).getAttribute('href')).toBe(`/${locale}`);
    const nav = within(banner.getByRole('navigation', { name: m.nav.label }));
    expect(nav.getByRole('link', { name: m.nav.demo }).getAttribute('href')).toBe(demo);
    expect(nav.getByRole('link', { name: m.nav.contact }).getAttribute('href')).toBe(contact);
  });

  it('contains the locale switcher and the theme toggle', () => {
    const m = renderWith('de', <SiteHeader />);

    const banner = within(screen.getByRole('banner'));
    expect(banner.getByRole('navigation', { name: m.localeSwitcher.label })).toBeDefined();
    expect(banner.getByRole('button', { name: m.theme.toggle })).toBeDefined();
  });
});

describe('SiteFooter', () => {
  it.each([
    ['de', '/de/impressum', '/de/datenschutz'],
    ['en', '/en/legal-notice', '/en/privacy'],
  ] as const)('links the legal pages with %s slugs and GitHub', (locale, legal, privacy) => {
    const m = renderWith(locale, <SiteFooter />);

    const footer = within(screen.getByRole('contentinfo'));
    expect(footer.getByText(m.footer.promise)).toBeDefined();
    expect(footer.getByRole('link', { name: m.footer.legalNotice }).getAttribute('href')).toBe(
      legal,
    );
    expect(footer.getByRole('link', { name: m.footer.privacy }).getAttribute('href')).toBe(privacy);
    // The external-site hint is part of the accessible name (screen readers announce it).
    const github = footer.getByRole('link', { name: new RegExp(m.footer.github) });
    expect(github.textContent).toContain(m.footer.external);
    expect(github.getAttribute('href')).toBe(GITHUB_URL);
    expect(github.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
