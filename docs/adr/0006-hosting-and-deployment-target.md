# 0006. Hosting and deployment target

- Status: proposed (needs owner confirmation of the Vercel Pro cost, see "Open points")
- Date: 2026-09-25
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
| Exit path | Docker image (standalone) | Docker image (standalone) | n/a |

## Decision
We choose **A. Vercel Pro with functions pinned to `fra1`**, plus a **portable Docker image**
(`output: 'standalone'`) built and pushed to GHCR on every release as the documented exit path.

Details:
- Deploys are driven from **GitHub Actions with the Vercel CLI** (`vercel pull`, `vercel build`,
  `vercel deploy --prebuilt`), not from the Vercel Git integration, so CI is the single source of
  truth and the pipeline is visible in the repo. Automatic Git deployments are disabled in
  `vercel.json` (`git.deploymentEnabled: false`).
- PR -> preview deployment, URL posted as a PR comment. Release published (ADR-0009) -> production.
- `regions: ["fra1"]` for functions. No Vercel Analytics, Speed Insights or Web Analytics scripts
  (ADR-0012 chooses a separate cookieless tool).
- A DPA with Vercel is accepted in the dashboard; Vercel and Brevo are listed as processors in the
  Datenschutzerklärung (placeholder text in P1-24, owner finalises).
- The GHCR image (`ghcr.io/<owner>/vorchain-web`) is smoke-tested in CI (`docker run` + curl
  `/de`), so moving to option C for Phase 2 (backend next to the web app, EU hosting as a selling
  point) is a config change, not a rewrite.

Why not B: good and cheaper, but the adapter adds a moving part between Next.js and production for
a site whose main risk is shipping on time. Why not C now: preview environments and operations
would eat Phase 1 time; it becomes attractive in Phase 2 when there is a backend and customer data.

## Consequences
- Positive: least operational work, first-class Next.js support, preview URLs for every PR,
  release-driven production deploys, a tested container exit path.
- Negative / risks: USD 20/month; US provider (mitigated: no customer files on the server, DPF +
  SCCs, fra1 functions, disclosed in the privacy policy); vendor features must not creep in (no
  Vercel-only APIs such as Edge Config or KV in Phase 1).
- Follow-ups: P1-14 (preview deploys + release-please), P1-28 (production deploy, domain, GHCR
  image, runbooks `docs/runbooks/deploy.md` and `rollback.md`).

## Open points (owner)
- Confirm the Vercel Pro subscription. If cost is a blocker, supersede this ADR with option B
  (Cloudflare Workers free plan); the backlog tasks stay the same except the deploy commands.
- Domain name and DNS provider (needed for P1-28).

## References
- Vercel fair use / commercial usage: https://vercel.com/docs/limits/fair-use-guidelines (read 2026-09-25: "Hobby teams are restricted to non-commercial personal use only")
- Vercel regions: https://vercel.com/docs/functions/configuring-functions/region
- Vercel DPF certification: https://vercel.com/changelog/vercel-is-now-certified-under-the-eu-us-data-privacy-framework-dpf
- OpenNext Cloudflare (supports all Next 16 minors): https://opennext.js.org/cloudflare , `@opennextjs/cloudflare@1.20.6` (checked 2026-09-25)
- `vercel` CLI: check `pnpm view vercel version` when implementing P1-14
