import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import { resetTheme } from '../../lib/theme.ts';
import { ThemeToggle } from './theme-toggle.tsx';

function stubSystemScheme(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: prefersDark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function renderToggle(locale: 'de' | 'en' = 'de') {
  const messages = { de, en }[locale];
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ThemeToggle />
    </NextIntlClientProvider>,
  );
  return screen.getByRole('button', { name: messages.theme.toggle });
}

beforeEach(() => {
  resetTheme();
});

afterEach(() => {
  resetTheme();
});

describe('ThemeToggle', () => {
  it.each(['de', 'en'] as const)('is a toggle button with a %s label', (locale) => {
    stubSystemScheme(false);

    const button = renderToggle(locale);

    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('starts pressed when the system prefers dark', () => {
    stubSystemScheme(true);

    expect(renderToggle().getAttribute('aria-pressed')).toBe('true');
  });

  it('switches to dark on click without storing anything in the browser', async () => {
    stubSystemScheme(false);
    const user = userEvent.setup();
    const button = renderToggle();

    await user.click(button);

    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('works from the keyboard with Enter and Space', async () => {
    stubSystemScheme(false);
    const user = userEvent.setup();
    const button = renderToggle();

    await user.tab();
    expect(document.activeElement).toBe(button);

    await user.keyboard('{Enter}');
    expect(button.getAttribute('aria-pressed')).toBe('true');

    await user.keyboard(' ');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    // Back to following the system scheme: no override class remains.
    expect(document.documentElement.className).toBe('');
  });

  it('hides both icons from assistive technology', () => {
    stubSystemScheme(false);

    const button = renderToggle();

    const icons = button.querySelectorAll('svg');
    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
