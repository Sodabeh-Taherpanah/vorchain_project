import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import DatenschutzPage from './datenschutz/page.tsx';
import DemoPage from './demo/page.tsx';
import ImpressumPage from './impressum/page.tsx';
import KontaktPage from './kontakt/page.tsx';
import HomePage from './page.tsx';

const catalogs = { de, en } as const;

const pages: readonly [string, ComponentType, (messages: typeof de) => string][] = [
  ['home', HomePage, (m) => m.home.title],
  ['demo', DemoPage, (m) => m.demo.title],
  ['kontakt', KontaktPage, (m) => m.contact.title],
  ['impressum', ImpressumPage, (m) => m.legalNotice.title],
  ['datenschutz', DatenschutzPage, (m) => m.privacy.title],
];

// Pages read their locale from next-intl, so each render supplies one catalog.
const cases = (['de', 'en'] as const).flatMap((locale) =>
  pages.map(([name, Page, title]) => ({ locale, name, Page, title: title(catalogs[locale]) })),
);

describe.each(cases)('$name page ($locale)', ({ locale, Page, title }) => {
  it('renders exactly one level-1 heading with the localized title', () => {
    render(
      <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
        <Page />
      </NextIntlClientProvider>,
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeDefined();
    // The root layout owns the single <main> landmark (layout.test.tsx), so pages add none.
    expect(screen.queryByRole('main')).toBeNull();
  });
});
