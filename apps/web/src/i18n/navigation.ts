import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing.ts';

/**
 * Locale-aware navigation: `<Link href="/kontakt">` renders `/de/kontakt` or `/en/contact`, and
 * `usePathname()` returns the internal route, so a link can keep the page and switch the locale.
 */
export const { Link, usePathname } = createNavigation(routing);
