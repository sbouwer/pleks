---
paths:
  - "app/**"
  - "lib/**"
  - "components/**"
---

## DOMAIN ARCHITECTURE

The app is a single Next.js deployment on Vercel. Four subdomains, each with a
distinct purpose and routing behaviour enforced by `proxy.ts`:

| Domain | Purpose | Route group |
|--------|---------|-------------|
| `pleks.co.za` | Marketing / public pages | `app/(public)/` |
| `app.pleks.co.za` | Main product (agent dashboard, portals) | `app/(dashboard)/`, `app/(tenant)/`, etc. |
| `admin.pleks.co.za` | Internal admin portal (HMAC-token gated) | `app/(admin)/` |
| `status.pleks.co.za` | Public status page (minimal layout, no auth) | `app/(status)/` |

**Routing rules** (production only — skipped in dev/preview):
- `pleks.co.za` only serves `APEX_PREFIXES` paths (pricing, privacy, terms, etc.) — anything else 308s to `app.pleks.co.za`
- `app.pleks.co.za` 308s apex paths to `pleks.co.za` and admin paths to `admin.pleks.co.za`
- `admin.pleks.co.za` only serves `/admin/*` and `/api/admin/*` — anything else 308s to `app.pleks.co.za`
- `status.pleks.co.za` rewrites `/` → `/status` internally; other paths 308 to the right home
- Visiting `/status` on any non-status domain 308s to `status.pleks.co.za`

**Why separate subdomains instead of paths?**
Cookie isolation (admin token only on `admin.pleks.co.za`), CSP scoping, and brand clarity.
Status page needed its own layout without inheriting the dark dashboard shell — route group
`(status)` achieves that without a separate deployment.

**In development:** All traffic comes from `localhost:3000`. `resolveHostContext` returns `"app"`
for any unrecognised host, so subdomain splitting is skipped entirely. All routes are reachable
at their path directly (e.g. `/admin`, `/status`, `/pricing`).

---

