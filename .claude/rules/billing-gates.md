---
paths:
  - "lib/billing/**"
  - "lib/subscriptions/**"
  - "lib/tier/**"
  - "lib/trial/**"
---

## "YOUR DATA, ALWAYS" DOCTRINE

Subscription gating only applies to net-new value creation.

**Always on, regardless of subscription state (including paused/cancelled):**
- Reads of existing data
- Exports (PDF, CSV, audit bundles)
- Audit log access
- Scheduled notifications for legally required events

**Gated by active subscription:**
- Creating new leases
- Adding new properties/units beyond tier limit
- Running new credit checks
- Generating new AI outputs

**UNENFORCEABLE** — same gap identified in `.claude/rules/data-access.md`: the server-action census (Cat-15) requires SOME gate on a "use server" module, not the CORRECT one for this table. A read gated with `requireAgentWriteAccess` (over-gating a "your data, always" surface) or a write gated with bare `gateway()` (under-gating net-new value creation) both pass the census identically — it cannot see which side of this list a table falls on.

When building any feature that touches subscription state, apply this rule.
A cancelled agency must always be able to access, export, and read their 
historical data. They cannot create new business.
**UNENFORCEABLE** — same net-new-value-creation classification judgement as above; not derivable from a table/route name alone.

---

