# Deploying to Hetzner Cloud with Coolify

The decision and its reasons are in [ADR-0006](adr/0006-hosting-and-deployment-target.md). The repo
is deploy-ready: the `Dockerfile`, `docker-compose.yml` and `.env.example` at the root are all a
server needs. **Nothing is rented or deployed yet.** These are the steps for when the owner can open
a Hetzner account.

## 0. Check locally first

```sh
cp .env.example .env              # optional; every value has a safe default
docker compose up --build         # then open http://localhost:3000/de
```

The container is healthy when `docker compose ps` shows `healthy`. `/de`, `/en` and `/en/contact`
must load (the last one guards against Next.js bug #94745, see ADR-0004).

## 1. Create the server

1. Open an account at [Hetzner Cloud](https://console.hetzner.cloud) and create a project
   `vorchain`.
2. Conclude the data processing agreement (AVV) in the Hetzner console. It is needed for the
   Datenschutzerklärung (P1-24).
3. Add a server:
   - Location: **Nuremberg (`nbg1`)** or **Falkenstein (`fsn1`)**, both in Germany.
   - Image: Ubuntu 24.04 LTS.
   - Type: a shared-vCPU server with **2 vCPU and 4 GB RAM** (about EUR 5/month; check current
     prices). Coolify needs at least 2 CPU cores and 2 GB RAM, and `next build` needs the rest.
   - Add your SSH key; no password login.
   - Enable backups only if you want server snapshots. Phase 1 stores no data on the server.
4. Create a Hetzner **firewall** and attach it to the server: allow inbound TCP 22 (SSH), 80 and
   443 (web) and 8000 (Coolify dashboard, until it has its own domain). Block everything else.

## 2. Install Coolify

```sh
ssh root@<server-ip>
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Then open `http://<server-ip>:8000`, create the admin account immediately (the first visitor
becomes admin), and turn on two-factor authentication. Official guide:
<https://coolify.io/docs/get-started/installation>.

## 3. Connect the GitHub repo

1. In Coolify: **Sources → Add → GitHub App**, install it on the `vorchain_project` repository only.
2. **Projects → New → Application**, pick the repo and branch `main`.
3. Build pack: **Dockerfile** (the `Dockerfile` at the repo root). Exposed port: **3000**.
4. Health check: path `/de`, port `3000`.
5. Turn on **automatic deployment** on push to `main`. Production deploys move to published
   releases in P1-28.
6. Optional: turn on **Preview Deployments** so every pull request gets its own URL
   (<https://coolify.io/docs/applications/ci-cd/github/preview-deploy>). This needs a wildcard DNS
   record (step 5). Use `MAIL_TRANSPORT=console` and no analytics for previews.

## 4. Set the environment variables

In the application's **Environment Variables**, add the keys from `.env.example`:

| Variable | Value | Build variable? |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` | **yes** (compiled into the browser code) |
| `NEXT_PUBLIC_ANALYTICS_DOMAIN` | your analytics domain, or leave unset (P1-26) | **yes** |
| `MAIL_TRANSPORT` | `brevo` in production, `console` for previews | no |
| `BREVO_API_KEY` | from Brevo (ADR-0007) | no, and mark it secret |
| `CONTACT_TO`, `CONTACT_FROM` | contact-form recipient and sender | no |

`PORT` and `HOSTNAME` are set in the image; do not override them.

## 5. Point the domain

1. At your DNS provider, add an `A` record (and `AAAA` for IPv6) for the domain and `www` to the
   server IP. For preview deployments also add a wildcard record, e.g. `*.preview.<domain>`.
2. In Coolify, set the application's domain to `https://<your-domain>`. Coolify requests the
   Let's Encrypt certificate itself.
3. Give the Coolify dashboard its own domain (e.g. `https://coolify.<domain>`) and then close port
   8000 in the Hetzner firewall.

## 6. After the first deploy

- Check `https://<your-domain>/de`, `/en` and `/en/contact`.
- Enable unattended security upgrades on the server (`apt install unattended-upgrades`), and keep
  Coolify updated from its dashboard.
- Record the server, domain and DNS provider in P1-28, which adds the production-on-release
  workflow, the rollback and incident runbooks and the GHCR image.
