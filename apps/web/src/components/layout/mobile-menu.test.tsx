import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as NextNavigation from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import de from '../../../messages/de.json';
import { MobileMenu } from './mobile-menu.tsx';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof NextNavigation>()),
  usePathname: () => '/de',
}));

function renderMenu() {
  render(
    <NextIntlClientProvider locale="de" messages={de}>
      <MobileMenu />
    </NextIntlClientProvider>,
  );
  return screen.getByRole('button', { name: de.nav.menu });
}

describe('MobileMenu', () => {
  it('is closed at first and opens a named dialog with the links and the demo button', async () => {
    const user = userEvent.setup();
    const trigger = renderMenu();
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: de.nav.menuTitle });
    expect(dialog).toBeDefined();
    expect(screen.getByRole('link', { name: de.nav.contact }).getAttribute('href')).toBe(
      '/de/kontakt',
    );
    expect(screen.getByRole('link', { name: de.nav.cta }).getAttribute('href')).toBe('/de/demo');
  });

  it('closes on Escape and returns focus to the menu button', async () => {
    const user = userEvent.setup();
    const trigger = renderMenu();
    await user.click(trigger);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes with the close button', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: de.nav.menu }));

    await user.click(screen.getByRole('button', { name: de.nav.menuClose }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes after a link was followed', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: de.nav.menu }));

    await user.click(screen.getByRole('link', { name: de.nav.contact }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
