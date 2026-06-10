# Launch readiness — email & auth

Deferred levers captured during the email-branding + security-notification work (2026-06-10). None are code
bugs; they're config/launch steps + conscious couplings. Grouped by what unblocks them.

## 1. Resend — the single biggest one (everything email is DARK without it)

The app's transactional pipeline (`lib/comms` → Resend) has **no `RESEND_API_KEY`** set. Until it's wired,
**every Pleks-sent email is dark** — including:
- the **security notifications** (password changed, passkey/TOTP added, passkey removed) — wiring is live,
  but they don't send;
- the **subscription/billing** emails;
- tenant/landlord/supplier transactional mail.

Mitigation already in place: `auth_events` logs every security event regardless, so it stays **forensically
visible** — just not proactively emailed. **Action: set `RESEND_API_KEY` at launch.** That one env var lights
up all of the above at once.

## 2. Supabase Auth email (separate from #1)

Supabase sends its **own** auth-action emails (the 6 templates: magic link, confirm signup, invite, reset,
change-email, reauthentication) via **its own SMTP**, NOT the app's Resend.

- **Point Supabase Auth → Resend SMTP** (Authentication → Emails → SMTP). The built-in mailer is slow
  (4–7s, blocks the send), **rate-limited** (a few/hour — this actively interfered with testing), and stamps a
  "powered by Supabase" footer. Custom SMTP fixes all three.
- **Re-paste the 6 branded templates** (`supabase/email-templates/`) into the dashboard after each deploy —
  the dashboard does not sync from the repo. They use the hosted wordmark (`/logo/pleks-wordmark-light.png`)
  with a dark-mode swap; the logo only resolves once `public/logo/` is deployed.
- **Redirect URLs** must allow `…/auth/callback` for every env (`localhost:3000`, `app.pleks.co.za`) or the
  links error.

## 3. Email change — disable it (account-bound)

Email is bound to the account; it should **not** be self-service. App side: confirmed **no email-change UI**
exists. Platform side: **turn off "Secure email change"** in Supabase (Authentication → Providers → Email).
Legit changes go via a manual/DB ticket.

**Coupling (load-bearing):** disabling the change and dropping the `email_changed` notification are **joined**
decisions. Email-change-enabled with no change-notification is the classic account-takeover path (swap email →
reset password). The `email_changed` enum value is dormant in `lib/auth/events.ts`. **If email change is ever
re-enabled at Supabase, the `email_changed` notification must come back with it.**

## 4. Security notifications — status

Pleks-branded, fired from the `logAuthEvent` chokepoint (after the `auth_events` insert, 4s-bounded, gated to
sensitive types). Component is event-complete (all 6 keys).

| Event | Emitter wired? | Notes |
|---|---|---|
| `password_changed` | ✅ (`/api/auth/log-password-changed`) | closed the forensic gap — was logged nowhere |
| `passkey_enrolled` | ✅ existing log | |
| `totp_enrolled` | ✅ existing log | |
| `passkey_unenrolled` | ✅ existing log | |
| `totp_unenrolled` | ❌ no emitter | no remove-authenticator flow exists — wire the log when it does |
| `recovery_used` | ❌ no emitter | no recovery-code-at-login path exists — wire the log when it does |

All gated to `success`; all dark until Resend (#1).

## 5. Branding principle (codified)

Branding follows the **sender → recipient** relationship:
- **Agency-branded** = agency → its contacts (tenants, landlords, applicants).
- **Pleks-branded** = Pleks → the agency (security, billing, subscription, platform).

`EmailLayout` enforces it: an uploaded org logo wins (agency mail); else `orgName === "Pleks"` → the wordmark
PNG (light/dark swap); else org-name text. New Pleks→customer templates must pass `PLEKS_BRANDING`.

## 6. Minor follow-ups (non-blocking)

- `OrgContact.branding` in `lib/subscriptions/emails.tsx` is now ignored (overridden to `PLEKS_BRANDING`); the
  billing crons still build `buildBranding(...)` + `fetchOrgSettings` needlessly — could drop for a small
  saving.
- `process-audit-exports` uses `orgName: "Pleks Platform"` (≠ "Pleks") so it renders text, not the wordmark —
  align to `"Pleks"` if you want the logo there too.
- Email dark-mode logo toggle works on fresh opens; live-toggling the reading pane in Outlook can leave a
  stale render (`data-ogsc` persists). Optional bulletproofing: a fixed navy "chip" behind the wordmark.
