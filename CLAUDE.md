# CLAUDE CODE INSTRUCTIONS
# Pleks
# Repository: github.com/sbouwer/pleks

---

## CONNECTED MCP SERVERS

All of the following are connected and available in every session. Use them directly — no setup needed.

| Server | Capability |
|--------|-----------|
| **GitHub** (`sbouwer/pleks`) | PRs, issues, CI runs, code search, branch management |
| **Supabase** | Execute SQL, apply migrations, get logs, list tables, check advisors |
| **Vercel** | List/check deployments, build logs, runtime logs, project info |
| **Figma** | Read designs, get screenshots, convert designs to code |
| **Gmail** | Search threads, create drafts (bouwer.stean@gmail.com) |
| **Google Calendar** | Read/create/update events |
| **Google Drive** | Read, search, and create files |

Default to using these instead of asking the user to copy-paste data. For example: check GitHub for open PRs rather than asking; check Vercel for deployment status rather than asking; query Supabase directly rather than asking for schema details.

---

## ⚠ MANDATORY: FILE HEADERS

Every `.ts`, `.tsx`, and `.yml` file must have a filled-in header. Rules:

- **Touch a file with a stub header (contains `FILL:`)** → fill it in before committing. Replace every `FILL:` line with real content; delete unused placeholder lines.
- **Update a file that already has a filled header** → update the header if the purpose, route, auth, or data source has changed.
- **Create a new file** → write the header filled in from the start. Never commit a `FILL:` stub.

TS/TSX format:
```ts
/**
 * app/path/to/file.tsx — one-line purpose
 *
 * Route:  /the/url (omit if not a page)
 * Auth:   what gate protects it
 * Data:   where data comes from
 * Notes:  gotchas or non-obvious decisions (omit if none)
 */
```

YAML format:
```yaml
# .github/workflows/example.yml
# One-line purpose.
# Trigger: push to main
# Auth:    GITHUB_TOKEN / secrets used
# Notes:   any gotchas (omit if none)
```

Delete any lines that don't apply (e.g. omit `Route:` for a utility library, omit `Notes:` if there's nothing worth saying).

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

## ⚠ MANDATORY: DB ACCESS AND AGENT WRITE GATE

Never use `createClient()` for database queries in server actions or server components.
The cookie-based client does NOT propagate auth to Postgres RLS — `auth.uid()` returns null,
causing silent empty results.

**Use the right helper for the right situation:**

```typescript
// Agent WRITE (any mutation — create, update, delete, state transition, AI action)
// Throws SubscriptionLockdownError (403) if org is paused or cancelled (ADDENDUM_57G)
import { requireAgentWriteAccess } from "@/lib/auth/server"

export async function createLease(formData: FormData) {
  const gw = await requireAgentWriteAccess("create_lease")
  const { db, userId, orgId } = gw
  // proceed — org is active and user is authenticated
}

// Agent READ (queries, exports, reads — no lockdown gate)
import { gateway } from "@/lib/supabase/gateway"     // server actions
import { gatewaySSR } from "@/lib/supabase/gateway"  // server components

export async function getLeases() {
  const gw = await gateway()
  if (!gw) return []
  const { db, orgId } = gw
  // reads always work regardless of subscription state
}

export default async function MyPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw
}
```

**Rules:**
- `requireAgentWriteAccess(action)` for ALL agent-side mutations — never bare `gateway()` on a write path
- `gateway()` for server action reads (not cached — one-shot)
- `gatewaySSR()` for server component reads (React.cache — deduplicates per render)
- Cron and webhook handlers: do NOT use `requireAgentWriteAccess` — they fire regardless of subscription state
- Tenant/landlord/supplier portal actions: use `getTenantSession()` — not subject to agent lockdown
- Every query MUST include `.eq("org_id", orgId)` — the service client bypasses RLS
- The only valid use of `createClient()` is for `auth.getUser()` — never for data queries
- Always check `{ data, error }` from Supabase queries — never use `(data ?? [])` without logging `error` first
- `any` types leaking through (fix them, don't suppress)
- Missing `key` props in .map() renders

---

## ⚠ MANDATORY: CONVENTIONAL COMMIT MESSAGES

Every commit to `main` drives semantic-release. Release notes and version bumps
are generated from commit messages. Format matters.

**PR titles** (which become the squash-merged commit on `main`) MUST follow:

  <type>(<scope>)?: <subject>

Allowed types and their release effect:

| Type       | Release        | Use for                                     |
|------------|----------------|---------------------------------------------|
| `feat`     | minor          | New user-visible feature                    |
| `fix`      | patch          | Bug fix                                     |
| `perf`     | patch          | Performance improvement                     |
| `refactor` | no release     | Code change without behaviour change        |
| `chore`    | no release     | Tooling, config, dependency updates         |
| `docs`     | no release     | Documentation only                          |
| `test`     | no release     | Adding or fixing tests                      |
| `build`    | no release     | Build system or external deps               |
| `ci`       | no release     | CI/CD configuration                         |
| `style`    | no release     | Code style (not CSS) — whitespace, linting  |
| `revert`   | patch          | Revert a previous commit                    |

Breaking changes: add `!` after type (e.g. `feat!: rename /portal to /tenant`)
AND a `BREAKING CHANGE:` footer in the commit body explaining the migration.

Subject line: lowercase, imperative, under 72 chars, no trailing period.

Examples:
- `feat: add passkey enrolment to settings`
- `fix(auth): reject expired step-up challenges`
- `chore(deps): bump @supabase/ssr from 0.9.0 to 0.10.0`
- `feat!: move /portal URLs to /tenant`

The `pr-title` CI job rejects PRs whose titles don't match. PR titles can be
edited after opening — edit, don't force-push.

---

## ⚠ MANDATORY: VERSION-AWARE COMMITTING

This project uses **semantic-release** driven by GitHub. Every squash-merge to
`main` can create a GitHub Release and bump the version — so commit type is
a versioning decision, not just a label.

**Before every commit, ask:**
- Is this a user-visible new feature? → `feat` (minor bump)
- Is this fixing broken behaviour? → `fix` (patch bump)
- Is this internal cleanup with no behaviour change? → `refactor` / `chore` (no release)
- Does it break existing behaviour or URLs? → add `!` and a `BREAKING CHANGE:` footer

**Commit message discipline:**
- Subject line must be meaningful in a changelog: "fix contact form submit"
  not "fix stuff"
- Include scope when it narrows the blast radius: `fix(auth):`,
  `feat(billing):`
- Imperative mood: "add resolver-owned welcome" not "added" or "adds"
- Branch commits are squash-merged, so each branch PR = one changelog entry;
  write the PR title as the changelog line you want users to see

**GitHub Releases are the changelog.** Consumers of this repo (and Stéan
reviewing releases) read GitHub Releases to understand what shipped. Make
every commit title worth reading there.

---

## Git rhythm — when to commit, when to push

The remote history is documentation, not a save game. Each commit on `main`
should represent a complete, testable unit of work — not a stream of
micro-checkpoints. Each push should be a batch of commits that has been
locally verified green.

### What counts as one commit

A commit groups all the file changes needed for ONE coherent change to behave
correctly. The test:

- Could I revert this single commit and leave the repo in a working state?
- Does the message describe a real behavioural delta, or just "wip" / "more
  changes"?

**Interdependent files belong in ONE commit.** A type change in `decisions.ts`
that requires updates to `facts.ts` and `decisions.test.ts` is one commit, not
three. Splitting interdependent changes produces commits that don't typecheck
individually — useless for `git bisect` and noisy in review.

**Unrelated concerns in one file = multiple commits.** If a single file change
contains an auth fix AND a JSDoc tidy AND a style nit, stage them separately
with `git add -p` and commit them as three.

### What's NOT a commit

- Mid-implementation, code written but not tested. Not a commit yet.
- A fix attempt that hasn't been verified. Not a commit.
- "Just in case I lose my changes." Use `git stash` or a local WIP branch.
- Same logical change as the previous commit, with a tweak. **AMEND**
  (`git commit --amend`) — do not pile on `fix: oops` and `fix: oops again`.

### Push is a separate verb

Commit and push are different gates with different bars.

- Do not push after every commit. Push when a logical unit of work — usually
  one or several related commits — is COMPLETE and TESTED locally.
- Multiple commits pushed together is normal and good. Related work arrives
  on the remote as a coherent unit.

### Mandatory pre-push checklist

Before every `git push`, in order:

1. `npm run check:full` (typecheck + lint + architecture audit + security:db) — **must be green**
2. `npm test` — **must be green**
3. For behavioural changes (routing, auth, UI, data): manually walk the
   affected flow in dev. Console errors count as failures.
4. Each commit message describes the actual change in imperative mood

If any step fails, fix it locally and **AMEND** the relevant commit before
pushing. Don't pile fix commits on top of broken commits — squash them in.

The current anti-pattern this kills: commit → push → see error → commit fix →
push → see error → commit fix → push. Each cycle is a partial deploy that
Vercel/Sentry/CI react to. The local gate is supposed to catch what the remote
was catching.

### Amend vs new commit

- **Amend** when fixing the SAME logical change you just committed but
  haven't pushed yet: typo in code you just wrote, missed a file, test
  failure that's clearly part of the change.
- **New commit** when the change is a different concern, even if it touches
  the same file.

Once a commit is pushed, treat it as immutable. Do not force-push to `main`.
A pushed commit with a problem is fixed forward with a new commit.

### Announce push intentions

For non-trivial work — anything spanning multiple commits, or any change
touching auth/routing/data — state the push intention in chat before
pushing:

> "Ready to push 3 commits: A, B, C. Verified locally: `npm run check`
> green, `npm test` green, walked the signup flow end-to-end with no
> console errors. OK to push?"

This gives Stéan a chance to say "hold, I want to walk it first" without
the work already being on the remote. Trivial commits (typo fixes, doc
tweaks, JSDoc-only changes) can skip this step.

### When tests genuinely can't run before push

Rare but real:
- Vercel preview deploys (env-specific endpoints, prod-only integrations)
- Supabase migrations that need to land remotely before code that uses them
- DNS / CSP / cookie behaviour that's domain-dependent

For these:
- Document in the commit body WHY local testing wasn't possible
- Mention in chat before pushing
- Never use "can't test locally" as a general escape hatch — 95%+ of changes
  can and should be tested before push

### What this looks like

Bad — current pattern:
fix: welcome_seen
fix: also reset on upsert
fix: privacy cookie httpOnly
fix: privacy cookie actually fix
fix: skeleton flicker
fix: skeleton wrong colour

Good — same work, properly batched and amended:
fix(auth): reset welcome_seen on upsert + privacy cookie client-readable
fix(onboarding): gate wizard on authChecked to kill type-selection flicker
fix(onboarding): replace bg-muted skeleton with warm-toned ob-skel

Three coherent commits, each testable and revertable, each describing a
real change. Pushed together as one batch after the pre-push checklist
came back green.

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

**After completing or making meaningful progress on any build or addendum, update `brief/build/INDEX.md`:**
- Change the status emoji (📝 → ✅, or note partial progress)
- Update the "Last updated" line at the top with today's date and a one-line summary
- Update the relevant row in the addendum/build table with what shipped, what's deferred, and any open work
- Update the "Known open work" paragraph if the build changes what's pending

**Read the actual source files before writing code.** Do not guess at the current state of a file — read it. This is non-negotiable.

---

## KNOWN SCHEMA GOTCHAS

These are real constraints that cause non-obvious bugs. Check before writing migrations or queries.

- `user_orgs.role` CHECK constraint only allows: `owner / property_manager / agent / accountant / maintenance_manager` — `admin` is not valid and will fail silently
- `auth.users` has no unique constraint on email — `ON CONFLICT (email)` will fail. Use SELECT-first pattern to check existence before INSERT
- `maintenance_delay_events.delay_type` CHECK does not include `parts_unavailable` — do not add it without a migration first

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

This convention is documented in the schema itself at `005_operations.sql:2379`: *"applicant = tenant without a lease; link is `applications.tenant_id` → `tenants.auth_user_id`."*

When a spec or ticket needs "the data subject for an application", the resolution chain is:
```ts
const { tenant_id } = await db.from('applications').select('tenant_id').eq('id', applicationId).single()
const { auth_user_id } = await db.from('tenants').select('auth_user_id').eq('id', tenant_id).single()
// auth_user_id is the auth.users row to scope POPIA s23, capability checks, audit, etc.
```

---

## TIER MODEL (post-April 2026 — locked)

| Tier | Price | Lease limit |
|------|-------|-------------|
| Owner | Free | 1 |
| Steward | R699/mo | 15 |
| Growth | R1,199/mo | 30 |
| Portfolio | R2,599/mo | 75 |
| Firm | R4,499/mo | 150 |
| Bespoke | Custom | Custom |

No per-user seat caps on any tier — lease count is the only gate.
Annual pricing not yet live. Bespoke/white-label deferred until first enterprise customer.

---

## CURRENT WORK — WHERE TO LOOK

Do not rely on this file for task status. It changes daily.

**Before every session:**
1. Read `brief/build/INDEX.md` — source of truth for build status, queue order, 
   and all known open work
2. Check the "Latest shipped" and "Queue" lines at the top of INDEX.md
3. Check the "Known open work" section — items there are confirmed gaps that 
   need addressing, not future ideas
4. Read the actual spec file before implementing anything — never guess at intent
5. Read `brief/build/CURRENT.md` — session state. What step is active, 
   what was just done, what the next action is, any mid-build decisions.
   This is what INDEX.md cannot carry.

**How builds and addendums work:**
- Builds: `brief/build/BUILD_{NN}_{NAME}.md`
- Addendums: `brief/build/_ADDENDUM/ADDENDUM_{NN}{letter}_{NAME}.md`
- {NN} in an addendum references its parent build number
- CD (Claude Desktop) authors specs; CC (Claude Code - you) implements them
- After completing meaningful work, update INDEX.md: status emoji, 
  "Last updated" line, and any new open work discovered during implementation

**If a spec is ambiguous or conflicts with existing code:**
- Do not guess or fill in the gaps yourself
- Flag the ambiguity explicitly and stop — do not implement around it
- CD resolves architecture questions; CC implements confirmed decisions

---

## MAINTAINING CURRENT.md

`brief/build/CURRENT.md` is your working memory. It survives compaction because it is written to disk.

**Update it after every meaningful step — before committing:**
- Set "Active work" to the current build + step
- Move completed items into "Just completed" (one line each)
- Set "Next action" to the exact thing CC should do next
- Record any mid-build decisions not captured in the spec
- Record any files that should not be touched
- Record any bugs or issues discovered

**On compaction or new session:** read CURRENT.md first. It tells you where you are. Do not ask Stéan to re-explain — the answer is in the file.

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

## PROXY.TS — Next.js 16 Middleware Rename

In Next.js 16, `middleware.ts` was deprecated and renamed to `proxy.ts` to better
reflect its role as a network boundary for rewriting, redirecting, and header
manipulation rather than general server-side logic. The default export also changed
from `middleware` to `proxy`.

**`proxy.ts` at the project root IS the Next.js middleware.** Do NOT create a new
`middleware.ts` file — it is deprecated in Next.js 16 and will not be picked up.

`proxy.ts` handles (in order):
1. Webhook/cron bypass — `WEBHOOK_PREFIXES` skip all gates; handlers validate their own secrets
2. Admin API gate — `/api/admin/*` checked for HMAC token before reaching the handler
3. Subdomain split (production only) — hostname-based 308 redirects and rewrites
4. Manifest lookup — `ROUTE_MANIFEST` drives auth requirements per route prefix
5. Supabase session refresh — `updateSession()` on all authenticated routes
6. AAL2 enforcement — MFA check on agent workspace routes
7. Portal role gate — `pleks_active_role` cookie check for tenant/landlord/supplier portals
8. Org cookie hydration — `pleks_org` + `pleks_has_org` cookies set/refreshed per request

When any spec references "middleware" or "the proxy layer" — the implementation lives in
`proxy.ts`. When ADDENDUM_62A references signal points in `proxy.ts`, that means the
middleware layer. Never split this into a separate `middleware.ts`.

---

## CRON ARCHITECTURE — SPLIT BETWEEN VERCEL AND CPANEL

**Not all cron jobs run from `vercel.json`.** The Vercel Hobby plan allows only 1 cron
entry, so high-frequency jobs are triggered externally via cPanel curl crons on the
Yoros hosting account (`yoroscoz` user).

### vercel.json (once daily, 05:00 UTC)
Single entry: `/api/cron/daily` — orchestrates all truly-daily jobs sequentially.

### cPanel external crons (yoroscoz hosting)
These jobs were moved out of the daily orchestrator to run at higher frequency:

| Job | Endpoint | Cadence | HTTP method |
|-----|----------|---------|-------------|
| mandatory-retry | `/api/cron/tenant-comms/mandatory-retry` | Every 1h | POST |
| screening-line-runner | `/api/cron/screening-line-runner` | Every 15m | GET |
| bank-feed-sync | `/api/cron/bank-feed-sync` | Every 4h | GET |
| arrears-sequence | `/api/cron/arrears-sequence` | Every 4h | GET |
| maintenance-delay-check | `/api/cron/maintenance-delay-check` | Every 4h | GET |
| check-links | `/api/cron/check-links` | Every 4h | GET |

All use the same `x-cron-secret` header auth as Vercel-triggered jobs.

**When adding a new cron job**, decide:
- Once daily is fine → add to `app/api/cron/daily/route.ts` orchestrator
- Needs higher frequency → add a cPanel curl entry AND document it in this table
- Monthly → add to the `dayOfMonth === N` gate in `daily/route.ts`

**Do not add a second entry to `vercel.json`** — Hobby plan only supports 1.

---

## AI MODEL ROUTING (unchanged)

Haiku 4.5:  triage, classification, SMS copy
Sonnet 4.6: income extraction, FitScore, lease drafting, arrears comms,
            deposit justifications, municipal extraction, AGM notices
Opus 4.6:   Tribunal submissions, LODs, eviction notices (Firm tier only)

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

## INSPECTION PHOTO DISCIPLINE

Photos must be compressed **client-side** before upload. Never server-side.

- Canvas compression: 1920×1440 max, 70% JPEG quality, ~300KB target
- EXIF extraction (GPS coordinates + timestamp) happens BEFORE compression
- GPS and timestamp stored separately as tamper-evident metadata
- The compressed photo is what goes to Supabase Storage
- The original full-resolution photo is never uploaded

This is non-negotiable for two reasons:
1. Storage cost — modern phone images at full resolution make inspection 
   storage untenable at scale
2. Legal — GPS/timestamp extracted from original EXIF before compression 
   are the evidence chain for Tribunal submissions. Post-compression 
   metadata cannot be trusted.

`sharp` (bundled via `next/image`) is a server-side safety net only — 
it should never be the primary compression path.

---

## TRUST ACCOUNT — REQUIRED READING

**Before any trust-related work, read `brief/legal/TRUST_ACCOUNT_POSITIONING.md`.**

This is non-negotiable. The document defines the load-bearing architectural invariant
(D-TRUST-01: Pleks is not the trustee) enforced at schema, code, and ESLint levels.
The new developer checklist is in §8 of that document.

---

## FITSCORE PRIMITIVE PARITY — REQUIRED READING

**Before any work touching `lib/reports/screening/_pdf/primitives/` or `lib/reports/screening/_web/primitives/`, read §10.7 of `brief/build/_ADDENDUM/ADDENDUM_14H_FITSCORE_DELIVERY.md`.**

This is non-negotiable. The §10.7 doctrine defines the tribunal-match invariant (the agent-side dashboard surface is a parallel rendering of the same evidentiary content as the archived PDF report-of-record, not a summary of it) and the parity-atomic enforcement rule: any PR modifying a file under `_pdf/primitives/` must include a corresponding change to the matching file under `_web/primitives/` in the same change-set (and vice versa), modulo the paginated-chrome exclusion list (`DocumentShell`, `RunningHeader`, `PageFooter`, `Watermark`).

Same load-bearing pattern as D-TRUST-01 — codified-everywhere discipline, not case-by-case judgement. CI enforcement is deferred per §11.20 of the same addendum; until then, the discipline is code-review plus the F.2 acceptance checklist.

---

## MARKETING VOICE — REQUIRED READING

Pleks does not market benefits. Pleks markets **constraints**.

The public-facing surfaces work because they read like operational doctrine
leaking into public marketing — not because they sound exciting. Cold,
attested, infrastructural tone is the moat against the legacy-incumbent
register of trapped data, hidden fees, and silent retention.

This voice is project-level discipline, not Charter-specific. It applies to
every public-facing surface: homepage, feature pages, sales collateral,
email templates, the FIC compliance pitch when that becomes a marketing
surface, and every new public page added going forward.

**Anti-patterns — never apply to Pleks public surfaces:**
- Softening copy toward generic trust language ("we value your partnership",
  "customer-first", "built for you")
- Emotional escalation against competitors ("trap, squeeze, hostage") as
  attack vocabulary — only acceptable when describing what Pleks itself
  refuses to do
- Marketing-funnel-style anti-competitor confrontation
- "Startup-y" register — fresh, modern, smart, sleek, intuitive, seamless,
  effortless, etc.
- Generic SaaS virtue claims ("no silos", "all-in-one", "end-to-end")
- Aspirational architectural claims unsupported by linked substantiation
- Adding pricing/funnel content that breaks the operational-doctrine register

**Patterns to preserve:**
- Architectural irreversibility framing ("We removed the pipes")
- Specific, falsifiable claims with linked substantiation pages
- ATTESTED-style operational commitments rather than aspirational promises
- Fear-naming with restraint ("blacklist", "collateral", "hostage") used
  only to describe what Pleks refuses to do, never to attack competitors
  directly
- Quasi-legal artefacts (seals, charters, registers, attestations) backed
  by operational reality on the linked pages — the seal rhetoric must
  remain operationally defensible
- Counts and metrics that match their backing data sources exactly (drift
  between marketing copy and live data is a Tribunal-defensibility risk,
  not a typo)

**The substantiation invariant (load-bearing):**

The moment public copy uses ATTESTED, regulator references, architectural
claims, retention guarantees, or operational constraints — the linked
substantiation pages become part of the product surface. The danger is
never that the marketing is too strong; it is that the marketing is
specific enough that inconsistency between the claim and the backing page
becomes discoverable. Every public claim ships with its substantiating
destination, and the two must match.

**The Truth Pipeline (load-bearing):**

Operational truth originates once, in domain-owned structured data; surfaces render from that source; CI defends the rendering. Counts, lists, retention periods, notification windows, sub-processor identities, and structured legal references are derived facts, not authored content. The pattern generalises the dates-on-homepage automation, the parity-atomic invariant (§11.20), and the D-TRUST-01 architectural invariant into a single class. Public-facing fact drift becomes impossible by construction once the source is unique and the consuming surface derives from it. See ADDENDUM_00J for the SSOT module structure, CI script, and migration sequence.

**The evidentiary-doctrine standard for Charter substantiation (load-bearing):**

Every Charter card that claims an architectural constraint must substantiate at the linked page with a four-layer evidentiary structure: Database (RLS or schema constraint), Application (invariant guard or gateway binding), Codebase (ESLint rule or code review requirement), Integration (what does not exist and cannot be compromised). A prose paragraph explaining what is enforced is not sufficient — the structure must make the claim falsifiable layer-by-layer. §01 (trust account, /for-agents/trust-account#architecture) and §07 (agency isolation, /popia-register#fitscore-isolation) are the reference implementations. Any future Charter commitment that claims architectural enforcement must add a substantiation section following the same structure before the card ships.

**The Charter test:** if a proposed copy edit could appear in WeConnectU,
PropWorx, or RedRabbit's marketing without seeming out of place, it does
not belong on a Pleks public surface. The voice should be impossible to
confuse with legacy-incumbent register.

Source: BUILD_66 Charter shipping + second-opinion review (2026-05-25).
Codified at project level so future public-surface decisions can be
evaluated against named principles rather than re-litigated each time.

---

## LEGAL DOCS JSX DISCIPLINE

In every legal page under `app/(public)/` — terms, privacy, popia-register, credit-check-policy,
cookie-policy, paia-manual, definitions — bolded labels must use the explicit JSX space expression,
never a bare literal space:

```tsx
// Correct — survives line-wrap, formatters, and str_replace edits
<strong>Label.</strong>{" "}Following text here.

// Wrong — space can be silently stripped at JSX line boundaries
<strong>Label.</strong> Following text here.
```

The `{" "}` is semantically identical but immune to three failure modes:
1. JSX whitespace stripping when a formatter or str_replace wraps the line
2. Prettier/biome reformatting
3. Copy-paste artefacts when inserting bold labels via str_replace

**This applies to any element immediately followed by descriptive text** — including
`</strong>`, `</span>`, `</em>` — wherever a space is needed between an inline element
and adjacent prose at a potential line boundary.

Source: ADDENDUM_LEGAL_DOCS_SPACING_2026-05-27.

---

## Data access in pages, server components, and server actions

**Cookie client (`createClient()`) is for `auth.getUser()` ONLY.** Never call `.from(...)` on its result. RLS does not reliably propagate `auth.uid()` to Postgres from the cookie client in Next.js server components; queries through this client return empty for new users whose session state has not warmed.

**Server components and pages: use `gatewaySSR()`.** Returns `{ db, userId, orgId, role }`. Every query through `db` MUST include `.eq("org_id", orgId)` explicitly. The service-role client bypasses RLS; the explicit filter IS the org boundary.

**Server actions: use `gateway()` or `requireAgentWriteAccess(action)`.** Same shape, same rules. `requireAgentWriteAccess` additionally enforces the subscription lockdown gate.

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

## Single-Pass Auth Doctrine (ADDENDUM_AUTH_RESOLVER_SELF_REFERENCE_FIX_2026-05-27)

**Rule:** `/auth/resolver` produces exactly ONE routing decision per call. Every URL it returns redirects to the user's actual final destination (or a transient auth state with the final destination preserved in `?redirect=`). The resolver MUST NOT appear in any `?redirect=` value it forwards. The transient auth states (`/login/mfa`, `/settings/security/enrol-totp`, `/onboarding`) MUST navigate directly to the final destination on success — never back through the resolver.

**Rationale:** Resolver self-references create infinite loops when AAL2 cookies don't propagate on post-MFA navigation, or when the user is in a cross-host MFA state (factor enrolled on host A, currently at host B).

Membership and consent are NOT the resolver's job after the first call. They are handled by `ensureOrgCookies` in proxy.ts and `ConsentGateModal` in destination layouts.

**Factor scoping:** Any code path that ROUTES based on "does the user have an MFA factor?" MUST use the host-scoped check (`filterFactorsByHost` from `lib/auth/mfa-host`). Global factor presence is meaningless for routing — only host-scoped presence determines whether the user can MFA-verify on the current host.

**Anti-pattern (creates loops):**

```ts
// Wrapping resolver URL inside another transient state's redirect param
mfaUrl.searchParams.set("redirect", "/auth/resolver?redirect=" + safeNext)
// ↑ Post-MFA navigation re-enters the resolver — loop if AAL2 cookie is stale

// Routing based on global factor presence
const hasVerifiedFactor = factors.some(f => f.status === "verified")
if (hasVerifiedFactor) return NextResponse.redirect("/login/mfa")
// ↑ Cross-host user has factors elsewhere — /login/mfa sees no host match — stranded
```

**Correct pattern:**

```ts
// MFA redirect with original destination (not resolver)
const mfaUrl = new URL("/login/mfa", origin)
if (safeNext) mfaUrl.searchParams.set("redirect", safeNext)

// Host-scoped routing decision
const hostFactors = filterFactorsByHost(allVerified, currentHost)
if (hostFactors.length > 0) return NextResponse.redirect(mfaUrl)    // verify
else return NextResponse.redirect(enrolUrl)                          // enrol
```

Source: ADDENDUM_AUTH_RESOLVER_SELF_REFERENCE_FIX_2026-05-27.

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
- Do not build debit order or DebiCheck mandate features — Pleks reads bank statement matches only. Agencies hold mandates bank-side between themselves and their bank. Pleks is not in the payment flow.
- Do not split an extension migration across commits — when changing a file extension (.ts → .tsx, .js → .ts, etc.), delete the predecessor in the same commit that introduces the successor. A surviving .ts shadow alongside a new .tsx file causes TypeScript to resolve to the old interface (.ts takes priority over .tsx in module resolution), silently masking the extension and breaking builds downstream.