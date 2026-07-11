---
paths:
  - "lib/comms/**"
  - "lib/notices/**"
  - "lib/pdf/**"
  - "lib/sms/**"
  - "lib/whatsapp/**"
  - "supabase/email-templates/**"
---

## ABSOLUTE URL DISCIPLINE

`NEXT_PUBLIC_APP_URL` is the single source of truth for all absolute URLs —
emails, WhatsApp messages, PDFs, deep links, QR codes.

- Production: `https://app.pleks.co.za`
- Development: `http://localhost:3000`
- Preview: Vercel preview URL (set automatically)

Any hardcoded `https://app.pleks.co.za/...` in template or email code is a bug.

**How to build one (centralisation items 2 + 3, 2026-07-11):**
- **`absoluteUrl(path)`** / **`marketingUrl(path)`** from `@/lib/routing/absoluteUrl` — the one place a path
  becomes a full URL (product vs apex origin). Prefer this for links in emails/PDFs/QR/deep-links:
  `absoluteUrl("/wo/123")`, `absoluteUrl(\`/apply/${slug}\`)`. Enforced by `pleks/no-inline-app-url`
  (inline `` `${APP_URL}/…` `` is forbidden; baseline burning down).
- Need the bare origin (not building a path)? Import **`APP_URL` / `MARKETING_URL`** from `@/lib/env` — the
  centralised accessors with the single canonical default. **Do NOT read `process.env.NEXT_PUBLIC_APP_URL`
  directly** — `pleks/no-raw-process-env` forbids it outside `lib/env`.

---

