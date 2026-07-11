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
Use `process.env.NEXT_PUBLIC_APP_URL` everywhere. Zero exceptions.

---

