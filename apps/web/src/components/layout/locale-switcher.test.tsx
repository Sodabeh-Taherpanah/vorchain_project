import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as NextNavigation from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import { LocaleSwitcher } from './locale-switcher.tsx';

// The public URL the browser shows; next-intl maps it back to the internal route.
const browser = vi.hoisted(() => ({ pathname: '/de' }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof NextNavigation>()),
  usePathname: () => browser.pathname,
}));

function renderSwitcher(locale: 'de' | 'en', pathname: string) {
  browser.pathname = pathname;
  const messages = { de, en }[locale];
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LocaleSwitcher />
    </NextIntlClientProvider>,
  );
  return within(screen.getByRole('navigation', { name: messages.localeSwitcher.label }));
}

describe('LocaleSwitcher', () => {
  it.each([
    ['de', '/de', '/de', '/en'],
    ['de', '/de/kontakt', '/de/kontakt', '/en/contact'],
    ['de', '/de/impressum', '/de/impressum', '/en/legal-notice'],
    ['en', '/en/privacy', '/de/datenschutz', '/en/privacy'],
    ['en', '/en/demo', '/de/demo', '/en/demo'],
  ] as const)(
    'on %s %s links to %s and %s (keeps the page)',
    (locale, pathname, deHref, enHref) => {
      const nav = renderSwitcher(locale, pathname);

      expect(nav.getByRole('link', { name: 'Deutsch' }).getAttribute('href')).toBe(deHref);
      expect(nav.getByRole('link', { name: 'English' }).getAttribute('href')).toBe(enHref);
    },
  );

  it('marks the current locale with aria-current and sets hreflang and lang', () => {
    const nav = renderSwitcher('en', '/en/contact');

    const english = nav.getByRole('link', { name: 'English' });
    const german = nav.getByRole('link', { name: 'Deutsch' });

    expect(english.getAttribute('aria-current')).toBe('true');
    expect(german.getAttribute('aria-current')).toBeNull();
    expect(german.getAttribute('hreflang')).toBe('de');
    expect(german.getAttribute('lang')).toBe('de');
  });

  it('is reachable with the keyboard in reading order', async () => {
    const user = userEvent.setup();
    const nav = renderSwitcher('de', '/de');

    await user.tab();
    expect(document.activeElement).toBe(nav.getByRole('link', { name: 'Deutsch' }));
    await user.tab();
    expect(document.activeElement).toBe(nav.getByRole('link', { name: 'English' }));
  });
});
