# MECHANISABLE — the mechanisation build queue

> **Provenance of the metric.** The 98-of-122 figure was measured only AFTER fixing the marker
> audit's tag parser (commit `c0d3344b`), whose id character class excluded `@` — so scoped plugin
> ids like `eslint:@typescript-eslint/no-explicit-any` never matched. Such a tag passed the
> "bullet is tagged" string test while registering no claim, counting in NEITHER N nor D and never
> being resolution-checked: the rule left the audit while reading as enforced. Any metric quoted
> from before that commit was produced by a parser that could not see one of the tags it counted.
> This note lives here because those commits are already pushed and amending them would require a
> force-push — denied by `hook:bash-gate`, and by the push policy itself.

Originally extracted from the `CLAUDE.md` + `.claude/rules/*.md` triage pass
(`node scripts/check-claude-md.mjs`), which found most rules UNENFORCEABLE and, of those, the subset
carrying a `MECHANISABLE (rung: … · blast: …)` sketch of what a mechanism would assert. This register
holds the sketches so they stop paying rent in the always-loaded files; the source files now carry a
one-line pointer (`MECHANISABLE → M-0NN`) instead.

**No entry count here — it is a stat, stale by definition** (CLAUDE.md §4). This line previously read
"60 entries as of 2026-08-18" and was still saying it at 82. Worse than merely stale: it was the only
age evidence in the file, and a triage pass reached for it as if it dated the entries. **It does not.
`git log` puts M-003…M-073 in ONE commit on 2026-08-20 (`fd818c0c`)** — the register has no per-entry
age, and entry NUMBER is not a proxy for one. Count with `grep -cE '^### M-[0-9]+'` when a number is
actually needed.

**This is a build queue, not doctrine — it only shrinks.** An entry is removed when its mechanism ships
and the source rule gets an `@enforced` tag instead of a pointer (moving a rule from N to D in the
`check-claude-md.mjs` ratio). Do not add speculative entries here outside a fresh triage pass; do not
widen an entry's scope to cover something the original annotation didn't claim.

**Ranking:** blast radius band (`money → data-boundary → schema → auth → other`), then ascending cost
within a band (cheapest/most self-contained mechanism first). **M-001 through M-006 were fixed by prior
agreement before this register was written** — their band does not sort purely by the money-first rule
(three are `data-boundary`, sequenced ahead of the money band) because they were pinned to those IDs
directly rather than derived from the sort; M-007 onward is the derived ranking, banded strictly.

**Covering spec** cites an existing `brief/` doc only where the sketch or its neighbouring prose named
one AND the file was confirmed present on disk in this pass; `NEW` means no such doc exists — do not
infer one. Two rules in the source material cited spec filenames that do **not** exist on disk
(`ADDENDUM_AUTH_RESOLVER_SELF_REFERENCE_FIX_2026-05-27`, `ADDENDUM_DATA_ACCESS_DOCTRINE_2026-05-27`,
and the `standards/CLAUDE-MD-STANDARD` cited in `check-claude-md.mjs`'s own header) — flagged in the report,
not silently substituted.

---

## MONEY

### M-003 — Cat-15 distinguishes write-gate from read-gate on mutation-bearing modules
- **Rule:** "A `gateway()`-on-a-write must be provably intentional... the ADDENDUM_57G subscription-lockdown gate on a money path is convention-enforced" (`.claude/rules/data-access.md`)
- **Where it lives:** `.claude/rules/data-access.md:32` (twin: `CLAUDE.md:168`, see M-011)
- **Rung:** check · **Blast:** money
- **Sketch:** This overstates Cat-15 as implemented. Read `buildActionCensus()` (`scripts/security/server-action-census.mjs`): `expectedGateFamily()` only special-cases `app/(admin)/`; every other file just needs ANY recognized gate present (`gateway`, `gatewaySSR`, `requireAgentWriteAccess`, `getTenantSession`, … are all equally acceptable). It does not parse for mutation verbs (`.update(`/`.insert(`/`.upsert(`) and does not require an allowlist entry for a write gated with bare `gateway()`. The two files that DO carry "intentional gateway()-on-write" allowlist reasons (`lib/deposits/disburse.ts`, `lib/deposits/calculateReturn.ts`) would pass the census identically without those entries — the reasons are documentation, not something the script reads to make a pass/fail decision. Sketch: scan each gated file's body for a mutation call and, if `gateway()`/`gatewaySSR()` is the only gate present, require an allowlist entry.
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_57G_SUBSCRIPTION_PAUSE_POLICY.md` (defines the lockdown-gate requirement this mechanism would enforce; does not itself implement the census check)

---

## DATA-BOUNDARY

### M-001 — ✅ BUILT 2026-08-19 — Supabase MCP DDL gate

**Control:** `.claude/hooks/mcp-ddl-gate.js` (PreToolUse) + the `permissions.ask` twin in
`.claude/settings.json`. **Probe:** `scripts/check-mcp-ddl-gate.mjs` — 15 cases, both directions,
each a real subprocess with a real payload. **Tagged:** `hook:mcp-ddl-gate` on the DO NOT DO rule.

**Two corrections to this entry's original premise, both found by slice 0's enumerate-before-matching:**

1. The entry said the MCP path was ungated. **Partly false** — `permissions.ask` already covered
   `execute_sql`, `apply_migration`, `deploy_edge_function`, `pause_project`, `restore_project`.
   The real gap was narrower and worse: **`merge_branch` — which merges migrations to PRODUCTION —
   was gated by nothing**, along with `reset_branch`, `delete_branch` and `rebase_branch`.
2. The planned "DDL keyword AND tool" condition **cannot work**. `merge_branch` takes only a
   `branch_id`; there is no SQL to keyword-match, so an AND-gate would never fire on the
   highest-blast tool in the set. The keyword is now a labelling device for `execute_sql` alone.

**Also fixed while here:** 19 dead entries in `settings.json` — 14 in the `mcp__supabase__`
namespace, **which does not exist** (probed both directions; the live prefix is
`mcp__claude_ai_Supabase__`), plus `get_logs` (the tool is `query_logs`) and
`mcp__github__pull_request_read` (there is no GitHub MCP server; `gh` is the path).
A permission rule naming a non-existent tool is L-01 at the config layer: it matches nothing,
forever, and looks exactly like a rule that is working.

<details><summary>Original entry</summary>

**M-001 — Gate Supabase MCP `execute_sql`/`apply_migration`**
- **Rule:** "Do not apply ad-hoc SQL to the live DB — put it in the appropriate migration file instead" (`CLAUDE.md`, DO NOT DO)
- **Where it lives:** `CLAUDE.md:682-683`
- **Rung:** hook · **Blast:** data-boundary
- **Sketch:** `check-schema-drift.mjs` can detect the RESULTING drift reactively (and only when someone runs it, or via `check:check-drift-if-sql-changed` in `check:full` — itself not CI-wired, see Git rhythm above), but nothing prevents the ad-hoc execution itself: the Supabase MCP's SQL execution is not gated by `hook:bash-gate`, which only inspects the Bash tool. Sketch: a PreToolUse hook entry gating the Supabase MCP's SQL-execution tool(s) the same way `bash-gate` gates `git push` — require approval (or block outright) on `execute_sql`/`apply_migration` calls against the live project.
- **Covering spec:** NEW

</details>

### M-002 — ✅ BUILT 2026-08-19 (slice 3)

**Control:** `eslint-rules/require-org-scope-on-service-read.mjs`, tagged
`eslint:pleks/require-org-scope-on-service-read`. **Probed three directions:** an unscoped
service read fires, the same read with `.eq("org_id")` does not, and a cookie-client read does not.

**The sketch said "same AST shape as the existing write/delete rules". Half right.** The AST shape
transfers; the SCOPE does not. Measured before building: retargeting the write rule at `.select()`
gave **253 findings across 104 files**, splitting into 139 service-client reads (the real surface),
69 cookie/browser-client reads where **RLS applies and the filter would be wrong, not merely
noisy**, and 45 test fixtures. The write rule needs no client discriminator because
`no-cookie-client-from` already bans cookie-client `.from()`; a cookie-client `.select()` in a
client component is legitimate. Shipping the sketch as written would have been ~45% false positives.

A further 12 findings across 7 `components/admin` files were platform-admin dashboard reads —
cross-org **by design**, the same reason `(admin)`/`api/admin`/`lib/admin` were already skipped.
They went to SKIP_PATH on evidence, not to the baseline: recording the admin surface's whole
purpose as debt would have been a lie about the baseline's size.

**52 files baselined, 106 sites.** Classification coverage is stated in the rule header rather than
implied — families enumerated, a sample read at each, not all 106. The sample was mostly REAL
(caller-supplied id, no org filter, on a client that bypasses RLS — it leaks rather than corrupts,
which is why it survived review) with a minority of token-keyed false positives that should leave
via an inline disable naming the reason.

<details><summary>Original entry</summary>

**M-002 — org-scope on service-client `.select()` reads**
- **Rule:** "Every write/update/delete MUST include `.eq(\"org_id\", orgId)`" — reads half (`CLAUDE.md`, DB ACCESS)
- **Where it lives:** `CLAUDE.md:175-176` (twin: `.claude/rules/data-access.md:13`, see M-014)
- **Rung:** eslint · **Blast:** data-boundary
- **Sketch:** PARTIAL: `pleks/require-org-scope-on-service-write` covers `.update()`/`.upsert()` and `pleks/require-scope-on-delete` covers `.delete()`, both baseline-limited (pre-existing sites grandfathered). Plain `.select()` reads have no scoping check of any kind — an unscoped read is invisible to both rules and to Category 7. Sketch: a `require-org-scope-on-service-read` rule, same AST shape as the existing write/delete rules, flagging a service-client `.from(...).select(...)` chain with no `.eq("org_id", ...)`.
- **Covering spec:** NEW

</details>

### M-004 — ⚠ PARTIALLY BUILT 2026-08-19 (slice 3) — and the entry was WRONG

**Built:** `leases` added to `pleks/require-audit-on-sensitive-mutation`; test files scoped out;
4 known-unaudited production sites baselined with classifications; probed both directions (a
planted lease mutation fires, the same file with `recordAudit` does not). `CLAUDE.md` SECURITY
RULE 3 split at its coverage boundary — covered half tagged, uncovered half still pointing here.

**REFUSED, and this is the substance of the entry.** M-004 proposed extending the rule to
`leases`, `applications`, `properties`, `tenants` **and `user_orgs` role changes**. Measured
before building: **40 findings across 27 files** — applications 21, leases 11, properties 5,
tenants 3. Classifying every one showed the wider set is mostly routine traffic: applicant draft
autosave, consent and document-upload touches, a UI widget dismissal, and `getTenantSession`'s
last-seen write.

That is precisely the reason the rule's author excluded `user_orgs` **on day one**, in a comment
at the top of the rule:

> `user_orgs` — mutated in ~50 files for routine session / last-seen touches; auditing "role
> changes" specifically needs finer-than-table-level detection.

**This register entry proposed overriding a considered decision that carried its own reason.** It
was written during a triage pass that read the doctrine line but not the rule implementing it. The
only thing that prevented it was grounding before building, and the only reason grounding worked
is that the original author wrote the reason where the work happens (LESSONS L-23).

**What remains is NOT a longer table list.** Auditing the sensitive subset of applications /
properties / tenants / user_orgs — a screening decision, a submission, a fee, a role change —
needs finer-than-table-level detection. That is a different mechanism and should be scoped as its
own entry when someone builds it; adding the tables here would produce a rule whose findings are
mostly noise, and a noisy rule earns an allowlist and then stops being read.

<details><summary>Original entry</summary>

**M-004 — extend `require-audit-on-sensitive-mutation` beyond its two tables**
- **Rule:** "audit_log on every state change" (`CLAUDE.md`, SECURITY RULES #3)
- **Where it lives:** `CLAUDE.md:599-600`
- **Rung:** eslint · **Blast:** data-boundary
- **Sketch:** enforced for TWO tables only (`contact_bank_accounts`, `tenant_bank_accounts` — `pleks/require-audit-on-sensitive-mutation`). Leases, applications, properties, tenants and `user_orgs` role changes have NO mechanism requiring an audit row to exist. The rule as written claims far more coverage than exists. Sketch: extend `require-audit-on-sensitive-mutation`'s tracked-table set to leases, applications, properties, tenants, and `user_orgs` role-change writes.
- **Covering spec:** NEW

</details>

### M-013 — self-check that all 15 security-audit categories run unconditionally
- **Rule:** "Never disable or skip categories to pass the audit." (`CLAUDE.md`, SECURITY AUDIT)
- **Where it lives:** `CLAUDE.md:423-424`
- **Rung:** check · **Blast:** data-boundary
- **Sketch:** sketch: a self-check asserting all 15 `catN_*` functions are invoked unconditionally in `main()`/`runCiMode()`, the same self-referential pattern this file's own `--selftest` uses.
- **Covering spec:** NEW

### M-014 — org-scope on service-client `.select()` reads (data-access.md twin)
- **Rule:** "Every query through `db` MUST include `.eq(\"org_id\", orgId)` explicitly" — reads half (`.claude/rules/data-access.md`)
- **Where it lives:** `.claude/rules/data-access.md:13` (twin of M-002, `CLAUDE.md:176`)
- **Rung:** eslint · **Blast:** data-boundary
- **Sketch:** PARTIAL, same as the CLAUDE.md DB ACCESS rule: `pleks/require-org-scope-on-service-write`/`require-scope-on-delete` cover writes/deletes (baseline-limited); plain `.select()` reads carry no scoping check at all. Sketch: a `require-org-scope-on-service-read` rule, same AST shape as the existing write/delete rules, flagging a service-client `.from(...).select(...)` chain with no `.eq("org_id", ...)`.
- **Covering spec:** NEW

### M-015 — `require-consent-log-on-popia-write` (new rule)
- **Rule:** "consent_log for any new POPIA-sensitive operation" (`CLAUDE.md`, SECURITY RULES #4)
- **Where it lives:** `CLAUDE.md:601-602`
- **Rung:** eslint · **Blast:** data-boundary
- **Sketch:** no rule or script references `consent_log` as a write requirement. Sketch: a new `require-consent-log-on-popia-write` rule, same shape as `require-audit-on-sensitive-mutation`, scoped to a named consent-required table set.
- **Covering spec:** NEW

### M-016 — no raw decrypted identifier reaching JSX (mask-before-display)
- **Rule:** "Mask before display — never show raw decrypted ID/account in UI" (`CLAUDE.md`, SECURITY RULES #6)
- **Where it lives:** `CLAUDE.md:615-616`
- **Rung:** eslint · **Blast:** data-boundary
- **Sketch:** no check inspects JSX for a raw decrypted identifier reaching render. Sketch: a new rule shaped like `no-id-number-hash-in-app` flagging a `decryptIdNumber`/`decryptBankAccount`-derived value reaching JSX text/props outside the lease-document renderer (allowlisted).
- **Covering spec:** NEW

### M-017 — no PII in `console.log`
- **Rule:** "No PII in console.log, no PII in audit_log values" (`CLAUDE.md`, SECURITY RULES #7)
- **Where it lives:** `CLAUDE.md:618-619`
- **Rung:** eslint · **Blast:** data-boundary
- **Sketch:** the audit_log half is now partly structural (`recordAudit` sanitises, and denied keys are marked rather than dropped). The console.log half has NO control — there is no `no-console` rule configured and no PII-shaped-argument check. Sketch: an ESLint rule (or extension of `scripts/security/check-pii-classification.mts`, which already classifies PII-bearing fields) flagging `console.log`/`console.error`/`console.warn` calls whose arguments reference known PII-bearing variable/property names (`idNumber`, `passportNumber`, bank account fields, etc.).
- **Covering spec:** NEW

### M-018 — CI job gates a Vercel deploy on `npm run security:quick` exit code
- **Rule:** "Zero critical findings before any deployment. No exceptions." (`CLAUDE.md`, SECURITY AUDIT)
- **Where it lives:** `CLAUDE.md:419-420` (twin: `CLAUDE.md:674-675`, see M-019)
- **Rung:** ci · **Blast:** data-boundary
- **Sketch:** No gate blocks the actual deployment on this script's exit code; Vercel deploys on push independently of `npm run security`. Running it is a manual pre-deploy step, not a CI/deploy gate. Sketch: a required CI job running `npm run security:quick` gated on the Vercel deployment (e.g. a GitHub deployment-status check Vercel is configured to wait on), failing the deploy on exit code 1.
- **Covering spec:** NEW

### M-019 — CI job gates a Vercel deploy on `npm run security:quick` (DO NOT DO twin)
- **Rule:** "Do not deploy without running `npm run security:quick` first" (`CLAUDE.md`, DO NOT DO)
- **Where it lives:** `CLAUDE.md:674-675` (twin of M-018)
- **Rung:** ci · **Blast:** data-boundary
- **Sketch:** twin of "Zero critical findings before any deployment" above, same mechanism: no gate blocks a Vercel deploy on this script having run or passed.
- **Covering spec:** NEW

---

## SCHEMA

### M-005 — ✅ BUILT 2026-08-19 (slice 2)

**Control:** `scripts/check-migration-integrity.mjs`, tagged
`check:check-migration-integrity:shared`. **Probe:** 24 cases, both directions.
Reads the identity-scoped allowlist FROM `.claude/rules/identity-scoped-tables.md` rather than
mirroring it into code, so the doc is the single source and there is no parity test to rot. A
missing or zero-row 'Current members' section FAILS rather than silently exempting nothing.
29 pre-existing tables baselined, each with its reason; 3 identity-scoped resolve via the rule file.

<details><summary>Original entry</summary>

**M-005 — `org_id`-on-new-table migration parse + identity-scoped allowlist**
- **Rule:** "org_id on every new table — one bounded exception: identity-scoped tables" (`CLAUDE.md`, SECURITY RULES #1)
- **Where it lives:** `CLAUDE.md:589-594` (twin: `.claude/rules/identity-scoped-tables.md:14`, see M-023)
- **Rung:** check · **Blast:** schema
- **Sketch:** Nothing inspects migration SQL for the column. The org-scope ESLint rules govern app-code USAGE (`require-org-scope-on-service-write`, `require-scope-on-delete`); a new table with no `org_id` at all is invisible to them and to Category 7. Sketch: parse each migration's new `§N` section for `CREATE TABLE`, and assert an `org_id` column is present unless the table name is in the identity-scoped allowlist (`.claude/rules/identity-scoped-tables.md`'s "Current members" table).
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_62F_MULTI_DEVICE_PASSKEY.md` (the grounding pass that ratified the membership test and named the planned `device_enrolment_tokens`/`account_recovery_codes` allowlist additions)

</details>

### M-006 — ✅ BUILT 2026-08-19 (slice 2)

**Control:** `scripts/check-migration-integrity.mjs`, tagged
`check:check-migration-integrity:shared`. **Probe:** 24 cases, both directions.
Asserts the file set is exactly the twelve named files, in BOTH directions — a thirteenth file
fires, and a deleted expected file fires too.

<details><summary>Original entry</summary>

**M-006 — migration file count is exactly the twelve named files**
- **Rule:** "Do not create new migration files — amend the existing domain file" (`CLAUDE.md`, DO NOT DO)
- **Where it lives:** `CLAUDE.md:678-679` (closely related: `CLAUDE.md:680-681` CREATE POLICY/DROP pairing, see M-020 — could ship as one combined migration-integrity script)
- **Rung:** check · **Blast:** schema
- **Sketch:** nothing counts migration files. `check-migration-forward-refs.mjs` checks reference ORDER inside the existing twelve; a thirteenth file would pass every gate. Sketch: assert the migration file set is exactly the twelve named files (`001_foundation.sql` … `012_property_extensions.sql`) and fail on any additional file matching the migration glob.
- **Covering spec:** NEW

</details>

### M-020 — ✅ BUILT 2026-08-19 (slice 2)

**Control:** `scripts/check-migration-integrity.mjs`, tagged
`check:check-migration-integrity:shared`. **Probe:** 24 cases, both directions.
The 328→29→21 history is why this was built probe-first with a known-good seeded FROM A REAL
MIGRATION. It paid off immediately: the first run reported 27 findings, and classifying them per
site rather than baselining showed **23 were legitimate** — two other idempotency patterns the
check now recognises (`IF NOT EXISTS (SELECT 1 FROM pg_policies …)` naming the policy, and a
dynamic `EXECUTE format('DROP POLICY IF EXISTS %I ON t', …)` loop, and a
`DO $ … EXCEPTION WHEN duplicate_object THEN NULL; END $` block). Baselining those 23 would have
buried valid patterns as debt and left an 85% false-positive rate.

**4 real defects — FIXED 2026-08-19, none baselined.** All four were in `009_security.sql`,
consolidations that DROP the old policy names and CREATE a new one never dropped, so a re-run
aborted at the CREATE. One `DROP POLICY IF EXISTS` line each; proven load-bearing by removing one
and watching the check re-fire. The policy baseline is EMPTY.

Two candidates in `007_enhancements.sql` turned out NOT to be defects — they use the
`EXCEPTION WHEN duplicate_object` pattern — which matters twice over, because 007 is a protected
file that may not be amended. Had the classification not been done per site, the only "fix"
available would have been forbidden.

<details><summary>Original entry</summary>

**M-020 — `CREATE POLICY`/`DROP POLICY IF EXISTS` pairing scan**
- **Rule:** "Do not use raw `CREATE POLICY` without `DROP POLICY IF EXISTS` first" (`CLAUDE.md`, DO NOT DO)
- **Where it lives:** `CLAUDE.md:680-681` (closely related to M-006)
- **Rung:** check · **Blast:** schema
- **Sketch:** zero scripts scan migration SQL for the pairing. Trivially mechanisable — a regex over `supabase/migrations/*.sql` asserting every `CREATE POLICY "name"` is preceded by a matching `DROP POLICY IF EXISTS "name"` — and worth doing, since the failure mode is a migration that aborts partway and silently leaves everything below it unapplied.
- **Covering spec:** NEW

</details>

### M-021 — idempotency (`IF NOT EXISTS`) syntactic scan on new migration sections
- **Rule:** "Idempotency is mandatory" (`.claude/rules/migrations.md`)
- **Where it lives:** `.claude/rules/migrations.md:81`
- **Rung:** check · **Blast:** schema
- **Sketch:** sketch: scan a migration's new `§N` section for `CREATE TABLE` without `IF NOT EXISTS`, `ADD COLUMN` without `IF NOT EXISTS`, or `CREATE INDEX` without `IF NOT EXISTS`, each a concrete syntactic pattern.
- **Covering spec:** NEW

### M-022 — flag `.upsert`/`ON CONFLICT` on `auth.users` by email
- **Rule:** "`auth.users` has no unique constraint on email — `ON CONFLICT (email)` will fail" (`.claude/rules/schema-gotchas.md`)
- **Where it lives:** `.claude/rules/schema-gotchas.md:17`
- **Rung:** check · **Blast:** schema
- **Sketch:** these are orientation ("known gotchas to check before writing migrations or queries") rather than a single checkable property; the closest mechanisable slice is the second bullet — sketch: flag an `.upsert`/`ON CONFLICT` call targeting `auth.users` by `email` — but none exists today.
- **Covering spec:** NEW

### M-023 — SUBSUMED BY M-005 (do not build separately)

⚠ **Not an independent build.** Ruled 2026-08-18: both rule sites — `CLAUDE.md` SECURITY RULE 1 and
`.claude/rules/identity-scoped-tables.md:14` — now point at **M-005**, because they are two
statements of ONE control (parse migration SQL for `CREATE TABLE`, assert `org_id` unless the table
is in the identity-scoped allowlist). Leaving both entries live would have implied two builds for
one mechanism, and the queue would have been counted twice. Build M-005; this entry is a pointer.

The two sites are kept separate in the DOCS on purpose — the statement is incident-class and must be
visible to a write-blind session (E1b), while the membership test's detail belongs in the rule file.
Different audiences, same missing control.

<details><summary>Original M-023 entry (retained for provenance)</summary>

**M-023 — identity-scoped membership test (migration-parse twin)**
- **Rule:** "A table is in this class only if it passes the membership test below" (`.claude/rules/identity-scoped-tables.md`)
- **Where it lives:** `.claude/rules/identity-scoped-tables.md:14` (twin of M-005, `CLAUDE.md:590`)
- **Rung:** check · **Blast:** schema
- **Sketch:** Nothing inspects migration SQL for a new table at all, so nothing can distinguish "correctly exempted by the membership test" from "the org_id rule was simply skipped." This file's whole purpose — a written test to stop the exception becoming a general escape hatch — has no code-side check that the test was actually applied. Sketch: parse each migration's new `§N` section for `CREATE TABLE`, and assert an `org_id` column is present unless the table name is in this file's "Current members" allowlist.
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_62F_MULTI_DEVICE_PASSKEY.md`

</details>

### M-024 — 007/008 gain-no-new-`§N`-section diff
- **Rule:** "Do NOT amend `007_enhancements.sql` or `008_enhancements2.sql`" (`.claude/rules/migrations.md`)
- **Where it lives:** `.claude/rules/migrations.md:53`
- **Rung:** check · **Blast:** schema
- **Sketch:** `check-migration-forward-refs.mjs` reads every migration file's content but has no rule against 007/008 specifically gaining a new `§N` section. Sketch: diff each file's section (`§N`) count against a recorded baseline and fail if 007/008 grows.
- **Covering spec:** NEW

### M-025 — flag `applications.applicant_id`/`applicant_user_id` references
- **Rule:** "Anti-patterns to never use" — non-existent applicant columns (`.claude/rules/schema-gotchas.md`)
- **Where it lives:** `.claude/rules/schema-gotchas.md:38`
- **Rung:** check · **Blast:** schema
- **Sketch:** PARTIAL, mechanically. The first two bullets name COLUMNS that don't exist, so a query referencing them fails at the database (PostgREST 42703) and — if the call site's `{ data, error }` is checked per `pleks/require-supabase-error-check` — surfaces as a real, visible error rather than a silent `null`. That is real but REACTIVE (fails at query time, not write time). The third and fourth bullets describe an absence, which nothing can positively check for. Sketch: verify (or extend) `schema-contract-scan.mjs` (manifest-driven, already in `npm run check`) to statically flag a `.select`/`.eq` referencing `applications.applicant_id` or `applications.applicant_user_id` — not independently verified in this pass whether it already does.
- **Covering spec:** NEW

### M-026 — code-side `IDENTITY_SCOPED_TABLES` constant mirroring the markdown allowlist
- **Rule:** "Current members (exhaustive — extend only via a CD ruling)" (`.claude/rules/identity-scoped-tables.md`)
- **Where it lives:** `.claude/rules/identity-scoped-tables.md:50`
- **Rung:** check · **Blast:** schema
- **Sketch:** no code anywhere enumerates this three-table allowlist to check against (the ESLint rules' own `SELF_SCOPED_TABLES` set is a DIFFERENT, unrelated exemption for `organisations`/`user_profiles`); a fourth table added to this list by prose alone, with no matching code-side allowlist, would not be caught adding `org_id` back OR skipping it incorrectly. Sketch: a code-side constant (e.g. `IDENTITY_SCOPED_TABLES` in `lib/`) mirroring this markdown table, read by the migration-scan sketched above (M-005/M-023), kept in sync by a doc/code parity test.
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_62F_MULTI_DEVICE_PASSKEY.md`

### M-027 — `REFERENCES auth.users` cascade-policy scan (credential vs. evidence)
- **Rule:** "Cascade credentials. Never cascade evidence." (`.claude/rules/identity-scoped-tables.md`)
- **Where it lives:** `.claude/rules/identity-scoped-tables.md:69`
- **Rung:** check · **Blast:** schema
- **Sketch:** sketch: grep migrations for `REFERENCES auth.users` and assert `ON DELETE CASCADE` only on the named credential tables and `ON DELETE SET NULL` everywhere else — but nothing does; classifying a NEW table as "credential" or "evidence" in the first place still requires the semantic judgement this section describes, so the check would need the same allowlist as M-023/M-026 to know which tables are "named credential tables".
- **Covering spec:** `brief/build/SPEC_ANALYTICS_CAPTURE.md` (§2, the `ON DELETE SET NULL` evidentiary-row doctrine this rule generalises from)

### M-028 — pre-commit/pre-push hook runs `check-schema-drift.mjs` after a migration edit
- **Rule:** "After adding a section, re-run the migration against the live DB and verify with the drift script" (`.claude/rules/migrations.md`)
- **Where it lives:** `.claude/rules/migrations.md:76` (twin cluster with M-029 and `CLAUDE.md:307-308`)
- **Rung:** hook · **Blast:** schema
- **Sketch:** `check-schema-drift.mjs` would catch the RESULTING mismatch if run, but nothing forces "re-run and verify" to have actually happened before a commit. Sketch: a local pre-commit/pre-push hook running `node scripts/check-schema-drift.mjs` when a migration file changed, blocking on drift.
- **Covering spec:** NEW

### M-029 — pre-commit/pre-push hook drives drift to zero before commit
- **Rule:** "Always drive drift back to zero before committing." (`.claude/rules/migrations.md`)
- **Where it lives:** `.claude/rules/migrations.md:150` (twin cluster with M-028 and `CLAUDE.md:307-308`)
- **Rung:** hook · **Blast:** schema
- **Sketch:** `check-schema-drift.mjs` genuinely detects drift when run, and its conditional wrapper (`check-drift-if-sql-changed.mjs`) is part of `check:full` — but `check:full` is not CI-wired (CI's `db-tests` job runs `test:db`/`security:db` post-push, but not this drift check), so nothing forces "drive drift to zero" to have happened before a commit lands. Sketch: same pre-commit/pre-push hook as M-028, running `check-schema-drift.mjs` when a migration file changed.
- **Covering spec:** NEW

---

## AUTH

### M-030 — grep for a literal `/auth/resolver` self-reference in a `redirect=` value
- **Rule:** "`/auth/resolver` produces exactly ONE routing decision per call... MUST NOT appear in any `?redirect=` value it forwards" (`.claude/rules/routing-auth.md`)
- **Where it lives:** `.claude/rules/routing-auth.md:39`
- **Rung:** check · **Blast:** auth
- **Sketch:** sketch: grep the resolver route and the three named transient-auth-state routes for a literal `/auth/resolver` substring inside a `redirect=`/`searchParams.set("redirect", ...)` value and fail on a match — the exact self-reference class this rule forbids; it is a runtime routing property, not something `architecture-audit.mjs`'s current checks (cross-origin links, manifest completeness, safe-redirect denylist) happen to cover.
- **Covering spec:** NEW

### M-031 — extend `expectedGateFamily` to require the portal gate under portal route groups
- **Rule:** "Tenant/landlord/supplier portal actions: use `getTenantSession()`" (`CLAUDE.md`, DB ACCESS)
- **Where it lives:** `CLAUDE.md:173-174`
- **Rung:** check · **Blast:** auth
- **Sketch:** `server-action-census.mjs`'s `expectedGateFamily()` only special-cases `app/(admin)/`; every other location (including portal routes) accepts ANY recognized gate, so a portal action gated with `gateway()` instead of `getTenantSession()` passes Cat-15 undetected. Sketch: extend `expectedGateFamily` to require the portal gate under `app/(tenant)/`, `app/(landlord)/`, `app/(supplier)/`.
- **Covering spec:** NEW

### M-032 — flag routing decisions guarded by raw factor-array truthiness instead of `filterFactorsByHost`
- **Rule:** "Factor scoping: any code path that ROUTES based on 'does the user have an MFA factor?' MUST use the host-scoped check" (`.claude/rules/routing-auth.md`)
- **Where it lives:** `.claude/rules/routing-auth.md:46`
- **Rung:** check · **Blast:** auth
- **Sketch:** sketch: flag a routing decision (`NextResponse.redirect` inside an `if`) guarded by `factors.some(...)`/raw factor-array truthiness instead of a `filterFactorsByHost(...)` call — the exact anti-pattern shown below — but nothing greps for it today.
- **Covering spec:** NEW

---

## OTHER

### M-033 — ✅ BUILT (found already shipped 2026-08-21) — `@typescript-eslint/no-explicit-any` is resolver-visible

- **Rule:** "`any` types leaking through (fix them, don't suppress)" (`CLAUDE.md`)
- **Asked for:** an explicit `"@typescript-eslint/no-explicit-any": "error"` declaration in `eslint.config.mjs`'s own rules block, so `check-claude-md.mjs`'s `eslint:` resolver (which greps for the literally quoted id) can verify a tag the preset was providing invisibly.
- **Verified 2026-08-21 at `3e785e61`:** `eslint.config.mjs:145` declares it literally; `scripts/check-claude-md.mjs:91` resolves a configured built-in by `cfg.includes('"' + id + '"')`; CLAUDE.md carries `@enforced eslint:@typescript-eslint/no-explicit-any` and `npm run check` is green, so the claim resolves rather than merely parsing.
- **Why it sat open:** the fix landed as part of the resolver work described in this file's own preamble (the `@`-in-id parser bug, `c0d3344b`) and nothing walked back to the entries that had asked for it. **An entry closes when someone checks; shipping the mechanism does not close it by itself.**


### M-034 — ✅ BUILT (found already shipped 2026-08-21) — `react/jsx-key` is resolver-visible

- **Rule:** "Missing `key` props in .map() renders" (`CLAUDE.md`)
- **Verified 2026-08-21 at `3e785e61`:** `eslint.config.mjs:146` declares `"react/jsx-key": "error"` literally, CLAUDE.md carries the matching `@enforced` tag, and the resolver path is the same one M-033 records. Twin of M-033 and closed with it, in the same commit, for the same reason.


### M-035 — flag the literal substring `ANON_KEY` outside `lib/env.ts`
- **Rule:** "Supabase key name: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY (not ANON_KEY)" (`CLAUDE.md`, KEY CONSTANTS)
- **Where it lives:** `CLAUDE.md:582-583` (twin: `CLAUDE.md:689-690`, see M-036)
- **Rung:** eslint · **Blast:** other
- **Sketch:** `pleks/no-raw-process-env` blocks a raw read of ANY env var name outside `lib/env.ts`, so it happens to touch this one without knowing the string "ANON_KEY" — it would equally flag the correct name, and would miss a wrong alias declared inside `lib/env.ts` itself. Sketch: a small, specific check (or an extension of `no-raw-process-env`) that flags the literal substring `ANON_KEY` anywhere outside `lib/env.ts`, distinct from the general raw-env-var block.
- **Covering spec:** NEW


### M-037 — grep cron/webhook route files for a `requireAgentWriteAccess(` call
- **Rule:** "Cron and webhook handlers: do NOT use `requireAgentWriteAccess`" (`CLAUDE.md`, DB ACCESS)
- **Where it lives:** `CLAUDE.md:171-172`
- **Rung:** check · **Blast:** other
- **Sketch:** `route-census.mjs` classifies a route as `cron`/`webhook` by path prefix or secret header, but nothing greps those same files for a `requireAgentWriteAccess(` call and fails if found. Sketch: extend `route-census.mjs` to grep cron/webhook-bucket route files for a `requireAgentWriteAccess(` call and fail if present.
- **Covering spec:** NEW


### M-041 — ✅ BUILT 2026-08-20

**Control:** `scripts/check-extension-stem-pairs.mjs`, chained into `npm run check` beside
`check-import-cycles`. Walks the tree, groups `.ts`/`.tsx` by directory+stem, and fails on any group
holding both. Case-only collisions (`Card.ts` beside `card.tsx`, which shadow on win32/macOS and
agree with Linux CI for the wrong reason) are reported as a **separate class** — the remedy is a
rename, not a delete, so merging the two lists would have merged two different repairs.
Ships with **no baseline**: a full scan found zero pairs of any extension combination, so there was
nothing to grandfather. Pure regression guard.

**Built through the P1 pipeline, and the walk is why the entry is worth reading.** The first
implementation passed its own thirteen probes and was refuted by MUTATION — the walker deleted lines
and watched the suite stay green:

- The `.d.ts` KNOWN-GOOD probe **passed for a reason other than the one it claimed.** Grouping is by
  stem, and `basename("foo.d.ts", ".ts")` is `"foo.d"`, which can never key-collide with `"foo"` — so
  the probe was green with the exclusion line deleted. It was indistinguishable from a broken
  detector. The exclusion stayed (it keeps the file census honest) and the probe was rewritten to
  assert what the line actually does.
- **`SKIP_DIRS` was an unprobed silencer**, and broader than any sibling's: `generated` and `build`
  are legal directory names in this tree (`lib/comms/templates/seed/generated/` is real source), so
  the set could hide live source and the fixtures — all under `lib/` — could never detect it. Adding
  `"app"` to the set left the suite green.
- The **failing exit path was never driven at all.** Setting both floors to `0` left the suite green.

Fixes: the skip set narrowed to six unambiguous names; the 700/700 floor **replaced by a
reconciliation against `git ls-files`** (they agreed exactly at 1972 files, so it lands green and any
future over-reach fails immediately instead of shrinking a count a floor is too loose to catch); the
real entry point now spawned as a subprocess against fixture roots so exit 1 and its stderr are
demonstrated rather than asserted.

**And the reconciliation had the same bug one level up** — found by the implementer while probing it,
not by anyone reviewing it. Both sides originally read the same mutable `SKIP_DIRS`, so a skip-list
over-reach would narrow the walk and the git-side filter *identically* and never disagree: a control
that moves with the thing it is controlling. A planted `"scripts"` addition stayed green at 993/700.
The git side now has its own independent constant, and the same plant fails naming the 13 hidden
files. **A reconciliation is only a control while its two sides can disagree.**

<details><summary>Original entry</summary>

**M-041 — flag a `.tsx` whose stem matches a sibling `.ts`**
- **Rule:** "Do not split an extension migration across commits" (`CLAUDE.md`, DO NOT DO)
- **Where it lives:** `CLAUDE.md:697-698`
- **Rung:** check · **Blast:** other
- **Sketch:** a check could fail on a `.tsx` whose stem matches a sibling `.ts`. The stated failure (TypeScript resolves to the stale `.ts`, masking the new file) is exactly the silent class that earns a check. Sketch: a check globs `**/*.tsx` and fails if a sibling `.ts` file with the identical stem exists in the same directory.
- **Covering spec:** NEW

</details>

### M-042 — derive the Category 9 rate-limit flood list from `route-census.mjs`
- **Rule:** "When adding new public routes: add them to the Category 9 rate limit test list." (`CLAUDE.md`, SECURITY AUDIT)
- **Where it lives:** `CLAUDE.md:429-430`
- **Rung:** check · **Blast:** other
- **Sketch:** `PUBLIC_API_ROUTES` is hand-maintained (unlike Category 8's disk-derived census) and `cat9_rateLimiting` only floods `.slice(0, 2)` of it regardless of length, so nothing fails if a new public route is never added. Sketch: derive the flood target list from `route-census.mjs`'s `byBucket.public`, the same pattern Category 8 already uses.
- **Covering spec:** NEW


### M-044 — assert every `TRACKED_CRONS` name is written by a matching `withCronRun` call
- **Rule:** "Health-check tracking: `lib/observability/health.ts` `checkCrons` tracks only top-level scheduled `job_name`s that ACTUALLY write a `cron_runs` row" (`.claude/rules/crons.md`)
- **Where it lives:** `.claude/rules/crons.md:68`
- **Rung:** check · **Blast:** other
- **Sketch:** sketch: assert every name in `TRACKED_CRONS` is written by at least one route calling `withCronRun` with that exact `job_name` — the precise mismatch that caused the chronic "crons: degraded" false positive this paragraph describes.
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_67E_CRON_RELIABILITY.md`

**Retained 2026-08-21** under the WON'T-BUILD default, and the reason is its provenance: it names a symptom that was OBSERVED — the chronic `crons: degraded` false positive — rather than a hazard inferred from the rule's wording. A tracked `job_name` no writer produces leaves the health check permanently wrong in the direction that teaches people to ignore it. **M-043 was closed into this entry**, being the same surface argued from the weaker end.


### M-045 — extend `no-inline-app-url` to visit plain string `Literal` nodes
- **Rule:** "Any hardcoded `https://app.pleks.co.za/...` in template or email code is a bug." (`.claude/rules/comms-urls.md`)
- **Where it lives:** `.claude/rules/comms-urls.md:21`
- **Rung:** eslint · **Blast:** other
- **Sketch:** PARTIAL: `pleks/no-inline-app-url` catches the templated-literal form of this bug (baseline-limited) — verified: it only visits `TemplateLiteral` nodes interpolating `APP_URL`/`MARKETING_URL`; a hand-typed literal string with no `${}` interpolation (e.g. `"https://app.pleks.co.za/wo/123"`) is a different AST shape the rule does not visit at all. Sketch: extend the rule to also visit plain `Literal` string nodes matching the production/apex origins, outside `lib/routing/`.
- **Covering spec:** NEW

**Retained 2026-08-21:** the cheapest build in the register and the reason is structural — the rule already EXISTS and already runs; the gap is one additional node type on a live visitor. The uncovered shape (a hand-typed `"https://app.pleks.co.za/…"`) is strictly SIMPLER than the covered one, and more likely to be written by hand than the interpolated form the rule already catches.


### M-048 — diff staged files against `file-headers.baseline.json` for surviving `FILL:`
- **Rule:** "Touch a file with a stub header (contains `FILL:`) → fill it in before committing" (`CLAUDE.md`, FILE HEADERS)
- **Where it lives:** `CLAUDE.md:70-71`
- **Rung:** check · **Blast:** other
- **Sketch:** `check-file-headers.mjs` only fails on a `FILL:` stub NOT already in `file-headers.baseline.json`; touching a baselined file's body without filling its header leaves the file still baselined and still passing. Sketch: diff staged files against the baseline and fail if a staged, baselined file still contains `FILL:`.
- **Covering spec:** NEW


### M-051 — local `pre-push` git hook running `npm run check:full`
- **Rule:** "`npm run check:full`... must be green" (`CLAUDE.md`, pre-push checklist step 1)
- **Where it lives:** `CLAUDE.md:307-308` (related cluster: M-028, M-029)
- **Rung:** hook · **Blast:** other
- **Sketch:** `check:full` exists and is genuinely strict when run (it chains `check`, `test:db`, `security:db`, `check-drift-if-sql-changed`), but nothing forces it to run before a push: it is not in `ci.yml` (CI's `db-tests` job runs `test:db`/`security:db` separately on the PR — a real, newer mitigation, but still post-push/pre-merge, and it skips `check-drift-if-sql-changed`) and `hook:bash-gate` gates the push action on approval, not on this command's exit code. Sketch: a local `pre-push` git hook running `npm run check:full`, blocking the push on non-zero exit.
- **Covering spec:** NEW

### M-052 — CI step asserting a `!` PR title has a matching `BREAKING CHANGE:` footer
- **Rule:** "Breaking changes: add `!` after type... AND a `BREAKING CHANGE:` footer" (`CLAUDE.md`, CONVENTIONAL COMMIT MESSAGES)
- **Where it lives:** `CLAUDE.md:212-213`
- **Rung:** ci · **Blast:** other
- **Sketch:** the `pr-title` job validates only the title's `type(scope): subject` grammar (`amannn/action-semantic-pull-request`, no `subjectPattern` configured); it does not check the PR/commit body for a `BREAKING CHANGE:` footer. `semantic-release` parses the footer at RELEASE time (post-merge) to size the version bump. Sketch: a CI step reads the PR title; if it contains `!`, assert the PR body contains a `BREAKING CHANGE:` line and fail otherwise.
- **Covering spec:** NEW


### M-055 — one generic script enumerating every `*.baseline.json` for shrink-only
- **Rule:** "Baselines only SHRINK." (`.claude/rules/lint-rules.md`)
- **Where it lives:** `.claude/rules/lint-rules.md:21`
- **Rung:** check · **Blast:** other
- **Sketch:** PARTIAL. "Baselines only shrink" is what `check-claude-md.mjs` itself enforces for the UNENFORCEABLE-marker count and what `check-file-headers.mjs`/`check-pii-classification.mts` enforce for their own baselines — but that shrink-only property is per-script, not a general property every `*.baseline.json` is verified to hold; a NEW baseline file could widen on every run and nothing would notice. Sketch: one generic script enumerates every `*.baseline.json` in the repo and, in CI, compares each file's entry count against the base-branch version, failing if any grows.
- **Covering spec:** NEW

**Retained 2026-08-21:** the shrink-only property is doctrine CLAUDE.md §4 calls load-bearing — *"never widen one to make CI green — that deletes the finding"* — and three scripts already implement it privately for their own baselines. This is the generic form of a ratchet the repo has already decided it wants, not a new proposal.


## MONEY (continued — remaining band entries, ranked after M-003)

### M-007 — ✅ BUILT 2026-08-19 — pre-commit and pre-push gates

**Control:** `.githooks/pre-commit` (`npm run check`) and `.githooks/pre-push`
(`npm run check:full`), wired via `core.hooksPath`, self-configuring on install through a
`prepare` script. **Probe:** `scripts/check-git-hooks.mjs` — asserts existence, the executable
bit as git records it, that `core.hooksPath` actually points at the directory (a hook in an
unreferenced directory is a file, not a gate, and nothing about the file reveals that), and
**that each hook blocks on failure and passes on success**, driven through a command seam so the
probe does not need a two-minute run. **Tagged:** `check:check-git-hooks`.

**Operational cost, stated rather than softened:** `check:full` includes `test:db` and
`security:db`, so on a machine with no reachable database **pre-push blocks every push**. That is
the honest reading of "never push red". If it proves wrong for this team, change the rule visibly
rather than quietly weakening the hook.

<details><summary>Original entry</summary>

**M-007 — scan for tier-price/name/lease-cap literals outside the two SSOT files**
- **Rule:** "Names, prices, lease caps → `lib/marketing/tiers.ts` (canonical) · cents → `lib/constants.ts`." (`CLAUDE.md`, TIER MODEL)
- **Where it lives:** `CLAUDE.md:498-499`
- **Rung:** check · **Blast:** money
- **Sketch:** sketch: scan `app/**`/`lib/**` for tier-price/name/lease-cap-shaped literals (e.g. "R699", "R1,199", "R2,599", "R4,499", the lease-cap numbers 15/30/75/150) outside the two SSOT files, the way `no-rerolled-money-format`/`no-adhoc-dates` guard their own SSOTs.
- **Covering spec:** NEW

</details>

> **⚠ CORRECTION, 2026-08-21 — M-049 and M-050 were folded into this entry and deleted.**
> Both were twin entries asking for a `.husky/pre-commit` hook running `npm run check`, and both
> asserted as their central premise: *"there is no pre-commit hook in this repo (no `.husky`, no
> `core.hooksPath`, empty `.git/hooks`)."* **That was false at `3e785e61`** — `core.hooksPath` is
> `.githooks`, which holds `pre-commit`, `pre-merge-commit`, `pre-push` and `prepare-commit-msg`,
> and CLAUDE.md §3 tags the commit gate `check:check-git-hooks`. The mechanism shipped as THIS entry
> and under a different tool than the sketch named, so neither twin ever matched on the string it was
> watching. **The register contradicted itself in the same file for as long as both existed** —
> M-007 recording the hook as built while M-049/M-050 recorded it as absent. Sketches that name a
> specific tool (`.husky`) rather than a property (`a hook that runs the gate before a commit`)
> cannot notice the property being satisfied another way.


### M-008 — scan for `25000`/`47000`/`0.30`-shaped literals outside `lib/constants.ts`
- **Rule:** "`APPLICATION_FEE_CENTS` · `JOINT_APPLICATION_FEE_CENTS` · `INCOME_AFFORDABILITY_THRESHOLD` → `lib/constants.ts`" (`CLAUDE.md`, KEY CONSTANTS)
- **Where it lives:** `CLAUDE.md:558-559`
- **Rung:** check · **Blast:** money
- **Sketch:** sketch: scan for a raw `25000`/`47000`/`0.30`-shaped literal outside `lib/constants.ts`, the way a `no-rerolled-*` rule guards its own SSOT. Same mechanism family as M-007 — could ship as one combined script.
- **Covering spec:** NEW

### M-009 — extend the constants/tier literal scan to the screening fee cents value
- **Rule:** "Never hardcode a fee literal" (`CLAUDE.md`, KEY CONSTANTS — screening fee SSOT)
- **Where it lives:** `CLAUDE.md:563-564`
- **Rung:** check · **Blast:** money
- **Sketch:** PARTIAL. The test (`bundle-economics.test.ts`) asserts price > cost WITHIN the SSOT module itself — a real, running invariant — but it does not scan call sites, so "never hardcode a fee literal" elsewhere in the codebase is unchecked; a call site that writes `25000` instead of importing `APPLICATION_FEE_CENTS` would not fail this test. Sketch: same call-site literal scan as M-007/M-008, applied to the screening fee cents value.
- **Covering spec:** NEW

### M-010 — `no-restricted-syntax` pattern for a hand-rolled debit-order/DebiCheck flow
- **Rule:** "Do not build debit order or DebiCheck mandate features" — hand-rolled-flow half (`CLAUDE.md`, DO NOT DO)
- **Where it lives:** `CLAUDE.md:695-696`
- **Rung:** eslint · **Blast:** money
- **Sketch:** PARTIAL, related to `.claude/rules/finance-trust.md:19`'s D-TRUST-01 coverage assessment (M-012). `no-restricted-imports` forbids importing generic payment-initiation SDKs repo-wide, but a hand-rolled debit-order flow using ordinary Supabase writes (no SDK import) would not be caught at all. Sketch: add named DebiCheck/debit-order SDK packages to the existing `no-restricted-imports` patterns block as they become known; the hand-rolled-flow gap needs a separate `no-restricted-syntax` pattern on mandate-creation-shaped writes and is harder to close fully.
- **Covering spec:** `brief/legal/TRUST_ACCOUNT_POSITIONING.md`

### M-011 — Cat-15 write-gate/read-gate distinction (CLAUDE.md twin)
- **Rule:** "`requireAgentWriteAccess(action)` for ALL agent-side mutations — never bare `gateway()` on a write path" (`CLAUDE.md`, DB ACCESS)
- **Where it lives:** `CLAUDE.md:167-168` (twin of M-003)
- **Rung:** check · **Blast:** money
- **Sketch:** twin of `.claude/rules/data-access.md:28`, same mechanism (M-003). The server-action census (Cat-15) only requires SOME recognized gate to be present; it does not distinguish `gateway()` from `requireAgentWriteAccess`, nor a read path from a write path. A write silently gated with bare `gateway()` and no allowlist entry does NOT fail Cat-15. Sketch: flag a `"use server"` module containing an `.update(`/`.insert(`/`.upsert(`/`.delete(` call whose file only resolves via `gateway()`/`gatewaySSR()`, absent an allowlist reason.
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_57G_SUBSCRIPTION_PAUSE_POLICY.md`

### M-012 — verify/build the schema- and code-layer D-TRUST-01 enforcement claims
- **Rule:** "D-TRUST-01: Pleks is not the trustee) enforced at schema, code, and ESLint levels" (`.claude/rules/finance-trust.md`)
- **Where it lives:** `.claude/rules/finance-trust.md:18`
- **Rung:** eslint · **Blast:** money
- **Sketch:** PARTIAL. The ESLint layer is real: `no-restricted-imports` forbids named payment-SDK packages repo-wide, citing D-TRUST-01 by name. The "schema" and "code" enforcement layers this sentence also claims were not independently verified in this pass — flagged rather than tagged, per "do not invent controls." Sketch: independently verify (or build) the schema- and code-layer controls the sentence claims, then tag each verified layer separately rather than the compound claim as one.
- **Covering spec:** `brief/legal/TRUST_ACCOUNT_POSITIONING.md`

### M-061 — order-sensitive org-awareness in `require-org-scope-on-service-read`
- **Rule:** "Every service-client `.select()` MUST include `.eq(\"org_id\", orgId)`" (`CLAUDE.md`, §4 Enforced) — the ESCAPE HATCH, not the rule
- **Where it lives:** `eslint-rules/require-org-scope-on-service-read.mjs`, the `ORG_AWARE` test
- **Rung:** eslint · **Blast:** data-boundary
- **Sketch:** the rule exempts an unscoped read when the ENCLOSING FUNCTION is "org-aware" anywhere in its text — an `.eq("org_id", …)`, an `org_id !==` compare, an `orgId ===` compare. That is deliberately loose, to allow validate-then-act (prove ownership, then read by id). But "anywhere in the function" includes AFTER the read, so a function that reads unscoped and org-checks something else later is exempt, and a 200-line page component is exempted by one org-scoped fetch at the bottom.
- **MEASURED 2026-08-19, before proposing a fix** (a check's first number is a hypothesis):
  - require the org signal to appear BEFORE the read in source order → **57 findings across 35 files**
  - …and additionally exempt any function TAKING `orgId`/`org_id` as a parameter, which is org-bound by contract → **52 findings across 33 files**
  - the second variant is the better rule and barely moves the number, because the bulk sits in top-level page components rather than in parameterised helpers (`app/(dashboard)/leases/[leaseId]/page.tsx` alone accounts for 15)
- **Why it is not shipped here:** 52 sites is a classification job, not a flag flip. Shipping the tightening would have meant baselining 33 files unread, which is widening a baseline to make CI green — the one thing a baseline may never do. The measurement is the deliverable; the classification is the build.
- **Covering spec:** NEW

### M-062 — ✅ BUILT 2026-08-20

**Control:** `scripts/agent-distribution.mjs`. Walks `~/.claude/projects/<slug>/*/subagents/agent-*.jsonl`,
joins each to its `.meta.json` for `agentType`, and prints per-type median/max turns and returned-report
size against the budget. **The budgets are READ FROM THE SPINES** (`.claude/agents/*.md`), never
hardcoded — a budget changed in canon and propagated here moves this report, and there is no second
copy to go stale.

**On the gate: `--selftest` only** (24 probes, wired into `npm run check` beside the other harness
self-tests). The LIVE run is deliberately ungated — it reads the transcript tree, which no CI runner
has. "Runs nowhere" and "is checked nowhere" are different failures and only the second was avoidable.

**The first live run was wrong in the dangerous direction, and that is the finding.** It printed
"RE-MEASURE TRIGGER MET (27 ≥ 20)" against 27 runs that ALL predated the budgets — which would have
meant tightening budgets against exactly the behaviour the budgets were introduced to change. Counting
every run in the tree answers a different question than "how many invocations under the NEW spines".
Fixed by taking the newest spine file's mtime as the generation boundary (`spineGeneration()`) and
counting only runs that postdate it (`runsSince()`); a run whose mtime cannot be read counts as OLD,
so the trigger never fires on evidence it cannot date. The table still spans both generations — it is
the only data there is — but now says so, above the trigger line. As at this commit the honest reading
is **0/20**, not 27/20.

**Extended 2026-08-20 with depth + parent, BEFORE `census` was granted the `Agent` tool.** Order
mattered: a nested fan-out arrives in the transcript tree as "more runs of a type", indistinguishable
from the main session invoking it more often, so granting the tool first would have blinded the
instrument exactly where cost grows fastest. Depth is read from each sidecar's `spawnDepth`; the
parent edge is recovered by containment — whichever transcript holds a run's `toolUseId` made the
call, which is the only place that edge is recorded. The trigger now counts depth-1 runs only.

**First distribution, all pre-generation** (27 runs): implementer 196/336 turns · walker 118/129 ·
grounder 100/117 · census 62/139 · db-inspector 18/18 (n=1). Reports 1.9k–5.3k median. Zero subagent
compactions at a peak context of 249k — which is *not* evidence of "never", since the peak never
approached the window; E6 stays INCONCLUSIVE rather than answered.

<details><summary>Original entry</summary>

**M-062 — per-type agent turn/output distribution emitted per session**
- **Rule:** "**Turn budget: {N} — a backstop, not a target.** ... If you reach it, STOP and report what you have with the gap named" + "**Output budget: {M} tokens.**" (all six spines, `.claude/agents/*.md`, walker v4 / others v2)
- **Where it lives:** `.claude/agents/{census,walker,grounder,implementer,db-inspector,crawler-doctrine}.md` — the "what reaches you" preamble of each
- **Rung:** check · **Blast:** other
- **Sketch:** the budget itself is **structurally unenforceable and stated as such in canon**: an agent has no reliable turn counter, it estimates, so the clause is attention-held prose by the standard's own grammar. What IS mechanisable is *visibility* — the overrun should surface as a report rather than a log (L-22). The measurement already exists as a throwaway: walk `<transcript-dir>/<sessionId>/subagents/agent-*.jsonl`, join each to its `.meta.json` for `agentType`, and emit turns and returned-report size per type. Sketch: promote that script into `scripts/`, run it on demand (not on the gate — it reads the live transcript tree, which no CI runner has), and have it print each type's median/max against its budgeted N/M so an overrun is visible without anyone opening a transcript. **This is also the instrument the canon's re-measure trigger depends on** — `standards/AGENT-SPINES.md` schedules a second distribution after ~20 invocations under the new spines, and without this script that trigger has nothing to fire.
- **Covering spec:** `dev-standards/playbooks/3-TOKEN-ECONOMY.md` §3

</details>

### M-063 — extend the stem-pair check to the js-family and multi-extension spellings — ✅ BUILT 2026-08-21
- **Rule:** "Do not split an extension migration across commits" — the half `check-extension-stem-pairs` did NOT cover (`CLAUDE.md`, DO NOT DO)
- **Where it lives:** `CLAUDE.md` — the two split bullets are now **rejoined into one**, since the coverage boundary that justified the split is gone
- **⚠ TWO PREMISES OF THE SKETCH BELOW WERE WRONG, and both were found by building it. Read them before reusing this entry's reasoning anywhere:**
  1. *"Widen `sourceFiles`'s extension test"* — the `.ts`/`.tsx` test was hardcoded in **three** independent places (`sourceFiles`, `findStemPairs`, `gitTrackedSourceFiles`). Widening one would have under-reported silently. The shipped fix derives the regex FROM the extension array so the two spellings cannot drift — and that same class then bit the build **twice more** (a floor table diverging from its own guard list; a probe list diverging from the table). **Two independently-maintained spellings of one set is the defect class this entry should be remembered for**, not the extension list.
  2. *"webpack's resolve order puts `.js`/`.mjs` AHEAD of `.ts`/`.tsx`"* — **not verifiable from this repository.** No override, no lockfile pin, upstream default only. `allowJs: true` IS verified in `tsconfig.json`, so the hazard shape is real, but the ordering claim was asserted rather than observed and is not repeated in the shipped text. Detection therefore ships **symmetric**, not directional: the walker's ruling, and it is the right one — a directional report would have to name which file wins, which is precisely the thing that could not be established.
- **The "more dangerous half" framing is TEMPERED, measured:** all 81 js-family files are in `scripts/`, `eslint-rules/`, `.claude/hooks/`, postcss and supabase — **zero under `app/`, `lib/`, `components/`**, so the bundle-time hazard has no live surface today. The check is a ratchet against the first one that lands there. It landed green with no baseline, as predicted.
- **Rung:** check · **Blast:** other
- **Sketch:** M-041 shipped covering `.ts` ↔ `.tsx` only, which is what its sketch specified. The walk on that build measured the boundary: `/\.tsx?$/` also misses `.mts`, `.cts`, `.jsx`, `.mjs`, `.cjs` — 9 tracked `.mts` and 78 tracked js-family files today. **The uncovered half is the more dangerous one.** `tsconfig.json` has `allowJs: true` and Next's webpack resolve order puts `.js`/`.mjs` AHEAD of `.ts`/`.tsx`, so a surviving `foo.js` beside a new `foo.ts` shadows it at BUNDLE time while `tsc` typechecks the new file happily: typecheck green, runtime stale, and no gate in this repo looks at bundle-time resolution. The covered `.ts`-over-`.tsx` direction is at least visible to `tsc`. Sketch: widen `sourceFiles`'s extension test and give `findStemPairs` a resolution-ORDER model rather than a symmetric pair test — the finding is "the file that wins is not the file you added", which is directional, unlike the `.ts`/`.tsx` case where either survivor is a defect. Zero live violations of any extension combination as at `7f7ba3d0`, so this too would land green and needs no baseline.
- **What it cost, and what that says about the register's estimates:** built through a full P1 pipeline — GROUND, three IMPLEMENT legs, three WALKs, **48 mutants across the three walks plus 5 more from Main**. The check went from 13 probes to 39. Every walk found real defects **in the previous walk's repair**, none in the original transform. A one-line-sketch entry is not a one-commit entry, and the gap is not scope creep: it is the probe work that makes the difference between a check and a check that reports coverage it does not have.
- **The failure mode this build kept reproducing, three times in three different costumes:** a probe that cannot fail. (1) Dropping `.jsx` from the extension array was invisible to 23 probes. (2) The `-z` hardening's own probe asserted a *space* in a filename — `git ls-files` neither quotes nor breaks on spaces, so reverting `-z` was invisible to all 37; a non-ASCII name discriminates and a space never could. (3) The floor table's guard compared **lengths**, so a coordinated two-site edit agreed with itself. **The third has no probe-side fix** — any two hand-maintained lists agree when both are edited consistently — and is closed instead by a guard derived from the TREE (`zeroFloorsWithLiveFiles`): an extension with live files may not carry a floor of 0. When a probe and the thing it guards are both authored by the same hand, only an outside source of truth breaks the tie.
- **Covering spec:** NEW — split out of M-041 per CLAUDE.md §4, "coverage boundaries split the rule, never qualify the tag"; the split is now **rejoined**, same rule applied in reverse once the boundary closed

### M-064 — a check must not depend on how the tree was materialised

- **Rule:** dev-standards `standards/CLAUDE-MD-STANDARD.md` §4.5 — a probe's result must be a function of what a file SAYS, never of how the checkout produced it (line endings, BOM, permissions)
- **Where it lives:** no CLAUDE.md bullet yet; the scar is `d18e344e` (`check-claude-md.mjs` split on `"\n"`, so every line carried a trailing `\r` on a CRLF checkout and the marker audit reported findings that did not exist)
- **Rung:** check · **Blast:** other
- **Sketch:** the fix that shipped is `text.split(/\r?\n/)`. **The finding is that it is now written independently in five places and nothing makes the sixth author do it.** A `no-naive-line-split` check over `scripts/**` and `.claude/hooks/**` — fail on `.split("\n")` / `.split('\n')` where the receiver is file text — is the right shape here, NOT a shared `splitLines` helper: the idiom is one regex, and a shared import across otherwise-standalone node scripts buys coupling rather than safety (and puts two sides of every future comparison behind one reader, per dev-standards [[L-37]]). BOM is the same class and belongs in the same check: a `﻿` before the first character defeats any `^`-anchored first-line test.
- **Measured, not assumed:** as at `d18e344e`, per `.claude/handoff/crlf-materialisation-sweep/01-grounder.md` — 36 content-reading sites across `npm run check` plus the four hooks, **34 tolerant or out of scope, 0 confirmed vulnerable**. Tolerance is per-site and reasoned (`\s` in the pattern absorbs `\r`; `includes()` is a substring test; whole-file regex with no line anchors; `JSON.parse`). So this ships green and needs no baseline — it is a ratchet against the next author, not a burn-down. **This classification is the agent's, re-derived independently for one site only (the BOM finding below); the other 35 are cited, not verified.**
- **Coverage boundary, stated rather than discovered:** `scripts/architecture-audit.mjs` (9 sites) and everything under `vitest run` were NOT traced. The check above would cover them by path, but the CLAIM that they are clean is unmade. Do not let a green first run be read as "the gate is materialisation-independent".
- **Third instance, 2026-08-20 — and it is outside the proposed aperture.** The knip tranche-2 census agent hit this in its OWN analysis script: it split `rg` output on `"\n"`, every `brief/*.md` match kept a trailing `\r` (those files are CRLF), and the parse silently dropped genuine cross-file references. It wrongly placed `lib/subscriptions/acceptance.ts:getLatestTosAcceptance` in the "referenced nowhere" bucket when `brief/legal/TOS_ARCHIVAL_SPEC.md` names it — i.e. **one line-ending bug away from proposing the deletion of code a spec depends on.** It self-caught only because a human-legible contradiction surfaced. A `no-naive-line-split` check over `scripts/**` and `.claude/hooks/**` would NOT have covered it: the script was an agent's scratch file in a handoff directory, written and discarded inside one task. That does not argue for widening the glob to scratch files — it argues that the class recurs wherever this idiom is retyped, and the check is a ratchet on the tracked tree only. Say that when the check ships, so a green run is not read as "this cannot happen here".
- **Covering spec:** NEW

### M-065 — `check-rules-tracked` has no probe seam, and a BOM defeats its frontmatter test

- **Rule:** "every `.claude/rules/*.md` is git-tracked and carries `paths:` frontmatter" <!-- @enforced check:check-rules-tracked -->
- **Where it lives:** `scripts/check-rules-tracked.mjs:87` — `/^---[\s\S]*?\bpaths:/m` against the first 400 bytes
- **Rung:** check · **Blast:** other
- **Sketch:** verified at the site, not taken on report: a `﻿` BOM makes the first line `﻿---`, so `^---` cannot match at position 0. It then matches the frontmatter's CLOSING delimiter instead, and `paths:` is never found after it — the file is reported as missing `paths:` when it has it. **This fails LOUD, not silent** (a false positive, not a false negative), which is why it is a register entry and not a stop-work. Fix is `.replace(/^﻿/, "")` on read.
- **The reason it is not a one-line fix:** the script has **no `--selftest`, no exported pure function, and no fixture** — ~~it is the only check in the chain with no probe seam at all~~ — **superlative struck 2026-08-20 as unmeasured: 21 of 31 chained checks have no `--selftest`.** The narrower claim stands and is what carries the entry: this script has no seam of any kind AND is about to have its parsing changed. Changing its parsing with nothing to probe against is how a check starts lying. The work is: extract the frontmatter test to an exported function, add `--selftest` with both directions (a BOM'd file WITH `paths:` must pass; a file genuinely without `paths:` must still fail), then apply the strip. Same shape as M-064 and could ship in the same commit.
- **Covering spec:** NEW

**Retained 2026-08-21:** a live check reports a false result on a valid file, and the entry's own point is that it has no seam to change safely. Closing it discards both halves and leaves the next person to rediscover the first while breaking the second.


### M-068 — ✅ BUILT 2026-08-20

**Was:** nothing stops a subagent committing.

**Built as:** `.claude/hooks/agent-write-scope.js` now matches `Bash` as well as the edit tools, and denies `git commit|merge|rebase|cherry-pick|revert|am|push` from any subagent — including `implementer`, whose unrestricted *write* grant was never a commit grant. Read-only git (`log`, `diff`, `show`, `status`, `grep`, `merge-base`) and the main session are untouched. 42 probes in `scripts/check-agent-write-scope.mjs`, both directions.

**Two bugs the known-good half caught, in the first two runs — the argument for writing it:**
1. `\b` after `merge` matched inside `git merge-base`, which every grounder runs to test ancestry and which writes nothing. Fixed with `(?![\w-])`.
2. `git -C /repo commit` defeated the flag-parsing, because `-C` takes a value and the value is not a flag. Rather than enumerate every global option that takes an argument and be wrong on the next one, the test stopped parsing git's grammar: find `git`, then look for a denied subcommand as a standalone token anywhere after it. **An unusual invocation cannot slip past a test that does not depend on the invocation's shape.**

**Accepted false-deny, stated rather than discovered later:** a command merely mentioning both (`rg "git commit" docs/`) is denied. Correct direction to be wrong in — the agent is told what to do instead; a false-allow leaves an unreviewed commit on the caller's branch.

**Superseded text below, kept for the reasoning.**

### M-068 — nothing stops a subagent committing

- **Rule:** "the implementer ends at a report; YOU commit and push (it never does)" — `CLAUDE.md` §5 and §7
- **Where it lives:** `CLAUDE.md` §5, the implementer bullet
- **Rung:** hook · **Blast:** other
- **Sketch:** `.claude/hooks/agent-write-scope.js` declares `// @matcher Write|Edit|MultiEdit|NotebookEdit` — it gates *where* an agent writes and never sees `Bash`, so `git commit` from inside a subagent is ungated. `bash-gate.js` denies `--no-verify` and force-push and asks on `git push`, none of which is "a subagent must not commit". Sketch: extend the write-scope hook's matcher to `Bash` and deny `git commit` / `git merge` / `git rebase` when `agent_type` is set, reusing the E7 `agent_type` field the hook already reads. Probe both directions — a commit attempted from an agent must be denied, and the same command from the main session must pass untouched.
- **Exposed, not created, by the E10 ruling (2026-08-20):** worktree isolation never enforced this either. It made a subagent's commit land on a throwaway branch instead of yours, which hid the behaviour rather than preventing it — and it hid it *while making the agent's work invisible to your tree*, which is the E10 defect. Dropping isolation removes the accidental concealment and leaves the real gap in view. Do not read "isolation used to protect us here" into it.
- **Covering spec:** NEW

### M-074 — the purge clock advances whether or not the 30-day warning is ever delivered

- **Rule:** counsel ruling 2026-08-20 — the Day-0 cancellation notice may state a *minimum retention period* instead of a deletion date, **"provided the surrounding lifecycle actually delivers the eventual date"**. The 30-day warning is that delivery. It is therefore a condition of the Day-0 disclosure being sufficient, not a courtesy send.
- **Where it lives:** the counsel ruling recorded in `brief/legal/CANCELLATION_EMAIL_TEMPLATES_v1.1.md` and the header of `lib/comms/templates/agent/subscriptions/cancellation.tsx`. No code depends on it.
- **Rung:** check (+ schema) · **Blast:** data-boundary
- **Measured at `e4d75e3e`, 2026-08-20 — `processPurgeWarnSub` (`app/api/cron/subscription-purge-warnings/route.ts:78-110`) advances the lifecycle before, and independently of, any delivery:**
  - `purge_eligible_at` and `purge_warning_sent_at` are written **first**; the send happens after.
  - The send is wrapped in `.catch()` that only `console.error`s. A failed send does not fail the step, does not roll back the date, and does not retry the *step*.
  - `if (contact)` — when `fetchOrgContact` returns no contact, **no email is attempted at all** and the clock still advances: the update already landed, `recordAudit` runs, the function returns `true`.
  - `purge_warning_sent_at` **records that the cron ran, not that mail was delivered.** The column name asserts a delivery the code never establishes — which is why the gap reads as covered.
  - Nothing downstream re-checks. `processFinalWarnSub` guards against duplicate *final* warnings via `communication_log`, but no step makes purge conditional on the 30-day warning having been delivered.
- **What that means after the ruling:** an org can be purged having never received the exact deletion date, while the Day-0 notice it *did* receive was sufficient only on the premise that the date would arrive. The two-stage disclosure silently collapses to one stage, and the failure is invisible — a `console.error` in a cron log.
- **Sketch — THREE parts, not one. `defer` alone is a second breach with better intentions.**
  1. **Gate purge on delivery.** A `communication_log` row for `subscription.purge_warning_30d` is already written by the send path, so the signal exists. Gate `processPurgeDueSub` on it.
  2. **Defer when absent** rather than purging.
  3. **Surface every deferral as an operational item** — never log-and-continue, and **the no-contact case must be distinguishable from the send-failed case**, because they need different human responses (find a contact vs. investigate delivery).
- **⚠ Why (3) is load-bearing and not polish:** an org with **no contact can never satisfy the gate**, so it defers forever — and **indefinite retention is also a POPIA failure, in the opposite direction.** Section 14 requires deletion once retention is no longer authorised. *"We never purged it because we couldn't warn them"* is not a defence; it is a second breach. This is **L-22 on a path where the quiet failure is legally symmetrical to the loud one** — the usual asymmetry that makes "fail closed" the safe default does not hold here, and a deferral that nobody sees is not a safe state.
- **Probes, both directions and then some:** a purge with the warning logged must PROCEED · one without must DEFER · a deferral must RAISE an item · a no-contact deferral must be distinguishable from a send-failure deferral.
- **⚠ The naming class is why this survived review, and the entry says so deliberately.** `purge_warning_sent_at` is **a column named for an outcome that records an attempt.** Same shape as a commit message claiming a build failure that did not exist, and as a `documented:` flag that records intent rather than fact. **A name asserting more than the code establishes reads as covered on every skim it ever gets.** Do **not** "fix" this by renaming the column — the missing thing is the dependency, not the label — but do not let the next reader take the same skim either.
- **Timing, stated rather than assumed:** the population that can reach purge today is **empty** — no customer has cancelled, let alone eleven months ago. This is prospective, with a runway of at least eleven months past the first cancellation. **That is not licence to let it age in the register**; it is the reason it can be built properly, with the probes above, instead of hot-patched under pressure.
- **Related:** M-071 (a retried send replays stored HTML, so a retry preserves the date but would drop any attachment). The date survives retry; the *step* has no retry.
- **Provenance:** found while verifying the conditions counsel attached to their approval. The approval created the dependency — before it, a missed warning was an ops nuisance; after it, it is the leg the Day-0 disclosure stands on.
- **Covering spec:** ADDENDUM_57G §11.3 · counsel ruling 2026-08-20

### M-071 — attachments are supported, unimplemented, and silently dropped on retry

- **Rule:** ADDENDUM_57G §11.3 — the T-30 purge warning goes *"with full export bundle attached"*. Not implemented, and not implementable as a one-line parameter.
- **Where it lives:** §11.3 only. No code, no check.
- **Rung:** check (+ migration) · **Blast:** data-boundary
- **Measured at `f7c51d89`, 2026-08-20 — three states, and the first two readings each got it wrong in opposite directions:**
  - **SUPPORTED.** `SendEmailParams.attachments?: Array<{ filename; content: string | Buffer; contentType? }>` (`lib/comms/send-email.ts:86`), forwarded to Resend (`:341`). `sendPlatformEmail(params: SendEmailParams)` spreads the whole object into `sendEmail` (`lib/subscriptions/sendWithRetry.ts:28,37`). A first send would carry an attachment today.
  - **UNIMPLEMENTED.** Nothing passes one on this template. The warning templates render `<EmailButton href={appUrl}/reports>`.
  - **SILENTLY DROPPED ON RETRY.** `drainPlatformEmailRetries` rebuilds a fresh `{ orgId, templateKey, to, subject, rawHtml }` from `platform_email_retries` (010 §1248 — columns `subject` + `body_html`, **no attachments column**). The retry re-sends from stored HTML.
- **The defect this would ship if built naively:** an email that arrives **with** the bundle on the first attempt and **without** it on every retry — on the path that exists precisely because these sends matter, for the recipient whose delivery already failed once, with nothing reporting the difference. The customer receives a POPIA-adjacent statutory notice that promises an attachment it does not carry.
- **Sketch:** one change across both halves or it is not started. (1) An `attachments` column on `platform_email_retries` plus persistence and replay in the drain; (2) the send site passing the bundle; (3) a check asserting the drain's field set is a superset of what the sender accepts — the general form, so the next field added to `SendEmailParams` cannot silently fail to survive a retry. Probe both directions: a retried send WITH an attachment must arrive with it, and a field added to the sender but not the retry table must FAIL.
- **Do not build without a ruling.** Emailing a full PII bundle unprompted has its own POPIA posture, and CD ruled 2026-08-20 that **the spec moves — a link satisfies §11.3**. This entry is the build if that ruling is ever reversed, and the reason reversing it is not cheap.
- **Provenance:** the claim "the code cannot attach" was asserted from a single-file grep, propagated to four documents, and falsified by a cleared session that resolved the type instead. See L-42/L-43 in `dev-standards/ledgers/LESSONS.md`.
- **Covering spec:** ADDENDUM_57G §11.3

### M-072 — `bash-gate` matches a flag token without checking which command owns it — ✅ BUILT 2026-08-22

- **Rule:** `--no-verify` is forbidden on commit/push (`CLAUDE.md` §3, hook-denied).
- **Where it lives:** `.claude/hooks/bash-gate.js`.
- **Rung:** hook · **Blast:** other
- **Measured at `f7c51d89`, 2026-08-20:** `git push > "$LOG" 2>&1; ...; grep -n "vitest" "$LOG"` was DENIED with *"-n is --no-verify on commit/push and is forbidden"*. The `-n` belongs to `grep`, not to `git push`. The hook found a git verb and a denied flag token in the same command string and joined them.
- **Token-anchoring's fourth costume, in the hook family M-068 just corrected.** The first three: `\b` after `merge` matching inside `git merge-base`; `git -C /repo commit` defeating a flags-then-subcommand pattern; a grep for a parameter name where the parameter arrives through a type. Same root — **the token found is not the token meant.**
- **Sketch:** same fix as M-068's. Find the command, then check only the flags belonging to *that* command — split on `;`/`&&`/`||`/`|` into segments, identify the segment whose leading verb is `git`, and match denied flags within that segment alone. Probe both directions: `git push --no-verify` must DENY, and `git push && grep -n x f` must ALLOW. **The known-good half is the half that finds these** — it is how both M-068 bugs surfaced.
- **Direction of the failure:** fail-safe (a false deny, not a false allow), which is why it is a register entry and not an incident. But it blocks legitimate reads, and a gate that cries wolf is a gate people learn to route around.
- **Sharper instance, found while filing this entry:** the commit message documenting M-072 and M-073 was itself DENIED, because its prose contained the words for a hard reset while describing why that operation is hook-denied. No command was being run — the string was heredoc text destined for a commit message. **The hook cannot distinguish a command from prose about a command**, which means the class it guards is also the class it prevents you from writing down. M-068's entry already accepted this direction of error (`rg "git commit" docs/` is denied); what is new is that it obstructs the register entry describing it. Segment-aware matching fixes both.
- **Covering spec:** NEW

- **Re-measured 2026-08-21 at `3e785e61`, five cases, both directions — the entry is UNFIXED and the fix that landed did not reach it.** `bash-gate.js` gained real `segments()` splitting for M-068, but the flag rule at `DENY_PATTERNS` is still a regex over the RAW command string whose `[^\n]*` spans `;`, `&&` and `|`. Three of four known-good cases DENY:
  - `git push && grep -n vitest /tmp/log` → denied, *"-n is --no-verify on commit/push and is forbidden"*. **The `-n` alias is still live** — this is the original `f7c51d89` case, unchanged.
  - the flag appearing in a LATER segment of a command whose first segment is `git push` → denied.
  - the flag named inside a `git commit -m` MESSAGE → denied.
  - `rg` for the flag under `docs/` → correctly ALLOWED, so the prose problem is narrower than the entry claimed: it is the git-verb-plus-later-text span, not any mention.
- **Found while re-measuring, first-hand:** the probe could not be run inline at all. A single Bash command containing the flag as a quoted test case was denied by the hook under test, so the probe had to be written to a file that assembles the token from fragments. **The control obstructs its own measurement**, which is one turn worse than obstructing its own documentation.
- **Probe, kept:** `scripts/` has no home for it yet; the five cases are reproduced in the bullet above so the next attempt starts from the measurement rather than the code.

**✅ BUILT 2026-08-22.** Both raw-string flag rules replaced by `isNoVerify()` in `.claude/hooks/bash-gate.js`, mirroring `isForcePush`'s idiom: `segments()` → `commandIndex(tokens, "git")` → find the verb among the remaining tokens → test for the flag as a STANDALONE TOKEN in that segment alone. Nine probes added to `scripts/check-bash-gate.mjs`, four of them known-good, including the original `f7c51d89` command verbatim (it now resolves to **ask** — an ordinary push — which was the correct answer all along).

- **The fix is NARROWER than this entry proposed, and the boundary is a security one.** "Segment-aware matching fixes both" (the prose bullet above) is only half right. Prose about the flag inside a commit **message** is fixed — but by masking the VALUE of `-m`/`--message` specifically, not by stripping quoted spans generally. `normToken` already removes quote characters, so `git commit "--no-verify"` normalises to the bare flag — and it genuinely *is* a flag, because the shell strips those quotes before git sees the argument. A general quoted-span strip would have waved through the exact command the rule exists to stop. Only a `-m` value is inert, because git treats it as text whatever it spells. That case is now a DENY probe labelled as the no-bypass boundary; if it ever flips to allow, the masking has been widened into a hole.
- **What stayed a false deny, deliberately:** a command mentioning the flag outside a `-m` value in the same segment as a git verb. Same accepted direction as the `rm` rule's — a false deny costs a rephrase.
- **The finding this entry ends on is not about the flag.** Four separate rules in ONE file — `rm`, force-push, `.env`, and now this — each shipped matching characters *around* the thing instead of the thing, and each was fixed in isolation. `segments()` was built for the first and sat twenty lines above the last two for a full day without being carried across. **A lesson landing on one rule does not propagate to its neighbours**, and the sweep after a fix has to be the whole file, not the rule that prompted it. → [[l-44]]


### M-073 — nothing local stops a commit landing on the default branch — ✅ BUILT 2026-08-21

- **Rule:** "If on the default branch, branch first" — and `main` is ruleset-protected on the remote.
- **Where it lives:** prose only. `CLAUDE.md` §3 covers push policy; `.githooks/pre-commit` runs `npm run check` and says nothing about which branch it is on.
- **Rung:** hook · **Blast:** other
- **Measured at `f7c51d89`, 2026-08-20:** five commits were made directly on local `main` and every local gate passed — `npm run check` green on each. The violation was caught only by the GitHub ruleset at push time (`GH013`, "Changes must be made through a pull request"), after which the commits had to be moved to a branch and local `main` reset. **M-007's shape exactly:** a rule stated in `CLAUDE.md` with no local gate, where the remote is the first thing that notices.
- **Sketch:** a `.githooks/pre-commit` guard failing when `git branch --show-current` is the default branch, resolved from `origin/HEAD` rather than hardcoded. Cheap, and it catches the error at the point where fixing it is one `git switch -c` instead of a reset. Probe both directions: a commit on `main` must FAIL, and the same commit on any other branch must PASS.
- **Why the remote catching it is not good enough:** by then the work is committed, and the remedy (`git reset --keep`) sits one keystroke from `git reset --hard`, which is hook-denied for good reason. A local gate keeps the recovery trivial rather than adjacent to a destructive operation.
- **Covering spec:** NEW

- **SECOND occurrence, 2026-08-21 — and the first one the remote did not catch either.** Work in this session was committed directly onto local `main` again: `git status` at session start named a feature branch, that branch had since been merged and deleted, and the checkout was left on `main` with nothing saying so. Four commits landed before it was noticed. Every local gate passed, exactly as measured at `f7c51d89`.
- **What the recovery cost, which is the part that argues for the gate:** the fix was `git switch -c chore/dead-code-burndown` followed by `git branch -f main origin/main` — chosen specifically to avoid `git reset --hard`, which is hook-denied. That is the entry's own "one keystroke from a destructive operation" prediction, met in practice, by a session that knew the rule.
- **This makes it a recurrence, not an anecdote.** Two occurrences, months apart, both by a session with the rule in context, is the signature of a rule that prose cannot hold — and `.githooks/pre-commit` now EXISTS (M-007), so the sketch is no longer "add a hook" but "add three lines to a hook already running on every commit".

**✅ BUILT 2026-08-21, in the session that produced the second occurrence.** `.githooks/pre-commit`
refuses a commit whose branch is the default, resolved from `refs/remotes/origin/HEAD` rather than
hardcoded — a repo defaulting to `master` gets the same guard, and the probe resolves it the same way
so it cannot pass by agreeing with a hardcoded "main" on both sides. It runs **before** the check
chain, which is the property that keeps the remedy at one `git switch -c`.

Five probes in `scripts/check-git-hooks.mjs`, both directions: the default branch BLOCKS, the refusal
says why, the guard fires even when the chain seam says the chain would pass (proving order), a
normal feature branch is untouched, and `<default>-but-not-quite` passes — the last two are the half
that catches an over-broad guard, without which "block everything" would score green.

**One design note worth keeping.** The guard is skipped under `PLEKS_HOOK_PROBE=1` unless its own
seam opts in. Without that, `npm run check` would fail *on the default branch* — `check-git-hooks`
spawns the real hook, so the guard would fire during an ordinary check run that is not committing
anything. A gate that makes the gate unrunnable is the failure this file keeps recording in other
forms; here it was caught before shipping rather than after.


### M-070 — a generated seed artefact with no regeneration check

- **Rule:** `lib/comms/templates/seed/generated/document_templates.seed.generated.sql` is generated from `lib/comms/templates/seed/*.ts` by `scripts/gen-template-seed.mts`. The committed artefact is expected to match its source.
- **Where it lives:** nowhere. Not a CLAUDE.md bullet, not a rule file, not a check.
- **Rung:** check · **Blast:** data-boundary
- **Measured at `e5e7abf9`, 2026-08-20:** `scripts/gen-template-seed.mts` is **referenced by nothing** — not `package.json`, not CI, not any `check-*.mjs`. A repo-wide grep for `gen-template-seed` returns only the file itself. `check-drift-if-sql-changed.mjs` and `check-schema-drift.mjs` cover Supabase *schema* drift, not this generator. Source and artefact were in sync at the time of measurement (mtimes 4 ms apart, same regeneration run) — **which is a property of whoever last ran it by hand, not a maintained invariant.**
- **Sketch:** regenerate to a temp file, diff against the committed artefact, fail on mismatch. Standard generated-artefact guard; the generator already exists, so this is wiring plus a probe, not new machinery. Probe both directions: an edited source with a stale artefact must FAIL, and a freshly regenerated tree must PASS.
- **Why it matters more than a normal codegen drift:** the rows carry `legal_review_ref` values (`ADDENDUM_70C §8.8`, `§10.1`, `§10.3`) and some are `locked: true` counsel-signed copy. A silent divergence between source and artefact means the text counsel signed and the text that reaches the database are two different strings, with nothing reporting it. The failure is invisible by construction — a stale artefact is a valid SQL file that applies cleanly.
- **Live instance of exactly that:** `subscription.cancellation_confirm` (generated:890) still promises a deletion date — "your data is available until `{{purgeEligibleAt}}`" — after `e5e7abf9` moved the code path to a period-based promise. Not a drift defect *yet*, because both source and artefact are equally stale, which is the point: they agree with each other and disagree with the product. Settling that is counsel's call (see the item-3 fork), but when it is settled, three surfaces must move together and only two of them are in TypeScript.
- **Provenance:** found 2026-08-20 while checking whether a third copy of the Day-0 cancellation text was a live implementation or an inert seed. It was inert — and the *reason* the check was cheap to run is that generated and source happened to agree. Filed because the next person will not be that lucky.
- **Covering spec:** NEW

### M-069 — two competing Information-Regulator SSOTs, and the declared one has zero importers

- **Rule:** `lib/comms/templates/ApplicantLegalFooter.tsx:25` — its own JSDoc: `INFORMATION_REGULATOR_URL` is the "single source for every IR reference in comms", deliberately the WEBSITE only, because the postal/email/phone details "have changed repeatedly, and a stale address on an immutable evidence record is a defect", and it "normalises the older justice.gov.za/inforeg references onto the current site".
- **Where it lives:** that JSDoc. No CLAUDE.md bullet, no rule file, no check.
- **Rung:** eslint · **Blast:** data-boundary
- **Measured at `b2587295`, 2026-08-20** (`rg 'inforegulator|justice.gov.za|023 5207'` over `app/` + `lib/`): **34 lines across 14 files**, and **zero importers of `INFORMATION_REGULATOR_URL`**. Every one of the three things its header forbids is present in the tree:
  - **A second, competing SSOT that is the one actually used** — `lib/external-links.ts:13` `informationRegulator: "https://inforegulator.org.za"`, consumed via `ExtLink` in `app/(public)/privacy`, `paia-manual`, `popia-register`. Two constants for one fact, and the documented one lost.
  - **The volatile details pinned anyway** — `complaints.IR@justice.gov.za` and `+27 10 023 5207` inline in ~10 sites, including two `locked: true` counsel-reviewed seed templates (`lib/comms/templates/seed/info-requests.ts:404,445`, `legalReviewRef: ADDENDUM_70C §10.1/§10.3`) and a postal address in `privacy/page.tsx:555` / `paia-manual/page.tsx:119`.
  - **The old domain it exists to normalise away from, still live** — `https://www.justice.gov.za/inforeg/` at `my-data/page.tsx:95`, `landlord/privacy:134`, `supplier/privacy:118`, `tenant/privacy:126`.
- **Sketch:** an ESLint `no-restricted-syntax` over string literals matching `/inforegulator|justice\.gov\.za|023 ?5207/` outside the two constants files, in the shape of `no-rerolled-money-format`. Ship it **baseline-first**: the population is 34 and at least the two `locked: true` seed sites are counsel-signed copy that may not be edited without a Part-F sign-off, so a rule with no baseline turns a documentation defect into a red gate on legal text. Classify per site before recording a number.
- **The decision that must precede the rule, and it is CD's:** which constant wins, and whether a data-subject response may cite only a website. `ApplicantLegalFooter`'s argument (an immutable evidence record must not pin a mutable address) is strong and is the reason the URL-only form exists; but a POPIA §74 escalation notice that omits the Regulator's email may be legally thinner. That is a counsel question, not a lint question, and building the rule first would encode whichever answer the regex happened to prefer.
- **Second instance of M-067's class, same sweep:** a stated SSOT/MUST with zero call sites is not dead code — it is an unenforced invariant, and the constant's *existence* has been standing in for the enforcement. Two in one tranche makes it a class worth naming, not a coincidence.
- **Provenance:** surfaced by the knip tranche-2 census as a two-site note (`info-requests.ts:404,445`); the real population is 34/14, found on filing. The artefact's version was under-measured — a count that was never taken reads identically to one that was. Artefacts archived at `brief/build/_AGENT_ARCHIVE/knip-tranche-2/` (untracked — `brief/` is a OneDrive symlink).
- **Covering spec:** NEW

### M-067 — `excludePlatformOrg` is a stated MUST with zero call sites

- **Rule:** `lib/comms/platform-org.ts` — its own JSDoc: every "for each org" query MUST exclude the platform org
- **Where it lives:** the helper's header comment. No CLAUDE.md bullet, no rule file, no check.
- **Rung:** eslint · **Blast:** data-boundary
- **Sketch:** found 2026-08-20 by the knip tranche-2 sweep, which flagged the export as unreferenced. It is not dead code — it is an **unenforced invariant**, which is the more dangerous reading of the same evidence: the guard exists, the rule is written down, and **no query in the tree applies it**. Either every org-iterating query is already safe for a reason the comment does not give, or the platform org is silently included in fan-outs that were meant to exclude it. Nobody has established which, and the helper's existence has been standing in for the answer. Two pieces of work, in order: (1) census every "for each org" query and classify per site whether platform-org inclusion is a defect there — the answer decides whether this is a burn-down or a no-op; (2) only then, an ESLint rule over org-iterating query shapes. Do NOT build (2) first; a rule with no measured population is how a check's first number becomes a finding.
- **Covering spec:** NEW

### M-075 — `check-git-hooks`'s probes are not concurrency-safe

- **Rule:** a probe's result must be a function of what the tree SAYS, never of what else is running — the same family as **M-064** ("a check must not depend on how the tree was materialised"), one axis over: time rather than checkout
- **Where it lives:** `scripts/check-git-hooks.mjs` — the probes that spawn real `.githooks/*` invocations with a shimmed `npm`
- **Rung:** check · **Blast:** other
- **Measured, 2026-08-21, not inferred:** two `npm run check` chains run concurrently against one checkout produced **3 failing probes in one chain and 1 in the other** — different failures, same tree, same commit (`078926eb`), both spurious. Named: `pre-commit passes when "npm run check" succeeds`, `pre-merge-commit passes when …`, `prepare-commit-msg: a marker for THIS tree skips the gate`, and in the other chain `prepare-commit-msg passes when …`. The probes shell out to the real hooks, which resolve and invoke `npm run check` themselves, so two chains contend over hook state and over the marker file that records "this exact tree already passed".
- **Why it is filed rather than fixed on sight:** it is **harmless today and the reason is worth stating** — nothing runs two chains on one checkout, and CI gets a fresh one per job. Filing it is not a plan to fix it; it is so the next person who sees these four probes fail does not go looking for a defect in the hooks. **A probe that can report a defect that is not there costs more than one that misses**, because it is chased.
- **The sharper consequence, and the reason this is not merely trivia:** it makes the two-chain concurrency test unusable for diagnosing anything downstream of it. That is exactly how it was found — the test was aimed at the vitest zero-collection intermittent, and **both chains died here, before vitest ran**, so the trial measured nothing about its target. A concurrency-unsafe check early in a chain is a blindfold over every step after it.
- **Sketch:** give the hook probes a per-process scratch root and a unique marker path (they already build fixtures in `os.tmpdir()`; the contention is over the shared repo-relative marker and the shimmed `npm` resolution), then probe the property directly — run the probe body twice concurrently and require both green. Do NOT "fix" it by serialising the check; that hides the shared state rather than removing it.
- **Related:** M-064 (materialisation-independence) · [[l-44]] (a probe and the thing it guards, authored by the same hand) — this is a third axis on the same theme: a probe whose result is a function of something other than the artefact under test.
- **Covering spec:** NEW

**Retained 2026-08-21:** a check that reports defects which are not there, early in the chain, blinds every step after it — which is how it was found, with both chains dying here before vitest ran. Note the shape of the value: this entry pays off by EXISTING, because it stops the next person hunting a phantom in the hooks. An entry whose worth is in being readable is the last kind to delete for being cheap.


### M-076 — the re-entry cap cannot fire, because the artefacts erase the loop as it runs

- **Rule:** `dev-standards/playbooks/4-AGENT-PIPELINES.md` §3.1b — `WALK_FAIL ⇒ IMPLEMENT`, **max 2 re-entries, then `decision-needed`**
- **Where it lives:** §3.1b, and the `⇒` edges in §4's P1/P2 diagrams that cite it
- **Rung:** check · **Blast:** other
- **The finding, and it is about the evidence rather than the rule:** the cap is prose Main follows, which was known. What was NOT known until the disposition was audited is that **the artefacts cannot evidence it either.** A task directory holds one `NN-walker.md`; three walks appended to that one file. **The loop was overwritten as it ran**, so no check counting same-agent artefacts per task could ever have fired — not because the check does not exist, but because the evidence it would count was destroyed at the moment it was produced. This is the accreting-artefact problem in a place already ruled on: **one artefact per agent step, immutable once written. Three walks are three steps.**
- **Sketch — two parts, both cheap:**
  1. **Walks number sequentially** like every other step: `03-walker.md`, `05-walker.md`, `07-walker.md`. No new convention — the existing immutability ruling already requires it; the practice had drifted to append-in-place because a walk "continues" the previous one conceptually. It does not: it observes a **different tree**.
  2. **A check fails a task directory carrying more than three artefacts of one agent type** (one initial + two permitted re-entries). Aperture is the task directory; the count is the whole test. Probe both directions: a directory with three walker artefacts must PASS, one with four must FAIL.
- **⚠ Do not build (2) without (1).** With artefacts appended in place the check counts 1 forever and passes green having measured nothing — the green-and-unfailable class, arrived at by building the enforcement half of a two-part fix. The naming change is the load-bearing half.
- **Until both exist, the rule is UNENFORCEABLE by the standard's own grammar and is now marked so at its site.** It had been reading as a bound.
- **Not a criticism of the run that found it.** The cap DID hold at pleks M-063 — the pipeline exited `⊗ MAIN` at walk 3 and Main finished by hand. But it held because Main stopped, and the surviving artefacts cannot distinguish that from a Main that did not. **A rule that was obeyed and cannot be shown to have been obeyed is indistinguishable from one that was not**, which is the whole reason acceptance item 5 exists.
- **The cap's rationale, recorded at the same site because a limit justified only by cost gets raised:** at walk 3 the four remaining findings were one-line probe fixes — exactly the shape that makes a fourth re-entry feel obvious. Taking them by hand is what surfaced that one had **no probe-side fix** and needed a tree-derived guard rather than another patch. **The cap forces a mode switch, and the mode switch finds a different class of thing.**
- **Related:** [[l-44]] (the tree-derived guard that finding produced) · M-064, M-075 (probes whose result is a function of something other than the artefact under test)
- **Covering spec:** `dev-standards/playbooks/4-AGENT-PIPELINES.md` §3.1b · §11 step 4b item 5

### M-077 — `HELP_CONTENT_DRAFT` is a sign-off gate that nothing reads

- **Rule:** `lib/help/help-data.ts:8` — its own header: "⚠ DRAFT — `HELP_CONTENT_DRAFT` is true until Stéan's §7 content-compliance pass signs off every answer"
- **Where it lives:** that header comment and the constant's own declaration. No CLAUDE.md bullet, no rule file, no check.
- **Rung:** eslint · **Blast:** other
- **Measured at `b2eda39d`, 2026-08-21** (repo-wide `HELP_CONTENT_DRAFT`, excluding `docs/DEAD-CODE-QUEUE.md`): **two hits, and both are the declaration** — the header sentence at :8 and `export const HELP_CONTENT_DRAFT = true` at :40. **Zero readers.** The `/help` page and the help widget import `HelpRole` and the content itself and never consult the flag, so the un-signed-off state is asserted in a comment and rendered to users regardless.
- **Third instance of M-067's class, and the class is now confirmed rather than suspected.** M-067 (`excludePlatformOrg`, a stated MUST) and M-069 (`INFORMATION_REGULATOR_URL`, a stated SSOT) are the same shape: **a constant whose existence stands in for the enforcement it names.** Three in two sweeps from independent domains — comms fan-out, legal copy, help content — makes it a repo-wide pattern with a single generalisable check, not three unrelated dead exports.
- **Sketch — and note this one is cheaper than its two siblings, which is why it is worth doing first:** unlike M-067 (needs a per-site census before any rule) and M-069 (blocked on a counsel decision about which constant wins), this flag has **no prior decision to make**. Either it gates something or it should not exist. Two candidate shapes: (a) the narrow one — `/help` refuses to render, or renders a visible draft banner, while the flag is true, which converts the comment into behaviour; (b) the general one — a check that any `export const *_DRAFT`/`*_REQUIRED`-shaped boolean with zero readers fails, which is the class-level rule the three instances argue for. **(a) is a one-file change and provable; (b) needs its population measured before a number is recorded.** Do not ship (b) on a population of three.
- **The reading that makes this a finding and not a knip deletion:** the export is unreferenced, so a dead-code sweep proposes deleting it — which would remove the *only* record that the content is unsigned, leaving the tree in the state the header warns against with nothing saying so. **Deleting an unenforced invariant is strictly worse than leaving it,** because it converts a visible gap into an invisible one. Same trap as M-067 and M-069.
- **Provenance:** surfaced by the `census → census ×4` fan-out over the knip census (slice 3), classified JUDGMENT/other; **verified independently on filing** rather than taken on the child's word — the grep above and the absence of an existing register entry were both re-run against the tree. Artefact: `docs/DEAD-CODE-QUEUE.md` (Appendix C + the Promote section).
- **Covering spec:** NEW

### M-078 — counsel-reviewed disclaimer text exists three times, and the SSOT copy is the unused one

- **Rule:** `lib/leases/disclaimer.ts:12,47` — its own comments name both source documents (`brief/legal/FINAL_PLATFORM_DISCLAIMER.md`, `brief/build/ADDENDUM_44A_CREDIT_TERMS.md §3`) and mark both constants "attorney reviewed". A constant that cites a legal source document IS a claim to be the SSOT for it.
- **Where it lives:** those two comments. No check; `no-rerolled-money-format` and `no-adhoc-dates` guard their SSOTs, nothing guards this one.
- **Rung:** check · **Blast:** data-boundary (liability text on a document a tenant signs)
- **Measured at `b2eda39d`, 2026-08-21** — read at all three sites, not inferred from the census:
  - `DISCLAIMER_GATE_TEXT` (`disclaimer.ts:14`) — **zero importers.** The live modal, `components/leases/LeaseDisclaimerGate.tsx`, hand-types the same text into a `SECTIONS` array: all six clause bodies verbatim, the intro paragraph verbatim, the "By clicking 'I accept'" closer verbatim.
  - `DOCUMENT_DISCLAIMER_TEXT` (`disclaimer.ts:49`) — **zero importers.** `lib/leases/generateDocument.ts:692-711` builds `platformDisclaimer` from an inline array whose four strings are byte-for-byte the constant's four paragraphs, under the same `IMPORTANT NOTICE` heading — **including a duplicated copy of the source-document comment.**
- **The two copies are NOT equally checkable, and that difference decides the mechanism:** the PDF copy is a clean structural split — prefix the heading, `join("\n\n")`, and it reconstructs the constant exactly, so an equality assertion is possible today. The gate copy is **not** reconstructable: headings are title-case in the component and UPPERCASE in the constant, and the constant's lead sentence ("Before using the Pleks lease template system…") has no counterpart in the modal, which opens with a header and a scroll instruction instead. **So the honest fix is asymmetric** — the PDF site can simply import the constant; the gate site needs the constant restructured into the sections the UI actually renders before it can. A check written as "these two strings are equal" would pass on the PDF and fail on the gate for a reason that is not a defect.
- **Sketch:** (1) wire `generateDocument.ts` to `DOCUMENT_DISCLAIMER_TEXT` and delete the inline array — one edit, provable by a test asserting the generated paragraphs equal the constant's split; (2) restructure `DISCLAIMER_GATE_TEXT` into the `{heading, body}[]` shape the modal renders, export that, and have both the modal and any future plain-text rendering derive from it; (3) only then, a check that the disclaimer strings appear nowhere outside `lib/leases/disclaimer.ts` — the `no-rerolled-*` shape. **Order matters: (3) before (1) and (2) is a red gate over attorney-reviewed copy with no legal fix available.**
- **Why this is a defect and not dead code, stated plainly because the sweep proposed the opposite:** knip flagged both constants as unused exports. Deleting them removes the only file that names which legal source document each block of text came from, leaving two hand-maintained copies of liability wording with no provenance and no link to each other. **Counsel amends one document; whoever applies the amendment has to know there are two places, and after the deletion nothing tells them.** The failure mode is a lease PDF and an acceptance modal that disagree about what the user agreed to — which is exactly the artefact that would be produced in a dispute.
- **Related:** M-077 (same fan-out, same "unused export is really an unenforced invariant" reading) · M-069 (two competing SSOTs, declared one has zero importers — this is that pattern with the copies inline rather than in a second constant)
- **Provenance:** surfaced by the fan-out's slice 3, classified JUDGMENT/security-compliance; **all three sites read on filing**, and the gate-copy asymmetry above is a correction to the artefact's "word-for-word" summary, which was true of the clause bodies and loose about the lead. Artefact: `docs/DEAD-CODE-QUEUE.md`.
- **Covering spec:** NEW

### M-079 — the implementer's unrestricted write grant is defended by a control E10 removed

- **Rule:** `.claude/hooks/agent-write-scope.js` — `implementer: null` in `SCOPES`, justified in the same file as "implementer's whole remit IS editing source, and its containment is **the worktree it is spawned into**, not a path list"
- **Where it lives:** that comment, and nowhere else. The grant itself is one line of a lookup table.
- **Rung:** hook · **Blast:** other
- **The finding, and it is about the JUSTIFICATION rather than the grant.** There is no worktree any more. The E10 ruling moved implementer to the main checkout, and **the same file's header says so three paragraphs above** — "Dropping isolation (E10 ruling) removed the concealment". So one file simultaneously records that isolation was dropped and cites isolation as the containment for its only unrestricted write grant.
- **The grant may well still be right** — path-scoping an agent whose entire job is editing arbitrary source is close to impossible, and the alternative (ask on every edit) makes the implementer useless. What changed is what actually contains it: **the caller's review of a dirty tree, plus the commit denial in the same hook.** Those are different guarantees from a throwaway checkout, and neither is named at the site.
- **Sketch:** replace the stale sentence with the two controls that really apply, and state the residual exposure plainly — an implementer can write anywhere in the main checkout, and the only thing between that and a landed change is a human reading `git status`. If that is too thin, the mechanism is not a path list but a **write manifest**: the caller declares the files in scope at spawn time and the hook denies outside them. That is buildable today — `agent_type` and `cwd` are both in the payload — and it is the shape the spine's "declared scope" language already assumes exists.
- **Why it is filed rather than fixed on sight:** changing a security posture on the strength of a stale comment is how the posture got stale. The grant is a deliberate decision that needs re-taking with the current facts, not a typo.
- **Related:** E10 (`docs/EXPERIMENTS.md`) · M-068 (nothing stops a subagent committing — the control that now does half this work)
- **Provenance:** CD review, 2026-08-21, against `.claude/hooks/agent-write-scope.js` read in full at `ca4689dc`. **E10 fallout nobody swept.**
- **Covering spec:** NEW

**Retained 2026-08-21:** a standing security grant whose only written justification names a control the E10 ruling removed. CD-authored, and the entry is explicit that the grant may still be right — what it needs is re-taking against current facts. That is a DECISION pending, not a build not done, and closing it would retire the question rather than answer it.


### M-080 — two hooks match `Bash` and their precedence is undocumented and unprobed

- **Rule:** implicit — when two PreToolUse hooks both match a tool and return different decisions, one wins. Nothing states which.
- **Where it lives:** nowhere. `bash-gate.js` matches `Bash`; `agent-write-scope.js` matches `Write|Edit|MultiEdit|NotebookEdit|Bash`. Every Bash call in every subagent runs both.
- **Rung:** check · **Blast:** other
- **Why it matters, specifically:** the **force-push denial lives in one hook** and the **subagent commit denial lives in the other**. Presumably most-restrictive wins — but that is an assumption, neither file asserts it, and **no probe exercises the disagreement case at all**. Both suites test their own hook in isolation, which is precisely the configuration in which a precedence bug is invisible.
- **Sketch:** construct one payload the two hooks decide DIFFERENTLY — a subagent running an ordinary commit, which `bash-gate` allows and `agent-write-scope` denies — and assert the composite decision the harness actually applies. **This is a measurement before it is a check:** the answer is a harness behaviour nobody here has observed, so it belongs in `docs/EXPERIMENTS.md` first and becomes a probe once known.
- **⚠ Do not write the check against the assumed answer.** "Most restrictive wins" is the intuitive design and would produce a check that passes by agreeing with itself. Measure, then encode.
- **Related:** E7/E8 (what the payload carries) · [[l-44]] (a probe and the thing it guards, authored by the same hand)
- **Provenance:** CD review, 2026-08-21. Not read as part of it: `.claude/hooks/mcp-ddl-gate.js`, which may make it three hooks rather than two.
- **Covering spec:** NEW

**Retained 2026-08-21:** it is a MEASUREMENT before it is a check. The force-push denial lives in one hook and the subagent-commit denial in the other, nothing has ever exercised their disagreement, and the entry already warns against writing the check against the assumed answer. Closing it closes an unasked question about two rung-1 controls.


### M-082 — `RETENTION_PROTECTED_TABLES` governs nothing, and two artefacts say it does

- **Rule:** the tables on this list are protected from retention purges — a PPRA/POPIA obligation, not a preference. The array names `audit_log`, `trust_transactions`, `consent_log`, `auth_events`, `tos_acceptances`.
- **Where it lives:** `lib/subscriptions/retention.ts` — the array, and nothing else.
- **Rung:** check · **Blast:** data-boundary
- **Measured 2026-08-21 at `2265c58c`:** a whole-repo grep for the identifier finds the declaration and **no importer**. The array is exported, exhaustive, and read by nobody.
- **What makes it a register entry rather than a deletion.** TWO artefacts assert it is live, in the present tense, and both are wrong:
  1. its own module header — *"BUILD_65 imports this array rather than defining its own"*;
  2. `supabase/migrations/010_platform_features.sql:1690` — a table was *"Added to RETENTION_PROTECTED_TABLES"*.
  A reader who greps either one finds a list that looks authoritative and is inert. **This is the third instance of M-067's class** (a stated MUST with zero call sites), and the second where the false claim is load-bearing prose rather than absence — M-069 is the other.
- **Why the shape matters more than the count.** The failure is silent and one-directional: a purge that should skip `consent_log` skips it only if the purge author happened to hardcode the same list. Nothing fails, nothing logs, and the evidence of the omission is the *absence* of rows — the same reason the 2026-08-19 cross-org READ hole (CLAUDE.md §6) went unnoticed while the write half was guarded.
- **Sketch:** two halves, and the first is the cheap one. (a) A check asserting the array has at least one importer — the general form is M-067's, and building it once should cover all three instances rather than three times. (b) The real mechanism is at the purge sites: every `pg_cron` retention purge and every erasure path asserts its target table is NOT in this array, deriving the list by import. Until (b) exists, (a) only converts a silent lie into a loud one, which is still the right first move.
- **⚠ Do not close this by deleting the array.** The list is a correct statement of a statutory obligation. Deleting it removes the record and leaves the obligation.
- **Related:** M-067 (first instance) · M-069 (second) · M-078 (counsel text with the same "declared SSOT, unused" shape)
- **Provenance:** the 2026-08-21 dead-code burn-down. knip reported the array as an unused export; asking *why* it has no caller produced this. It is now tagged `@knipignore` at the site with this entry named, so the tool stays green without the finding being lost.
- **Covering spec:** NEW

### M-081 — three rules in one hook each re-derive "find X as a standalone token", and each got it wrong separately — **BUILT 2026-08-21 (`34468178`, `2b3a9ca9`)**

> **STATUS: BUILT, partially — and the entry stays open because one of the three rules did not migrate.**
> `segments()` + `normToken()` + `commandIndex()` now live in `bash-gate.js`; the `rm` and force-push
> rules are token matchers over them. The `.env` rule is **still an anchored regex** — see the closing
> note below for why that is a decision rather than an omission.
>
> **What the migration cost, and it is the entry's best argument:** rebuilding the `rm` rule as a
> regex first — before the helper existed — introduced EIGHT new bypasses and a quadratic blowup,
> and both survived a green 54-probe suite. Every one was found by adversarial review. The rules did
> not converge on the shared shape because someone swept; they converged because the un-swept version
> failed loudly enough to force it.
>
> **A mechanism nobody knew was already installed did the rest.** `sonarjs/super-linear-regex` has
> been configured in this repo the whole time, and `.claude/**` sat in `globalIgnores` under the
> reason "not production code" — so the one rule that catches catastrophic backtracking was pointed
> away from the security hooks. It flagged two live patterns the instant it could see them: the one
> written that day, and the force-push rule, years older, carrying the identical defect AND the
> identical "the flag follows the subcommand" assumption. **Before filing a lesson as unmechanised,
> check whether the mechanism exists and is merely scoped away from the file that needs it.**


- **Rule:** the shape all three want — locate a command or path token, independent of what surrounds it
- **Where it lives:** `.claude/hooks/bash-gate.js` (the `rm` and `.env` rules) and `.claude/hooks/agent-write-scope.js` (`deniedGitSubcommand`)
- **Rung:** check · **Blast:** other
- **Measured, 2026-08-21, three instances in two files, all defective the same way:**
  1. `deniedGitSubcommand` matched `git <flags>* <subcommand>` and was defeated by a `-C /repo` invocation on its first probe run. Fixed, with a twelve-line comment naming the lesson: **"DELIBERATELY NOT A GIT GRAMMAR PARSER."**
  2. The `rm` rule sat twenty lines from that comment still parsing `-rf?`, and missed **7 of 13** lethal spellings — including the root-glob form, the one that actually destroys a filesystem.
  3. The `.env` rule anchored on surrounding characters and asked for approval on `process.env.NODE_ENV`, in a hook whose stated posture is unattended autonomy.
- **The finding is not any of the three defects — it is that a lesson landing on one rule did not propagate to its neighbours.** Instance 1's remedy was written down, in detail, in the same file, and instances 2 and 3 were authored and reviewed past it repeatedly. The sweep stopped at the rule that prompted it, twice: the `rm` fix left `.env` untouched, and the `.env` fix initially left two of five anchors unprobed.
- **So the remedy is structural, not editorial.** "Sweep the whole file when a lesson lands" is correct and relies on somebody remembering — the thing that already failed three times. **A shared `standaloneToken(haystack, alternatives)` helper used by all three rules makes rule four correct by construction rather than by vigilance**, and gives the lesson one home instead of three comments.
- **Sketch:** extract the matcher, migrate all three rules onto it, keep every existing probe (they are the regression suite for the migration), and add the helper's own probe suite covering the union of the three rules' edge cases. **Probe-first and in that order** — the migration is only safe because 54 probes already pin the current behaviour.
- **The cost of not doing it, stated because this entry's blast radius reads as low:** two of the three instances were in DENY rules with a security remit, and one of them permitted the root-glob delete for as long as the hook has existed.
- **A live demonstration arrived while this entry was being written:** the commit carrying it was DENIED by `bash-gate` because the prose quoted a forbidden flag literally. That is the documented accepted false-deny — the rule matches a command that is merely mentioned — and it is cheap in the right direction: the author rephrases. Worth knowing before writing a register entry about a deny rule.
- **WHY `.env` DID NOT MIGRATE, recorded so the gap is a decision and not an oversight.** The other
  two rules ask *"which command is this, and what token follows it"* — genuinely the same question,
  which is why one helper serves both. The `.env` rule asks *"is this string a path or a property
  access"*, which is answered by the character BEFORE it, not by token position: `process.env` and
  `./config/.env` tokenise identically. Forcing it onto the shared helper would have been
  consolidation by resemblance rather than by shape, and the register's own standard — classify per
  site, never sweep — cuts against it. **The `.env` rule's remaining exposure is its own line:** it is
  a regex over an anchor set, and the anchor set has now been wrong twice (once over-firing on
  `process.env.NODE_ENV`, once dropping `\` and un-gating every Windows absolute path). That is a
  different mechanisation, not this one.
- **What is now enforced rather than remembered** — the reason this entry can be closed at all:
  `no-undef` and `sonarjs/super-linear-regex` run over `.claude/hooks/**` and `.claude/statusline.js`
  as of `2b3a9ca9`, probed both directions (a planted block-scope violation fails; the real tree
  passes). Rule four gets the backtracking half for free. The token-shape half is still vigilance.
  <!-- @enforced eslint:sonarjs/super-linear-regex (scoped to .claude/hooks + statusline) -->
- **Related:** M-072 (`bash-gate` matches a flag token without checking which command owns it — same family, already filed) · [[l-44]]
- **Provenance:** CD review, 2026-08-21, across three passes; the third instance was found INSIDE the sweep the second demanded, which is the evidence that the editorial remedy does not hold. Built the same day, after a fourth instance — a quadratic regex — was introduced by the fix for the second.
- **Covering spec:** NEW

---

## CLOSED — WON'T BUILD (ruled 2026-08-21)

**The ruling.** A triage of the register found 28 entries carrying neither a HIGH blast tag
(money/data-boundary/schema/auth) nor any citation outside this file. CD's ruling inverted the burden
on them: *those default to WON'T BUILD; retention requires a stated reason.* The entries below did not
carry one. Their headings are removed so `grep -cE '^### M-[0-9]+'` reflects real open work; the ID
and the reason stay, because **an entry closed without a recorded reason reopens itself** the next time
someone reads the rule it came from and has the same idea.

**Two findings the pass produced, which matter more than the closures:**

1. **The blast taxonomy under-describes a defect in a control.** `blast` records what the RULE guards,
   so an entry about a bug in `bash-gate.js` — a hook whose DENY list covers force-push, `rm -rf` on
   root, and the commit-gate bypass — is tagged `blast: other`, because the miscellany it guards is
   miscellaneous. Six of the 28 were defects in rung-1 controls, and the "no HIGH blast tag" half of
   the triage filter selected FOR them. They are retained on that ground, and the tag is the thing at
   fault, not the entries. Filed as an input to TASK 3 (control-aim audit), whose question — *is this
   control pointed where the class lives?* — is the same question one level up.

2. **Four of the 28 were already done.** M-033 and M-034 were shipped by the resolver work described
   in this file's preamble; M-049 and M-050 asked for a hook that exists, under a different name than
   their sketch watched for. **The register does not notice its own entries being satisfied** — nothing
   re-resolves a sketch against the tree, so an entry's open state means only that nobody has looked.
   That is a claim about this file of exactly the kind CLAUDE.md §8 requires an anchor for.

**M-036 — flag the literal substring `ANON_KEY` outside `lib/env.ts`**

WON'T BUILD. The hazard — a raw env read of ANY name — is already covered by `pleks/no-raw-process-env`. A literal-substring ban would fire on every document that names the trap, including CLAUDE.md's own warning and this register: the M-072 shape, bought for a string the general rule already forbids.

**M-038 — `vercel.json` guard against a `crons` key**

WON'T BUILD. Re-adding a `crons` key is a deliberate edit to a short config file, not a drift class. The completed migration off Vercel Cron is the control; a guard against reversing it on purpose guards nothing.

**M-039 — scan `app/(public)/**` JSX for un-escaped `</strong> text` (generalised)**

WON'T BUILD. Closed as a PAIR with M-040 — closing one half of a twin leaves the register asymmetric. The defect is a visible rendering fault in public prose, apparent to anyone who opens the page; and `</strong>` followed by a space cannot be told from an intended space without rendering it.

**M-040 — scan legal pages for un-escaped `</strong> text` (specific twin)**

WON'T BUILD. See M-039 — closed as its twin, same reason, same commit.

**M-043 — enumerate `app/api/cron/**/route.ts` against the orchestrator**

WON'T BUILD. Closed in favour of M-044, which asserts the sharper half of the same property. M-044 starts from a symptom that was OBSERVED; this one starts from a hazard inferred from the rule's wording. Where two entries cover one surface, keep the measured one.

**M-046 — flag a server page importing a value from a `"use client"` module**

WON'T BUILD. The failure is loud and immediate — `X.some is not a function` at render, on the first page load. A check earns its keep against SILENT failures; this class announces itself.

**M-047 — scan filled headers for surviving literal placeholder text**

WON'T BUILD. `check-file-headers` already fails on the `FILL:` stub, which is the half with consequence. A second scan for a surviving parenthetical hint guards a cosmetic class whose cost is that a header reads slightly oddly.

**M-053 — allowlist requirement on server-side `sharp(` calls**

WON'T BUILD. The entry's own sketch concedes the distinction it needs — safety net vs primary path — requires reading intent. Its proposed remedy is an inline allowlist comment, which DOCUMENTS the call rather than detecting the misuse.

**M-054 — EXIF-before-compression order test + branded `CompressedPhoto` type**

WON'T BUILD. The branded-type half is a change to the upload function's signature — a refactor, not a mechanism — and the order test without it asserts a call order in a module that could be bypassed entirely. If wanted, it belongs in the inspections spec as design work.

**M-056 — AST check flagging an enumeration test with no non-emptiness floor**

WON'T BUILD. "An `it()` whose body iterates a `readdirSync` result and asserts no floor on its length" has no crisp AST signature; the check would arrive with a baseline on day one, and CLAUDE.md §4 is explicit that a baseline is a decision log, not a parking space.

**M-057 — AST check flagging a hand-written parity-test member array**

WON'T BUILD. Same family and same objection as M-056, plus a sharper one: identifying "parity-test files by naming convention" IS the difficulty, and getting it wrong points a working rule away from the class — the MISAIMED verdict, bought in advance.

**M-058 — component-canon partial slice (`rounded-*` + shadcn `Button` import ban)**

WON'T BUILD. `rounded-md`/`rounded-lg` are widespread in the tree today, so the check's first act is a large baseline over surfaces the design doc already calls "old-style". Restyle the surfaces, then ratchet — a ratchet installed against a tree that has not moved yet only records the tree.

**M-059 — `check-subprocessor-claims.mts` mirroring `check-retention-claims.mts`**

WON'T BUILD. The check is the small half. It requires an SSOT sub-processor data file that does not exist, and building that SSOT is the actual work — it belongs to ADDENDUM_00J, with the check as its closing step, not to a queue of mechanisms.

**M-060 — parity test asserting each `createMessage` call site's model matches its task**

WON'T BUILD. `no-restricted-imports` already forces every call through one entry point. Asserting each call site's model against the routing table means encoding that table a second time, in a test, where the copy rots against the rule it mirrors.

**M-066 — every reference/wording document names its decision authority**

WON'T BUILD. Closed as a CHECK, not as an idea. The entry states the disqualifying fact itself: `brief/` is a OneDrive symlink outside version control, so this can never run in CI, and it warns against shipping it as a normal check where a CI green would read as coverage. It also puts a genuine choice to CD (accept a local-only ratchet, or move the reference documents into the tracked tree first). That choice is a DECISION, and it is recorded in `brief/build/OUTSTANDING.md` rather than left here as a build item.
