# 0007. Contact form delivery

- Status: proposed (needs owner to create the Brevo account and confirm the sender domain)
- Date: 2026-09-25
- Deciders: Sodabeh Taherpanah

## Context and problem
`/kontakt` collects name, company, role, email, message and a consent checkbox, and must reach the
owner's inbox reliably. This is the only personal data the Phase 1 site processes. Requirements:
GDPR (EU processor preferred, DPA, data minimisation, no storage beyond the email), spam
protection without a cookie banner (so no reCAPTCHA), works with JavaScript disabled (progressive
enhancement), localized validation messages, and testable in CI without sending real mail.

## Options considered
1. **Server Action + transactional email API (Brevo, EU).** Pros: full control over validation
   (zod shared by client and server), progressive enhancement via `<form action={...}>`, Brevo is a
   French company with EU data centres, free tier (300 mails/day) is plenty, HTTPS API works on
   any host. Cons: we own spam protection and rate limiting; needs an API key secret.
2. **Server Action + Resend.** Pros: excellent developer experience, React Email. Cons: account
   data and logs are stored in the US even when sending from `eu-west-1` (DPF/SCCs cover it, but
   weaker story for a privacy-first brand).
3. **Server Action + SMTP (nodemailer) via the owner's mailbox provider.** Pros: no extra vendor.
   Cons: SMTP from serverless functions is fragile (timeouts, blocked ports), credentials are a
   full mailbox password, harder to test.
4. **Hosted form service (e.g. Formspree (US), Tally (EU), Basin).** Pros: no backend code.
   Cons: third-party script or redirect, weaker styling/a11y control, extra processor, less
   portfolio value, often US-hosted.

## Decision
We choose **option 1: a Next.js Server Action that validates with zod and sends via the Brevo
transactional email HTTP API**, behind a small `MailTransport` interface.

- `apps/web/src/lib/mail/transport.ts`: `interface MailTransport { send(msg): Promise<Result<void, MailError>> }`
  with `BrevoTransport` (plain `fetch` to `https://api.brevo.com/v3/smtp/email`, no SDK needed)
  and `ConsoleTransport` / `MemoryTransport` for dev and tests. Selected by validated env vars
  (`MAIL_TRANSPORT=brevo|console|memory`, `BREVO_API_KEY`, `CONTACT_TO`, `CONTACT_FROM`).
  Swapping to Resend or SMTP later is one new class.
- Schema `contactSchema` (zod 4) shared by client (instant feedback) and server (authority).
  Errors are i18n keys.
- Spam: hidden honeypot field + minimum fill time (signed timestamp) + per-IP rate limit
  (in-memory token bucket per function instance; good enough for Phase 1, documented limit).
  No CAPTCHA.
- Data minimisation: nothing is stored or logged except a success/failure counter; the email to the
  owner is the only copy. `Reply-To` is the visitor's address; no auto-reply in Phase 1 (avoids
  becoming a spam relay).
- Consent checkbox is required and links to `/datenschutz`; the privacy page names Brevo as the
  processor (owner finalises text).
- `useActionState` for pending/success/error UI; the form works without JS (full-page POST).

## Consequences
- Positive: EU processor, no cookies, full a11y and i18n control, host-agnostic (plain `fetch`),
  e2e-testable with `MemoryTransport`.
- Negative / risks: in-memory rate limiting resets per instance; if spam becomes a problem, add a
  durable limiter (Upstash, EU region) via a new ADR. Brevo account/API key setup is manual.
- Follow-ups: P1-25. Owner: create Brevo account, verify sender domain (SPF/DKIM/DMARC), put
  `BREVO_API_KEY` into the Coolify environment (ADR-0006; production + preview uses `console`
  transport).

## References
- Brevo transactional API: https://developers.brevo.com/reference/sendtransacemail ; EU hosting (France/Germany): https://www.brevo.com/features/email-api/ (checked 2026-09-25)
- Resend data residency: https://resend.com/docs/dashboard/domains/regions (checked 2026-09-25)
- `zod@4.6.5` (checked 2026-09-25)
