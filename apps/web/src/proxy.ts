import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing.ts';

/**
 * Next.js 16 proxy (formerly middleware): redirects `/` and unprefixed paths to a locale
 * (Accept-Language may pick `en`, otherwise `de`) and rewrites localized slugs such as
 * `/en/contact` to the internal route `/en/kontakt`.
 */
export default createMiddleware(routing);

export const config = {
  // Skip Next internals, API routes and files with an extension (static assets).
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
