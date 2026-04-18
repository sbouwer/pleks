# CLAUDE CODE INSTRUCTIONS
# Pleks
# Repository: github.com/sbouwer/pleks

---

## ⚠ MANDATORY: RUN CHECKS BEFORE EVERY COMMIT

Before committing ANY changes, run:

```bash
npm run check
```

This runs `tsc --noEmit` (type check) + `eslint . --max-warnings 0` (lint).

**If it fails, fix the errors before committing.** Do not push code that fails `npm run check`. Do not skip this step. Do not use `--no-verify`.

If you've changed multiple files, run the check after each logical change — don't batch 10 changes and discover 8 errors at the end.

Quick commands:
- `npm run typecheck` — TypeScript only (~15 seconds)
- `npm run lint` — ESLint only
- `npm run check` — both (run this before every commit)

Common errors to watch for:
- Missing imports after moving/renaming files
- Type mismatches when component props change
- Unused variables (ESLint)

---

## ⚠ MANDATORY: USE GATEWAY FOR ALL DB ACCESS

Never use `createClient()` for database queries in server actions or server components.
The cookie-based client does NOT propagate auth to Postgres RLS — `auth.uid()` returns null,
causing silent empty results.

**Always use the gateway helper:**

```typescript
import { gateway } from "@/lib/supabase/gateway"     // server actions
import { gatewaySSR } from "@/lib/supabase/gateway"  // server components

// Server action:
export async function myAction() {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, userId, orgId } = gw

  // ALWAYS filter by orgId — RLS is not protecting you
  const { data } = await db.from("units").select("*").eq("org_id", orgId)
}

// Server component:
export default async function MyPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw
  // ...
}
```

**Rules:**
- `gateway()` for server actions (not cached — one-shot)
- `gatewaySSR()` for server components (React.cache — deduplicates per render)
- Every query MUST include `.eq("org_id", orgId)` — the service client bypasses RLS
- The only valid use of `createClient()` is for `auth.getUser()` — never for data queries
- Always check `{ data, error }` from Supabase queries — never use `(data ?? [])` without logging `error` first
- `any` types leaking through (fix them, don't suppress)
- Missing `key` props in .map() renders

---

## ⚠ MANDATORY: SECURITY AUDIT BEFORE DEPLOYMENT

Before every deployment to production, run the full security audit:

```bash
npm run security
```

This runs 282 tests across 12 security categories:
1. Unauthenticated table access (SELECT/INSERT/DELETE on all sensitive tables)
2. Cross-org data leakage
3. Gateway bypass / org_id injection
4. Public route token security
5. File storage access (bucket listing, predictable paths)
6. Security headers (CSP, X-Frame-Options, HSTS, etc.)
7. RLS policy audit (queries pg_policies — flags USING(true), missing WITH CHECK, RLS disabled)
8. Server action / API route auth (hits every route without cookies)
9. Rate limiting on public routes
10. Webhook signature verification (sends forged payloads)
11. Secrets exposure (service key in NEXT_PUBLIC_, secrets in HTML)
12. IDOR (fake UUIDs on parameterised routes)

**Exit code 1 = CRITICAL findings = deployment blocked.**

**Workflow:**
- First time or after security fixes: `npm run security` (full — ~30s)
- Routine pre-deploy check: `npm run security:quick` (skips INSERT/DELETE and rate limit flood tests — ~10s)
- Single category debug: `node scripts/security/audit.mjs --category 7`

**Rules:**
- Zero critical findings before any deployment. No exceptions.
- If a finding is a false positive (e.g. `prime_rates` intentionally has no RLS because it's read-only public data), the correct fix is to add a read-only RLS policy (`USING (true)` for SELECT, block INSERT/UPDATE/DELETE) — not to remove the test.
- Never disable or skip categories to pass the audit.
- When adding new tables: add RLS + org_id policy immediately. The Category 7 audit will catch you if you forget.
- When adding new API routes: the Category 8 test list in `scripts/security/audit.mjs` must be updated to include the new route.
- When adding new webhook handlers: add signature verification from day one. Category 10 sends forged payloads.
- When adding new public routes: add them to the Category 9 rate limit test list.

**Prerequisites:**
- `npm run dev` must be running (Categories 3, 4, 6, 8–12 test localhost)
- The `get_rls_audit()` SQL function must exist in Supabase (see `scripts/security/setup-rls-audit.sql`)

Quick commands:
- `npm run security` — full audit (run before deploy)
- `npm run security:quick` — quick audit (routine check)

---

## ⚠ MANDATORY: HOW TO WORK WITH MIGRATIONS

**The migration structure is consolidated into 12 domain-scoped files. New
features amend an existing file — they do NOT create new migration files.**

This is the single most important rule for schema work. Read this whole
section before touching `supabase/migrations/`.

### File structure

```
001_foundation.sql           orgs, auth, users, audit, consent, bank accounts, waitlist
002_contacts.sql             contacts master + thin tenant/landlord tables + comm_log
003_properties.sql           properties, buildings, units, inspections
004_leases_financials.sql    leases, charges, trust, payments, deposits, arrears, debicheck
005_operations.sql           maintenance, contractors, applications, municipal, HOA, reports
006_seed.sql                 prime rate history
007_enhancements.sql         scattered ALTERs, comm_preferences, rule_templates, clause seeds
008_enhancements2.sql        further schema adjustments
009_security.sql             RLS hardening, WITH CHECK everywhere, audit helpers
010_platform_features.sql    portal, bank feeds, billing, admin, ownership, lease notes
011_documents_messaging.sql  templates, signatures, WhatsApp, email, storage, comm_log ext
012_property_extensions.sql  furnishings, inspection profiles, insurance, brokers, schemes
```

Prior per-BUILD migrations (old 010–016) were consolidated into the
domain-scoped files above and have been removed.

### Which file does my change belong in?

| Your change touches...                                                                 | Amend this file                    |
|----------------------------------------------------------------------------------------|------------------------------------|
| property/building/unit/inspection/insurance/managing scheme                            | `012_property_extensions.sql`      |
| leases/rent/deposits/arrears/trust/debicheck/lease charges                             | `004_leases_financials.sql`        |
| maintenance/contractors/HOA/applications/municipal/reports/imports                     | `005_operations.sql`               |
| contacts/tenants/landlords/`communication_log` core fields                             | `002_contacts.sql`                 |
| portal/subscription billing/auth/team/admin/ownership/bank feeds/cron health           | `010_platform_features.sql`        |
| documents/templates/signatures/WhatsApp/email/SMS/storage buckets + RLS                | `011_documents_messaging.sql`      |
| reference/seed data (prime rates, clause library, rule templates, system templates)    | `006_seed.sql`                     |
| encryption/RLS hardening/`WITH CHECK` policies                                         | `009_security.sql`                 |
| foundational tables only (orgs, user_orgs, audit_log, consent_log, waitlist) — rare    | `001_foundation.sql`               |

**Do NOT amend** `007_enhancements.sql` or `008_enhancements2.sql`. These are
historical cross-cutting files preserved for replay fidelity. New work goes into
the domain-scoped files above.

When in doubt, pick the file whose purpose most closely matches what you're
adding. It is better to stretch the definition of an existing domain than to
create a new file.

### Amend-forward pattern

Each domain file uses numbered `§N` section headers. New work adds a new
section at the bottom, labelled with the BUILD number:

```sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- §N  BUILD_XX: short description of what this adds
-- ═══════════════════════════════════════════════════════════════════════════════

[schema changes here]
```

After adding a section, re-run the migration against the live DB and verify
with the drift script (below). Fresh DB replays will pick up your new
section automatically when it replays the whole file.

### Idempotency is mandatory

Every migration must be safely re-runnable. Use these patterns:

```sql
-- Tables
CREATE TABLE IF NOT EXISTS foo (...);

-- Columns
ALTER TABLE foo ADD COLUMN IF NOT EXISTS bar text;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_foo_bar ON foo(bar);
CREATE UNIQUE INDEX IF NOT EXISTS idx_foo_uniq ON foo(bar) WHERE bar IS NOT NULL;

-- RLS policies — Postgres has no CREATE POLICY IF NOT EXISTS, so drop first
DROP POLICY IF EXISTS "policy_name" ON foo;
CREATE POLICY "policy_name" ON foo
  FOR ALL USING (...) WITH CHECK (...);

-- CHECK constraints — drop first, then re-add
ALTER TABLE foo DROP CONSTRAINT IF EXISTS foo_bar_check;
ALTER TABLE foo ADD CONSTRAINT foo_bar_check CHECK (bar IN ('a', 'b'));

-- Triggers
DROP TRIGGER IF EXISTS trg_foo ON foo;
CREATE TRIGGER trg_foo BEFORE UPDATE ON foo
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bucket-name', 'bucket-name', false, 10485760, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies on storage.objects — use a DO block that checks pg_policies
-- (storage schema doesn't allow plain DROP POLICY IF EXISTS in all setups)
DO $DOLLAR$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'policy_name'
  ) THEN
    CREATE POLICY "policy_name" ON storage.objects FOR ALL ...;
  END IF;
END $DOLLAR$;
```

Note: in the actual SQL, replace `$DOLLAR$` above with two literal dollar
signs (the Postgres dollar-quote delimiter). Shown as `$DOLLAR$` here only
to survive Markdown rendering in this doc.

**NEVER use raw `CREATE POLICY` without the drop-first guard.** Postgres
errors with `42710: policy already exists` on the second run and aborts
the entire migration at that point, silently leaving everything below it
unapplied. This has bitten us multiple times.

### Drift detection workflow

After any schema change, verify that the migrations file and the live DB
produce identical schemas:

```bash
node scripts/check-schema-drift.mjs
```

Exit clean: `✓ No drift — migrations match the live database.`

If drift is reported, the report lists every difference with copy-paste
SQL to fix it. Always drive drift back to zero before committing.

`schema-drift-report.md` is generated in the project root — it's in
`.gitignore` (don't commit).

### When applying to live DB

Because every file is idempotent, there are only two safe workflows:

1. **Targeted re-run** — if you edited `011_documents_messaging.sql`, run
   just that file's contents in the Supabase SQL editor. Everything already
   in the DB is a no-op; only the new statements take effect.

2. **Full replay (fresh DB or full reset)** — run 001 → 012 in order. Takes
   a minute or two. Ends with a schema identical to what the migration files
   describe.

Never run partial/cherry-picked statements without re-running the drift
check afterwards. Ad-hoc SQL in the editor is the #1 cause of drift.

### When to create a new migration file

**Almost never.** Genuine cases:

- A completely new domain not covered by existing files (e.g. if we added
  a full double-entry accounting subsystem, that might warrant its own file)
- A destructive/irreversible migration that must be isolated for review
  (column drops with data, table renames, type conversions)

Even in these cases, flag the decision before creating the file. Default
is always amend-forward.

---

## BUILD SPECS — READ BEFORE IMPLEMENTING

All build specifications live in `brief/build/`. The master index is `brief/build/INDEX.md`. You can be referenced to as CC - Claude Code and CD - Claude Desktop, can be referenced as the architect / oversight that writes the builds and checks build completion for factual implementation, gaps that might have been created and bugs.

**Before implementing any spec, read the INDEX first** to understand the numbering and relationships. Addendums are named `ADDENDUM_{NN}{letter}_*` where `{NN}` references the parent build.

**Read the actual source files before writing code.** Do not guess at the current state of a file — read it. This is non-negotiable.

---

## CURRENT TASK QUEUE

Work through these in order. Do not skip ahead.

---

### TASK 1 — TESTING FIXES (as bugs are found)

When a bug is identified during manual testing, fix it immediately
before moving to the next task. Common areas to watch:

- Cron routes: ensure CRON_SECRET header check on every cron handler
- PayFast ITN: validate signature before processing any webhook
- RLS: if any data leaks between orgs, fix immediately — this is critical
- Searchworx bundle: ensure foreign national bundle uses correct checks
- FitScore: verify weighted total always sums correctly (0–100)
- Encryption: decrypt before sending to Searchworx API, mask before UI display

---

### TASK 2 — UX POLISH

Read: E:\OneDrive\Websites\pleks\brief\PLEKS_PROJECT_TIMELINE.md
Section: "Phase 3 — UX Polish"

Work through in this order:

A) Empty states
   Every page that fetches a list needs a useful empty state with CTA.
   Pages to check:
     /properties — "Add your first property"
     /tenants — "No tenants yet"
     /leases — "No leases yet"
     /applications — "Create a listing to start receiving applications"
     /maintenance — "No maintenance requests"
     /reports — "No data yet for this period"
     /hoa — "No schemes set up"
     /contractor (contractor portal) — "No jobs assigned yet"

B) Loading states
   Add skeleton loaders (use shadcn Skeleton component) to all
   server-fetched pages. Priority:
     Dashboard (most visited)
     Applications list
     FitScore detail
   
   Add progress indicators for async AI operations:
     Bank statement extraction: "Processing your bank statement..."
     Searchworx check: "Running credit check..."
     DocuSeal generation: "Generating your lease..."

C) Error handling
   Wrap all Searchworx API calls in try/catch.
   On failure: update application.searchworx_check_status = 'failed'
   Create agent alert. Never show a blank screen.
   
   Wrap all Sonnet calls in try/catch.
   On failure: log error, return null for optional AI fields,
   continue flow without blocking.
   
   Add inline validation to:
     SA ID number field: Luhn check before form submit
     File upload: size check (>10MB = error before attempting upload)

D) Mobile audit
   Test these pages at 375px — fix any issues:
     /apply/[listingId] (applicant listing view)
     /apply/[listingId]/details (applicant details form)
     /apply/[listingId]/documents (document upload)
     /apply/[listingId]/status (pre-screen status)
     /contractor/jobs (contractor job list)
     /contractor/jobs/[id] (job detail)
     /inspections (inspection list)

E) Nav badges
   Add unread/action-required counts to navigation:
     Applications: count where stage1_status = 'pre_screen_complete'
                   AND prescreened_by IS NULL (needs review)
     Maintenance: count where status = 'pending_review'
     Arrears: count where arrears_cases.status = 'open'
   Show as small red badge on nav item.
   Only show if count > 0.

---

### TASK 3 — MARKETING WEBSITE

All pages go under app/(public)/ — same Next.js app.
No separate marketing site needed.

Current state:
  app/(public)/page.tsx — 854 byte placeholder
  app/(public)/pricing/page.tsx — basic tier cards, needs upgrade

Build these pages in order:

A) Update app/(public)/page.tsx — Homepage
   
   Audience: SA property agents on TPN RentBook.
   
   Sections (in order):
   
   1. HERO
      Headline: "SA Property Management, Built Right"
      Sub: "Built by someone who's done it for 11 years.
           Free applicant pre-screening. Automated DebiCheck collections.
           Tribunal-ready documentation. Always."
      CTAs: [Start free — 1 unit] [Book a demo]
      No stock photos. Use the Pleks logo mark as a visual element.
   
   2. PAIN POINTS (3 cards)
      "Tired of paying for credit checks that go nowhere?"
        → Pleks: applicants pay R399 at Stage 2. You never pay for a check.
      "Chasing rent manually every month?"
        → Pleks: DebiCheck mandate created with the lease. Runs automatically.
      "What happens at the Rental Housing Tribunal?"
        → Pleks: every inspection, deposit, and arrears letter is logged
          and exportable as a Tribunal bundle.
   
   3. HOW IT WORKS (3 steps)
      1. List your property → applicants apply free
      2. Shortlist → they pay for the credit check, you see the FitScore
      3. Sign digitally → DebiCheck collects → statements auto-generate
   
   4. FEATURES STRIP
      Simple grid of feature names + tier badges:
      FitScore screening | DebiCheck | Inspection PWA | Owner statements |
      Arrears automation | Municipal bills | Deposit reconciliation |
      HOA / Body corporate | Contractor portal | Heritage building support
   
   5. PRICING TEASER
      "Start free. 1 unit. No credit card."
      Link to /pricing
   
   6. CTA FOOTER
      "10 founding agent spots — R299/mo locked for life"
      [Get early access] → /register or Calendly

B) Upgrade app/(public)/pricing/page.tsx
   
   Keep existing tier cards but add:
   - Feature comparison table below the cards
   - Annual toggle (show monthly / annual prices)
   - Annual saving shown: "Save 2 months"
   - FAQ section (5 questions):
     "What counts as a unit?"
     "What happens if I go over my unit limit?"
     "Is the application fee charged to me or the applicant?"
     "Can I cancel anytime?"
     "Do you support trust accounts?"

C) Create app/(public)/for-agents/page.tsx
   TPN RentBook replacement positioning.
   Lead with what's different, not what's the same.
   Key message: "Everything TPN does, plus what it should have done."
   
   Sections:
   - Screening: applicants pay, you get FitScore (not raw credit report)
   - Collections: DebiCheck built-in, no separate integration
   - Compliance: POPIA, RHA, CPA handled — not your problem
   - Financials: SARS-ready statements, one click
   - Multi-building: heritage + new build on same erf

D) Create app/(public)/privacy/page.tsx
   POPIA privacy notice. Required before launch.
   Reference this in the applicant consent flow.
   
   Include:
   - What personal information we collect
   - Why we collect it (purpose — rental application processing)
   - Who we share it with (Searchworx for credit checks, named explicitly)
   - How long we retain it
   - Data subject rights (access, correction, deletion, objection)
   - Information Officer contact details
   - How to lodge a complaint with the Information Regulator

E) Create app/(public)/terms/page.tsx
   Terms of service. Keep simple for now.
   Cover: user obligations, payment terms, cancellation, liability limits.

F) Create app/(public)/credit-check-policy/page.tsx
   Referenced from applicant consent screen in BUILD_14/16.
   Explains: what Searchworx checks, why, consent rights, POPIA basis.

---

### TASK 4 — OPT-IN LANDING PAGE

Build before starting outreach. A clean, simple page for email capture.

Create app/(public)/early-access/page.tsx

Content:
  "Pleks is launching soon"
  "SA property management built from 11 years of doing it.
   Join the waitlist for founding agent pricing."
  
  Form: Email + "I am a: [Agent ▼] [Landlord] [Property Manager]"
  Submit button: "Get early access"
  
  Below form:
  "By submitting, you consent to receive emails about Pleks.
  Unsubscribe anytime. We respect your privacy." (link to /privacy)

On submit:
  The `waitlist` table already exists in `001_foundation.sql` — use it.
  Do NOT create a new migration. Store email + role there.
  (Alternative: Resend Audiences API to add them directly to a Resend list.)
  Send a confirmation email: "You're on the list — we'll be in touch"
  Show success message: "You're on the list!"

NOTE: This is the only legally clean way to build a marketing email list
under POPIA. Do not add emails without this explicit opt-in.

---

## SUPABASE QUERY ERROR HANDLING — MANDATORY

**Never use `(data ?? [])` without checking `error` first.**

The Supabase JS client returns `{ data: null, error: { code, message } }` on any query failure — including a missing column (Postgres error 42703). The `?? []` fallback silently converts this to an empty array, making it look like the table is empty when the query is actually crashing.

```ts
// ❌ WRONG — masks query failures silently
const { data } = await supabase.from("units").select("id, access_instructions")
return data ?? []

// ✅ CORRECT — surface errors explicitly
const { data, error } = await supabase.from("units").select("id, access_instructions")
if (error) {
  console.error("fetchUnits failed:", error.message)
  return []
}
return data ?? []
```

This applies everywhere: server pages, server actions, client queries, route handlers. A missing column, wrong RLS policy, or typo in a column name will return `data: null` — not an error you can see without checking.

**Real incident:** The maintenance page showed no units for weeks because `access_instructions` was selected but never migrated. Every query returned `{ data: null, error: { code: "42703" } }`. The `?? []` fallback made it look like an empty list.

---

## KEY CONSTANTS (unchanged — do not modify)

APPLICATION_FEE_CENTS = 39900         // R399
JOINT_APPLICATION_FEE_CENTS = 74900   // R749
INCOME_AFFORDABILITY_THRESHOLD = 0.30

Supabase key name: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
(not ANON_KEY — match this exactly)

---

## SECURITY RULES (unchanged — still apply to any new code)

1. org_id on every new table
2. RLS on every new table
3. audit_log on every state change
4. consent_log for any new POPIA-sensitive operation
5. Encrypt before INSERT, decrypt after SELECT for all PII fields
6. Mask before display — never show raw decrypted ID/account in UI
7. No PII in console.log, no PII in audit_log values

---

## AI MODEL ROUTING (unchanged)

Haiku 4.5:  triage, classification, SMS copy
Sonnet 4.6: income extraction, FitScore, lease drafting, arrears comms,
            deposit justifications, municipal extraction, AGM notices
Opus 4.6:   Tribunal submissions, LODs, eviction notices (Firm tier only)

---

## DO NOT DO

- Do not deploy without running `npm run security:quick` first
- Do not commit without running `npm run check` first
- Do not create new migration files — amend the existing domain file (see MIGRATIONS section)
- Do not use raw `CREATE POLICY` without `DROP POLICY IF EXISTS` first — it aborts the migration
- Do not apply ad-hoc SQL to the live DB — put it in the appropriate migration file instead
- Do not change existing RLS policies without flagging it
- Do not add new npm packages without checking if an existing
  package already covers the use case
- Do not use ANON_KEY — the correct env var is
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
