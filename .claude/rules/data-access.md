---
paths:
  - "app/**/*.tsx"
  - "app/api/**"
  - "lib/actions/**"
---

## Data access in pages, server components, and server actions

**Cookie client (`createClient()`) is for `auth.getUser()` ONLY.** Never call `.from(...)` on its result. RLS does not reliably propagate `auth.uid()` to Postgres from the cookie client in Next.js server components; queries through this client return empty for new users whose session state has not warmed.

**Server components and pages: use `gatewaySSR()`.** Returns `{ db, userId, orgId, role }`. Every query through `db` MUST include `.eq("org_id", orgId)` explicitly. The service-role client bypasses RLS; the explicit filter IS the org boundary.

**Server actions: use `gateway()` or `requireAgentWriteAccess(action)`.** Same shape, same rules. `requireAgentWriteAccess` additionally enforces the subscription lockdown gate.

**Which write gate — the paused-org test.** A mutation is NOT automatically `requireAgentWriteAccess`. The subscription-lockdown gate applies only to *net-new value creation* (per "Your Data, Always"), not to every write. Classify by the table the write targets, using one test:

> **"If the org is paused, should this action still work?"**

- **Yes → `gateway()`** (auth + org-scope, no lockdown): the org's own account/config surface — notification prefs, display/display-name settings, profile, saved filters, team display names. A cancelled agency editing its own settings is exercising "your data, always," not creating new business. Blocking it is a regression.
- **No → `requireAgentWriteAccess(action)`** (full gate): create or advance billable business objects — leases, properties/units beyond tier, applications, credit checks, AI generations, trust/financial postings.

This maps 1:1 onto the "net-new value creation" doctrine and is answerable per-table, not per-route.

**A `gateway()`-on-a-write must be provably intentional.** Every write that uses `gateway()` instead of `requireAgentWriteAccess` MUST be an explicit allowlist entry (const or inline reason) that the server-action census category (`scripts/security/server-action-census.mjs`) can read. Otherwise "intentionally lockdown-free" is indistinguishable from "forgot the gate" — the exact bug class behind the site-content hole (2026-07-02). An ungated-for-lockdown write with no allowlist entry FAILS the census.

**Mixed-class PATCH routes (e.g. `org/details`).** If one route writes both config fields (display name → `gateway()`) and billing-adjacent identity fields (→ lockdown), split the route or gate it to the stricter of the two. Never let a mixed route default to the looser gate.

Source: cookie-client baseline burndown + write-gate ratification (PR #116, 2026-07-02).

**Reference:** `app/(dashboard)/dashboard/page.tsx` (Pattern A). Every `supabase.from(...)` call in it includes `.eq("org_id", orgId)`.

**Anti-pattern (do NOT do this):**

```tsx
const supabase = await createClient()
const { data } = await supabase.from("properties").select("*").is("deleted_at", null)
```

**Correct pattern:**

```tsx
const gw = await gatewaySSR()
if (!gw) redirect("/login")
const { data } = await gw.db.from("properties").select("*").eq("org_id", gw.orgId).is("deleted_at", null)
```

Even though the RLS policies in `pg_policies` are structurally correct (verified 2026-05-27), don't rely on them when the data path goes through the cookie client. Explicit filter is the only deterministic option.

Source: ADDENDUM_DATA_ACCESS_DOCTRINE_2026-05-27.

---

