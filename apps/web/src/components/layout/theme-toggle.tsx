'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';

import { Button } from '@vorchain/ui/components/button';
import { currentTheme, subscribeToTheme, toggleTheme } from '@/lib/theme.ts';

/** The server cannot know the visitor's scheme; `null` renders a neutral button until hydration. */
const unknownOnServer = () => null;

/**
 * Toggle button for the dark colour scheme (`aria-pressed`). The initial state follows the system;
 * the icons switch through CSS, so the button already looks right before hydration.
 */
export function ThemeToggle() {
  const t = useTranslations('theme');
  const theme = useSyncExternalStore(subscribeToTheme, currentTheme, unknownOnServer);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      aria-label={t('toggle')}
      aria-pressed={theme === null ? undefined : theme === 'dark'}
      onClick={() => {
        toggleTheme();
      }}
    >
      <Moon aria-hidden="true" className="dark:hidden" />
      <Sun aria-hidden="true" className="hidden dark:block" />
    </Button>
  );
}
