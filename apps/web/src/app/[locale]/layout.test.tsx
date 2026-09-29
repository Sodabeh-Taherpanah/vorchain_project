import { createTranslator } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import LocaleLayout, { dynamicParams, generateMetadata, generateStaticParams } from './layout.tsx';

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
  it.each(['de', 'en'])('sets <html lang="%s"> and renders its children', async (locale) => {
    const html = await renderLayout(locale);

    expect(html).toContain(`<html lang="${locale}">`);
    expect(html).toContain('<p>child</p>');
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
