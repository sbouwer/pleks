---
paths:
  - "supabase/migrations/**"
  - "supabase/seed/**"
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

