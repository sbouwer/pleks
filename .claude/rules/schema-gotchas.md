---
paths:
  - "supabase/**"
  - "lib/actions/**"
  - "lib/queries/**"
  - "app/api/**"
---

## KNOWN SCHEMA GOTCHAS

These are real constraints that cause non-obvious bugs. Check before writing migrations or queries.

- `user_orgs.role` CHECK now only requires a **non-empty string** (relaxed for the RBAC role library — ADDENDUM_RBAC). The five *permission-bearing* system slugs are `owner / property_manager / agent / accountant / maintenance_manager`; any other value (e.g. `office_manager`, a custom slug) is a valid **title** but carries no built-in permissions. `admin` is the `is_admin` boolean, not a role. Role definitions + capabilities live in `org_roles` (010 §43) + `lib/auth/capabilities.ts`
- `auth.users` has no unique constraint on email — `ON CONFLICT (email)` will fail. Use SELECT-first pattern to check existence before INSERT
- `maintenance_delay_events.delay_type` CHECK does not include `parts_unavailable` — do not add it without a migration first

**UNENFORCEABLE** — MECHANISABLE (rung: check · blast: schema) — these are orientation ("known gotchas to check before writing migrations or queries") rather than a single checkable property; the closest mechanisable slice is the second bullet — sketch: flag an `.upsert`/`ON CONFLICT` call targeting `auth.users` by `email` — but none exists today.

### Applicant ≡ Tenant (no separate applicant entity)

An applicant is a tenant in a pre-lease lifecycle state. There is **no `applicants` table** and **no `applicant_id` column** anywhere in the schema. When you need to identify the natural person behind an application, use these references:

| What you need | Use | Notes |
|---|---|---|
| Primary applicant identity | `applications.tenant_id` → `tenants(id)` | Canonical FK. `tenants.auth_user_id` → `auth.users(id)` for the linked user account. |
| Primary applicant natural-person fields | `applications.first_name`, `last_name`, `id_number`, `applicant_email`, etc. | Denormalised onto the `applications` row for application-stage workflow. Treat as a snapshot — `tenants` is the canonical record. |
| Co-applicant identity (residential) | `application_co_applicants.contact_id` → `contacts(id)` | Added in BUILD_14 v2. Same denormalisation pattern — natural-person fields also on the co-applicant row. |
| Surety director identity (commercial) | `application_directors.co_applicant_id` → `application_co_applicants(id)` | Each director is also a co-applicant entry; identity ultimately resolves via the co-applicant's `contact_id`. |
| Active user account (for capability checks, RLS, audit) | `auth.users(id)` via `tenants.auth_user_id` | The user-account binding only exists once the tenant has logged in / been invited. |

**Anti-patterns to never use:**

- `applications.applicant_id` — does not exist. Use `tenant_id`.
- `applications.applicant_user_id` — does not exist. Use `tenants.auth_user_id` via `tenant_id` join.
- A separate `applicants` table — does not exist. Applicants and tenants are one table.
- Treating co-applicants as a row in `tenants` directly — co-applicants live in `application_co_applicants` (eventually linked to `contacts.id`). They become tenants only on lease activation.

**UNENFORCEABLE** — MECHANISABLE (rung: check · blast: schema) — PARTIAL, mechanically. The first two bullets name COLUMNS that don't exist, so a query referencing them fails at the database (PostgREST 42703) and — if the call site's `{ data, error }` is checked per `pleks/require-supabase-error-check` (tagged in CLAUDE.md's DB ACCESS section) — surfaces as a real, visible error rather than a silent `null`. That is real but REACTIVE (it fails at query time, not at write time). The third and fourth bullets (no separate `applicants` table; co-applicants never inserted directly into `tenants`) describe an absence, which nothing can positively check for. Sketch: verify (or extend) `schema-contract-scan.mjs` (manifest-driven, already in `npm run check`) to statically flag a `.select`/`.eq` referencing `applications.applicant_id` or `applications.applicant_user_id` — not independently verified in this pass whether it already does.

This convention is documented in the schema itself at `005_operations.sql:2379`: *"applicant = tenant without a lease; link is `applications.tenant_id` → `tenants.auth_user_id`."*

When a spec or ticket needs "the data subject for an application", the resolution chain is:
```ts
const { tenant_id } = await db.from('applications').select('tenant_id').eq('id', applicationId).single()
const { auth_user_id } = await db.from('tenants').select('auth_user_id').eq('id', tenant_id).single()
// auth_user_id is the auth.users row to scope POPIA s23, capability checks, audit, etc.
```

---

