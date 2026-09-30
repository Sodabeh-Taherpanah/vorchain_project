import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Registers `src/i18n/request.ts` as the next-intl request config (ADR-0004).
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Same build runs on the host and in the GHCR container image (ADR-0004, ADR-0006).
  output: 'standalone',
  // Internal packages are consumed as TypeScript source (ADR-0002).
  transpilePackages: ['@vorchain/engine', '@vorchain/parsers', '@vorchain/sample-data'],
  poweredByHeader: false,
  reactStrictMode: true,
  // Project rules live in the root AGENTS.md; stop `next dev` from writing its own AGENTS.md and
  // CLAUDE.md into apps/web.
  agentRules: false,
  experimental: {
    // `src/app/global-not-found.tsx` answers URLs outside any locale (e.g. `/missing.png`) with a
    // branded 404, because the root layout lives in `[locale]` (ADR-0004).
    globalNotFound: true,
  },
};

export default withNextIntl(nextConfig);
