import { createTranslator } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as SkipLinkModule from '@/components/layout/skip-link.tsx';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import LocaleLayout, {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
  viewport,
} from './layout.tsx';

const catalogs = { de, en } as const;

// In Next.js the request config resolves the locale from the root param; here each test picks it.
const request = vi.hoisted((): { locale: 'de' | 'en' } => ({ locale: 'de' }));

vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: 'metadata') =>
    Promise.resolve(
      createTranslator({
        locale: request.locale,
        messages: catalogs[request.locale],
        namespace,
      }),
    ),
  getMessages: () => Promise.resolve(catalogs[request.locale]),
}));

// Header, footer and skip link are Server Components that read the full catalog from the request
// config; they have their own tests (site-chrome.test.tsx). Here they are markers, so this test can
// check the order of the page landmarks.
vi.mock('@/components/layout/site-header.tsx', () => ({ SiteHeader: () => <header /> }));
vi.mock('@/components/layout/site-footer.tsx', () => ({ SiteFooter: () => <footer /> }));
vi.mock('@/components/layout/skip-link.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof SkipLinkModule>()),
  SkipLink: () => <a href="#main-content">skip</a>,
}));

// The root layout renders <html>, which Testing Library cannot mount into a container,
// so its output is checked as static markup.
async function renderLayout(locale: string): Promise<string> {
  const element = await LocaleLayout({
    children: <p>child</p>,
    params: Promise.resolve({ locale }),
  });
  return renderToStaticMarkup(element);
}

describe('LocaleLayout', () => {
  beforeEach(() => {
    request.locale = 'de';
  });

  it.each(['de', 'en'] as const)(
    'sets <html lang="%s"> with the font variables and renders its children',
    async (locale) => {
      request.locale = locale;
      const html = await renderLayout(locale);

      expect(html).toMatch(
        new RegExp(`<html lang="${locale}" class="font-plex-sans font-plex-mono"`),
      );
      expect(html).toContain('<p>child</p>');
    },
  );

  it('orders skip link, header, a single focusable main and footer', async () => {
    const html = await renderLayout('de');

    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html).toMatch(
      /<a href="#main-content">skip<\/a><header><\/header><main id="main-content" tabindex="-1"[^>]*><p>child<\/p><\/main><footer><\/footer>/,
    );
  });

  it('needs no inline script for the theme: CSS follows the system before first paint', async () => {
    const html = await renderLayout('de');

    expect(html).not.toContain('<script');
  });

  it('tells the browser that both colour schemes are supported', () => {
    expect(viewport.colorScheme).toBe('light dark');
  });

  it('responds with 404 for an unknown locale', async () => {
    await expect(renderLayout('fr')).rejects.toMatchObject({
      digest: expect.stringContaining('404') as unknown,
    });
  });

  it('prerenders both locales and nothing else', () => {
    expect(generateStaticParams()).toEqual([{ locale: 'de' }, { locale: 'en' }]);
    expect(dynamicParams).toBe(false);
  });
});

describe('generateMetadata', () => {
  beforeEach(() => {
    request.locale = 'de';
  });

  it.each(['de', 'en'] as const)(
    'uses the %s title and description from the message catalog',
    async (locale) => {
      request.locale = locale;

      await expect(generateMetadata()).resolves.toEqual({
        title: catalogs[locale].metadata.title,
        description: catalogs[locale].metadata.description,
      });
    },
  );
});
