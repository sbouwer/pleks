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

When building any feature that touches subscription state, apply this rule.
A cancelled agency must always be able to access, export, and read their 
historical data. They cannot create new business.

---

