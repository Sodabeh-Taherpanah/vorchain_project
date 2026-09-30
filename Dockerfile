# syntax=docker/dockerfile:1
# Production image for the Vorchain website (ADR-0006: Hetzner Cloud + Coolify).
# Build from the repo root:  docker build -t vorchain-web .
# Run:                       docker run -p 3000:3000 vorchain-web

ARG NODE_VERSION=24

# ---- base: Node + pnpm (version from package.json "packageManager" via corepack) -------------
FROM node:${NODE_VERSION}-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# ---- build: install the workspace and build the standalone Next.js server --------------------
FROM base AS build
# Only the lockfile is needed to download packages, so this layer stays cached until it changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --store-dir /pnpm/store
COPY . .
# --ignore-scripts: the root `prepare` script installs git hooks, which a container has no use for.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --ignore-scripts --store-dir /pnpm/store
# NEXT_PUBLIC_* values are inlined into the browser JavaScript at build time, so they are build
# arguments, not runtime variables (Coolify passes them as build args).
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_ANALYTICS_DOMAIN
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_ANALYTICS_DOMAIN=$NEXT_PUBLIC_ANALYTICS_DOMAIN
RUN pnpm --filter @vorchain/web build

# ---- runtime: only the traced standalone output, run as the unprivileged `node` user ---------
FROM node:${NODE_VERSION}-slim AS runtime
# HOSTNAME is never a loopback address: Next.js bug #94745 turns the localized-slug rewrites into
# a 307 loop when the server binds to 127.0.0.1 (ADR-0004, Consequences).
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
# The slim image has no curl; Node's built-in fetch checks that a prerendered page is served.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/de').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
