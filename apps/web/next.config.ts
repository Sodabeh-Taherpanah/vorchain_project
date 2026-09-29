import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Same build runs on the host and in the GHCR container image (ADR-0004, ADR-0006).
  output: 'standalone',
  // Internal packages are consumed as TypeScript source (ADR-0002).
  transpilePackages: ['@vorchain/engine', '@vorchain/parsers', '@vorchain/sample-data'],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
