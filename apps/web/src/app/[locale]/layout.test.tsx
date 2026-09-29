import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import LocaleLayout, { dynamicParams, generateStaticParams } from './layout.tsx';

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
