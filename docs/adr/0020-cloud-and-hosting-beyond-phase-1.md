# 0020. Cloud and hosting options beyond Phase 1

- Status: proposed (cost and accounts are the owner's decision)
- Date: 2026-11-05
- Deciders: Sodabeh Taherpanah

## Context and problem
ADR-0006 fixes hosting for the static site: Docker on Hetzner Cloud (Germany) with Coolify. The
optional server and database (ADR-0019) and AI inference add needs: backups, availability, and
possibly GPUs. We need a path that does not undo the "hosted in Germany" argument or the exit via
plain Docker.

## Options considered
1. **Stay on one Hetzner server with Coolify, Postgres as a Coolify service.** Cheapest, already
   documented (P2-01). We run backups and patching; one server means no failover.
2. **EU-owned managed services** (for example IONOS, OVHcloud, Scaleway, STACKIT): managed
   Postgres and backups, EU company and data centre; higher cost, new account and DPA each.
3. **US hyperscaler EU region** (AWS Frankfurt, Azure, Google Cloud): richest services and GPUs;
   US parent company (CLOUD Act exposure, DPF/SCCs needed), contradicts the sales argument.

## Decision
- **Now to first pilot:** option 1. Add Postgres through Coolify, backups to EU object storage,
  restore tested (runbook).
- **First paying customer who needs an SLA or point-in-time recovery:** move the database to an
  EU-owned managed service (option 2); the web container stays where it is. Provider chosen by
  price and DPA at that time, behind `DATABASE_URL`, so the move is configuration.
- **Option 3 only if a customer requires it**, with its DPA and transfer basis documented first.
- **AI inference:** the default stays the customer's choice in the browser (ADR-0018). Offered
  order of preference: local model (Ollama) on the customer's side, then an EU-hosted provider,
  then any other remote provider. Vorchain does not host a model before a customer asks for it.
- Every new provider is added to the Datenschutzerklärung as a processor before use.

## Consequences
- Positive: no new vendor until a need and a budget exist; the exit path (Docker, plain Postgres)
  is preserved at each step.
- Negative / risks: option 1 has no automatic failover and a bigger ops burden; option 2 costs
  more and adds a migration. Pricing and provider features here were not re-checked (re-check at
  decision time; do not rely on this ADR for numbers).
- Follow-ups: backup and restore runbook with P2-01; provider list in the privacy text.

## References
- ADR-0006, ADR-0019, ADR-0018; `docs/deploy-hetzner.md`
