import { createTranslator } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import de from '../../messages/de.json';
import en from '../../messages/en.json';
import GlobalNotFound, { generateMetadata } from './global-not-found.tsx';

const catalogs = { de, en } as const;

vi.mock('next-intl/server', () => ({
  getTranslations: ({ locale, namespace }: { locale: 'de' | 'en'; namespace: 'notFound' }) =>
    Promise.resolve(createTranslator({ locale, messages: catalogs[locale], namespace })),
}));

// Renders its own <html>, so it is checked as static markup like the root layout.
async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await GlobalNotFound());
}

describe('GlobalNotFound', () => {
  it('answers in German first with one h1, and in English second', async () => {
    const html = await renderPage();

    expect(html).toMatch(/^<html lang="de"/);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(`>${de.notFound.title}</h1>`);
    expect(html).toMatch(new RegExp(`<section lang="en"><h2[^>]*>${en.notFound.title}</h2>`));
  });

  it('links to both home pages', async () => {
    const html = await renderPage();

    expect(html).toMatch(/<a [^>]*href="\/de"[^>]*>Zur Startseite<\/a>/);
    expect(html).toMatch(/<a [^>]*href="\/en"[^>]*>Go to the home page<\/a>/);
  });

  it('needs no inline script (the colour scheme follows the system through CSS)', async () => {
    expect(await renderPage()).not.toContain('<script');
  });

  it('has a German title', async () => {
    await expect(generateMetadata()).resolves.toEqual({ title: de.notFound.title });
  });
});
