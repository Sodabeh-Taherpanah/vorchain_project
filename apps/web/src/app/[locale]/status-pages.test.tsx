import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import UnknownPage from './[...rest]/page.tsx';
import ErrorPage from './error.tsx';
import NotFound from './not-found.tsx';

const catalogs = { de, en } as const;

function renderWith(locale: 'de' | 'en', ui: ReactNode) {
  render(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
      {ui}
    </NextIntlClientProvider>,
  );
  return catalogs[locale];
}

describe('NotFound', () => {
  it.each([
    ['de', '/de', '/de/demo'],
    ['en', '/en', '/en/demo'],
  ] as const)('is localized (%s) with one h1 and links onward', (locale, home, demo) => {
    const m = renderWith(locale, <NotFound />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: m.notFound.title })).toBeDefined();
    expect(screen.getByText(m.notFound.code)).toBeDefined();
    expect(screen.getByRole('link', { name: m.notFound.home }).getAttribute('href')).toBe(home);
    expect(screen.getByRole('link', { name: m.notFound.demo }).getAttribute('href')).toBe(demo);
  });
});

describe('ErrorPage', () => {
  it.each(['de', 'en'] as const)('is localized (%s) with one h1', (locale) => {
    const m = renderWith(locale, <ErrorPage error={new Error('boom')} retry={vi.fn()} />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: m.error.title })).toBeDefined();
    expect(screen.getByRole('link', { name: m.error.home }).getAttribute('href')).toBe(
      `/${locale}`,
    );
  });

  it('retries the failed segment from the keyboard', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const m = renderWith('de', <ErrorPage error={new Error('boom')} retry={retry} />);

    screen.getByRole('button', { name: m.error.retry }).focus();
    await user.keyboard('{Enter}');

    expect(retry).toHaveBeenCalledOnce();
  });

  it('shows the digest for support but never the error message', () => {
    const error = Object.assign(new Error('secret internal detail'), { digest: '4711' });
    renderWith('en', <ErrorPage error={error} retry={vi.fn()} />);

    expect(screen.getByText('Error ID: 4711')).toBeDefined();
    expect(screen.queryByText(/secret internal detail/)).toBeNull();
  });

  it('omits the error ID line when there is no digest', () => {
    renderWith('en', <ErrorPage error={new Error('boom')} retry={vi.fn()} />);

    expect(screen.queryByText(/Error ID/)).toBeNull();
  });
});

describe('UnknownPage', () => {
  it('hands unknown paths to the localized 404', () => {
    expect(() => UnknownPage()).toThrow(
      expect.objectContaining({ digest: expect.stringContaining('404') as unknown }),
    );
  });
});
