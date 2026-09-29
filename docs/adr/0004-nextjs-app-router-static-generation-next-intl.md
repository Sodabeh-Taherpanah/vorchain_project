# 0004. Next.js App Router with static generation and next-intl

- Status: accepted
- Date: 2026-09-25 (amended 2026-09-29: locale via `next/root-params` instead of `setRequestLocale`)
- Deciders: Sodabeh Taherpanah

## Context and problem
The site is mainly marketing content in German and English that must be fast (LCP < 2 s, JS for
`/` < 120 KB gzip), rank well in German search (hreflang, metadata, JSON-LD) and host one highly
interactive page (`/demo`) plus one server-side form handler. Locale-prefixed URLs (`/de/...`,
`/en/...`) are required.

## Options considered
1. **Next.js 16 App Router, static generation (`generateStaticParams` per locale), next-intl.**
   Pros: Server Components ship zero JS for static sections; Metadata API, `sitemap.ts`,
   `robots.ts` and `next/og` cover SEO needs; Server Actions cover the contact form; next-intl is
   the de-facto i18n library for the App Router with locale routing and ICU messages.
   Cons: Next.js is complex; static rendering with next-intl needs `setRequestLocale` in every
   layout/page.
2. **Astro + React islands + a small i18n setup.** Pros: excellent static performance by default.
   Cons: weaker fit for the owner's target job market (Next.js/React), form handling and i18n
   routing are more manual.
3. **Vite SPA + react-router + i18next.** Pros: simple mental model. Cons: poor SEO without SSR,
   worse LCP, no server for the contact form.
4. **Next.js with Paraglide or next-i18next.** Pros: Paraglide is tree-shakable. Cons: smaller
   App Router ecosystem; next-i18next targets the Pages Router.

## Decision
We choose **option 1**.
- `next@16.3.x`, `react@19.x`, `next-intl@4.14.x`.
- Routing: `src/i18n/routing.ts` with `locales: ['de', 'en']`, `defaultLocale: 'de'`,
  `localePrefix: 'always'`. Root `/` redirects to `/de` via the next-intl proxy/middleware (on Next
  16 the file is `proxy.ts`). German slugs for German pages (`/de/kontakt`, `/de/datenschutz`,
  `/de/impressum`) via next-intl `pathnames`, English equivalents (`/en/contact`, `/en/privacy`,
  `/en/legal-notice`).
- Every page is statically generated (`generateStaticParams` in the `[locale]` root layout returns
  both locales, `dynamicParams = false`). The next-intl request config reads the locale from
  `next/root-params` (default since Next.js 16.3); next-intl now calls `setRequestLocale` a legacy
  API, so layouts and pages do not call it (amended 2026-09-29, P1-12). `/demo` is a static shell
  with a client component island; the worker loads on demand.
- No locale cookie (`localeCookie: false`, amended 2026-09-29, P1-12): the URL prefix already
  carries the locale, and Phase 1 sets no cookies (AGENTS.md §5). `/` and unprefixed paths still
  pick the locale from `Accept-Language`, falling back to `de`. If a language switcher should later
  remember an explicit choice for `/`, re-enable the cookie and list it in the Datenschutzerklärung.
- The proxy's `Link` response header announces the `de`/`en` alternates and an unprefixed
  `x-default` (which redirects by `Accept-Language`). P1-23 adds the same alternates to `<head>`.
- Messages in `apps/web/messages/{de,en}.json`. A unit test asserts both files have identical key
  sets. Engine `Reason`/`Action` codes map to message keys `demo.reason.<CODE>` / `demo.action.<CODE>`.
- `output: 'standalone'` is set so the same build can run in a container (ADR-0006).
- React Compiler: not enabled in Phase 1 (keep the build boring); revisit with an ADR.

## Consequences
- Positive: near-zero JS on marketing pages, first-class SEO primitives, one framework for static
  content, the demo island and the form handler.
- Negative / risks: next-intl and Next.js minor releases occasionally change APIs (middleware was
  renamed to proxy in Next 16); pin via lockfile and let Dependabot/Renovate PRs run the full e2e
  suite.
- Known upstream bug ([vercel/next.js#94745](https://github.com/vercel/next.js/issues/94745), open
  as of 2026-09-29, reproduced with `next@16.3.6`): when the server is **bound** to a loopback IP
  (`next start -H 127.0.0.1`, or `HOSTNAME=127.0.0.1` / `::1` for the standalone `server.js`), the
  router builds its base URL from that literal IP while `NextURL` normalizes loopback hosts to
  `localhost`. The rewrite from the proxy (`/en/contact` -> `/en/kontakt`) then looks external,
  Next proxies it over the network, the proxy runs again and answers
  `307 /en/contact`: an endless loop on `/en/contact`, `/en/legal-notice` and `/en/privacy`
  (a `500 EPROTO` behind a TLS proxy that sends `X-Forwarded-Proto: https`). The `Host` header does
  not matter; only the bind address does. Binding to `0.0.0.0`, `localhost` or omitting `-H` works.
  So: Playwright binds to `localhost`, and the container image (P1-28) must keep
  `HOSTNAME=0.0.0.0` and put any loopback-only restriction in the network layer, not in `-H`.
  The container smoke test in P1-28 must request `/en/contact`, not only `/de`.
- Follow-ups: P1-12 and P1-13 build the shell; P1-23 adds SEO primitives.

## References
- `next@16.3.6`, `react@19.3.0`, `next-intl@4.14.7` (peer range includes `next@^16`) (checked 2026-09-25)
- https://next-intl.dev/docs/routing , https://nextjs.org/docs/app
