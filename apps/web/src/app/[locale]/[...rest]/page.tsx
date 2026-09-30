import { notFound } from 'next/navigation';

/**
 * Catch-all for unknown paths under a locale (`/de/xyz`): hands them to `[locale]/not-found.tsx`,
 * so the 404 page is localized and keeps the header and footer.
 */
export default function UnknownPage(): never {
  notFound();
}
