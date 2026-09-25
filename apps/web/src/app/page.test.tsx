import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import RootLayout from './layout.tsx';
import HomePage from './page.tsx';

// Server Components without hooks render to static HTML; component tests with
// Testing Library and jsdom arrive with the first interactive UI (P1-13+).
describe('HomePage', () => {
  it('renders exactly one h1', () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });
});

describe('RootLayout', () => {
  it('sets German as the document language and renders its children', () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <p>child</p>
      </RootLayout>,
    );

    expect(html).toContain('<html lang="de">');
    expect(html).toContain('<p>child</p>');
  });
});
