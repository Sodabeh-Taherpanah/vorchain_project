import { render, screen } from '@testing-library/react';
import type * as NextNavigation from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import de from '../../../messages/de.json';
import { SiteNav } from './site-nav.tsx';

const navigation = vi.hoisted(() => ({ pathname: '/de' }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof NextNavigation>()),
  usePathname: () => navigation.pathname,
}));

function renderNav() {
  render(
    <NextIntlClientProvider locale="de" messages={de}>
      <SiteNav label="Test" />
    </NextIntlClientProvider>,
  );
}

describe('SiteNav', () => {
  beforeEach(() => {
    navigation.pathname = '/de';
  });

  it('marks no link as current on the home page', () => {
    renderNav();

    expect(screen.queryByRole('link', { current: 'page' })).toBeNull();
  });

  it.each([
    ['/de/demo', de.nav.demo],
    ['/de/kontakt', de.nav.contact],
  ])('marks the link of %s as the current page', (pathname, name) => {
    navigation.pathname = pathname;
    renderNav();

    const current = screen.getByRole('link', { current: 'page' });
    expect(current.textContent).toBe(name);
  });

  it('keeps the current state for sub-paths', () => {
    navigation.pathname = '/de/demo/ergebnis';
    renderNav();

    expect(screen.getByRole('link', { current: 'page' }).textContent).toBe(de.nav.demo);
  });
});
