# 0006. Hosting and deployment target

- Status: accepted (owner, 2026-09-30); supersedes the earlier proposal of option A
- Date: 2026-09-25, decided 2026-09-30
- Deciders: Sodabeh Taherpanah

## Context and problem
We need hosting for a mostly static Next.js 16 site with one Server Action (contact form),
per-PR preview deployments, production deploys driven by releases (ADR-0009), and an honest GDPR
story for German B2B buyers. The site is **commercial** (it advertises a service). Customer files
never reach the server (ADR-0003), so the host only processes access logs and contact-form data.
The repo is a portfolio, so the setup should show solid CI/CD without costing a solo founder much
time in operations.

## Options considered

| Criterion | A. Vercel Pro (fra1) | B. Cloudflare Workers (OpenNext adapter) | C. Container on an EU host (e.g. Hetzner, Scaleway) |
|---|---|---|---|
| Next.js 16 fidelity | Reference platform, all features | Good; via `@opennextjs/cloudflare@1.20.x`, adapter lag possible | Full (`output: 'standalone'`), but we run it |
| Preview deploy per PR | Built in (or `vercel deploy` from Actions) | Built in (Workers preview URLs) | Must be built (per-PR containers, DNS, cleanup) |
| GDPR / data location | US company, DPF-certified + SCCs, DPA available; functions pinned to `fra1`; CDN is global; CLOUD Act exposure | US company, DPF + SCCs, DPA; global edge; EU-only processing needs Enterprise add-ons | Strongest: EU company, EU data centre, "gehostet in Deutschland" as a sales argument |
| Commercial use | **Hobby plan forbids it**; Pro ~USD 20/month per member | Free plan allows it; Workers Paid ~USD 5/month if limits are hit | ~EUR 5 to 10/month for a small VM |
| Ops burden | Very low | Low | Medium to high (TLS, patching, monitoring, backups, zero-downtime deploys) |
| Portfolio value | Standard for Next.js, well understood by reviewers | Shows edge/adapter knowledge | Shows Docker/infra skills, but mostly invisible work |
| Exit path | Docker image (standalone) | Docker image (stand## Decision
We choose **C. a Docker container on Hetzner Cloud in Germany (Nuremberg or Falkenstein), deployed
with Coolify** (self-hosted, open-source PaaS). Decided by the owner on 2026-09-30.

Why C:
- **"Gehostet in Deutschland".** Hetzner is a German company with German data centres. For German
  Mittelstand buyers this is a selling point, and it keeps the privacy story simple: no US provider
  sits between the visitor and the site.
- **Cost.** About EUR 5/month for a small server, against about USD 20/month for Vercel Pro.
- **Git-push deploys without a US vendor.** Coolify builds the repo's `Dockerfile` on every push to
  `main`, can build preview deployments for pull requests through its GitHub App, and issues
  Let's Encrypt certificates.

Rejected:
- **A. Vercel Pro:** US company (CLOUD Act exposure, DPF + SCCs needed), not hosted in Germany, and
  the Hobby plan forbids commercial use, so it would cost USD 20/month from day one.
- **B. Cloudflare Workers:** US company with a global edge, not hosted in Germany (EU-only
  processing needs Enterprise add-ons), and the OpenNext adapter adds a moving part between Next.js
  and production.

Details:
- The repo is **deploy-ready now; the server is rented later.** The owner cannot open a Hetzner
  account yet, so no account is created, nothing is bought and nothing is deployed until then.
  `docs/deploy-hetzner.md` lists the later steps.
- One image for every environment: a multi-stage `Dockerfile` at the repo root builds the Next.js
  `output: 'standalone'` server, runs as the unprivileged `node` user, binds `0.0.0.0` (ADR-0004,
  Next.js bug #94745) and has a healthcheck. `docker compose up --build` runs the same image
  locally. The GHCR image from P1-28 stays as the portable artefact and exit path.
- `NEXT_PUBLIC_*` variables are build arguments (inlined at build time); everything else is set in
  Coolify's environment settings. `.env.example` lists all of them.
- **No database in Phase 1** (app only in `docker-compose.yml`): customer files never leave the
  browser (ADR-0003) and contact-form messages are sent on as email (ADR-0007). Postgres is added
  through Coolify when the first backend feature needs to store data (backlog **P2-01**: add
  `DATABASE_URL` to `.env.example`, set up backups, update the Datenschutzerklärung).
- A DPA (AVV) with Hetzner is concluded in the Hetzner console; Hetzner and Brevo are listed as
  processors in the Datenschutzerklärung (placeholder text in P1-24, owner finalises).
- No analytics or telemetry from the platform: `NEXT_TELEMETRY_DISABLED=1` in the image; analytics
  stay with ADR-0012.

## Consequences
- Positive: data hosted in Germany, lowest running cost, no vendor lock-in (plain Docker), the
  same image runs on a laptop, in CI and on the server, and the Docker/infra work is visible in the
  portfolio.
- Negative / risks: **we operate the server**: OS and Coolify updates, SSH hardening, firewall,
  monitoring and backups of the Coolify configuration are our job (mitigated: unattended upgrades,
  Hetzner firewall, runbook). A single small server has no automatic failover; a restart or a bad
  deploy means minutes of downtime (mitigated: Coolify health checks and rollback to the previous
  image, a static-first site). Preview deployments need the Coolify GitHub App and a wildcard DNS
  record, so they only work once the server exists.
- Follow-ups: P1-14 (deploy-ready container + release-please), P1-28 (rent the server, Coolify,
  domain, production deploy on release, GHCR image, runbooks), P1-24 (privacy text names Hetzner),
  P2-01 (Postgres when needed).

## Open points (owner)
- Rent the Hetzner server and create the Coolify instance when possible (needed for P1-28 and for
  preview deployments).
- Domain name and DNS provider (needed for P1-28).

ed for P1-28).

## References
- Vercel fair use / commercial usage: https://vercel.com/docs/limits/fair-use-guidelines (read 2026-09-25: "Hobby teams are restricted to non-commercial personal use only")
- Vercel regions: https://vercel.com/docs/functions/configuring-functions/region
- Vercel DPF certification: https://vercel.com/changelog/vercel-is-now-certified-under-the-eu-us-data-privacy-framework-dpf
- OpenNext Cloudflare (supports all Next 16 minors): https://opennext.js.org/cloudflare , `@opennextjs/cloudflare@1.20.6` (checked 2026-09-25)
- Hetzner Cloud locations (Nuremberg `nbg1`, Falkenstein `fsn1`): https://docs.hetzner.com/cloud/general/locations/
- Coolify installation and requirements: https://coolify.io/docs/get-started/installation
- Coolify preview deployments: https://coolify.io/docs/applications/ci-cd/github/preview-deploy
- Next.js standalone output: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
