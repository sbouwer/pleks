# MECHANISABLE — the mechanisation build queue

> **Provenance of the metric.** The 98-of-122 figure was measured only AFTER fixing the marker
> audit's tag parser (commit `c0d3344b`), whose id character class excluded `@` — so scoped plugin
> ids like `eslint:@typescript-eslint/no-explicit-any` never matched. Such a tag passed the
> "bullet is tagged" string test while registering no claim, counting in NEITHER N nor D and never
> being resolution-checked: the rule left the audit while reading as enforced. Any metric quoted
> from before that commit was produced by a parser that could not see one of the tags it counted.
> This note lives here because those commits are already pushed and amending them would require a
> force-push — denied by `hook:bash-gate`, and by the push policy itself.

**60 entries** as of 2026-08-18. Extracted from the `CLAUDE.md` + `.claude/rules/*.md` triage pass
(`node scripts/check-claude-md.mjs`), which found ~100 of ~118 rules UNENFORCEABLE and, of those, 60
carrying a `MECHANISABLE (rung: … · blast: …)` sketch of what a mechanism would assert. This register
holds the sketches so they stop paying rent in the always-loaded files; the source files now carry a
one-line pointer (`MECHANISABLE → M-0NN`) instead.

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

### M-033 — explicitly declare `@typescript-eslint/no-explicit-any` so it's resolver-visible
- **Rule:** "`any` types leaking through (fix them, don't suppress)" (`CLAUDE.md`, DB ACCESS)
- **Where it lives:** `CLAUDE.md:179-180`
- **Rung:** eslint · **Blast:** other
- **Sketch:** genuinely enforced (verified: `@typescript-eslint/no-explicit-any` fires as an error on a planted `const x: any = 1`, part of `eslint . --max-warnings 0`), but it is inherited via the `eslint-config-next` preset, not literally quoted in `eslint.config.mjs`, so `check-claude-md.mjs`'s `eslint:` resolver (which greps `eslint.config.mjs` for the literal quoted id) cannot verify it. Sketch: explicitly declare `"@typescript-eslint/no-explicit-any": "error"` in `eslint.config.mjs`'s own rules block (a no-behaviour-change restatement of what the preset already does) so the id becomes resolver-visible, then tag `@enforced eslint:@typescript-eslint/no-explicit-any`.
- **Covering spec:** NEW

### M-034 — explicitly declare `react/jsx-key` so it's resolver-visible
- **Rule:** "Missing `key` props in .map() renders" (`CLAUDE.md`, DB ACCESS)
- **Where it lives:** `CLAUDE.md:181-182`
- **Rung:** eslint · **Blast:** other
- **Sketch:** same gap as M-033: genuinely enforced by the built-in `react/jsx-key` rule (verified: fires on a planted keyless `.map()`), inherited via preset rather than literally quoted, so it isn't resolver-visible under the current `eslint:` grammar. Sketch: same fix as M-033 — explicitly declare `"react/jsx-key": "error"` in `eslint.config.mjs`, then tag.
- **Covering spec:** NEW

### M-035 — flag the literal substring `ANON_KEY` outside `lib/env.ts`
- **Rule:** "Supabase key name: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY (not ANON_KEY)" (`CLAUDE.md`, KEY CONSTANTS)
- **Where it lives:** `CLAUDE.md:582-583` (twin: `CLAUDE.md:689-690`, see M-036)
- **Rung:** eslint · **Blast:** other
- **Sketch:** `pleks/no-raw-process-env` blocks a raw read of ANY env var name outside `lib/env.ts`, so it happens to touch this one without knowing the string "ANON_KEY" — it would equally flag the correct name, and would miss a wrong alias declared inside `lib/env.ts` itself. Sketch: a small, specific check (or an extension of `no-raw-process-env`) that flags the literal substring `ANON_KEY` anywhere outside `lib/env.ts`, distinct from the general raw-env-var block.
- **Covering spec:** NEW

### M-036 — flag the literal substring `ANON_KEY` outside `lib/env.ts` (DO NOT DO twin)
- **Rule:** "Do not use ANON_KEY — the correct env var is NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY" (`CLAUDE.md`, DO NOT DO)
- **Where it lives:** `CLAUDE.md:689-694` (twin of M-035)
- **Rung:** eslint · **Blast:** other
- **Sketch:** `pleks/no-raw-process-env` catches a raw read of ANY env var outside `lib/env.ts`, which incidentally catches this one. It has no knowledge of the string "ANON_KEY" and would equally flag a raw read of the CORRECT name; if `lib/env.ts` itself aliased it, nothing would notice. A coincidental catch of a general pattern, not enforcement of this rule.
- **Covering spec:** NEW

### M-037 — grep cron/webhook route files for a `requireAgentWriteAccess(` call
- **Rule:** "Cron and webhook handlers: do NOT use `requireAgentWriteAccess`" (`CLAUDE.md`, DB ACCESS)
- **Where it lives:** `CLAUDE.md:171-172`
- **Rung:** check · **Blast:** other
- **Sketch:** `route-census.mjs` classifies a route as `cron`/`webhook` by path prefix or secret header, but nothing greps those same files for a `requireAgentWriteAccess(` call and fails if found. Sketch: extend `route-census.mjs` to grep cron/webhook-bucket route files for a `requireAgentWriteAccess(` call and fail if present.
- **Covering spec:** NEW

### M-038 — `vercel.json` guard against a `crons` key or `check` in `buildCommand`
- **Rule:** "No cron runs from `vercel.json`." (`.claude/rules/crons.md`)
- **Where it lives:** `.claude/rules/crons.md:18`
- **Rung:** check · **Blast:** other
- **Sketch:** sketch: a check parses `vercel.json` and fails if it gains a `crons` key or a `buildCommand` containing `npm run check`. (Note: `vercel.json` is strict JSON, so this doctrine cannot live as an in-file comment — a script is the only carrier.)
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_67C_CRON_HANDLER_MIGRATION.md` (the migration off Vercel Cron this guard would protect)

### M-039 — scan `app/(public)/**` JSX for un-escaped `</strong> text` (generalised)
- **Rule:** "This applies to any element immediately followed by descriptive text" (`.claude/rules/legal-docs-jsx.md`)
- **Where it lives:** `.claude/rules/legal-docs-jsx.md:29` (twin of M-040)
- **Rung:** check · **Blast:** other
- **Sketch:** sketch: a check scans `app/(public)/**` JSX for `</strong>` (or `</span>`/`</em>`) immediately followed by a bare space and text, and fails on the un-escaped form.
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_LEGAL_DOCS_SPACING_2026-05-27.md`

### M-040 — scan legal pages for un-escaped `</strong> text` (specific twin)
- **Rule:** "bolded labels must use the explicit JSX space expression, never a bare literal space" (`.claude/rules/legal-docs-jsx.md`)
- **Where it lives:** `.claude/rules/legal-docs-jsx.md:11` (twin of M-039)
- **Rung:** check · **Blast:** other
- **Sketch:** twin of the generalised bullet, same mechanism. Nothing scans these specific legal pages for a bare-space `</strong> text` pattern and fails.
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_LEGAL_DOCS_SPACING_2026-05-27.md`

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

### M-043 — enumerate `app/api/cron/**/route.ts` against the orchestrator/table
- **Rule:** "When adding a new cron job, decide..." (`.claude/rules/crons.md`)
- **Where it lives:** `.claude/rules/crons.md:61`
- **Rung:** check · **Blast:** other
- **Sketch:** sketch: enumerate `app/api/cron/**/route.ts` on disk and assert each one appears either in the daily orchestrator's source or in this table's cPanel-entry list — an undocumented cron currently goes unnoticed the same way an undocumented public route used to (Category 8's disk-derived census, before it existed).
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_67E_CRON_RELIABILITY.md`

### M-044 — assert every `TRACKED_CRONS` name is written by a matching `withCronRun` call
- **Rule:** "Health-check tracking: `lib/observability/health.ts` `checkCrons` tracks only top-level scheduled `job_name`s that ACTUALLY write a `cron_runs` row" (`.claude/rules/crons.md`)
- **Where it lives:** `.claude/rules/crons.md:68`
- **Rung:** check · **Blast:** other
- **Sketch:** sketch: assert every name in `TRACKED_CRONS` is written by at least one route calling `withCronRun` with that exact `job_name` — the precise mismatch that caused the chronic "crons: degraded" false positive this paragraph describes.
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_67E_CRON_RELIABILITY.md`

### M-045 — extend `no-inline-app-url` to visit plain string `Literal` nodes
- **Rule:** "Any hardcoded `https://app.pleks.co.za/...` in template or email code is a bug." (`.claude/rules/comms-urls.md`)
- **Where it lives:** `.claude/rules/comms-urls.md:21`
- **Rung:** eslint · **Blast:** other
- **Sketch:** PARTIAL: `pleks/no-inline-app-url` catches the templated-literal form of this bug (baseline-limited) — verified: it only visits `TemplateLiteral` nodes interpolating `APP_URL`/`MARKETING_URL`; a hand-typed literal string with no `${}` interpolation (e.g. `"https://app.pleks.co.za/wo/123"`) is a different AST shape the rule does not visit at all. Sketch: extend the rule to also visit plain `Literal` string nodes matching the production/apex origins, outside `lib/routing/`.
- **Covering spec:** NEW

### M-046 — flag a server page importing an array/object value from a `"use client"` module
- **Rule:** "Tabs: URL-sync via `?tab=`... keep the tab set in a plain `tabs.ts` — not the `\"use client\"` strip" (`.claude/rules/components.md`)
- **Where it lives:** `.claude/rules/components.md:36`
- **Rung:** eslint · **Blast:** other
- **Sketch:** sketch: a check flagging a server page importing an array/object value (not a component) from a file whose nearest ancestor module carries `"use client"`.
- **Covering spec:** NEW

### M-047 — scan filled headers for surviving literal placeholder text
- **Rule:** file-header TS/TSX format template (`CLAUDE.md`, FILE HEADERS)
- **Where it lives:** `CLAUDE.md:97-98`
- **Rung:** check · **Blast:** other
- **Sketch:** sketch: scan filled headers for surviving literal placeholder text (e.g. "(omit if not a page)") and fail; nothing does today.
- **Covering spec:** NEW

### M-048 — diff staged files against `file-headers.baseline.json` for surviving `FILL:`
- **Rule:** "Touch a file with a stub header (contains `FILL:`) → fill it in before committing" (`CLAUDE.md`, FILE HEADERS)
- **Where it lives:** `CLAUDE.md:70-71`
- **Rung:** check · **Blast:** other
- **Sketch:** `check-file-headers.mjs` only fails on a `FILL:` stub NOT already in `file-headers.baseline.json`; touching a baselined file's body without filling its header leaves the file still baselined and still passing. Sketch: diff staged files against the baseline and fail if a staged, baselined file still contains `FILL:`.
- **Covering spec:** NEW

### M-049 — `.husky/pre-commit` hook running `npm run check`
- **Rule:** "Do not push code that fails `npm run check`." (`CLAUDE.md`, RUN CHECKS BEFORE EVERY COMMIT)
- **Where it lives:** `CLAUDE.md:112-113` (twin: `CLAUDE.md:676-677`, see M-050)
- **Rung:** hook · **Blast:** other
- **Sketch:** there is no pre-commit hook in this repo (no `.husky`, no `core.hooksPath`), so nothing stops a commit that fails `npm run check`. CI's `quick-check` job runs `npm run check` but only after the commit exists, on the PR. Sketch: add a `.husky/pre-commit` hook running `npm run check` (or a fast subset) that blocks the commit.
- **Covering spec:** NEW

### M-050 — `.husky/pre-commit` hook running `npm run check` (DO NOT DO twin)
- **Rule:** "Do not commit without running `npm run check` first" (`CLAUDE.md`, DO NOT DO)
- **Where it lives:** `CLAUDE.md:676-677` (twin of M-049)
- **Rung:** hook · **Blast:** other
- **Sketch:** twin of the identical rule under RUN CHECKS BEFORE EVERY COMMIT, same mechanism. There is NO pre-commit hook in this repo (no .husky, no core.hooksPath, empty .git/hooks). CI catches it on the PR, after the commit exists. `--no-verify` has nothing to bypass.
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

### M-053 — allowlist requirement on server-side `sharp(` calls in inspection-photo code
- **Rule:** "`sharp`... is a server-side safety net only — it should never be the primary compression path." (`.claude/rules/inspections.md`)
- **Where it lives:** `.claude/rules/inspections.md:29`
- **Rung:** check · **Blast:** other
- **Sketch:** a check could flag a server-side call into `sharp` from an inspection-photo upload handler that isn't clearly gated as a fallback, but distinguishing "safety net" usage from "primary path" usage requires reading intent, not just presence of a call. Sketch: same "provably intentional" allowlist pattern as the `gateway()`-on-write rule (M-003) — require an inline allowlist comment/reason on any server-side `sharp(` call in this area; an unmarked call fails.
- **Covering spec:** NEW

### M-054 — unit test asserting EXIF-before-compression call order + branded `CompressedPhoto` type
- **Rule:** "Photos must be compressed client-side before upload... EXIF extraction happens BEFORE compression" (`.claude/rules/inspections.md`)
- **Where it lives:** `.claude/rules/inspections.md:18`
- **Rung:** check · **Blast:** other
- **Sketch:** nothing asserts (statically or in a test) that the upload path only ever receives a Canvas-compressed blob under the size/dimension target, or that EXIF extraction runs before compression in the call order. Sketch: a unit test on the compression module mocking the EXIF-extract and Canvas-compress calls and asserting invocation order, plus a branded `CompressedPhoto` type the upload function accepts (not a raw `File`) so an uncompressed upload fails to type-check.
- **Covering spec:** NEW

### M-055 — one generic script enumerating every `*.baseline.json` for shrink-only
- **Rule:** "Baselines only SHRINK." (`.claude/rules/lint-rules.md`)
- **Where it lives:** `.claude/rules/lint-rules.md:21`
- **Rung:** check · **Blast:** other
- **Sketch:** PARTIAL. "Baselines only shrink" is what `check-claude-md.mjs` itself enforces for the UNENFORCEABLE-marker count and what `check-file-headers.mjs`/`check-pii-classification.mts` enforce for their own baselines — but that shrink-only property is per-script, not a general property every `*.baseline.json` is verified to hold; a NEW baseline file could widen on every run and nothing would notice. Sketch: one generic script enumerates every `*.baseline.json` in the repo and, in CI, compares each file's entry count against the base-branch version, failing if any grows.
- **Covering spec:** NEW

### M-056 — AST check flagging an enumeration test with no non-emptiness floor
- **Rule:** "Every enumeration test asserts NON-EMPTY, as its own case" (`.claude/rules/lint-rules.md`)
- **Where it lives:** `.claude/rules/lint-rules.md:50`
- **Rung:** check · **Blast:** other
- **Sketch:** a property of how a NEW enumeration test is written; nothing scans `**/__tests__/**` for an `it(...)` whose body iterates a `readdirSync`/`git ls-files` result and asserts no non-emptiness floor on the list length. Sketch: an AST check over `**/__tests__/**` flagging a test that reads a directory/glob result but never calls `.toBeGreaterThan(...)` (or similar) on that result's `.length` within the same test body.
- **Covering spec:** NEW

### M-057 — AST check flagging a hand-written parity-test member array instead of disk enumeration
- **Rule:** "A parity test ENUMERATES its members; it never samples them" (`.claude/rules/lint-rules.md`)
- **Where it lives:** `.claude/rules/lint-rules.md:71`
- **Rung:** check · **Blast:** other
- **Sketch:** whether a NEW parity test derives its member list from disk vs. a hand-written array is a property of the test's own source, unchecked by anything outside code review. Sketch: an AST check over parity-test files (by naming convention) flagging a hand-written array literal used as the "members" list instead of a `readdirSync`/`git ls-files` call.
- **Covering spec:** NEW

### M-058 — component-canon partial slice (`rounded-*` + shadcn `Button` import ban)
- **Rule:** "Reach for the Use column; never the Not column without a reason." (`.claude/rules/components.md`)
- **Where it lives:** `.claude/rules/components.md:20`
- **Rung:** eslint · **Blast:** other
- **Sketch:** PARTIAL: one row of the table (`DetailTabs` vs shadcn `ui/tabs` under `/settings/**`) is enforced; the other rows (`ResourcePageHeader`, `SettingsPageHeader`, form-field grammar, `ActionButton`, `DetailCard`, corner radius) have no equivalent check — any of them can be skipped for an ad-hoc alternative with nothing failing. Sketch (first slice, not full coverage): a `no-restricted-syntax`-style rule flagging `rounded-md`/`rounded-lg`/`rounded-full` (outside pill contexts) and a `no-restricted-imports` restriction on shadcn `Button` outside `components/ui/actions` — the two rows with a crisp, cheap syntactic signature. The free-text layout rows need a harder JSX-shape heuristic and are not sketched here.
- **Covering spec:** NEW

### M-059 — `check-subprocessor-claims.mts` mirroring `check-retention-claims.mts`
- **Rule:** "The Truth Pipeline (load-bearing)" — sub-processor identities as derived facts (`.claude/rules/marketing-voice.md`)
- **Where it lives:** `.claude/rules/marketing-voice.md:70`
- **Rung:** check · **Blast:** other
- **Sketch:** PARTIAL, noted precisely: retention-period claims specifically are defended by a SEPARATE script, `check-retention-claims.mts` (also in `npm run check`), not by `check-marketing-consistency.mjs`. Sub-processor identities and sub-processor lists have no equivalent CI defence found in this census; a new sub-processor added to prose without updating its backing structured data would not be caught by either script. Sketch: a `check-subprocessor-claims.mts` mirroring `check-retention-claims.mts`'s structure — an SSOT sub-processor data file, the public page rendering from it, the script asserting the two match.
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_00J_MARKETING_CONSISTENCY.md`

### M-060 — parity test asserting each `createMessage` call site's model matches its task
- **Rule:** "AI MODEL ROUTING (unchanged)" (`.claude/rules/ai-routing.md`)
- **Where it lives:** `.claude/rules/ai-routing.md:13`
- **Rung:** check · **Blast:** other
- **Sketch:** `createMessage` (`lib/ai/client.ts`) is the required entry point (`no-restricted-imports` forbids a direct `@anthropic-ai/sdk` import, forcing calls through it), and nothing asserts the MODEL argument each call site passes matches this table. Sketch: a parity/enumeration test (per `.claude/rules/lint-rules.md`) deriving every `createMessage` call site from disk and asserting its model argument against the task it performs.
- **Covering spec:** NEW

---

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

### M-063 — extend the stem-pair check to the js-family and multi-extension spellings
- **Rule:** "Do not split an extension migration across commits" — the half `check-extension-stem-pairs` does NOT cover (`CLAUDE.md`, DO NOT DO)
- **Where it lives:** `CLAUDE.md:389-390` — the second of the two bullets the rule was split into
- **Rung:** check · **Blast:** other
- **Sketch:** M-041 shipped covering `.ts` ↔ `.tsx` only, which is what its sketch specified. The walk on that build measured the boundary: `/\.tsx?$/` also misses `.mts`, `.cts`, `.jsx`, `.mjs`, `.cjs` — 9 tracked `.mts` and 78 tracked js-family files today. **The uncovered half is the more dangerous one.** `tsconfig.json` has `allowJs: true` and Next's webpack resolve order puts `.js`/`.mjs` AHEAD of `.ts`/`.tsx`, so a surviving `foo.js` beside a new `foo.ts` shadows it at BUNDLE time while `tsc` typechecks the new file happily: typecheck green, runtime stale, and no gate in this repo looks at bundle-time resolution. The covered `.ts`-over-`.tsx` direction is at least visible to `tsc`. Sketch: widen `sourceFiles`'s extension test and give `findStemPairs` a resolution-ORDER model rather than a symmetric pair test — the finding is "the file that wins is not the file you added", which is directional, unlike the `.ts`/`.tsx` case where either survivor is a defect. Zero live violations of any extension combination as at `7f7ba3d0`, so this too would land green and needs no baseline.
- **Covering spec:** NEW — split out of M-041 per CLAUDE.md §4, "coverage boundaries split the rule, never qualify the tag"

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

### M-066 — every reference/wording document names its decision authority

- **Rule:** a document that carries WORDING or reference values, rather than rulings, opens with a line naming what decides for it — `Reference for X. Decision authority: ADDENDUM_NN §M. On disagreement, the addendum wins.` (Stéan ruling, 2026-08-20)
- **Where it lives:** nowhere yet. The nearest existing bullet is CLAUDE.md's PRICING PRECEDENCE ruling, which is the same shape solved one document at a time.
- **Rung:** check · **Blast:** other
- **Sketch:** scan `brief/**/*.md` for files that are not themselves decision documents (not `_ADDENDUM/`, not `INDEX.md`) and fail any that lack a `Decision authority:` line in the first ~20 lines. The line must name a document AND a section, not just a document — "see ADDENDUM_57G" is what a stale reference already looks like.
- **Why a check and not prose:** **three instances of the same class, none of which prose caught.** (1) Classic GitHub branch protection vs the `main-protection` ruleset. (2) `SEARCHWORX_RATE_CARD.md` vs INDEX/ADDENDUM — settled by a standing CLAUDE.md ruling *specific to that one file*. (3) `CANCELLATION_EMAIL_TEMPLATES_v1.1.md`'s five-notice cadence vs ADDENDUM_57G §10.6's three — found 2026-08-20, and the file had been carrying "5-notification cadence" under a heading that literally reads **"Locked decisions"** since 2026-05-07. Each was resolved by a human noticing; the resolution helps only the person who already opened both files. The header line helps at the moment someone opens the *wrong* file, which is the only moment that matters.
- **The limitation, stated up front:** `brief/` is a OneDrive symlink and is **not version-controlled**, so this check can never run in CI — CI has no `brief/`. It can only run locally, and must SKIP-and-say-so when the directory is absent rather than pass silently. That makes it a weaker rung than a normal check (CLAUDE.md §1: "anything the tooling depends on belongs in the tracked tree instead"). Two honest options, and the choice is CD's: accept a local-only ratchet, or move the reference documents that matter into the tracked tree first and check those. Do not build it as a normal check and let a CI green be read as coverage.
- **Covering spec:** NEW

### M-068 — nothing stops a subagent committing

- **Rule:** "the implementer ends at a report; YOU commit and push (it never does)" — `CLAUDE.md` §5 and §7
- **Where it lives:** `CLAUDE.md` §5, the implementer bullet
- **Rung:** hook · **Blast:** other
- **Sketch:** `.claude/hooks/agent-write-scope.js` declares `// @matcher Write|Edit|MultiEdit|NotebookEdit` — it gates *where* an agent writes and never sees `Bash`, so `git commit` from inside a subagent is ungated. `bash-gate.js` denies `--no-verify` and force-push and asks on `git push`, none of which is "a subagent must not commit". Sketch: extend the write-scope hook's matcher to `Bash` and deny `git commit` / `git merge` / `git rebase` when `agent_type` is set, reusing the E7 `agent_type` field the hook already reads. Probe both directions — a commit attempted from an agent must be denied, and the same command from the main session must pass untouched.
- **Exposed, not created, by the E10 ruling (2026-08-20):** worktree isolation never enforced this either. It made a subagent's commit land on a throwaway branch instead of yours, which hid the behaviour rather than preventing it — and it hid it *while making the agent's work invisible to your tree*, which is the E10 defect. Dropping isolation removes the accidental concealment and leaves the real gap in view. Do not read "isolation used to protect us here" into it.
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
