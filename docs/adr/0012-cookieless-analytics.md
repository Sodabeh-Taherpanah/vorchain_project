# 0012. Cookieless, EU-hosted analytics for three funnel events

- Status: proposed (needs owner to choose the paid plan or self-hosting)
- Date: 2026-09-25
- Deciders: Sodabeh Taherpanah

## Context and problem
Spec §1 defines three success metrics: demo started, demo completed, contact form submitted
(aggregate only). Phase 1 must not need a cookie banner, and analytics must never see demo data
(ADR-0003).

## Options considered
1. **Plausible Analytics (cloud, EU).** Pros: cookieless, EU company and EU hosting, custom events,
   small script, no consent needed under common German interpretation when no personal data is
   stored. Cons: paid (from ~EUR 9/month); third-party script origin in CSP.
2. **Umami Cloud (EU region) or self-hosted Umami.** Pros: cookieless, open source, free tier /
   self-hostable. Cons: self-hosting is ops work; cloud is a US company with EU region.
3. **Vercel Web Analytics.** Pros: zero setup on Vercel. Cons: US vendor coupling, fewer event
   features on lower tiers, ties analytics to the host decision.
4. **No analytics in Phase 1.** Pros: simplest, strongest privacy story. Cons: no evidence for the
   success metrics.

## Decision
We choose **option 1, Plausible (EU cloud)**, integrated behind a tiny `track(event)` wrapper
that only accepts the literal union `'demo_started' | 'demo_completed' | 'contact_submitted'` and
**no properties**. The script is loaded only when `NEXT_PUBLIC_ANALYTICS_DOMAIN` is set (so preview
and local builds send nothing) and is proxied through our own origin (`/stats/*` rewrite) so CSP
`connect-src` stays `'self'`. If the owner prefers free, Umami Cloud EU is a drop-in replacement
behind the same wrapper.

## Consequences
- Positive: success metrics without cookies or consent banner; the type-level event union makes
  it impossible to attach file data.
- Negative / risks: monthly cost; must be named in the privacy policy.
- Follow-ups: P1-26.

## References
- https://plausible.io/data-policy , https://plausible.io/docs/proxy/introduction (checked 2026-09-25)
