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

**What `blast` MEANS, corrected 2026-08-22 after finding the field applied two different ways inside
one class.** It is *what is exposed when **this defect** fires* — **not** the domain the rule's
subject belongs to. The two readings only diverge for entries whose subject is a CONTROL, and there
the register had both: **M-061** (an ESLint discriminator that misses files) inherited the aperture of
what its rule guards → `data-boundary`, correctly; **M-081** (three token matchers in `bash-gate.js`,
whose regex-first rebuild introduced eight bypasses) was tagged `other`, describing the rule's *topic*
rather than what eight open bypasses in the destructive-command gate expose. Same class, opposite
treatment.

**The rule that resolves it, and it turns on DIRECTION, not on being a control.** A control defect
that fails OPEN inherits the aperture of everything that control guards. A control defect that fails
SAFE — a false deny — exposes nothing and stays `other` no matter how central the control is.
**M-072 is the worked example on the `other` side:** it is a defect in a rung-1 deny in `bash-gate.js`,
and `other` is the CORRECT tag, because every one of its measured failures was a refusal of a
legitimate command. Do not re-tag an entry upward merely because it lives in a hook.

- **New band, `control`, ranked FIRST.** A fail-open control defect's radius is the union of what it
  guards, and for `bash-gate`/`agent-write-scope` that union includes destroying the working tree and
  rewriting published history — which no existing band names. Bands are now
  `control → money → data-boundary → schema → auth → other`.
- **This matters for triage, which is how it was found.** The 2026-08-21 pass ruled "no HIGH blast tag
  AND cited nowhere → WON'T BUILD". `other` is not a HIGH tag, so a mis-tagged fail-open control
  defect is *selected for* closure by the filter — the one class where the default disposition is
  most expensive. **The filter was not wrong; the tags it read were.** Any future triage on `blast`
  re-checks the control entries by hand first.

**Ranking:** blast radius band (`control → money → data-boundary → schema → auth → other`), then ascending cost
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
- **Satisfied when:** extends:audit:cat15_serverActionAuth
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
- **Satisfied when:** extends:eslint:pleks/require-audit-on-sensitive-mutation
- **Sketch:** enforced for TWO tables only (`contact_bank_accounts`, `tenant_bank_accounts` — `pleks/require-audit-on-sensitive-mutation`). Leases, applications, properties, tenants and `user_orgs` role changes have NO mechanism requiring an audit row to exist. The rule as written claims far more coverage than exists. Sketch: extend `require-audit-on-sensitive-mutation`'s tracked-table set to leases, applications, properties, tenants, and `user_orgs` role-change writes.
- **Covering spec:** NEW

</details>

### M-013 — self-check that all 15 security-audit categories run unconditionally
- **Rule:** "Never disable or skip categories to pass the audit." (`CLAUDE.md`, SECURITY AUDIT)
- **Where it lives:** `CLAUDE.md:423-424`
- **Rung:** check · **Blast:** data-boundary
- **Satisfied when:** check:check-audit-categories
- **Sketch:** sketch: a self-check asserting all 15 `catN_*` functions are invoked unconditionally in `main()`/`runCiMode()`, the same self-referential pattern this file's own `--selftest` uses.
- **Covering spec:** NEW

### M-014 — org-scope on service-client `.select()` reads (data-access.md twin) — ✅ BUILT 2026-08-19, CLOSED 2026-08-23
- **Rule:** "Every query through `db` MUST include `.eq(\"org_id\", orgId)` explicitly" — reads half (`.claude/rules/data-access.md`)
- **Where it lives:** `.claude/rules/data-access.md:13` (twin of M-002, `CLAUDE.md:176`)
- **Rung:** eslint · **Blast:** data-boundary
- **Satisfied when:** eslint:pleks/require-org-scope-on-service-read
- **Sketch:** PARTIAL, same as the CLAUDE.md DB ACCESS rule: `pleks/require-org-scope-on-service-write`/`require-scope-on-delete` cover writes/deletes (baseline-limited); plain `.select()` reads carry no scoping check at all. Sketch: a `require-org-scope-on-service-read` rule, same AST shape as the existing write/delete rules, flagging a service-client `.from(...).select(...)` chain with no `.eq("org_id", ...)`.
- **BUILT — and this entry is the first thing M-083 assertion 2 ever caught.** The rule the sketch
  asks for, `eslint-rules/require-org-scope-on-service-read.mjs`, shipped **2026-08-19** (it is
  `@enforced` in CLAUDE.md's DB-ACCESS list and carries the 2026-08-19 scar about its own
  discriminator skipping 63 files). The entry then sat open for four days while its CLAUDE.md twin
  **M-002 was already closed** — a twin pair closed on one side only, which is exactly the relational
  defect a per-entry reading pass cannot see. Nobody planted it; it was found on assertion 2's FIRST
  run, the moment the backfill gave the detector something to read. That is the argument for the
  convention, arriving as evidence for itself — and a direct correction to this register's own
  measured claim that the detector "would not have caught any of the five cases that motivated it".
- **Covering spec:** NEW

### M-015 — `require-consent-log-on-popia-write` (new rule)
- **Rule:** "consent_log for any new POPIA-sensitive operation" (`CLAUDE.md`, SECURITY RULES #4)
- **Where it lives:** `CLAUDE.md:601-602`
- **Rung:** eslint · **Blast:** data-boundary
- **Satisfied when:** eslint:pleks/require-consent-log-on-popia-write
- **Sketch:** no rule or script references `consent_log` as a write requirement. Sketch: a new `require-consent-log-on-popia-write` rule, same shape as `require-audit-on-sensitive-mutation`, scoped to a named consent-required table set.
- **Covering spec:** NEW

### M-016 — no raw decrypted identifier reaching JSX (mask-before-display)
- **Rule:** "Mask before display — never show raw decrypted ID/account in UI" (`CLAUDE.md`, SECURITY RULES #6)
- **Where it lives:** `CLAUDE.md:615-616`
- **Rung:** eslint · **Blast:** data-boundary
- **Satisfied when:** eslint:pleks/no-raw-pii-in-jsx
- **Sketch:** no check inspects JSX for a raw decrypted identifier reaching render. Sketch: a new rule shaped like `no-id-number-hash-in-app` flagging a `decryptIdNumber`/`decryptBankAccount`-derived value reaching JSX text/props outside the lease-document renderer (allowlisted).
- **Covering spec:** NEW

### M-017 — no PII in `console.log`
- **Rule:** "No PII in console.log, no PII in audit_log values" (`CLAUDE.md`, SECURITY RULES #7)
- **Where it lives:** `CLAUDE.md:618-619`
- **Rung:** eslint · **Blast:** data-boundary
- **Satisfied when:** eslint:pleks/no-pii-in-console
- **Sketch:** the audit_log half is now partly structural (`recordAudit` sanitises, and denied keys are marked rather than dropped). The console.log half has NO control — there is no `no-console` rule configured and no PII-shaped-argument check. Sketch: an ESLint rule (or extension of `scripts/security/check-pii-classification.mts`, which already classifies PII-bearing fields) flagging `console.log`/`console.error`/`console.warn` calls whose arguments reference known PII-bearing variable/property names (`idNumber`, `passportNumber`, bank account fields, etc.).
- **Covering spec:** NEW

### M-018 — CI job gates a Vercel deploy on `npm run security:quick` exit code
- **Rule:** "Zero critical findings before any deployment. No exceptions." (`CLAUDE.md`, SECURITY AUDIT)
- **Where it lives:** `CLAUDE.md:419-420` (twin: `CLAUDE.md:674-675`, see M-019)
- **Rung:** ci · **Blast:** data-boundary
- **Satisfied when:** ci:security-gate
- **Sketch:** No gate blocks the actual deployment on this script's exit code; Vercel deploys on push independently of `npm run security`. Running it is a manual pre-deploy step, not a CI/deploy gate. Sketch: a required CI job running `npm run security:quick` gated on the Vercel deployment (e.g. a GitHub deployment-status check Vercel is configured to wait on), failing the deploy on exit code 1.
- **Covering spec:** NEW

### M-019 — ➡ POINTER TO M-018 (do not build separately)
- **Rule:** "Do not deploy without running `npm run security:quick` first" (`CLAUDE.md`, DO NOT DO)
- **Where it lives:** `CLAUDE.md:674-675` (twin of M-018)
- **Rung:** ci · **Blast:** data-boundary
- **Satisfied when:** ci:security-gate
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
- **Satisfied when:** extends:check:check-migration-integrity
- **Sketch:** sketch: scan a migration's new `§N` section for `CREATE TABLE` without `IF NOT EXISTS`, `ADD COLUMN` without `IF NOT EXISTS`, or `CREATE INDEX` without `IF NOT EXISTS`, each a concrete syntactic pattern.
- **Covering spec:** NEW

### M-022 — flag `.upsert`/`ON CONFLICT` on `auth.users` by email — ✅ BUILT 2026-08-28
- **Rule:** "`auth.users` carries a PARTIAL unique index on email — a bare `ON CONFLICT (email)` will fail" (`.claude/rules/schema-gotchas.md`). ⚠ Quoted here as "has no unique constraint on email" until 2026-09-09; the real object is `users_email_partial_key`, `UNIQUE (email) WHERE (is_sso_user = false)`, verified live. **The check's behaviour is unaffected** — inference cannot resolve to a partial index without repeating the predicate, so the 42P10 it guards is real either way; only the stated cause was wrong. See **M-122** for what the partial index means beyond `ON CONFLICT`
- **Where it lives:** `.claude/rules/schema-gotchas.md:17`
- **Rung:** check · **Blast:** schema
- **Satisfied when:** check:check-auth-users-on-conflict
- **Sketch:** these are orientation ("known gotchas to check before writing migrations or queries") rather than a single checkable property; the closest mechanisable slice is the second bullet — flag an `.upsert`/`ON CONFLICT` call targeting `auth.users` by `email`.

**Control:** `scripts/check-auth-users-on-conflict.mjs`, wired into `npm run check` beside the
migration checks — the scan, then its `--selftest`. It reads every git-tracked `*.sql` plus SQL
embedded in `*.ts`/`*.tsx`/`*.mts`/`*.mjs`/`*.js`/`*.cjs` strings, attributes each `ON CONFLICT`
clause to the `INSERT INTO` that owns it, and fails when the target is `auth.users` and the arbiter
names `email`. **Probe:** ~40 fixture cases in both directions plus three reconciliation probes.
Clean tree exits 0 at `15 file(s), 250 INSERT statement(s), 80 ON CONFLICT clause(s)`.

**⚠ THE 2026-08-23 "TS half is COVERED" LINE BELOW WAS TRUE OF ONE POPULATION AND READ AS TRUE OF
TWO. Corrected here rather than deleted, because the entry's own wording is what nearly scoped this
build too narrowly.** `schema-contract-scan.mjs` walks fluent PostgREST chains down to `.from(…)`;
it has no SQL-text parser. So the TS half is covered for **call chains** and not at all for **raw
SQL in a template literal** — and the live example is `test/db/tier.ts:64`, which seeds `auth.users`
through `psql(\`INSERT INTO auth.users … ON CONFLICT DO NOTHING;\`)`. That site is correct today
(an arbiter-less `DO NOTHING` needs no unique index) and it is **one hand-edit from breaking the
whole DB test tier**. Neither the contract scan nor a `.sql`-only glob can see it, which is why the
code-string population is in this check's scope. A sibling implementation read the same entry and
excluded TS deliberately on the strength of that line; both readings were defensible, and the
narrower one would have shipped green over a live blind spot.

- **Measured 2026-08-23 at `73a734e6`, and the rule splits in two — the halves have different coverage, so they get different lines rather than one hedged tag:**
  - **TS half — covered FOR POSTGREST CALL CHAINS ONLY** (see the correction above; the original claim of "every TS expression" is withdrawn). A planted `db.from("auth.users").upsert({ email }, { onConflict: "email" })` fails `schema-contract-scan.mjs` (exit 1, `[relation] auth.users.table/view does not exist`); the clean tree exits 0. The scan does not reason about `ON CONFLICT` at all — it does not need to, because PostgREST cannot reach the `auth` schema, so every `.from("auth.users")` chain is caught by the relation check. Repo-wide there are zero `.from("auth.users")` sites under `app/`/`lib/`. Raw SQL in strings is a different population and was never in that scan's reach.
  - **SQL half — NOW COVERED by the control above; the live population remains zero defects.** Two candidate sites exist and **both are correct**: `scripts/seed-test-data-2.sql:19` INSERTs into `auth.users` using exactly the SELECT-first pattern this gotcha prescribes, and `supabase/migrations/006_seed.sql:543`'s `ON CONFLICT (email)` is on **`honeytoken_emails`**, not `auth.users`. Both are `--selftest` fixtures, so the check is pinned against the tree that made it necessary.
- **The measurement was itself the warning about how to build the SQL half, and the build confirms it.** A naive grep for `ON CONFLICT (email)` scores 1/2 — it flags the honeytoken seed, which is legitimate and whose table does carry a unique email. The check resolves which **table** the conflict target belongs to by bounding each `INSERT INTO` at its own terminating `;`, so neither the honeytoken seed nor a following statement's clause is misattributed. First number is a hypothesis: here the hypothesis was two hits and the finding is none.
- **Known boundary, latent rather than live:** the lexer closes a single-quoted literal on `''` doubling and does not treat a backslash as an escape, so a Postgres E-string containing `\'` would desynchronise it. No such literal exists in the tree as at 2026-08-28, and the check's reconciliation guard reports a desync as a parse failure rather than passing it as clean. Full statement in the script header.
- **Provenance:** built by an E17 arm-A cell (`t2-r1-A`, task 2) against baseline `1c9b6bbd` and harvested 2026-08-28. Nine cells independently implemented this item; the aperture difference between them is what surfaced the TS-half correction above.
- **Covering spec:** NEW

### M-023 — ➡ POINTER TO M-005 (SUBSUMED — do not build separately)

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
- **Satisfied when:** none — subsumed by M-005; building it separately would duplicate that check's scan
- **Sketch:** Nothing inspects migration SQL for a new table at all, so nothing can distinguish "correctly exempted by the membership test" from "the org_id rule was simply skipped." This file's whole purpose — a written test to stop the exception becoming a general escape hatch — has no code-side check that the test was actually applied. Sketch: parse each migration's new `§N` section for `CREATE TABLE`, and assert an `org_id` column is present unless the table name is in this file's "Current members" allowlist.
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_62F_MULTI_DEVICE_PASSKEY.md`

</details>

### M-024 — 007/008 gain-no-new-`§N`-section diff
- **Rule:** "Do NOT amend `007_enhancements.sql` or `008_enhancements2.sql`" (`.claude/rules/migrations.md`)
- **Where it lives:** `.claude/rules/migrations.md:53`
- **Rung:** check · **Blast:** schema
- **Satisfied when:** extends:check:check-migration-forward-refs
- **Sketch:** `check-migration-forward-refs.mjs` reads every migration file's content but has no rule against 007/008 specifically gaining a new `§N` section. Sketch: diff each file's section (`§N`) count against a recorded baseline and fail if 007/008 grows.
- **Covering spec:** NEW

### M-025 — flag `applications.applicant_id`/`applicant_user_id` references — ✅ BUILT 2026-08-23

**Found already shipped.** The sketch below ended "not independently verified in this pass whether it
already does" — that doubt was the whole entry, and resolving it took one planted violation rather
than a build. At `73a734e6` a probe file referencing both columns produced:

```
lib/__probe_m025.ts:3  [select] applications.applicant_id
lib/__probe_m025.ts:3  [select] applications.applicant_user_id
lib/__probe_m025.ts:4  [filter] applications.applicant_id
exit=1
```

and the same scan on the clean tree exits 0 — **both directions probed**, so this is coverage and
not a scan that fails on everything. `schema-contract-scan.mjs` is manifest-driven and already in
`npm run check`, so all three shapes (select, filter, and the write path by the same resolver) fail
the gate today. The probe file was deleted; it is reproduced here because the evidence is the point.

The one thing the scan does NOT do is the reactive half the sketch describes — it is static, so it
catches the reference at check time rather than waiting for a 42703 at query time. That is strictly
better than the entry asked for.

<details><summary>Original M-025 sketch (retained for provenance)</summary>

- **Rule:** "Anti-patterns to never use" — non-existent applicant columns (`.claude/rules/schema-gotchas.md`)
- **Where it lives:** `.claude/rules/schema-gotchas.md:38`
- **Rung:** check · **Blast:** schema
- **Satisfied when:** extends:check:schema-contract-scan
- **Sketch:** PARTIAL, mechanically. The first two bullets name COLUMNS that don't exist, so a query referencing them fails at the database (PostgREST 42703) and — if the call site's `{ data, error }` is checked per `pleks/require-supabase-error-check` — surfaces as a real, visible error rather than a silent `null`. That is real but REACTIVE (fails at query time, not write time). The third and fourth bullets describe an absence, which nothing can positively check for. Sketch: verify (or extend) `schema-contract-scan.mjs` (manifest-driven, already in `npm run check`) to statically flag a `.select`/`.eq` referencing `applications.applicant_id` or `applications.applicant_user_id` — not independently verified in this pass whether it already does.
- **Covering spec:** NEW

</details>

### M-026 — ❌ REJECTED 2026-08-23: the control shipped by a better route
- **Rule:** "Current members (exhaustive — extend only via a CD ruling)" (`.claude/rules/identity-scoped-tables.md`)
- **Where it lives:** `.claude/rules/identity-scoped-tables.md:50`
- **Rung:** check · **Blast:** schema
- **Satisfied when:** extends:check:check-migration-integrity
- **Sketch:** no code anywhere enumerates this three-table allowlist to check against (the ESLint rules' own `SELF_SCOPED_TABLES` set is a DIFFERENT, unrelated exemption for `organisations`/`user_profiles`); a fourth table added to this list by prose alone, with no matching code-side allowlist, would not be caught adding `org_id` back OR skipping it incorrectly. Sketch: a code-side constant (e.g. `IDENTITY_SCOPED_TABLES` in `lib/`) mirroring this markdown table, read by the migration-scan sketched above (M-005/M-023), kept in sync by a doc/code parity test.
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_62F_MULTI_DEVICE_PASSKEY.md`

### M-027 — `REFERENCES auth.users` cascade-policy scan (credential vs. evidence)
- **Rule:** "Cascade credentials. Never cascade evidence." (`.claude/rules/identity-scoped-tables.md`)
- **Where it lives:** `.claude/rules/identity-scoped-tables.md:69`
- **Rung:** check · **Blast:** schema
- **Satisfied when:** check:check-auth-users-cascade
- **Sketch:** sketch: grep migrations for `REFERENCES auth.users` and assert `ON DELETE CASCADE` only on the named credential tables and `ON DELETE SET NULL` everywhere else — but nothing does; classifying a NEW table as "credential" or "evidence" in the first place still requires the semantic judgement this section describes, so the check would need the same allowlist as M-023/M-026 to know which tables are "named credential tables".
- **Covering spec:** `brief/build/SPEC_ANALYTICS_CAPTURE.md` (§2, the `ON DELETE SET NULL` evidentiary-row doctrine this rule generalises from)

### M-028 — pre-commit/pre-push hook runs `check-schema-drift.mjs` after a migration edit
- **Rule:** "After adding a section, re-run the migration against the live DB and verify with the drift script" (`.claude/rules/migrations.md`)
- **Where it lives:** `.claude/rules/migrations.md:76` (twin cluster with M-029 and `CLAUDE.md:307-308`)
- **Rung:** hook · **Blast:** schema
- **Satisfied when:** extends:check:check-drift-if-sql-changed
- **Sketch:** `check-schema-drift.mjs` would catch the RESULTING mismatch if run, but nothing forces "re-run and verify" to have actually happened before a commit. Sketch: a local pre-commit/pre-push hook running `node scripts/check-schema-drift.mjs` when a migration file changed, blocking on drift.
- **Covering spec:** NEW

### M-029 — ➡ POINTER TO M-028 (do not build separately)
- **Rule:** "Always drive drift back to zero before committing." (`.claude/rules/migrations.md`)
- **Where it lives:** `.claude/rules/migrations.md:150` (twin cluster with M-028 and `CLAUDE.md:307-308`)
- **Rung:** hook · **Blast:** schema
- **Satisfied when:** extends:check:check-drift-if-sql-changed
- **Sketch:** `check-schema-drift.mjs` genuinely detects drift when run, and its conditional wrapper (`check-drift-if-sql-changed.mjs`) is part of `check:full` — but `check:full` is not CI-wired (CI's `db-tests` job runs `test:db`/`security:db` post-push, but not this drift check), so nothing forces "drive drift to zero" to have happened before a commit lands. Sketch: same pre-commit/pre-push hook as M-028, running `check-schema-drift.mjs` when a migration file changed.
- **Covering spec:** NEW

---

## AUTH

### M-030 — grep for a literal `/auth/resolver` self-reference in a `redirect=` value
- **Rule:** "`/auth/resolver` produces exactly ONE routing decision per call... MUST NOT appear in any `?redirect=` value it forwards" (`.claude/rules/routing-auth.md`)
- **Where it lives:** `.claude/rules/routing-auth.md:39`
- **Rung:** check · **Blast:** auth
- **Satisfied when:** check:check-auth-resolver-loop
- **Sketch:** sketch: grep the resolver route and the three named transient-auth-state routes for a literal `/auth/resolver` substring inside a `redirect=`/`searchParams.set("redirect", ...)` value and fail on a match — the exact self-reference class this rule forbids; it is a runtime routing property, not something `architecture-audit.mjs`'s current checks (cross-origin links, manifest completeness, safe-redirect denylist) happen to cover.
- **Covering spec:** NEW

### M-031 — extend `expectedGateFamily` to require the portal gate under portal route groups
- **Rule:** "Tenant/landlord/supplier portal actions: use `getTenantSession()`" (`CLAUDE.md`, DB ACCESS)
- **Where it lives:** `CLAUDE.md:173-174`
- **Rung:** check · **Blast:** auth
- **Satisfied when:** extends:audit:cat15_serverActionAuth
- **Sketch:** `server-action-census.mjs`'s `expectedGateFamily()` only special-cases `app/(admin)/`; every other location (including portal routes) accepts ANY recognized gate, so a portal action gated with `gateway()` instead of `getTenantSession()` passes Cat-15 undetected. Sketch: extend `expectedGateFamily` to require the portal gate under `app/(tenant)/`, `app/(landlord)/`, `app/(supplier)/`.
- **Covering spec:** NEW

### M-032 — flag routing decisions guarded by raw factor-array truthiness instead of `filterFactorsByHost`
- **Rule:** "Factor scoping: any code path that ROUTES based on 'does the user have an MFA factor?' MUST use the host-scoped check" (`.claude/rules/routing-auth.md`)
- **Where it lives:** `.claude/rules/routing-auth.md:46`
- **Rung:** check · **Blast:** auth
- **Satisfied when:** check:check-mfa-factor-filtering
- **Sketch:** sketch: flag a routing decision (`NextResponse.redirect` inside an `if`) guarded by `factors.some(...)`/raw factor-array truthiness instead of a `filterFactorsByHost(...)` call — the exact anti-pattern shown below — but nothing greps for it today.
- **Covering spec:** NEW

---

## OTHER

### M-124 — the commit-message mask covers `-m` and not the way this repo actually writes messages

- **Rule:** a flag named inside a COMMIT MESSAGE is prose, not a switch, and must not be matched by the gate that forbids the flag. This is already stated and already half-built — `maskMessageText` in `.claude/hooks/bash-gate.js` exists for exactly it, and its docblock cites the M-072 commit that was refused for describing a hard reset in its body.
- **Where it lives:** `maskMessageText` blanks the argument of `-m`/`--message`. It cannot blank what is not an argument. Every substantial commit in this repo is written `git commit -F -` with a heredoc, because the messages are long — so the message text arrives on **stdin**, the hook sees only `git commit -F -`, and the body is never masked at all. The mask therefore covers the spelling used for one-liners and misses the spelling used for everything the rule was written to protect.
- **Rung:** hook · **Blast:** other
- **Observed 2026-09-09**, twice in one session and both times on this session's own work: a commit documenting the new `git clean` rule was denied for containing `git reset --hard` in its body, and earlier a comparison script was denied for containing force-push spellings as test data. Both were rewritten to avoid the literal, which is the failure mode — **the gate is training its users to describe controls imprecisely in exactly the artefact that is supposed to record them.** A commit message that cannot name the flag it is about is a worse record than none, and the damage is silent because the rewritten message looks fine.
- **Satisfied when:** a `git commit` whose message reaches git by any route — `-m`, `-F <file>`, `-F -`, or `--file` — is judged on its COMMAND, never on its message text; and a real flag in the command line is still caught with the message present.
- **⚠ The obvious fix is the wrong one.** Blanking everything after `-F -` would blank the rest of the command line, and blanking stdin is not possible from a PreToolUse hook, which never sees it. The tractable shape is narrower: when the message is not an argument, there is nothing in the command to confuse the scanner, so `git commit -F -` should simply not be scanned for flags that only ever appear in prose. That is a real decision about aperture, not a patch — hence a register entry rather than an edit.
- **Probe both directions:** a heredoc message naming `--no-verify`, a hard reset and a force push must COMMIT; `git commit -F - --no-verify` — the flag genuinely present on the command line, alongside a heredoc — must still be DENIED. The second is the one that makes the first safe, and a fix that only tests the first has widened the bypass.
- **Covering spec:** NEW

### M-125 — the holiday auditor going dark is reported as `status: "ok"`, and the horizon now controls how many ways it can happen

- **Rule:** a witness that could not be read is not a witness that agreed. `!audit.ran` must not render as `ok`.
- **Where it lives:** `fetchNagerZA` in `lib/dates/holidayAuditFetch.ts` loops `yearsInWindow()` and returns `null` if **any single** year is not HTTP 200 — deliberately, because a partial fetch would fabricate Class-B noise. `app/api/cron/holiday-sentinel/route.ts` then writes `detail.holiday_audit = { status: "ok" }` when `!audit.ran`, so the daily run reports healthy and digests nothing.
- **Rung:** check · **Blast:** other
- **Observed 2026-09-10** by the walker on ADDENDUM_70L Phase A, and the finding is the COUPLING, not the fail-open on its own. `yearsInWindow()` derives from `HOLIDAY_TABLE_COVERS_FROM..THROUGH`. 70L made the horizon a consequence of the statute rather than a typed literal, which moved it 2027→2032 — so the fetch went 3 years to 8, and the number of independent ways to trip an all-or-nothing gate went with it. **Nothing in the diff touched the auditor.** A derived horizon is the right design; the point is that it silently re-rates an unrelated control's failure probability, and the one report that would show it says `ok`.
- **Not urgent on evidence:** live Nager serves ZA for every year in the window including 2032 and 2033 (curl, 2026-09-10, all 200), so no year is unsupported today.
- **Satisfied when:** a run where the primary witness returned nothing reports a state distinguishable from agreement, and a probe drives `fetchNagerZA` to `null` and asserts the route does NOT emit `ok`. ⚠ Do **not** "fix" this by making the fetch partial-tolerant — the all-or-nothing return is the deliberate anti-noise choice, and relaxing it trades a visible dark run for invented Class-B diffs.
- **Covering spec:** ADDENDUM_70K Phase C (the sentinel), ADDENDUM_70L Phase A (the horizon that re-rated it)

### M-126 — ✅ BUILT (2026-09-10) — mojibake sits in four migration files and nothing in the repo can see it

- **Rule:** dev-standards **L-71** — a shell round-trip of a file is `decode → transform → encode`, and on Windows both codecs are chosen by the shell. `CLAUDE.md` §8 states the rule ("never author a pattern through a shell string… write the script to a file with an editor"). What it has no half of is **detection**, and the damage predates the rule.
- **Where it lives:** `supabase/migrations/` — `010_platform_features.sql` (194), `005_operations.sql` (99), `012_property_extensions.sql` (94), `006_seed.sql` (49). Dominant sequence `U+00C3 U+00A2 U+00E2 U+201A U+00AC U+00E2 U+20AC U+0153` = an en dash `–` encoded **twice**; also the same doubling of `ç` inside `façade`. ⚠ **The sequences are named by codepoint here, not quoted literally, and that is deliberate** — `check-mojibake.mjs` scans tracked text, so a register that quoted the damage as bytes would fail the gate it asks for, and the only ways out are an allowlist entry (forbidden) or this. Codepoints are also the more useful notation: the third character of the corrupted box rule is `U+0090`, which is invisible in every editor.
- **Rung:** check · **Blast:** other (see the severity note — it is **not** data-boundary today, and the reason it is not is luck)
- **Observed 2026-09-10** by the legacy lesson triage, while answering L-71. Entered at **`b5636b9d`** (2026-07-06, *"chore(migrations): replay all 12 domain files clean from scratch"* (#133)) — a bulk mechanical rewrite of all twelve files, which is precisely L-71's shape.
- **The severity, measured rather than assumed, and it moved twice.** Most hits are on comment lines and are cosmetic. **`006_seed.sql` is not**: line 53 is `INSERT INTO lease_clause_library` and roughly 32 of its 49 hits are inside the `$$…$$` clause bodies that render into generated lease documents — line 199 read *"its fa<ç doubled>ade"*. That looked like live corruption of legal text. **It is not, and the check that establishes it is the one that matters:** `SELECT` against prod 2026-09-10 returns **44 clauses, 0 corrupted** in `body_template` and `title`. Prod was seeded before 2026-07-06 and the insert carries `ON CONFLICT DO NOTHING` (`73f2ed61`), so the corrupt file has never overwritten the good rows — **and for the same reason can never repair itself either.**
- **What is actually at risk, therefore:** any environment seeded from these files *after* the corruption — a fresh dev DB, a staging project, a disaster-recovery rebuild — gets garbled clause text in generated leases, and prod's cleanliness is exactly what would stop anyone noticing. This is L-71's own prediction ("would have committed cleanly, and the corruption would have surfaced as a mystery diff weeks later — or never").
- **Satisfied when:** a check fails on a mojibake sequence anywhere in tracked text, probed both directions; and the four files are repaired **with an editor, never a shell rewrite** — repairing them through the tool that caused this is the failure mode, not a shortcut past it. ⚠ Repair is amend-in-place on `005`/`006`/`010`/`012`; **`007`/`008` must not be amended** and none of them needs to be. <!-- @enforced check:check-mojibake -->
- **BUILT 2026-09-10.** `scripts/check-mojibake.mjs`, wired into `npm run check` with its selftest.
  - **The counting in this entry's own heading was wrong, and the correction is the interesting part.** "436 sequences" came from grepping the `Ã`/`â€`/`Â` families — which is the detection this entry asked for, and it undercounted by half. The real figure is **861 corrupted runs** (005: 242 · 006: 61 · 010: 447 · 012: 111), because the dominant damage is a doubly-encoded box rule whose third character is `U+0090`, an invisible C1 control that no family grep names. **A blacklist of the mojibake you have already seen cannot find the mojibake you have not**, and the number it produces looks like a measurement.
  - **So the check is not a blacklist.** It is the inverse transform: re-encode a run to cp1252 and try to decode those bytes as strict UTF-8. Correct text cannot survive that — an em dash is a lone continuation byte, and `═`/`→`/`⚠` are not in cp1252 at all — so success IS the diagnosis, with nothing enumerated and nothing to miss. It reports the repair, not just the location, because a check that says "something is wrong here" and cannot say what it should be sends the next person back to the shell that caused this.
  - **The repair was run over all twelve files, and that was the test.** The eight clean ones came out byte-identical; only the four known-bad ones changed. Verified after: the four files' non-ASCII vocabulary is now a subset of the eight clean files' (`═ ─ — § → – • …`, plus `ç ÷ ≈ ·` at four legitimate sites), zero residue, and `findMojibake` run against `HEAD:` still reports all 861 — so the check would have caught the damage it was built for, not merely the fixtures.
  - **It scans its own source, which forced two things.** Its probe fixtures are built from codepoints rather than written as characters, and `docs/MECHANISABLE.md` had this entry's example sequences rewritten to codepoint notation — the alternative was an allowlist entry, which `CLAUDE.md` §4 forbids and which would have hidden the next real one. It is registered `searches: false` in `check-mention-fixtures.mjs` with that reasoning.

### M-127 — ✅ BUILT (2026-09-10) — a passkey can be MINTED on session state alone, while destroying one demands step-up

- **Rule:** dev-standards **L-72** — authorise a credential-**minting** operation on the state of the **account** ("does this account already possess a credential of this kind?"), never on the state of the session. And review a create/destroy pair **as a pair**.
- **Where it lives:** `app/api/auth/passkeys/registration-verify/route.ts:27` gates on `supabase.auth.getUser()` and nothing else, then inserts into `user_passkeys` at :85. Its counterpart `app/api/auth/passkeys/revoke/route.ts:36` calls `requireStepUp({ action: "passkey_unenroll" })`. `lib/auth/step-up.ts:11`'s `StepUpAction` union carries `passkey_unenroll` and `totp_unenroll` — **both destroy actions — and no enrol action at all.**
- **Rung:** check (the residue is judgement — see below) · **Blast:** auth
- **Observed 2026-09-10** by the legacy lesson triage, verified in the main session rather than taken from the census: the union was read at `lib/auth/step-up.ts:11` and both routes' gates read directly. `registration-options` does read existing `user_passkeys`, but only to build WebAuthn's `excludeCredentials` — a same-device duplicate guard, **never an authorization input**, and it does not bind a *different* device.
- **Why the asymmetry is the default rather than an oversight,** in L-72's words: destructive operations advertise their danger and reviewers guard them; *add a device* reads as a preference. But minting is the privilege-granting half — it is the act that converts a session into an assured one on the next request, through the front door.
- **Not yet an exploit claim, and the gap is stated rather than papered over:** whether pleks is reachable the way yoros was depends on how long a session survives past its assurance window here, which this entry does **not** establish. The finding is the asymmetry, which holds regardless.
- **Satisfied when:** enrolment authorises on the assurance the ACCOUNT can offer — no factor of any kind permits a bare session, any factor requires step-up — through **one shared guard used by both routes**, so the challenge cannot be issued under one rule and redeemed under a weaker one. ⚠ The bootstrap case is the whole difficulty: enrolling requires being signed in, so the first enrolment cannot demand what every later one should. Do **not** resolve it with a standing fallback credential. **This line read "the account's key count — zero active passkeys permits a bare session" until 2026-09-10, and that spelling is the bug the build shipped and the walker caught** — see the BUILT bullet.
- **BUILT 2026-09-10, `effb2481`.** `lib/auth/passkeys/enrol-assurance.ts` is the shared guard; both `registration-options` (`consume: false`) and `registration-verify` (`consume: true`) call it, and only the mint spends the single-use token. The passkey count is **account-wide, not rp-scoped** — deliberately narrower than the `excludeCredentials` read it sits beside, because a per-rp count would hand a second rp the bootstrap state. It **fails closed**: an unreadable count returns `-1`, not `0`. `010 §54` widens the `step_up_challenges.action` CHECK, and `lib/auth/__tests__/step-up-action-db-parity.test.ts` now fails the gate if the TS union and that constraint ever disagree — the twin-drift hazard the union's own comment used to only warn about. Two defects found while building and fixed in the same change: `requireStepUp` returned a **token with no row behind it** when the insert failed (an unsatisfiable modal, indistinguishable from a wrong code), and the client hook had no step-up path at all, so a second enrolment would have died as a bare "Cancelled". ⚠ **Ordering: the migration must reach an environment before the code** — see the §54 header.
- **⚠ THE FIRST BUILD DID NOT CLOSE THE THREAT, AND THE ENTRY ABOVE IS WHY.** It counted passkeys, from this entry's own "Satisfied when" wording. A TOTP-only account holds zero passkeys, so it read as bootstrap and a stolen AAL1 session minted a passkey — and an AAL2 grant with it — without ever knowing the TOTP secret: the exact attack, surviving the fix aimed at it, past ten green tests that all asserted the passkey count. Caught by the walker on the commit, fixed before the push. **The register entry was one of the causes, not just the record of it** — a "Satisfied when" line is what the build is written against, so an under-specified one ships an under-specified fix. Filed to canon as **CF-6** (a clause for L-72 keying the bootstrap exemption to the assurance the account can offer, not the credential's type).
- **The sibling half is NOT closed and is not claimed to be: → M-132.** The guard accepts a `passkey_enroll` step-up satisfied by either factor, deliberately, so on a passkey-only account a stolen session mints its own TOTP through the ungated browser path and spends it here.

### M-128 — three send sites mark work "done" without reading whether the send succeeded

- **Rule:** dev-standards **L-22** — detection, recording and notification are three different things, and a log table is not a notification channel. A function returning `{ success, error }` that never throws is silent by design; a bare `await` discards the only signal there is.
- **Where it lives:** `app/api/cron/screening-portal-reminders/route.ts` (three sites) marks a reminder sent **and flips a never-retry flag** regardless of the result; `lib/messaging/whatsapp/sms-fallback.ts::sendSmsFallback` timestamps a failed send as sent; `app/api/cron/owner-statement-gen/route.ts` uses `Promise.allSettled` and branches on fulfilled/rejected only, so a *resolved* `{success:false}` counts as notified.
- **Rung:** eslint or check · **Blast:** other
- **Observed 2026-09-10** by the legacy lesson triage. Canon's L-22 entry carries an explicit note that **pleks had never been surveyed for this shape**; this is that survey. Several other sites discard the result *legitimately* and say so in-line (`lib/portal/inviteLandlord.ts`, contrasted at the site with `lib/portal/inviteTenant.ts`, which treats failure as hard) — the distinction is real and must survive any rule written here.
- **The existing control does not cover this, and its own header says so.** `pleks/require-supabase-error-check` requires *binding* `error`, not branching on it, and `lib/supabase/logQueryError.ts`'s header admits it only logs. Logging satisfies that rule today by design — which is exactly L-22's point.
- **Satisfied when:** a discarded failure result on a **notification** path fails the gate, with fire-and-forget expressible at the site (a named helper or a directive carrying its reason), never as a path list. Related: **M-121**, the same silence class on the digest channel itself.

### M-129 — a kit row's verifier lives only in canon, so pleks's own gate cannot see it

- **Rule:** dev-standards **L-63** — propagation is driven by the diff, so adopters get the artefact and not the mechanism that binds it. **L-69** is why it persists: the project's own session is the one least likely to run canon's gate.
- **Where it lives:** `.claude/package.json` (kit row `claude-module-kind`, template, adopted at `aa3d106a`, PR #294). It declares `"type": "module"` so the `.claude/**` hooks load as ES modules instead of relying on Node ≥ 22.7's syntax-detection compensation — a hook that fails to load gates nothing.
- **Rung:** check · **Blast:** other
- **Observed 2026-09-10** by the legacy lesson triage, and a census claim was **corrected on the way**: canon does ship a verifier — `check-kit-drift`'s `typelessHooks()`, which resolves the type the way Node does and reports any hook still relying on the compensation. The gap is not that no mechanism exists; it is that **the only mechanism runs from canon**, so deleting or emptying `.claude/package.json` in pleks turns every hook back into a typeless `.js` and **`npm run check` stays green**.
- **Satisfied when:** `npm run check` asserts that `.claude/package.json` exists and declares an explicit `type`, and that no `.claude/**/*.js` hook resolves to CommonJS. ⚠ It must assert this **from pleks's own tree** — a gate may never call canon's path (`CLAUDE.md` §1): a gate keyed on `C:/dev/dev-standards` fails on the first machine without that checkout, and fails *green* if the failure is swallowed.

### M-130 — a baseline entry that has stopped suppressing anything outlives the decision it recorded

- **Rule:** dev-standards **L-23** — write the reason where the decision lives, and a stale exemption must not outlive it. `CLAUDE.md` §4: *"an entry means read and classified, never exempt; every entry carries or points to its reason; they only shrink."*
- **Where it lives:** the object-map allowlists carry a reason per entry (`scripts/migration-integrity.baseline.json`, `PUBLIC_ALLOWLIST`, `ACTION_ALLOWLIST`). The **array-of-path ESLint baselines do not** — `eslint-rules/require-org-scope-on-service-read.baseline.json` holds 80 bare paths, and the classification lives once in the rule file's header, which itself records that it sampled families rather than verifying all 149 sites.
- **Rung:** check · **Blast:** data-boundary (these baselines silence the org-scope rules)
- **Observed 2026-09-10** by the legacy lesson triage. Staleness detection exists for **exactly one** allowlist — `scripts/security/audit.mjs:906` catches a `PUBLIC_ALLOWLIST` entry whose route file was deleted, but not one that was reclassified. `ACTION_ALLOWLIST` has none; no ESLint baseline has one.
- **pleks has already paid this cost once.** `CLAUDE.md` §6, 2026-08-22: the READ rule fired on the consent routes and was silenced by a file-level baseline entry *"classified once as debt, never re-read — and a baseline entry means read and classified, which this one had stopped being."*
- **Satisfied when:** an entry in any baseline or allowlist that no longer suppresses a real finding fails the gate, so it must be removed or re-argued. Probe both directions: a live exemption must pass, a dead one must fail.

### M-131 — the file-header template in `CLAUDE.md` is a second copy no check reads

- **Rule:** dev-standards **L-67** — an example is a second implementation of a specification written in prose, and it drifts exactly like a second implementation in code, except no test covers it. Wherever a document teaches a format a checker enforces, the example and the checker are **one unit**.
- **Where it lives:** `CLAUDE.md` §9 carries the `.ts`/`.tsx`/`.yml` header template. `scripts/check-file-headers.mjs` never reads it — it greps for `FILL:` tokens and carries its own independently hardcoded notion of the shape (`:67`). Change the template in §9 and nothing disagrees.
- **Rung:** check · **Blast:** other
- **Observed 2026-09-10** by the legacy lesson triage, and the contrast is what makes it actionable: pleks **already has** the single-source pattern in two places — `check-claude-md.mjs` and `check-rules-tracked.mjs` both `readFileSync` the live doc, and `CLAUDE.md` §4 states the principle for the identity-scoped-table allowlist (*"read FROM that rule file, so the doc is the single source — no mirrored constant to drift"*). This pair is the one that did not get it.
- **Satisfied when:** `check-file-headers.mjs` derives the expected field set by parsing §9's template, so editing the doc moves the check. ⚠ Not by copying §9 into the script — that is the same defect with a shorter drift path.

### M-132 — the SIBLING mint is ungated: a stolen session can enrol its own TOTP factor, then spend it

- **Rule:** dev-standards **L-72** — authorise a credential-MINTING operation on the state of the ACCOUNT, never on the state of the session. M-127 applied it to passkeys; TOTP is the other half of the same pair and was left open.
- **Where it lives:** `components/auth/EnrolTotp.tsx` → `enrollTotp` calls `supabase.auth.mfa.enroll` on the **browser** client, so the mint happens against the caller's own session with no server-side gate at all. `totp_unenroll` is in `STEP_UP_UNWIRED`, so the destroy half is ungated too — **both** halves of the TOTP credential are open while both halves of the passkey credential are now closed.
- **Rung:** check (the gate itself is code; the ratchet is a check that both mint paths call an assurance guard) · **Blast:** auth
- **Observed 2026-09-10** by the walker on M-127's own commit, and it is the fix's own bypass: `requirePasskeyEnrolAssurance` accepts a `passkey_enroll` step-up satisfied by **either** factor, deliberately, so nobody is locked out. On a passkey-only account a stolen session therefore mints a TOTP factor for free, verifies with it, and satisfies the passkey guard — closing the front door while the side door lets you fetch the key. It is out of M-127's scope (a different surface, a different client, a different Supabase API) and is filed rather than folded in, because a fix that touches the browser MFA enrol path is not the same review.
- **⚠ Ordering, and it runs the other way from the usual one.** Gating the TOTP mint is safe to ship alone — it strictly narrows. Gating `totp_unenroll` alone is **not**: a user whose only factor is a TOTP they can no longer produce must still be able to remove it, and the recovery path for that is not built. Mint first, unenrol second, and only with the recovery half beside it.
- **⚠ THE FIX SKETCHED BELOW CANNOT BE BUILT, AND THE REASON RELOCATES THE ENTRY.** Measured
  2026-09-11 at `e152a334`. "Gate the mint server-side" assumes Pleks is in the mint's path. It is
  not: `supabase.auth.mfa.enroll` POSTs to GoTrue's `/auth/v1/factors` from the browser with the
  user's access token, and no Pleks route is traversed. A server endpoint the client politely calls
  first is not a gate — an attacker holding the session simply does not call it. Nor can the mint be
  moved server-side: `GoTrueAdminMFAApi` exposes exactly **`listFactors` and `deleteFactor`**
  (`@supabase/auth-js` types) — **there is no admin enrol**, so enrolment can only ever run on the
  user's own session. The original "Satisfied when" is struck rather than deleted, because the
  reason it is wrong is the finding.
- **Where the fix actually belongs — the SPEND, not the mint.** `app/api/auth/step-up/route.ts:52`
  is Pleks's code and is the point where a minted factor is turned into assurance. Two readings were
  checked there and only one survived: `factors.totp[0]` does **not** accept an unverified factor —
  `_listFactors` groups into the per-type arrays only inside `if (status === 'verified')`, so
  `.totp` is verified-only by construction. So the attacker must complete enrolment, which they can,
  and the chain holds.
- **⚠ THE OBVIOUS ANCHOR IS RE-ROLLABLE, WHICH IS WHY THIS IS A RULING AND NOT A BUILD.** "A factor
  created after the challenge was issued may not satisfy it" reads correct and is not: challenge
  issuance is unauthenticated-by-possession and unlimited, so the attacker mints the factor, then
  asks for a *fresh* challenge, and the factor now predates it. The only anchor they cannot re-roll
  is the SESSION — the earliest `amr` timestamp from
  `mfa.getAuthenticatorAssuranceLevel().currentAuthenticationMethods`, i.e. *a factor that did not
  exist when this session was authenticated cannot assure it.* **That closes it and it has a real
  cost:** a user who signs in and then enrols their first TOTP is refused their own step-up until
  they re-authenticate. Raised as **G-10b** rather than chosen here — §8, a change with a lockout
  consequence is CD's to rule, not a session's to pick.
- **Satisfied when:** the anchor question is ruled, and the ruled rule is enforced at the step-up
  spend with probes both directions — a factor predating the anchor satisfies a challenge, one
  minted after it does not, and the bootstrap account with no factor at all is unaffected.

### M-133 — a cron that never fired and a cron that could not record are the same row: none

- **Rule:** a failure-only digest's denominator must be the runs that were EXPECTED, not the rows that
  happened to get written. Absence of evidence is reported here as evidence of health.
- **Where it lives:** `lib/cron/withCronRun.ts:57-70` — the `cron_runs` insert is deliberately
  best-effort, and a failed insert is swallowed with a `console.error` · `collectCronRunFailures`
  (`:95-119`) builds `byJob` **from the returned rows** and increments `agg.total` per row, so the
  denominator it prints is a count of successful recordings · `lib/observability/health.ts:127-136`
  (`TRACKED_CRONS`) is the only place an expected cadence is declared, and it covers 8 of the 13
  jobs that actually write rows.
- **Rung:** check · **Blast:** other
- **Observed 2026-09-11** against project `noexjtlrffkzzclibvbq`. On 2026-09-10 `mandatory_retry`
  wrote **22** rows, for hours `00-16,18-21,23` — **hours 17 and 22 have no row at all**, where
  2026-09-08 and 2026-09-09 each have a clean 24/24. The 03:00 digest reported
  *"1/22 runs failed in 24h"*. The defensible statement is **1 known failure plus 2 unaccounted, out
  of 24 expected**, and the digest cannot say the second half because nothing declares that 24 was
  expected. The likely cause of the two gaps is the same Supabase `Gateway Timeout` window that
  produced the 11:00 failure (`[mandatory-retry] Fetch error: Gateway Timeout`, Vercel error
  clusters, with sibling clusters on `screening-jobs cron select` and `platform-email drain fetch`)
  — so **the observability thins at exactly the moment the digest is being relied on.**
- **The best-effort insert is CORRECT and is not what this entry asks to change.** Recording must
  never mask the cron's own result; that is the right trade. The defect is that the digest reads the
  resulting row count as if it were a run count, and says so with a confident denominator.
- **The sharp end is a cron going fully dark, and it is silent for 5 of the 13 jobs.** Zero rows
  means `byJob` has no key, the job produces no digest entry, and the digest is failure-only — so it
  sends nothing. `checkCrons` catches that for the 8 names in `TRACKED_CRONS` via a freshness
  threshold (fail-safe: a missing row reads as stale, which is noise rather than silence). The other
  five write `cron_runs` and are in NO staleness map: **`screening_jobs` (2,885 rows, every 15m — the
  highest-volume job on the platform), `cost-snapshots`, `expire_listings`, `expire-info-requests`,
  `insurance-renewals`.** If any of those stops firing, both observability paths report nothing.
  Same vacuous-pass shape as **M-123**: the check passes because it never ran.
- **A doc claim was corrected while measuring this.** `.claude/rules/crons.md` said `TRACKED_CRONS`
  tracks *"only top-level scheduled job_names that ACTUALLY write a cron_runs row (currently just
  `["daily"]`)"*. It holds **8** names as at `d15e6f88`. The warning the sentence carries is still
  right; its count had been stale for long enough to be read as the design.
- **Satisfied when:** every job wrapped in `withCronRun` declares its expected cadence in ONE place
  that both the digest and `checkCrons` read, and the digest reports a *shortfall* — rows seen
  against rows expected — as its own condition, distinct from a failed run. A job with no declared
  cadence must FAIL the check rather than be skipped, which is the half that makes it a ratchet
  rather than a second list to forget. Probe both directions: a job missing N of its expected runs
  is reported, and a job at full cadence is not.
- **Covering spec:** NEW

### M-134 — an `ON CONFLICT DO NOTHING` with nothing to conflict on is a comment, not a guard

- **Rule:** a conflict clause asserts that a unique key exists. Where none does, the clause is inert
  and every replay re-inserts the whole set — while reading, at the call site, exactly like
  idempotency.
- **Where it lives:** `supabase/migrations/006_seed.sql` — the `prime_rates` history insert carries a
  bare `ON CONFLICT DO NOTHING`, and `prime_rates` has **no unique constraint or index at all**.
  Contrast `006:482`, which names a real `(clause_key)` target and therefore works.
- **Rung:** check · **Blast:** money (adjacent — see the measurement)
- **Observed 2026-09-11** against project `noexjtlrffkzzclibvbq`: **210 rows, 53 effective dates
  duplicated.** The table has been replayed repeatedly and accumulated a copy each time.
- **It is NOT a live money defect today, and the query that decides that is the entry's point.**
  `getPrimeRateOn` (`lib/deposits/interestConfig.ts`) takes the latest row `<=` the date, so
  duplicates matter only if they disagree:

      select count(*) from (select effective_date from prime_rates
        group by effective_date having count(distinct rate_percent) > 1) x    -- → 0

  Every duplicate group agrees on its rate, so the lookup is deterministic in value if not in row.
  **The hazard is the first correction.** The day a historical rate is amended, the amendment lands
  as one more row on a date that already has duplicates carrying the old value, `count(distinct
  rate_percent)` becomes 2, and which rate an interest calculation sees depends on physical row
  order. That is a silent 0.5pp-class error on deposit and arrears interest, and nothing would fail.
- **The fix is two-part and the order matters:** dedupe the 53 dates FIRST, then add the unique
  index — adding it first simply errors, and deduping without adding it buys one clean day.
- **Satisfied when:** `prime_rates` carries a unique key on `effective_date`, the seed's conflict
  clause names it, and a check asserts that no `ON CONFLICT` clause in any migration targets a table
  with no matching unique constraint — the general form, so the next inert clause is caught rather
  than this one being fixed alone. Probe both directions.
- **Covering spec:** NEW

### M-135 — the mojibake check cannot see the files whose corruption would cost most

- **Rule:** a scanner's aperture is part of its claim. One that reports "clean" while structurally
  unable to read 84 tracked files is making a narrower statement than the one people will hear.
- **Where it lives:** `scripts/check-mojibake.mjs:126` — `TEXT_EXT` is an extension allowlist, so
  anything extensionless or with an unlisted extension is never scanned.
- **Rung:** check · **Blast:** other
- **Observed 2026-09-11** at `98d8a9a0`: 84 tracked files fall outside it. The ones that matter are
  **the four `.githooks/*` scripts** — extensionless, gate-bearing, and carrying the exact box-rule
  and dash characters whose corruption is the defect this check exists to find — plus `knip.jsonc`
  (`.jsonc` does not match a `\.json$` anchor). **All are currently clean**, so this is an aperture
  gap and not a live finding; it is filed because the check's green is read as covering them.
- **Why it is not simply "add more extensions":** the gate-bearing files have no extension to add.
  The durable form is to scan what git reports as text (`git ls-files` plus a binary test or
  `.gitattributes`), which is a different question from "does this path end in `.sql`".
- **Satisfied when:** the scanner's file set is derived from text-ness rather than extension, the
  `.githooks/*` scripts are demonstrably inside it, and `--selftest` plants a corrupted sequence in
  an extensionless tracked file and fails on it.
- **Covering spec:** NEW

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
- **Satisfied when:** extends:eslint:pleks/no-raw-process-env
- **Sketch:** `pleks/no-raw-process-env` blocks a raw read of ANY env var name outside `lib/env.ts`, so it happens to touch this one without knowing the string "ANON_KEY" — it would equally flag the correct name, and would miss a wrong alias declared inside `lib/env.ts` itself. Sketch: a small, specific check (or an extension of `no-raw-process-env`) that flags the literal substring `ANON_KEY` anywhere outside `lib/env.ts`, distinct from the general raw-env-var block.
- **Covering spec:** NEW


### M-037 — grep cron/webhook route files for a `requireAgentWriteAccess(` call
- **Rule:** "Cron and webhook handlers: do NOT use `requireAgentWriteAccess`" (`CLAUDE.md`, DB ACCESS)
- **Where it lives:** `CLAUDE.md:171-172`
- **Rung:** check · **Blast:** other
- **Satisfied when:** extends:check:route-census
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
- **Satisfied when:** extends:audit:cat9_rateLimiting
- **Sketch:** `PUBLIC_API_ROUTES` is hand-maintained (unlike Category 8's disk-derived census) and `cat9_rateLimiting` only floods `.slice(0, 2)` of it regardless of length, so nothing fails if a new public route is never added. Sketch: derive the flood target list from `route-census.mjs`'s `byBucket.public`, the same pattern Category 8 already uses.
- **Covering spec:** NEW


### M-044 — assert every `TRACKED_CRONS` name is written by a matching `withCronRun` call
- **Rule:** "Health-check tracking: `lib/observability/health.ts` `checkCrons` tracks only top-level scheduled `job_name`s that ACTUALLY write a `cron_runs` row" (`.claude/rules/crons.md`)
- **Where it lives:** `.claude/rules/crons.md:68`
- **Rung:** check · **Blast:** other
- **Satisfied when:** check:check-tracked-crons
- **Sketch:** sketch: assert every name in `TRACKED_CRONS` is written by at least one route calling `withCronRun` with that exact `job_name` — the precise mismatch that caused the chronic "crons: degraded" false positive this paragraph describes.
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_67E_CRON_RELIABILITY.md`

**Retained 2026-08-21** under the WON'T-BUILD default, and the reason is its provenance: it names a symptom that was OBSERVED — the chronic `crons: degraded` false positive — rather than a hazard inferred from the rule's wording. A tracked `job_name` no writer produces leaves the health check permanently wrong in the direction that teaches people to ignore it. **M-043 was closed into this entry**, being the same surface argued from the weaker end.


### M-045 — extend `no-inline-app-url` to visit plain string `Literal` nodes
- **Rule:** "Any hardcoded `https://app.pleks.co.za/...` in template or email code is a bug." (`.claude/rules/comms-urls.md`)
- **Where it lives:** `.claude/rules/comms-urls.md:21`
- **Rung:** eslint · **Blast:** other
- **Satisfied when:** extends:eslint:pleks/no-inline-app-url
- **Sketch:** PARTIAL: `pleks/no-inline-app-url` catches the templated-literal form of this bug (baseline-limited) — verified: it only visits `TemplateLiteral` nodes interpolating `APP_URL`/`MARKETING_URL`; a hand-typed literal string with no `${}` interpolation (e.g. `"https://app.pleks.co.za/wo/123"`) is a different AST shape the rule does not visit at all. Sketch: extend the rule to also visit plain `Literal` string nodes matching the production/apex origins, outside `lib/routing/`.
- **Covering spec:** NEW

**Retained 2026-08-21:** the cheapest build in the register and the reason is structural — the rule already EXISTS and already runs; the gap is one additional node type on a live visitor. The uncovered shape (a hand-typed `"https://app.pleks.co.za/…"`) is strictly SIMPLER than the covered one, and more likely to be written by hand than the interpolated form the rule already catches.


### M-048 — diff staged files against `file-headers.baseline.json` for surviving `FILL:`
- **Rule:** "Touch a file with a stub header (contains `FILL:`) → fill it in before committing" (`CLAUDE.md`, FILE HEADERS)
- **Where it lives:** `CLAUDE.md:70-71`
- **Rung:** check · **Blast:** other
- **Satisfied when:** extends:check:check-file-headers
- **Sketch:** `check-file-headers.mjs` only fails on a `FILL:` stub NOT already in `file-headers.baseline.json`; touching a baselined file's body without filling its header leaves the file still baselined and still passing. Sketch: diff staged files against the baseline and fail if a staged, baselined file still contains `FILL:`.
- **Covering spec:** NEW


### M-051 — local `pre-push` git hook running `npm run check:full`
- **Rule:** "`npm run check:full`... must be green" (`CLAUDE.md`, pre-push checklist step 1)
- **Where it lives:** `CLAUDE.md:307-308` (related cluster: M-028, M-029)
- **Rung:** hook · **Blast:** other
- **Satisfied when:** extends:check:check-prepush-composition
- **Sketch:** `check:full` exists and is genuinely strict when run (it chains `check`, `test:db`, `security:db`, `check-drift-if-sql-changed`), but nothing forces it to run before a push: it is not in `ci.yml` (CI's `db-tests` job runs `test:db`/`security:db` separately on the PR — a real, newer mitigation, but still post-push/pre-merge, and it skips `check-drift-if-sql-changed`) and `hook:bash-gate` gates the push action on approval, not on this command's exit code. Sketch: a local `pre-push` git hook running `npm run check:full`, blocking the push on non-zero exit.
- **Covering spec:** NEW

### M-052 — CI step asserting a `!` PR title has a matching `BREAKING CHANGE:` footer
- **Rule:** "Breaking changes: add `!` after type... AND a `BREAKING CHANGE:` footer" (`CLAUDE.md`, CONVENTIONAL COMMIT MESSAGES)
- **Where it lives:** `CLAUDE.md:212-213`
- **Rung:** ci · **Blast:** other
- **Satisfied when:** ci:breaking-change-footer
- **Sketch:** the `pr-title` job validates only the title's `type(scope): subject` grammar (`amannn/action-semantic-pull-request`, no `subjectPattern` configured); it does not check the PR/commit body for a `BREAKING CHANGE:` footer. `semantic-release` parses the footer at RELEASE time (post-merge) to size the version bump. Sketch: a CI step reads the PR title; if it contains `!`, assert the PR body contains a `BREAKING CHANGE:` line and fail otherwise.
- **Covering spec:** NEW


### M-055 — one generic script enumerating every `*.baseline.json` for shrink-only
- **Rule:** "Baselines only SHRINK." (`.claude/rules/lint-rules.md`)
- **Where it lives:** `.claude/rules/lint-rules.md:21`
- **Rung:** check · **Blast:** other
- **Satisfied when:** check:check-baselines-shrink
- **Sketch:** PARTIAL. "Baselines only shrink" is what `check-claude-md.mjs` itself enforces for the UNENFORCEABLE-marker count and what `check-file-headers.mjs`/`check-pii-classification.mts` enforce for their own baselines — but that shrink-only property is per-script, not a general property every `*.baseline.json` is verified to hold; a NEW baseline file could widen on every run and nothing would notice. Sketch: one generic script enumerates every `*.baseline.json` in the repo and, in CI, compares each file's entry count against the base-branch version, failing if any grows.
- **Covering spec:** NEW

**Retained 2026-08-21:** the shrink-only property is doctrine CLAUDE.md §4 calls load-bearing — *"never widen one to make CI green — that deletes the finding"* — and three scripts already implement it privately for their own baselines. This is the generic form of a ratchet the repo has already decided it wants, not a new proposal.


### M-123 — the hook probes report BLOCKING when no hook ran at all
- **Rule:** "each hook blocks on failure and passes on success" — the property **M-007** states its probe establishes.
- **Where it lives:** `scripts/check-git-hooks.mjs:76` (and the same shape at the two seam blocks below it)
- **Rung:** check · **Blast:** other
- **Satisfied when:** `check-git-hooks.mjs` establishes that the probe process actually launched before reading its status — a spawn that never ran is reported as its own finding, naming the missing interpreter, rather than counted as a block. Probed both directions: a launchable seam still blocks on failure, and an unlaunchable one fails loudly instead of passing.
- **Sketch:** the blocking direction is `ok(run("false") !== 0, …)`, and `spawnSync` returns `status: null` when the binary cannot be launched at all. `null !== 0` is true, so **a hook that never executed satisfies the assertion**. Observed 2026-09-09 at `a3f1db55`: `sh` is absent from the PATH the PowerShell tool hands node, every `spawnSync("sh", [hook])` returned `{ status: null, error: ENOENT }`, and all four "BLOCKS when … fails" probes passed without a single hook running. Fix: check `r.error === undefined && r.status !== null` before interpreting the status, and surface a launch failure as a distinct finding.
- **Covering spec:** NEW

**Why this is filed while the suite still goes red.** It is **not false-green today**, and the entry would be dishonest if it implied otherwise: each blocking probe is paired with `ok(run("true") === 0, …)`, which `null === 0` fails, so the suite fails overall — on 2026-09-09 it reported **24 wrong probes** on a tree whose hooks were fine. Two things make that worth a mechanism anyway. The red **misattributes**: it names the four hooks rather than the absent shell, and `CURRENT.md` now carries a "run the gates from Git Bash" line that exists only because this cost twenty minutes to diagnose. And the two directions are load-bearing **as a pair** while nothing anywhere says so — the pass-direction is the half that fails on a Windows PATH, so it is exactly the half a future session is tempted to relax as environment-dependent. Relax it and the blocking direction goes silently green on a machine where no hook can run at all, which is the false proof M-007 is the entry for.

Same class as the non-vacuous guards already shipping in `test/credential-mint-census.test.ts` and `check-auth-users-on-conflict.mjs` (`scanned > 0`): assert the scan found something, or a moved root reports safety.


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
- **Satisfied when:** check:check-money-literals
- **Sketch:** sketch: scan for a raw `25000`/`47000`/`0.30`-shaped literal outside `lib/constants.ts`, the way a `no-rerolled-*` rule guards its own SSOT. Same mechanism family as M-007 — could ship as one combined script.
- **Covering spec:** NEW

### M-009 — ➡ POINTER TO M-008 (one scan, two literal sets — do not build separately)
- **Rule:** "Never hardcode a fee literal" (`CLAUDE.md`, KEY CONSTANTS — screening fee SSOT)
- **Where it lives:** `CLAUDE.md:563-564`
- **Rung:** check · **Blast:** money
- **Satisfied when:** extends:check:check-money-literals
- **Sketch:** PARTIAL. The test (`bundle-economics.test.ts`) asserts price > cost WITHIN the SSOT module itself — a real, running invariant — but it does not scan call sites, so "never hardcode a fee literal" elsewhere in the codebase is unchecked; a call site that writes `25000` instead of importing `APPLICATION_FEE_CENTS` would not fail this test. Sketch: same call-site literal scan as M-007/M-008, applied to the screening fee cents value.
- **Covering spec:** NEW

### M-010 — `no-restricted-syntax` pattern for a hand-rolled debit-order/DebiCheck flow
- **Rule:** "Do not build debit order or DebiCheck mandate features" — hand-rolled-flow half (`CLAUDE.md`, DO NOT DO)
- **Where it lives:** `CLAUDE.md:695-696`
- **Rung:** eslint · **Blast:** money
- **Satisfied when:** extends:eslint:no-restricted-imports
- **Sketch:** PARTIAL, related to `.claude/rules/finance-trust.md:19`'s D-TRUST-01 coverage assessment (M-012). `no-restricted-imports` forbids importing generic payment-initiation SDKs repo-wide, but a hand-rolled debit-order flow using ordinary Supabase writes (no SDK import) would not be caught at all. Sketch: add named DebiCheck/debit-order SDK packages to the existing `no-restricted-imports` patterns block as they become known; the hand-rolled-flow gap needs a separate `no-restricted-syntax` pattern on mandate-creation-shaped writes and is harder to close fully.
- **Covering spec:** `brief/legal/TRUST_ACCOUNT_POSITIONING.md`

### M-011 — ➡ POINTER TO M-003 (do not build separately)
- **Rule:** "`requireAgentWriteAccess(action)` for ALL agent-side mutations — never bare `gateway()` on a write path" (`CLAUDE.md`, DB ACCESS)
- **Where it lives:** `CLAUDE.md:167-168` (twin of M-003)
- **Rung:** check · **Blast:** money
- **Satisfied when:** extends:audit:cat15_serverActionAuth
- **Sketch:** twin of `.claude/rules/data-access.md:28`, same mechanism (M-003). The server-action census (Cat-15) only requires SOME recognized gate to be present; it does not distinguish `gateway()` from `requireAgentWriteAccess`, nor a read path from a write path. A write silently gated with bare `gateway()` and no allowlist entry does NOT fail Cat-15. Sketch: flag a `"use server"` module containing an `.update(`/`.insert(`/`.upsert(`/`.delete(` call whose file only resolves via `gateway()`/`gatewaySSR()`, absent an allowlist reason.
- **Covering spec:** `brief/build/_ADDENDUM/ADDENDUM_57G_SUBSCRIPTION_PAUSE_POLICY.md`

### M-012 — verify/build the schema- and code-layer D-TRUST-01 enforcement claims
- **Rule:** "D-TRUST-01: Pleks is not the trustee) enforced at schema, code, and ESLint levels" (`.claude/rules/finance-trust.md`)
- **Where it lives:** `.claude/rules/finance-trust.md:18`
- **Rung:** eslint · **Blast:** money
- **Satisfied when:** extends:eslint:no-restricted-imports
- **Sketch:** PARTIAL. The ESLint layer is real: `no-restricted-imports` forbids named payment-SDK packages repo-wide, citing D-TRUST-01 by name. The "schema" and "code" enforcement layers this sentence also claims were not independently verified in this pass — flagged rather than tagged, per "do not invent controls." Sketch: independently verify (or build) the schema- and code-layer controls the sentence claims, then tag each verified layer separately rather than the compound claim as one.
- **Covering spec:** `brief/legal/TRUST_ACCOUNT_POSITIONING.md`

### M-061 — ✅ BUILT 2026-08-28 — order-sensitive org-awareness in `require-org-scope-on-service-read`
- **Rule:** "Every service-client `.select()` MUST include `.eq(\"org_id\", orgId)`" (`CLAUDE.md`, §4 Enforced) — the ESCAPE HATCH, not the rule
- **Where it lives:** `eslint-rules/require-org-scope-on-service-read.mjs`, the `ORG_AWARE` test
- **Rung:** eslint · **Blast:** data-boundary
- **Satisfied when:** extends:eslint:pleks/require-org-scope-on-service-read
- **What it was:** the rule exempted an unscoped read when the ENCLOSING FUNCTION was "org-aware" anywhere in its text. Deliberately loose, to allow validate-then-act. But "anywhere in the function" includes AFTER the read — so a function that read unscoped and org-checked something else later was exempt, and a 200-line page component was exempted by one org-scoped fetch at the bottom.
- **Control:** `ORG_AWARE` is now tested against the text from the enclosing function's start UP TO the read. Two exemption classes ship with it, both discovered BY the classification rather than assumed before it: `GLOBAL_REFERENCE_TABLES` (a table with no `org_id` column — `.eq("org_id", …)` there errors rather than scopes) and `SESSION_SCOPED_TABLES` (the org-RESOLUTION read, exempt ONLY when the chain carries `.eq("user_id", …)`; a bare `user_orgs` read is the platform's whole membership table and still fires).
- **Probe:** three cases, each BOTH directions, in `eslint-rules/__tests__/require-org-scope-on-service-read.test.mjs` — order-sensitivity (an org signal before the read still exempts; the row's OWN `org_id` used after it does not), `GLOBAL_REFERENCE_TABLES` (`lease_clause_library` quiet, the adjacent `org_lease_clause_defaults` which DOES carry `org_id` still fires), `SESSION_SCOPED_TABLES` (`user_orgs` bounded by `user_id` quiet; bare fires; `.neq("user_id")` fires). The order probe was verified to FAIL against the pre-change rule — a probe that passes both before and after measures nothing.
- **⚠ The 2026-08-19 numbers were hypotheses and neither survived.** 57/35 and 52/33 were measured before the fix; re-measured at `1c9b6bbd` the order-sensitive variant gave **53 findings across 34 files**. The "additionally exempt functions TAKING `orgId`" variant was **considered and REJECTED**: `generateLeaseDocument` takes `orgId` and never bound the lease to it, so that exemption would have hidden a real defect. Being org-bound by contract is not being org-bound.
- **What the classification found** (this is why the register said the classification, not the measurement, was the build):
  - **THREE LIVE CROSS-ORG READS.** `app/(dashboard)/leases/[leaseId]/page.tsx`, `.../communications/page.tsx` and `app/(dashboard)/tenants/[tenantId]/ledger/page.tsx` each read a row by its URL id on the RLS-bypassing service client, then used THAT ROW's `org_id` as the boundary for every read below. Any signed-in user of any agency could read another agency's lease, correspondence, documents and tenant financial history by uuid; tenant `id_number` was in one of those selects. Fixed by moving each to `gatewaySSR()` so the org comes from the SESSION. Third instance of the caller-supplied-id class (see CLAUDE.md §6, 2026-07-06 / 2026-08-22).
  - **TWO DEFECTS IN THE RULE ITSELF**, 21 of the 53 sites, both demanding a filter that is impossible (no such column) or circular (the query that discovers the org).
  - **six unscoped reads hardened** (`deleteLease`, both `sendInfoRequestReminder` reads, all three `generateLeaseDocument` reads) and **five genuine exemptions**, each carrying its reason AT THE SITE.
  - **NOTHING was baselined.** The rule's baseline did not grow.
- **Known boundary, stated not claimed:** order-sensitivity is not per-read scoping. A read AFTER the function's first org signal is still exempt; closing that needs per-read dataflow. All three cross-org reads were in the prefix, which is why the prefix shipped first — not evidence the suffix is clean.
- **Provenance:** harvested from experiment cell `task1-r3-B` (the two table classes; 1 of 9 cells found them, and they covered 21 of 53 findings — the low-consensus tail was the signal, not the noise) and `task1-r1-A` (the three page fixes, 9 of 9 cells). Every claim re-verified against `1c9b6bbd` before adoption; `r3-B` shipped its rule changes with no test delta, so all probes here are new.
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
- **Satisfied when:** check:check-naive-newline-split
- **Sketch:** the fix that shipped is `text.split(/\r?\n/)`. **The finding is that it is now written independently in five places and nothing makes the sixth author do it.** A `no-naive-line-split` check over `scripts/**` and `.claude/hooks/**` — fail on `.split("\n")` / `.split('\n')` where the receiver is file text — is the right shape here, NOT a shared `splitLines` helper: the idiom is one regex, and a shared import across otherwise-standalone node scripts buys coupling rather than safety (and puts two sides of every future comparison behind one reader, per dev-standards [[L-37]]). BOM is the same class and belongs in the same check: a `﻿` before the first character defeats any `^`-anchored first-line test.
- **Measured, not assumed:** as at `d18e344e`, per `.claude/handoff/crlf-materialisation-sweep/01-grounder.md` — 36 content-reading sites across `npm run check` plus the four hooks, **34 tolerant or out of scope, 0 confirmed vulnerable**. Tolerance is per-site and reasoned (`\s` in the pattern absorbs `\r`; `includes()` is a substring test; whole-file regex with no line anchors; `JSON.parse`). So this ships green and needs no baseline — it is a ratchet against the next author, not a burn-down. **This classification is the agent's, re-derived independently for one site only (the BOM finding below); the other 35 are cited, not verified.**
- **Coverage boundary, stated rather than discovered:** `scripts/architecture-audit.mjs` (9 sites) and everything under `vitest run` were NOT traced. The check above would cover them by path, but the CLAIM that they are clean is unmade. Do not let a green first run be read as "the gate is materialisation-independent".
- **Third instance, 2026-08-20 — and it is outside the proposed aperture.** The knip tranche-2 census agent hit this in its OWN analysis script: it split `rg` output on `"\n"`, every `brief/*.md` match kept a trailing `\r` (those files are CRLF), and the parse silently dropped genuine cross-file references. It wrongly placed `lib/subscriptions/acceptance.ts:getLatestTosAcceptance` in the "referenced nowhere" bucket when `brief/legal/TOS_ARCHIVAL_SPEC.md` names it — i.e. **one line-ending bug away from proposing the deletion of code a spec depends on.** It self-caught only because a human-legible contradiction surfaced. A `no-naive-line-split` check over `scripts/**` and `.claude/hooks/**` would NOT have covered it: the script was an agent's scratch file in a handoff directory, written and discarded inside one task. That does not argue for widening the glob to scratch files — it argues that the class recurs wherever this idiom is retyped, and the check is a ratchet on the tracked tree only. Say that when the check ships, so a green run is not read as "this cannot happen here".
- **Covering spec:** NEW

### M-065 — `check-rules-tracked` has no probe seam, and a BOM defeats its frontmatter test

- **Rule:** "every `.claude/rules/*.md` is git-tracked and carries `paths:` frontmatter" <!-- @enforced check:check-rules-tracked -->
- **Where it lives:** `scripts/check-rules-tracked.mjs:87` — `/^---[\s\S]*?\bpaths:/m` against the first 400 bytes
- **Rung:** check · **Blast:** other
- **Satisfied when:** extends:check:check-rules-tracked
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

### M-068b — nothing stops a subagent committing — ✅ BUILT 2026-08-20, **recorded 2026-08-22**

- **Rule:** "the implementer ends at a report; YOU commit and push (it never does)" — `CLAUDE.md` §5 and §7
- **Where it lives:** `CLAUDE.md` §5, the implementer bullet
- **Rung:** hook · **Blast:** other
- **Sketch:** `.claude/hooks/agent-write-scope.js` declares `// @matcher Write|Edit|MultiEdit|NotebookEdit` — it gates *where* an agent writes and never sees `Bash`, so `git commit` from inside a subagent is ungated. `bash-gate.js` denies `--no-verify` and force-push and asks on `git push`, none of which is "a subagent must not commit". Sketch: extend the write-scope hook's matcher to `Bash` and deny `git commit` / `git merge` / `git rebase` when `agent_type` is set, reusing the E7 `agent_type` field the hook already reads. Probe both directions — a commit attempted from an agent must be denied, and the same command from the main session must pass untouched.
- **Exposed, not created, by the E10 ruling (2026-08-20):** worktree isolation never enforced this either. It made a subagent's commit land on a throwaway branch instead of yours, which hid the behaviour rather than preventing it — and it hid it *while making the agent's work invisible to your tree*, which is the E10 defect. Dropping isolation removes the accidental concealment and leaves the real gap in view. Do not read "isolation used to protect us here" into it.
- **Covering spec:** NEW

**✅ BUILT — verified against the tree 2026-08-22 at `8ba85b5c`, not taken from `CLAUDE.md`'s claim.**
`.claude/hooks/agent-write-scope.js:60` declares `// @matcher Write|Edit|MultiEdit|NotebookEdit|Bash`
and `:96` defines `GIT_COMMIT_FAMILY = "commit|merge|rebase|cherry-pick|revert|am|push"` — the sketch
above, plus `revert`/`am`, gated on `agent_type` being present. `scripts/check-agent-write-scope.mjs`
probes both directions, including the `git -C` shape that defeated the first cut and a main-session
control case that must still pass.

- **⚠ THIS ENTRY WAS FILED UNDER A DUPLICATE ID and sat satisfied-but-open for two days.** There were
  two `### M-068` headings: the BUILT one above and this one. Renumbered to **M-068b** rather than to
  the next free number, so the two `git log` references to "M-068" that predate the split still
  resolve to something. **Nothing in this register detects either failure** — an ID reused, or an
  entry whose named mechanism now exists. Both are mechanisable and both are cheap: heading IDs are a
  `sort | uniq -d`, and `check-claude-md.mjs` already contains a marker resolver that can tell whether
  a cited `check:`/`hook:`/`eslint:` control resolves. → **M-083**

### M-074 — the purge clock advances whether or not the 30-day warning is ever delivered — ✅ BUILT 2026-08-23

- **Rule:** counsel ruling 2026-08-20 — the Day-0 cancellation notice may state a *minimum retention period* instead of a deletion date, **"provided the surrounding lifecycle actually delivers the eventual date"**. The 30-day warning is that delivery. It is therefore a condition of the Day-0 disclosure being sufficient, not a courtesy send.
- **Where it lives:** the counsel ruling recorded in `brief/legal/CANCELLATION_EMAIL_TEMPLATES_v1.1.md` and the header of `lib/comms/templates/agent/subscriptions/cancellation.tsx`. No code depends on it.
- **Rung:** check (+ schema) · **Blast:** data-boundary
- **Satisfied when:** test:lib/subscriptions/__tests__/purgeWarningGate.test.ts
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

- **BUILT 2026-08-23, all three parts. The sketch above was wrong in one place and would have shipped the defect it was written to close — recorded here rather than quietly corrected in the diff.**
  - **Part 1's sketch said "a `communication_log` row for `subscription.purge_warning_30d` is already written by the send path, so the signal exists. Gate on it."** Gating on the ROW is a delivery gate satisfied by a failed send: `logToDb` writes a row on **both** outcomes, `sent` and `failed`. The row proves the send path executed — the same attempt-vs-outcome confusion the entry itself diagnoses two bullets above, reproduced in its own remedy. The gate reads `status`, never existence. `lib/subscriptions/purgeWarningGate.ts` splits the lifecycle explicitly: inserted as `sent`|`failed`, later revised by the Resend webhook to `delivered`|`opened`|`bounced`|`unsubscribed`; `sent`/`delivered`/`opened`/`unsubscribed` establish delivery, `failed`/`bounced` are a send failure, and anything else defers as `not_delivered` rather than being assumed good.
  - **Part 2.** `subscriptions.purge_deferred_at` + `purge_deferred_reason` (`010_platform_features.sql` §X.2, CHECK-constrained to the four reasons). Applied to production 2026-08-23 via the tracked ledger; `check-schema-drift.mjs` reports zero drift against the migration file afterwards. `purge_warning_sent_at` was **not** renamed — per the bullet above, the missing thing was the dependency, not the label.
  - **Part 3.** Every deferral surfaces twice: `lib/cron/cronDigest.ts`'s `isIssue` now counts a non-zero `deferred` as an issue (so the digest cannot report a clean run over a held purge), and `app/(admin)/admin/subscriptions/page.tsx` carries a card listing each deferred org with a per-reason "what to do". The four reasons are distinguishable exactly as the entry required — `no_contact` (find a contact) reads differently from `send_failed` (investigate delivery).
  - **A false-zero was avoided in the build, of the class M-088 closed the same week:** the `communication_log` query's `error` is treated as `"skipped"`, never as "no warning found". Collapsing an unreadable log into an absent warning would have made a transient database error look like grounds to defer — or, with the condition inverted, grounds to purge.
  - **Satisfied when** resolved on the first run after the test file landed, and the ⚑ note it produced is what prompted this closure — M-083 assertion 2 working as designed, on its second catch.

### M-071 — attachments are supported, unimplemented, and silently dropped on retry — ⚖ RULED 2026-08-20 (retained as the build-if-reversed)

**The ruling was already in this entry's body and never reached its heading**, so the register kept
counting a withdrawn requirement as pending work — the same defect as M-023 and M-026, one axis over.
CD ruled 2026-08-20 that **the spec moves: a link satisfies ADDENDUM_57G §11.3.** The build below is
not queued; it is the record of what reversing that ruling costs. Do not treat this as open work.

**⚠ Closing it did NOT close the third sketch-half, and that half was the live finding.** Sketch item
(3) — "a check asserting the drain's field set is a superset of what the sender accepts" — is
independent of whether an attachment is ever sent, and measuring it on 2026-08-23 showed a defect
wider than the attachment framing. It is now **M-093**, filed separately rather than buried in a
ruled entry, because a closure that swallows a finding is worse than an entry left open.

- **Rule:** ADDENDUM_57G §11.3 — the T-30 purge warning goes *"with full export bundle attached"*. Not implemented, and not implementable as a one-line parameter.
- **Where it lives:** §11.3 only. No code, no check.
- **Rung:** check (+ migration) · **Blast:** data-boundary
- **Satisfied when:** extends:check:schema-contract-scan
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
- **Rung:** hook · **Blast:** other — **held at `other` on review, 2026-08-22, and this is the worked example for the band rule at the top of this file.** It is a defect in a rung-1 deny, which is the shape that tempts an upgrade; but every measured failure is a REFUSAL of a legitimate command, so it fails safe and exposes nothing. Sibling entry M-081, in the same file, moved to `control` because its instances fail open. Direction decides, not location.
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

**⚠ THAT NOTE WAS WRONG, AND THE THING IT CLAIMED TO HAVE AVOIDED SHIPPED (2026-08-22).** The seam
covers every probe that sets `PLEKS_HOOK_PROBE=1` — but `check-git-hooks.mjs` has one block that
CLEARS the flag on purpose, because seam-inertness is the property it tests. On the default branch
the guard therefore fires there, refusing before pre-commit echoes the command it resolved, and both
of that block's assertions read `(no output)`. `npm run check` fails on `main`: exactly the outcome
the note said the seam prevented.

- **It went GREEN on the PR and RED on the push to main** (run `32523760908`, 2 probes wrong). A PR
  is built from a detached merge ref, where `git branch --show-current` is empty and the guard is
  inert; a push to `main` has the branch set. **The run that gates merging exercised the inert
  half.** That is the transferable finding — a branch-sensitive control is only half-tested by PR CI,
  and this repo's CI has no run that would have caught it before merge.
- **Fixed** by naming the simulated branch in that one block (`PLEKS_BRANCH_PROBE`, the guard's own
  seam — declaring which branch the probe simulates, not opting out), plus a NEW probe pinning the
  combination nothing asserted: flag absent AND branch is the default → must refuse. Kept under the
  npm shim deliberately: if the guard ever stops refusing there, the hook falls through to a real
  `npm run check` that re-enters this script, which is the documented fork bomb.
- **The lesson is the one M-072 ends on, one rung up.** A design note reasoning about a seam's
  coverage is a claim about every caller, and it was written from the callers that were in mind.
  The probe suite had a caller the note's author did not enumerate — in the same file.


### M-070 — a generated seed artefact with no regeneration check

- **Rule:** `lib/comms/templates/seed/generated/document_templates.seed.generated.sql` is generated from `lib/comms/templates/seed/*.ts` by `scripts/gen-template-seed.mts`. The committed artefact is expected to match its source.
- **Where it lives:** nowhere. Not a CLAUDE.md bullet, not a rule file, not a check.
- **Rung:** check · **Blast:** data-boundary
- **Satisfied when:** check:check-seed-artefact-fresh
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
- **Satisfied when:** eslint:pleks/no-rerolled-regulator-contact
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
- **Rung:** ~~eslint~~ → **check** (corrected 2026-08-23, see below) · **Blast:** data-boundary
- **Satisfied when:** check:check-platform-org-exclusion
- **Note the slot changed rung.** A CHECK, not the ESLint rule this entry recorded for months: the mechanism has to read `supabase/migrations/**` as well as `app/`+`lib/`, and no lint rule can. The rung correction is the finding, not a detail.
- **Not satisfied by the visibility ratchet.** `check:check-invariant-has-callers` shipped 2026-08-23; it makes the gap loud. This entry closes only AFTER the per-site census it requires, and then a rule over org-iterating query shapes.

**⚠ THE RECORDED RUNG WAS WRONG, AND IT WAS WRONG IN THE DIRECTION THAT HIDES THE DEFECT.** This
entry proposed `eslint:pleks/require-platform-org-exclusion`. When the census was run (2026-08-23),
the reachable defect **was not in TypeScript at all** — it was in two `SECURITY DEFINER` functions in
`supabase/migrations/010_platform_features.sql`, where `find_dormant_org_candidates` and
`find_dormancy_final_candidates` iterated every org and excluded only the sentinel. An ESLint rule
cannot read a `.sql` file, so the proposed mechanism would have shipped, gone green, and left the
live hole exactly where it was — a control aimed at the language the author was thinking in rather
than the language the rule has to hold in. Same shape as the 2026-08-22 scar (CLAUDE.md §6): a rule
whose aperture misses the surface that matters still passes every probe.

**What the census found, and it was live, not theoretical.** As at `08df4a30` the Pleks platform org
(`…0002`) had **0 members and was 44 days old**, against a 60-day dormancy threshold —
`find_dormant_org_candidates(now())` returned it when run against prod. It would have been
dormancy-warned in ~16 days, final-warned 30 days later, then handed to `purgeOrg`, which did not
refuse it either: the org owning all platform email logging was on a scheduled path to deletion, and
nothing in the tree would have said so first.

**Fixed 2026-08-23 in four places, two layers per track**, and the SQL predicate is `is_platform =
false` rather than a hardcoded uuid, so a second platform org inherits the protection:
both dormancy RPCs exclude it, `purge_org_cascade` raises rather than purging it, and
`purgeOrg` refuses it alongside the sentinel and decoy. Applied to prod and verified both
directions — the platform org left the candidate set, a real org stayed in it (`total_candidates =
1`), and the deployed function text was re-read to confirm the guard is actually there rather than
inferred from a `RAISE NOTICE` that `execute_sql` does not return.

**Why the entry stays OPEN after a fix that works.** The fix closes the one path the census proved
reachable; it does not create the general rule. And `excludePlatformOrg` **still has zero code
readers** — the fix bypassed it, because the defect was in SQL and the helper is TypeScript. That is
worth saying plainly rather than quietly re-baselining: the helper's continued existence with no
caller is still the exact condition this entry was filed for, and the live fix landing elsewhere
makes the helper *more* misleading, not less — a reader now finds a stated MUST, no callers, and a
protected system, and would reasonably conclude the helper is what protects it.
- **Sketch:** found 2026-08-20 by the knip tranche-2 sweep, which flagged the export as unreferenced. It is not dead code — it is an **unenforced invariant**, which is the more dangerous reading of the same evidence: the guard exists, the rule is written down, and **no query in the tree applies it**. Either every org-iterating query is already safe for a reason the comment does not give, or the platform org is silently included in fan-outs that were meant to exclude it. Nobody has established which, and the helper's existence has been standing in for the answer. Two pieces of work, in order: (1) census every "for each org" query and classify per site whether platform-org inclusion is a defect there — the answer decides whether this is a burn-down or a no-op; (2) only then, an ESLint rule over org-iterating query shapes. Do NOT build (2) first; a rule with no measured population is how a check's first number becomes a finding.

**Visibility ratchet SHIPPED 2026-08-23 — `scripts/check-invariant-has-callers.mjs`. This entry, M-077 and M-082 all stay OPEN, and the distinction matters.** The check asserts that an export carrying an `@invariant M-0NN` tag has at least one CODE reader — comments are blanked before counting, because M-082's finding was that prose asserting a list is live made the gap invisible, so a sentence must never satisfy it. The known instances are recorded in `scripts/invariant-callers.baseline.json` with their reason and register pointer; the check goes red on the next NEW instance, not on those. **M-077 has since left that baseline** — `HELP_CONTENT_DRAFT` gained a real reader on 2026-08-23, the check failed with "the baseline must shrink", and the entry was removed. That was the ratchet's first firing on real work rather than a probe.

What it does NOT do, stated plainly: it does not exclude the platform org from any query, sign off the help content, or protect a table from a purge. It converts a silent lie into a loud one — M-082 sketch half (a) — and that is still the right first move, because all three went unnoticed for months precisely because nothing asked the question out loud. Each entry's `Satisfied when` now names the mechanism that actually closes it.

**Deliberately NOT built: the general form.** M-077 rejected "any `*_DRAFT`/`*_REQUIRED`-shaped export with zero readers" on a population of three, and that rejection stands — this is a ratchet over DECLARED invariants, so an export nobody tagged is invisible to it. That hole is real, and is why the class-level rule stays open rather than reading as covered.

**Probed both directions against the real tree, not only in fixtures:** a newly tagged export with no reader FAILS; a baselined invariant that GAINS a reader FAILS with "the baseline must shrink"; a baseline entry naming no tagged export FAILS; the clean tree passes. A tag resolving to no export also fails — which caught the check author's own explanatory comment on first run: the third time this repo has been bitten by a token written in prose, and the first time a check caught it rather than being fooled by it.
- **Covering spec:** NEW

### M-075 — `check-git-hooks`'s probes are not concurrency-safe

- **Rule:** a probe's result must be a function of what the tree SAYS, never of what else is running — the same family as **M-064** ("a check must not depend on how the tree was materialised"), one axis over: time rather than checkout
- **Where it lives:** `scripts/check-git-hooks.mjs` — the probes that spawn real `.githooks/*` invocations with a shimmed `npm`
- **Rung:** check · **Blast:** other
- **Satisfied when:** extends:check:check-git-hooks
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
- **Satisfied when:** extends:check:check-handoff-contract
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

### M-077 — `HELP_CONTENT_DRAFT` is a sign-off gate that nothing reads — ✅ BUILT 2026-08-23

- **Rule:** `lib/help/help-data.ts:8` — its own header: "⚠ DRAFT — `HELP_CONTENT_DRAFT` is true until Stéan's §7 content-compliance pass signs off every answer"
- **Where it lives:** that header comment and the constant's own declaration. No CLAUDE.md bullet, no rule file, no check.
- **Rung:** eslint · **Blast:** other
- **Satisfied when:** test:lib/help/__tests__/draft-notice.test.ts

**BUILT 2026-08-23 — the flag now gates visible behaviour.** `lib/help/draft-notice.ts` is the reader it never had: while `HELP_CONTENT_DRAFT` is true, `HelpCentre` renders a warning banner telling the reader the answers have not completed compliance review and to confirm anything they plan to act on. The banner disappears on its own when the flag flips.

**The path this slot named until today did not exist** (`app/(public)/help/…` — /help lives at `app/(help)/help/`). Corrected rather than left plausible; a satisfied-when pointing at a non-existent destination is the same class as an unverified citation.

**Why a pure function rather than a rendered-component assertion.** This repo's vitest runs `environment: 'node'` with zero `.tsx` tests, so proving a banner by rendering it meant adding jsdom + testing-library for one boolean — against the rule on not adding packages an existing one covers. The decision and its copy live in `lib/help/draft-notice.ts`, unit-testable in the suite that already exists.

**Probed both directions**, which matters here more than usual: the true-branch test alone would pass against a function that returns a notice unconditionally — the very defect this entry records, one layer up. The suite also asserts the REAL constant is still `true`, so flipping it without doing the §7 pass fails rather than silently closing this entry.

⚠ **WHAT IS STILL OUTSTANDING, and it is not a build.** The content remains UNSIGNED. A banner is a disclosure, not a sign-off — it makes the interim state honest instead of silent, and that is all. Stéan's §7 content-compliance pass (D-HELP-20) is still owed, and the flag flips to false only when it is done.
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
- **Satisfied when:** test:lib/documents/__tests__/disclaimer-ssot.test.ts
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
- **Satisfied when:** none — a doctrine correction to CLAUDE.md prose; the residual exposure is stated, not gated
- **The finding, and it is about the JUSTIFICATION rather than the grant.** There is no worktree any more. The E10 ruling moved implementer to the main checkout, and **the same file's header says so three paragraphs above** — "Dropping isolation (E10 ruling) removed the concealment". So one file simultaneously records that isolation was dropped and cites isolation as the containment for its only unrestricted write grant.
- **The grant may well still be right** — path-scoping an agent whose entire job is editing arbitrary source is close to impossible, and the alternative (ask on every edit) makes the implementer useless. What changed is what actually contains it: **the caller's review of a dirty tree, plus the commit denial in the same hook.** Those are different guarantees from a throwaway checkout, and neither is named at the site.
- **Sketch:** replace the stale sentence with the two controls that really apply, and state the residual exposure plainly — an implementer can write anywhere in the main checkout, and the only thing between that and a landed change is a human reading `git status`. If that is too thin, the mechanism is not a path list but a **write manifest**: the caller declares the files in scope at spawn time and the hook denies outside them. That is buildable today — `agent_type` and `cwd` are both in the payload — and it is the shape the spine's "declared scope" language already assumes exists.
- **Why it is filed rather than fixed on sight:** changing a security posture on the strength of a stale comment is how the posture got stale. The grant is a deliberate decision that needs re-taking with the current facts, not a typo.
- **Related:** E10 (`docs/EXPERIMENTS.md`) · M-068 (nothing stops a subagent committing — the control that now does half this work)
- **Provenance:** CD review, 2026-08-21, against `.claude/hooks/agent-write-scope.js` read in full at `ca4689dc`. **E10 fallout nobody swept.**
- **Covering spec:** NEW

**Sketch half (a) DONE 2026-08-23; the entry stays OPEN on half (b).** The stale sentence in
`.claude/hooks/agent-write-scope.js` (read at `db0d6748`, line 72) has been replaced with the two
controls that really apply — the commit/push denial in the same hook, and the caller's review of a
dirty tree — plus the residual exposure stated unhedged. **The grant is unchanged**: `implementer:
null` still stands, for the reason this entry gives, and the comment now says so explicitly rather
than resting on a control that no longer exists. What remains is the decision the entry was filed
for — whether a write manifest should replace the unrestricted grant — and that is CD's to take,
not a build to schedule. Removing a false justification does not answer the question it was
concealing.

**Retained 2026-08-21:** a standing security grant whose only written justification names a control the E10 ruling removed. CD-authored, and the entry is explicit that the grant may still be right — what it needs is re-taking against current facts. That is a DECISION pending, not a build not done, and closing it would retire the question rather than answer it.


### M-080 — two hooks match `Bash` and their precedence is undocumented and unprobed

- **Rule:** implicit — when two PreToolUse hooks both match a tool and return different decisions, one wins. Nothing states which.
- **Where it lives:** nowhere. `bash-gate.js` matches `Bash`; `agent-write-scope.js` matches `Write|Edit|MultiEdit|NotebookEdit|Bash`. Every Bash call in every subagent runs both.
- **Rung:** check · **Blast:** other
- **Satisfied when:** extends:check:check-hook-registration
- **Why it matters, specifically:** the **force-push denial lives in one hook** and the **subagent commit denial lives in the other**. Presumably most-restrictive wins — but that is an assumption, neither file asserts it, and **no probe exercises the disagreement case at all**. Both suites test their own hook in isolation, which is precisely the configuration in which a precedence bug is invisible.
- **Sketch:** construct one payload the two hooks decide DIFFERENTLY — a subagent running an ordinary commit, which `bash-gate` allows and `agent-write-scope` denies — and assert the composite decision the harness actually applies. **This is a measurement before it is a check:** the answer is a harness behaviour nobody here has observed, so it belongs in `docs/EXPERIMENTS.md` first and becomes a probe once known.
- **⚠ Do not write the check against the assumed answer.** "Most restrictive wins" is the intuitive design and would produce a check that passes by agreeing with itself. Measure, then encode.
- **Related:** E7/E8 (what the payload carries) · [[l-44]] (a probe and the thing it guards, authored by the same hand)
- **Provenance:** CD review, 2026-08-21. Not read as part of it: `.claude/hooks/mcp-ddl-gate.js`, which may make it three hooks rather than two.
- **Covering spec:** NEW

**Retained 2026-08-21:** it is a MEASUREMENT before it is a check. The force-push denial lives in one hook and the subagent-commit denial in the other, nothing has ever exercised their disagreement, and the entry already warns against writing the check against the assumed answer. Closing it closes an unasked question about two rung-1 controls.


### M-082 — `RETENTION_PROTECTED_TABLES` governs nothing, and two artefacts say it does — **BUILT 2026-08-23 (`scripts/check-retention-skiplist.mts`)**

- **Rule:** the tables on this list are protected from retention purges — a PPRA/POPIA obligation, not a preference. The array names `audit_log`, `trust_transactions`, `trust_reconciliation_periods`, `consent_log`, `auth_events`, `tos_acceptances` — **six**, and this line said five until 2026-08-23, omitting `trust_reconciliation_periods`. That is the entry's own copy of the list having silently drifted from the array while the entry was open about the danger of copies of the list drifting. Left visible rather than quietly corrected, because it is the cheapest available demonstration of the failure mode: a fourth copy, in prose, in the register that exists to track it.
- **Where it lives:** `lib/subscriptions/retention.ts` — the array, and nothing else.
- **Rung:** check · **Blast:** data-boundary
- **Satisfied when:** check:check-retention-skiplist
- **Not satisfied by the visibility ratchet.** `check:check-invariant-has-callers` shipped 2026-08-23 and is sketch half (a) only. Half (b) shipped later the same day, but **not in the shape this entry specified** — see below.

**⚠ HALF (b) AS WRITTEN IS NOT BUILDABLE, AND SAYING SO IS THE FINDING.** The sketch below asks for
"every purge and erasure path deriving its skip-list from this array **by import**". The path that
matters is `purge_org_cascade`, a SQL `SECURITY DEFINER` function — **it cannot import a TypeScript
array**, in this or any other design. The sketch was written from the shape of the language its
author was reading (the same error M-067 made in the opposite direction, proposing an ESLint rule
for a defect that turned out to live in SQL). An entry can be open for months on a plan that was
never executable; nothing in the register format catches that, because a sketch is prose and prose
is not run.

**What shipped instead, ruled 2026-08-23: the array stays the SSOT and becomes real by being
CHECKED against the SQL rather than imported by it.** `scripts/check-retention-skiplist.mts` reads
`purge_org_cascade` out of `010_platform_features.sql`, extracts BOTH copies of the list it
carries — the Step 1 `UPDATE <t> SET org_id = v_sentinel` statements and the Step 2 `NOT IN (…)`
exclusion list — and asserts each matches the array exactly, in both directions.

**The list existed THREE times and nothing compared any pair.** That is more than the entry
originally found: half (b) was framed as "the array governs nothing", but the two SQL copies could
also silently disagree **with each other**, and neither direction raises an error. A table in the
UPDATE block but missing from the NOT IN list is repointed to the sentinel and then DELETED —
statutory records destroyed by a purge that reports success. A table in the NOT IN list but missing
from the UPDATE block survives un-anonymised under a dead org's id. Both are the one-directional
silence this entry already named; there were simply two of them, not one.

**Probed both directions, and the vacuous-pass case explicitly.** A table missing from either SQL
copy fails; SQL protecting a table the array does not declare fails; a parse matching nothing fails
rather than passing empty; a renamed function returns null and fails rather than reporting clean.
The parser probes run against fixture text shaped like the real function, not against the real file
— a selftest that read the real file would pass by tautology, which is the same collapse as a probe
suite that only exercises cases the discriminator already recognises (CLAUDE.md §6, 2026-08-19).
The two "handled separately" tables (`organisations`, `subscriptions`, dealt with by Steps 4 and 5)
are excluded by reading the SQL's own marker comment as the boundary rather than by subtracting a
hardcoded set — a subtraction would have been a *fourth* copy of a list, inside the check written
to stop lists being copied.

**Still open after the build, and deliberately so:** the array now has a mechanical reader but still
no *runtime* importer, so it stays in `scripts/invariant-callers.baseline.json`. A check is not a
caller. Whether that baseline entry should be satisfiable by a check is itself unsettled — closing
it by loosening the ratchet's definition of "read" would weaken the ratchet to close one of the
entries that motivated it.
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
- **Rung:** check · **Blast:** control — *re-tagged from `other`, 2026-08-22.* Every instance below fails OPEN: a defeated token match lets the guarded command through. The regex-first rebuild of the `rm` rule alone introduced **eight bypasses**, all surviving a green 54-probe suite, on the rule whose aperture is `rm -rf` against root and home. `other` described the entry's topic ("token matching"); it did not describe what eight open bypasses in the destructive-command gate expose. See the band definition at the top of this file — direction is what decides this, which is why sibling entry M-072 stays `other`.
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

### M-083 — this register does not notice a duplicate ID, or an entry its own mechanism has satisfied — ✅ BUILT 2026-08-23

- **Rule:** an M-number identifies exactly one entry, and an entry whose named mechanism now exists is BUILT, not open.
- **Where it lives:** nowhere. `docs/MECHANISABLE.md` is prose; nothing reads it.
- **Rung:** check · **Blast:** other — the register is a work queue, not a control, so a defect here misroutes effort rather than exposing anything.
- **Satisfied when:** check:check-register-integrity
- **Measured 2026-08-22 at `8ba85b5c`, both failures live in the file at once:**
  - **Duplicate ID:** two headings read `### M-068`, one BUILT and one open, filed a day apart. It survived a full triage pass on 2026-08-21 that read every entry — because the pass read entries, and the defect is only visible across them. It also silently broke the open/built counts: the derived figure came out 50 or 51 depending on which grep was used, and **both numbers were reported to CD as if exact.**
  - **Satisfied but open:** the same entry's sketch — extend the write-scope hook's matcher to `Bash`, deny the commit-creating family on `agent_type` — was BUILT on 2026-08-20 and the entry never moved. Four more entries in the 2026-08-21 pass turned out the same way (M-033, M-034, M-049, M-050), which is 5 of ~66. **A register that is wrong about a twelfth of itself is one that gets re-derived instead of read.**
- **Sketch, two assertions, both cheap:**
  1. Heading IDs are unique — `sort | uniq -d` over `^### M-`. Probe both directions: a planted duplicate must FAIL, and the real file must PASS once M-068b lands.
  2. Every entry citing a `check:`/`hook:`/`eslint:`/`audit:` marker that RESOLVES, and not marked BUILT, is reported. **Do not fail on this one — report it.** Resolution proves the mechanism exists, not that it asserts what the entry wanted; that judgement is the grounding pass. A hard failure would push the next author to delete the citation rather than settle the entry, which is the allowlist-widening failure in a new costume.
- **Reuse, not new machinery:** `check-claude-md.mjs` already carries the marker resolver (built for the `@enforced` ratio) and already knows the `rung:` vocabulary. This is a second caller for it, plus a `uniq -d`.

**⚠ HALF BUILT 2026-08-22 — and assertion 2 was MEASURED BEFORE BUILDING IT AND FOUND NOT TO WORK.**
`scripts/check-register-integrity.mjs` ships assertion 1 and is in `npm run check`. Assertion 2 is
**not built**, and the reason is a correction to this entry rather than a scheduling note.

- **✅ Assertion 1, duplicate IDs.** Ten selftest cases, four known-good — a lettered suffix is a
  different entry, a heading that MENTIONS another id is not a second entry, numbering gaps are fine.
  **Proved against the real defect, not only synthetic cases:** run over `git show
  25eab6f1:docs/MECHANISABLE.md`, it exits 1 naming *"M-068 is used by TWO entries (lines 711 and
  725)"* — the exact pair found by hand a day earlier. It takes an optional path argument so that
  historical proof is repeatable. Carries the same non-empty guard as `check-knip-floor.mjs`: a file
  that parses to zero entries FAILS, because a renamed heading level would otherwise read as clean.
- **⚠ AND THE BUILT COUNTER SHIPPED THE DEFECT IT WAS WRITTEN TO CATCH — caught within the hour, by
  its own output.** The first cut read BUILT as `/BUILT/` over the heading tail. Marking this entry
  `⚠ HALF BUILT` moved the reported figure from 18 to 19: **the substring matched the qualifier that
  exists precisely to deny it.** Same class as the four `bash-gate.js` defects written up the day
  before — *the pattern matched characters AROUND the thing instead of the thing* — reappearing in a
  check about register defects, written by the session that had just written those four up. Knowing
  the class is not protection from it; the discriminating probe is. `isBuilt` now rejects
  HALF/PARTIAL(LY)/NOT/NEVER and requires BUILT as a token, with seven probes, **four of them the
  deny half** — without those, "answer not-built to everything" scores green.
  - **Fixing it surfaced a second, older miscount: `M-004` is `⚠ PARTIALLY BUILT` and the naive rule
    had been counting it as BUILT all along.** So the true figure was never 18 — it is **17 BUILT of
    68** — and every count reported before this fix, including in this session, was one too high.
    Nobody planted that; it was simply never derived by anything that had to be right. **This is the
    entry's own thesis arriving as evidence for itself:** a relational defect, invisible to per-entry
    reading, found by a count disagreeing with its previous value.
- **✗ Assertion 2, satisfied-but-open. Measured at `5dbd0684`: exactly ONE of the 50 open entries
  carries a real `@enforced` marker.** The detector would have examined **2% of the register**, and
  would not have caught M-068b (no marker) nor the four stale-BUILT entries found by hand on
  2026-08-21 (M-033, M-034, M-049, M-050) — i.e. **none of the five cases that motivated it.**
- **The lesson is about how this entry was written, and it is worth more than the check.** The sketch
  said the resolver "already exists, so this is wiring plus a `uniq -d`" — reasoning from the
  MECHANISM that was available rather than from the DEFECT that occurred. It is the register's own
  standing warning (*"a check's first number is a hypothesis"*) applied one level up: **a sketch's
  claimed coverage is a hypothesis too, and costs nothing to test before building.** Testing it here
  took one `awk` over the file.
- **What assertion 2 would actually require, filed rather than half-built:** a machine-readable slot
  on each entry naming the mechanism that would satisfy it — `**Satisfied when:** check:check-foo` —
  which the resolver can then evaluate. That is a NEW CONVENTION for ~50 existing entries, only as
  good as the author who fills it in, and worth a ruling before adoption rather than a slot nobody
  populates. **A dead slot would be the same defect in a new costume**: machinery whose output
  nobody consumes, which is M-084's finding. Not built, deliberately.
- **Also not reused, and the reason is recorded so it is not re-attempted blind:** `controlExists` in
  `check-claude-md.mjs` cannot be imported — that file executes its whole check at module top level.
  Making it importable is a guard-clause refactor of a load-bearing gate, which is cheap but is not
  free, and there is currently no consumer to justify it.
- **Why it is worth building rather than "just be careful":** the counter-argument is that a human re-reading the register catches both. That is exactly what the 2026-08-21 pass was, and it caught neither — it found four stale-BUILT entries by reading them one at a time and missed the fifth plus the duplicate. The failures are *relational*, and per-entry attention is structurally blind to them.

**✅ BUILT 2026-08-23 — assertion 2 shipped, and the measurement above was answered rather than overruled.**
The refusal recorded 2026-08-22 was correct about the mechanism that existed then: with one resolvable
marker across 50 open entries, a detector reading `@enforced` citations would have examined 2% of the
register. The entry itself named what would change that — a machine-readable slot — and flagged the
risk that it becomes "a slot nobody populates". Stéan ruled on 2026-08-23 to adopt it **and backfill**,
which is the half that makes the difference: the convention and its population landed together, so
there was never a window in which the slot existed and meant nothing.

- **The slot.** Every OPEN entry now carries `**Satisfied when:** <marker>`. Three forms, and the third
  is what keeps the second honest: a resolvable marker (`check:`/`eslint:`/`hook:`/`audit:`/`ci:`/`test:`);
  `extends:<marker>` for a fix that MODIFIES an existing mechanism, where existence signals nothing;
  and `none — <reason>`. A **bare `none` FAILS** — without that, every author facing a hard entry writes
  `none` and the convention is dead while still looking alive.
- **`extends:` is not bookkeeping.** `pleks/no-inline-app-url` exists and M-045 is open precisely
  because it does not yet visit plain literals. A resolver that decided by existence would have told
  the reader to close 27 entries whose holes are still open — worse than silence, because it argues
  for closing them. Its own state, never conflated with absent.
- **The resolver reports THREE states, and the third is M-088's rule applied to this check.** A marker
  it cannot parse returns `unknown` and is reported as unreadable — never as "the mechanism is absent",
  which would re-open a built entry on a typo and look like a finding.
- **Assertion 2 caught a real stale-open entry on its first run: M-014.** Its own sketch asks for
  `require-org-scope-on-service-read`; that rule shipped 2026-08-19, and its CLAUDE.md twin M-002 was
  already closed. A twin pair closed on one side only — invisible to per-entry reading, which is this
  entry's whole thesis. **So the "would not have caught any of the five motivating cases" measurement is
  now superseded on its own terms:** it was measuring a detector with nothing to read.
- **Reports, never fails** — as the sketch insisted. A hard failure on "your mechanism exists now" would
  push the next author to delete the citation rather than settle the entry: allowlist-widening in a new
  costume. The slot's ABSENCE fails; its resolution only ever reports.
- **One trap worth recording, because it bit during the backfill.** This entry's own prose contains the
  literal string `**Satisfied when:** check:check-foo` as an example, so a substring test for the slot
  matched M-083 itself and skipped inserting its real one. The check's line-anchored regex correctly
  disagreed and reported the entry as slotless. A register that documents its own grammar will always
  contain specimens of it — match the slot anchored to the start of a line, never as a substring.
- **Covering spec:** NEW

### M-084 — a failing Release job is invisible; three releases were lost before anyone noticed — ✅ BUILT 2026-08-22

- **Rule:** a merge to `main` cuts a GitHub Release, sized from the commit types. `CLAUDE.md` §4 calls the PR-title type "a versioning decision" *because* semantic-release acts on it.
- **Where it lives:** `.github/workflows/release.yml`. Nothing watches whether it succeeded.
- **Rung:** ci · **Blast:** other — no data is exposed; what is lost is the version history and the release notes, silently.
- **Measured 2026-08-22 at `1578dac5`:** the Release workflow failed on the last **three** merges to `main` (2026-08-21 14:21, 2026-08-21 20:28, 2026-08-22 06:14); last success 2026-08-20 19:13. **Nobody noticed for two days**, across two of my own sessions that read `gh run list` output containing the word `failure` on the Release row and acted only on the CI row. The register's own "verify before you tick" discipline did not extend to a job whose output nobody consumes.
- **Root cause, and it is this repo's controls eating themselves:** `package.json`'s `prepare` script runs `git config core.hooksPath .githooks`, so `npm ci` on the release runner wires the local hooks into a checkout that is about to be pushed to. semantic-release then pushes a tag, which fires `.githooks/pre-push` → `npm run check:full` → `test:db` → a vitest global-setup requiring a `supabase_db` container that a release runner does not have. **Both halves landed in the same commit, `fd818c0c`.** The gate built to protect pushes from a dev machine blocked the one push that is not from a dev machine.
- **Why it took a diagnostic to see it:** the failure surfaced as an execa dump ending in `failed to push some refs`, with the real cause a hundred lines up in a vitest stack. It was read as a local Docker problem for two days — including by me, in writing, twice. What resolved it was the global-setup diagnostic rebuilt the day before to report its observations: `docker context: default *CURRENT*` and `ALL containers: (empty)` are not what this machine looks like, which is what finally located the failure on a runner rather than here.
- **Fixed** in the same change as this entry: the release job unsets `core.hooksPath` after `npm ci`. Scoped to the pusher rather than to the hook — teaching every hook to stand down on `CI` would make the whole rung-1 set conditional on a variable any job can set, to fix one job.
- **Still MECHANISABLE, and that is what this entry is for.** The fix stops this instance; nothing reports the next one. **Sketch:** a scheduled or post-merge check that fails when the most recent `Release` run on `main` did not succeed — `gh run list --workflow=Release --branch main --limit 1 --json conclusion`. Probe both directions: a seeded failure must FAIL, a green run must PASS. The general class is broader than Release, and worth stating as the rule: **a CI job nobody reads is not a control.** Its result has to reach something that fails.
- **Covering spec:** NEW

**✅ BUILT 2026-08-22.** `scripts/check-release-health.mjs` + a `Release health (M-084)` job in `ci.yml`.
Eleven selftest cases, six of them known-good, in `npm run check`; the live query runs in the PR job only.

- **A PR job, not a cron.** A cron that opens an issue is a second thing nobody reads — the failure
  mode being fixed, relocated. The next PR is the first moment a human is definitely looking at this
  repo's checks, so that is where the result is made to land.
- **⚠ THE DEADLOCK IS THE DESIGN PROBLEM, and pretending otherwise is how this control would have
  died.** A gate that blocks every PR while releases are broken also blocks the PR that FIXES them,
  and a gate that blocks its own remedy earns a permanent `|| true` within a week. So a diff touching
  `.releaserc*`, `release.yml` or the check itself passes with the failure **reported** rather than
  enforced. Mechanical, not a judgement call — no exemption by branch name, author, or a magic
  commit-message token. The carve-out has its own probe asserting it still PRINTS the failure: a
  silent carve-out is indistinguishable from a pass, which is precisely the defect this entry names.
- **Three fail-closed decisions, each the direction this repo keeps getting wrong.** `gh` missing or
  unauthenticated **fails** (a check that could not run is not green). Zero runs returned **fails**
  (this repo has released since 2026-08-17, so an empty result is a broken query — the collapsed-
  analysis shape `check-knip-floor.mjs` guards in its own domain). An uncomputable base diff enables
  the gate rather than the carve-out.
- **`in_progress` and `queued` pass, and that is load-bearing.** A running release has an EMPTY
  conclusion; treating empty as not-success would redden every PR opened mid-release. That false red
  is what gets a check deleted, and it is the case the known-good half exists to pin.
- **HONEST GAP, stated rather than papered over:** the FAILURE path is probed in the pure predicate
  only. Live, only the success path has run end-to-end — the two share every line except the value
  `gh` returns, and the JSON field names are confirmed by that green path. **Deliberately no env seam
  to force a verdict:** a variable that can fake `success` in CI is a worse hole than an unprobed
  branch. The first real failure is the end-to-end proof, and it will arrive on its own.

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

---

### M-085 — the raw-env rule in `scripts/` pushes toward the change that breaks the script

- **Rule:** `pleks/no-raw-process-env` — read env through `@/lib/env`, never `process.env` directly. Real rule with a real incident behind it (the June 4–10 outage: `RESEND_API_KEY` read raw in a path that only ran on a live send).
- **Where it lives:** the five production-touching scripts un-ignored by the control-aim audit R1 — `encrypt-existing-pii.ts`, `backfill-insurance-checklists.ts`, `migrate-totp-host-claims.ts`, `wa-submit-templates.ts`, `extraction-harness/run.ts`. Recorded in `eslint-suppressions.json`.
- **Rung:** check · **Blast:** other — no data path; what breaks is a one-off operational script, silently and at the worst moment.
- **Satisfied when:** extends:eslint:pleks/no-raw-process-env
- **⚠ THIS IS A TRAP, WHICH IS WHY IT IS HERE AND NOT ONLY IN THE BASELINE.** The obvious fix makes it worse. Probed 2026-08-22 (temporary `scripts/__env_order_probe__.ts`, deleted in the same turn): `lib/env`'s public half is a set of **top-level consts** evaluated at module load, and ESM evaluates imports before any module-body statement — so in a script that calls `dotenv.config({ path: ".env.local" })` in its body, `import { SUPABASE_URL } from "../lib/env"` yields `""` while `process.env.NEXT_PUBLIC_SUPABASE_URL` holds the real value. Observed side by side: `SUPABASE_URL (named export) = ""` · `process.env after dotenv.config() = "https://noexjtlrffkzzclibvbq.s…"`. A naive migration therefore points a service-role client at an empty URL. The SERVER half is fine — `requireEnv(name)` reads `process.env[name]` at CALL time and returned the live key in the same probe.
- **Sketch (the designed fix, both halves):**
  1. A shared `scripts/_env.ts` that calls `dotenv.config()` as an import **side effect**, imported before `lib/env` in every script. Import order then puts the values in `process.env` before `lib/env` is evaluated, and the named exports work.
  2. Four registry additions to `SERVER_ENV` in `lib/env.ts` for the names that are not there — `WA_API_KEY`, `WA_USERNAME`, `WA_SANDBOX`, `WA_BUSINESS_PHONE_ID` — without which `requireEnv` does not typecheck for them.
  Three sites are already hand-rolling `requireEnv` (`if (!process.env.ENCRYPTION_KEY) { … }`), so part of the burn-down is deletion.
- **Probe both directions:** a script migrated to the bootstrap must print a NON-EMPTY `SUPABASE_URL`, and a script that imports `lib/env` WITHOUT the bootstrap must be shown to print `""` — the second half is the whole finding, and without it the fix is unfalsifiable.
- **Covering spec:** NEW

### M-086 — nine real defects in `scripts/` are recorded in a ratchet, which has no owner, priority or blast tag — ✅ FIXED 2026-08-23

**All nine fixed, plus the two style entries filed alongside them; `--prune-suppressions` took
`eslint-suppressions.json` from 65 entries in 28 files to 54 in 26.** What remains is the three
classified-keep groups (`super-linear-regex`, `no-raw-process-env` → M-085, `no-unenclosed-multiline-block`
→ M-087), and that is the outcome worth recording rather than the count: **every rule with a MIXED
population is now at zero.** A group holding both real defects and deliberate exemptions is the one
nobody can act on without re-reading it — the entry says "classified", but the group says only
"classified as something". Each surviving group is one class with one verdict.

**Two of the nine did not land as the entry predicted, and both are worth reading before trusting the
next ranked list here.**

- **#3, `render-density-pass.ts` — the entry said it "needs a human who knows which". It got a
  judgement instead, stated at the site.** `divergencePoints: opts.ldp ? null : null` was collapsed to
  `null` and the `ldp` option deleted from `dims()` and its two call sites, because `opts.ldp` had no
  other consumer — the option never changed a rendered byte. The reason for deleting rather than
  inventing a figure: no producer sets `divergencePoints` at all (`assembleReportData.ts:236` hardcodes
  `null`), so a non-null LDP value would be a fixture asserting something the pipeline cannot emit.
  Which fixtures are LDP cases is carried by `ldpSummary` and by their ids. **Overrule this if the
  intended figure is known.**
- **#5 and #6 were filed at `agent-distribution.mjs:186` and `wa-submit-templates.ts:212,215`; they
  were found at `:212` and `:213,216`.** Nothing moved them deliberately — the file drifted under an
  unanchored line number, which is §8's anchor rule failing in the register's own ranked list. The
  defects were still identifiable by rule + file, so a line number here is a convenience, never the
  identifier.

A tenth site was fixed in the same pass and was **not** on this list, because no rule was reporting
it: `backfill-insurance-checklists.ts` guarded its head-count with `if ((count ?? 0) > 0)`. The error
IS checked there, so `require-supabase-error-check` was satisfied — but Supabase returns
`count: number | null` and a null count with no error still reads as zero, and a false zero here does
not skip a property, it **backfills one that already has rows**. That is M-088's class surfacing one
file over from where the lint rule was pointing, found only by reading the lines around a flagged one.

**As originally filed:**

- **Rule:** the defects each already have a rule; none has a queue entry. `eslint-suppressions.json` stops them multiplying and says nothing about what they are.
- **Rung:** eslint (all nine are already caught) · **Blast:** mixed, tagged per site below.
- **Satisfied when:** none — a ratchet with no owner; what is missing is prioritisation, not a control
- **Why not fixed on discovery:** commit hygiene — editing `encrypt-existing-pii.ts` belongs in a commit that is about `encrypt-existing-pii.ts`, not in one about lint configuration. That is a fair reason to defer, and not a reason to file them where nobody sees them ranked.
- **Ranked:**
  1. **`encrypt-existing-pii.ts` — post-run round-trip verification, `require-supabase-error-check`.** Blast: **data-boundary**. `const { data: sample } = await supabase.from("contacts").select("id, id_number")…` drops `error`. On a read failure `sample` is undefined, `stored` is undefined, and **neither** the ✅ branch nor the ⚠ branch prints — the spot check silently vanishes after the highest-risk irreversible operation in the PII programme, and its absence looks like a quiet success. Fix: destructure `error`, and print a THIRD outcome ("verification could not run") rather than folding it into either existing branch.
  2. **`backfill-insurance-checklists.ts` ×3 — `require-supabase-error-check`.** Blast: other. The `units` read feeds `hasFurnishedUnits`, and `(units ?? []).some(…)` turns a query error into `false`, which generates the WRONG checklist for a furnished property. The two `properties` / `property_insurance_checklists` reads turn an error into a silently skipped `POLICY_HEADER` derivation.
  3. **`render-density-pass.ts:347` — `no-all-duplicated-branches`.** Blast: other. `divergencePoints: opts.ldp ? null : null` — a ternary that cannot produce two outcomes. Either a stub someone meant to finish or a condition that was inverted away; both need a human who knows which.
  4. **`check-schema-drift.mjs:848` — `no-all-duplicated-branches`.** Blast: other. A glyph ternary in the drift reporter whose arms agree, so one class of drift renders as another.
  5. **`agent-distribution.mjs:186` — `no-duplicated-branches`.** Blast: other. `else if (r.mtime && r.mtime >= since) n++` repeats the block above it.
  6. **`wa-submit-templates.ts:212,215` — `no-adhoc-dates` ×2.** Blast: other. `toLocaleDateString()` with no `timeZone` in a CLI status table; renders in the host's zone. One-line fix each to `fmtDateZA`.
- **Covering spec:** NEW

### M-087 — twelve probe suites hand-roll the same `ok()` helper; extracting it is a decision, not a cleanup

- **Rule:** none yet. This is a NAMED DECISION rather than a build item, recorded so the duplication is one somebody chose.
- **Where it lives:** `const ok = (c, l) => { if (!c) failed++; console.log(\`  ${c ? "✓" : "✗"} ${l}\`) }`, copied into twelve `--selftest` harnesses (`check-git-hooks`, `check-context-budget`, `check-statusline`, `check-migration-integrity`, `check-handoff-contract`, `check-hook-registration`, `check-import-cycles`, `check-extension-stem-pairs`, `check-drift-if-sql-changed`, `check-prepush-composition`, `eslint-cache-guard`, `agent-distribution`).
- **Rung:** n/a · **Blast:** other.
- **Satisfied when:** none — rung n/a; extracting the shared ok() helper is a refactor decision, not a control
- **The two sides, and neither is obviously right.** Extracting it collapses the whole `sonarjs/no-unenclosed-multiline-block` suppression set to zero and gives one place to improve probe output. But it also puts **every probe suite in this repo behind one shared reader** — the L-33 shape, and this repo has already been bitten by a shared-import collision. A defect in the extracted helper would degrade every gate's selftest at once, and the selftests are what the gates' credibility rests on. The current duplication is the reason a broken `ok()` can only break one suite.
- **What would settle it:** if the helper is extracted, its own probe must assert that a FAILING case increments and returns non-zero — a shared reader that silently counts nothing would make twelve suites green at once, which is the failure mode the duplication currently prevents.
- **Covering spec:** NEW

### M-088 — "could not check" and "checked, found none" collapse to the same value, and no mechanism sees it

- **Rule:** R6, clause 3 of the probe convention, now written in `dev-standards/standards/CLAUDE-MD-STANDARD.md`: an instrument that reports a count must report **unknown** distinctly from **zero**, and must be probed for the uncheckable state.
- **Where it lives:** everywhere a count is computed behind a guard. The live instance was `agent-distribution.mjs` — `b.outputK ? reports.filter(...).length : 0` — where an unparsed budget rendered as `0` overruns and the summary printed "✅ no budget overruns" over an agent that had never been compared. Fixed 2026-08-23 (`null` for uncomparable, `0` for compared-and-clean, both probed). The **class** is not fixed.
- **Rung:** check · **Blast:** other.
- **Satisfied when:** check:check-zero-default-in-report
- **Why this is not simply built — MEASURED 2026-08-23, and the first answer was wrong.** This bullet
  previously asserted that an AST scan for `cond ? … : 0` and `?? 0` was "overwhelmingly" false-positive
  and "earns a large allowlist on its first run". That was read off the code, not measured. Measuring it
  overturned the number and produced a better reason.
  The scan (`espree`, `ConditionalExpression` with a literal-`0` alternate; `??` with a literal-`0` right)
  over the 73 instrument files in `scripts/**/*.mjs` + `eslint-rules/*.mjs` returned **36 hits**, of which
  **26 fall out on SHAPE ALONE, with no judgment**: 21 are `process.exit(failed ? 1 : 0)` exit codes (not
  counts at all), 4 are histogram accumulators (`m[k] = (m[k] ?? 0) + 1`, where `0` is the additive
  identity for a key about to become 1), and 1 is a decrement guard. **Ten sites remain — that is a
  decision log, not a large allowlist, so the stated reason for refusing did not survive contact.**
  **The reason that DID survive is stronger, and it is shape-identity.** Two of the ten residual hits are
  `agent-distribution.mjs:513` — `(r.turnOverruns ?? 0) + (r.outOverruns ?? 0)` — which is the
  **correctly remediated** code from this very entry's live instance. It is safe only because the
  null-ness is preserved on a *separate channel* three lines below (`unchecked`, and the `?t`/`?o`
  flags). The defect and its own fix are **syntactically identical**; what separates them is a
  whole-function dataflow property. A check on this shape therefore cannot rank, only enumerate — and
  every correct fix of this class would add a fresh baseline entry, ratcheting noise upward as the tree
  gets *better*.
- **The measurement was not free of findings — it found a live one.** `scripts/security/audit.mjs:512`
  read `Array.isArray(orgs.json) ? orgs.json.length : 0`. PostgREST answers an error with an OBJECT, so
  a 401/500/stall on `GET organisations` coerced to a count of **0**, printed `✅ 0 orgs found` as a
  PASS, then took the `orgCount < 2` early return and skipped the entire six-table cross-org sweep —
  **Category 2, the category guarding the 2026-07-06 cross-org IDOR scar, reporting clean having executed
  none of its subject.** It also advised "create a second org", blaming the data for an authentication
  failure. Fixed and probed both directions (401 → `🔴 … cross-org tests NOT run` + a HIGH finding;
  2-org array → `✅ 2 orgs found` and all six tables run). Pre-fix behaviour was demonstrated against
  `HEAD`, not inferred.
- **What would make it buildable:** the narrower rule the measurement points at is not "every zero
  default" but **a zero default flowing into a REPORTING call in the same expression** — `ok()`,
  `finding()`, a printed rate. That is one hop of dataflow, not whole-function, and it is what separates
  all four genuine residual sites (`audit.mjs:512`, `test-report.mjs:151`/`166`, `fitscore-replay.mjs:92`)
  from `agent-distribution.mjs:513`, whose zero flows into arithmetic with the unknown preserved beside
  it. Not yet written; this is the shape a build should take.
- **Interim control:** none. This is rung-4 prose in the standard, and it is stated as such rather than tagged. The three gates corrected in `1578dac5`, the drift gate's `DUE AND NOT RUN`, and this fix are the same rule applied by hand, three times — which is the evidence a mechanism is wanted, not evidence one exists.
- **Covering spec:** NEW

### M-089 — `schema-manifest.json` is a committed snapshot of prod that nothing asserts is fresh

- **Rule:** `schema-contract-scan.mjs` runs on every `npm run check` and validates `.from(...).select/.eq/.insert` chains against `scripts/schema-manifest.json`. The manifest is **generated FROM PRODUCTION** by `scripts/gen-schema-manifest.mjs`; it is a committed artefact with no generator run tied to it.
- **Where it lives:** `scripts/schema-manifest.json` · `scripts/gen-schema-manifest.mjs` · `scripts/schema-contract-scan.mjs`.
- **Rung:** check · **Blast:** schema
- **Satisfied when:** check:check-schema-manifest-fresh
- **Measured 2026-08-23, on a regen run for M-074.** `contact_change_requests` and its three CHECK constraints appeared in the diff. That table landed in migrations and prod in **#256** (`4fa29e51`); the manifest was last regenerated in **#247** (`62f01d56`). It had therefore been stale for two merged PRs, and nothing anywhere reported it.
- **Why it stayed invisible, and why that is the finding rather than the two PRs.** A table missing from the manifest is not a violation — it is an **unknown relation**, which the scan prints as a `⚠` and excludes from validation. The headline stays `0 violations`, correctly qualified as *"among resolvable chains"*. So the scan degrades from *checking* the new table to *not checking* it, silently, and the more schema that is added without a regen the less the check covers while continuing to pass. **The gate gets weaker exactly as the surface it guards grows**, which is the opposite of a ratchet.
- **Not the same defect as M-088, and the difference is worth keeping straight.** M-088 is a zero that means "could not check" being reported as "found none". Here the honesty is intact — the scan says out loud how many chains it skipped and that the count is qualified. What is missing is that **nobody is obliged to act on the qualification**, and nothing detects that the artefact's staleness is what caused it. An honest instrument whose caveat has no consumer is still an uncovered gap; it just fails a reader rather than a machine.
- **Sketch.** The generator already queries prod for the whole schema. A check can ask a much cheaper question locally: does every table named in a `CREATE TABLE` across `supabase/migrations/**` appear as a key in the manifest, and does every column added by an `ALTER TABLE … ADD COLUMN` appear in that table's column list? Both halves are pure text-vs-JSON with no credential, so it runs on any clone and in CI. It answers *"the manifest is behind the migrations"* — which is the direction that matters, because prod-ahead-of-migrations is already `check-schema-drift.mjs`'s job. Deliberately NOT a prod query: adding one would put this check in the same credential-dependent class as the drift gate, and the failure being caught here needs no live database to see.
- **Probe both directions:** a column added to a migration but absent from the manifest must FAIL, and a manifest regenerated after that migration must PASS. Add the degenerate third: a migration file that parses to zero tables must FAIL rather than report a clean comparison — the false-zero guard M-088 exists to make routine.
- **Ordering note for whoever builds it:** it must run BEFORE `schema-contract-scan.mjs` in the `check` chain, or a stale manifest produces a confusing pair of results — the scan quietly under-checking, and the freshness failure arriving after the reader has already seen a green scan.
- **Provenance:** found by reading the diff of a manifest regen that was only being run to unblock M-074, rather than by any control. That is the whole argument for the entry: the only reason anyone looked was an unrelated task.
- **Covering spec:** NEW

### M-090 — ✅ BUILT 2026-08-23 — the rules engine's dedup helper reads a count it never checked, and a DB fault becomes a duplicate send

- **BUILT in `d92a2a20`, and the sketch below was aimed at HALF the defect.** Widening `RESULT_FIELDS` from `data` to `{data, count, status, statusText}` exposed 28 sites — and `lib/rules/actioned.ts`, the file this entry was WRITTEN ABOUT, was not among them. It builds its query conditionally and awaits an **Identifier**, so the rule returned at `type !== "CallExpression"` before reading any field. Two holes, one class; shipping the field fix alone would have closed this entry with a rule that still missed its own motivating case, and every probe would have passed.
  **It was found by an absence** — running the widened rule over the tree and noticing the expected file was not in its own findings. A green result never shows you that.
  With the identifier arm the count went 28 → 35. Seven of those were new, and **six destructure `data`** — the rule's ORIGINAL field, in six `lib/reports/*` modules, blind since it shipped. In five of the six the very next query in the same function *does* bind `error`. The authors were not careless: the rule fired on the sibling and not on this one, so this one is what got skipped. **A discriminator does not only miss what it cannot see — it teaches the codebase where the requirement stops.**
- **⚠ THE BLAST FIELD BELOW WAS WRONG, and it was wrong because the entry was written from one site.** Recorded as `other` on the reasoning that a duplicate email is not money and crosses no org boundary. The census found the same shape deciding an **invoice number**, a **work-order number**, a **trust-audit-export version** (all three are counter-as-identifier: a false zero does not degrade the number, it *restarts* it, colliding with a live record), a **credit-report send**, an **inspection re-seed**, and `hasActiveLeases` in the purge cron — where the false zero stamps `purge_eligible_at` and tells an agency its data will be deleted in 30 days. Correct blast: **money**, with a POPIA-adjacent edge. Eight such sites were fixed in `6294b1c2`, ahead of the mechanism and deliberately separate from it.
  Also found, and the sharpest of the 35: `test/db/idor.dbtest.ts` asserted ABSENCE via `expect(depositTxns ?? 0).toBe(0)`, so **the cross-org IDOR test passed on a query that never ran**. An instrument that cannot fail is not an instrument.
- **Shipped with NO baseline** — all 35 classified and fixed, nothing carried forward.

**As originally filed:**

- **Rule:** `pleks/require-supabase-error-check` — always check `{ data, error }`; never let a fallback stand in for a failed query. The incident behind it is a missing column returning `{ data: null, error: 42703 }` that `?? []` turned into "the table is empty".
- **Where it lives:** `lib/rules/actioned.ts` (`hasBeenActionedFor`), called by four rules — `communication/email-bounce-alert`, `compliance/deposit-deadline-breach`, `tenant/deposit-return-t1`, `tenant/deposit-return-t7`.
- **Rung:** eslint · **Blast:** other — no data crosses an org boundary and nothing is corrupted; what escapes is a duplicate statutory-adjacent email to a tenant.
- **Satisfied when:** extends:eslint:pleks/require-supabase-error-check
- **Measured 2026-08-23 at `686235c1`**, while extracting the helper for the import-cycle burn-down. The body is four lines and the last two are the finding:
  ```ts
  const { count } = await query
  return (count ?? 0) > 0
  ```
  `error` is never destructured, let alone read. On any query failure Supabase returns `count: null`, `?? 0` makes the expression `false`, and **false is the answer that means "this rule has NOT been actioned for this entity yet"** — so the rule fires again.
- **The direction matters and it is the unusual one.** Most false zeros fail quiet: a count that cannot be read becomes "nothing found" and something silently does not happen. This one fails LOUD, into the customer's inbox. `hasBeenActionedFor` is the entity-level deduplication guard, so a transient database fault does not suppress a send — it **repeats** one, on deposit-return notices among others. The usual reassurance that a false zero is a missed detection rather than a wrong action does not apply here.
- **⚠ Why the rule that exists for this class does not see it, and why that is the mechanisable part.** `pleks/require-supabase-error-check` keys on the `{ data, error }` destructuring shape. This site destructures `{ count }` — no `data`, so there is nothing for the rule to notice a missing `error` beside. **The aperture is set by a variable NAME, not by the call.**
  **PROBED 2026-08-23, not read off the rule source** (temporary `lib/__probe__/aperture.ts`, two functions differing only in the destructured field, deleted in the same turn). The `{ data }` function was flagged; the `{ count }` function carrying the identical defect was **silent**. Stated because a mechanism claim inferred from reading a rule is the class of claim this project has been wrong about most often, and in the same direction each time — the rule looks like it covers the call, so the hole reads as covered. That is the 2026-08-22 consent-route shape again in a third costume: one class, a rule that covers it, and a hole where the rule's discriminator looked at the wrong feature. `head: true` + `count: "exact"` is the canonical Supabase way to ask "does a row exist", so this is a shape the codebase will keep producing.
- **Sketch:** widen the rule's trigger from "destructures `data`" to "destructures ANY result field of an awaited PostgREST chain" — `data`, `count`, `status`, `statusText` — and require `error` alongside. Census the `{ count }` and `{ status }` spellings first and classify per site before recording a number; the `data` half of this rule already has a baseline and this must not silently inherit one. **Probe both directions:** a `const { count } = await supabase...` with no `error` must FAIL, and the same call WITH `error` checked must PASS — plus the degenerate third, a file that parses to zero Supabase calls must not report clean.
- **Do not "fix" it by defaulting the other way.** `(count ?? 1) > 0` would turn a fault into permanent suppression, which is the s14 failure M-074 spent three parts avoiding. The correct shape is to read `error`, and to make an unreadable dedup state a reported condition rather than a guess in either direction — the same three-state discipline as M-088 and `resolveMarker`.
- **Provenance:** found while moving the function verbatim to break a circular import, not by any check. Moved unchanged on purpose: a cycle sweep is the wrong commit to change dedup semantics in, and a behavioural fix buried in a 38-file refactor is a fix nobody reviews.
- **Covering spec:** NEW

### M-091 — ✅ BUILT 2026-08-23, then SUPERSEDED the same day — nothing stops a capability gate reading the forgeable cookie tier

**THE RULE WAS BUILT, FOUND FIVE LIVE BYPASSES, AND WAS THEN DELETED — because the CD ruling on
M-092 removed the forgeable value itself, and a rule watching a deleted module cannot fire. This is
the entry to read before building the next path-matched control, because the rule's aperture was
wrong in a way five green runs could not show.**

`eslint:pleks/no-forgeable-tier-in-gate` banned importing `lib/tier/getOrgTierFromCookie` from
anything that decides entitlement. Dropping `tier` from `getServerOrgMembership`'s return reduced
that module's entire body to `return getOrgTierCanonical(orgId)`, so it was deleted, and with it the
rule and its suite.

**And the removal surfaced SEVEN more bypasses the rule was structurally blind to.** Every one read
`membership.tier` **directly** off `getServerOrgMembership` and never imported the module the rule
watched, so the rule was green over all of them:

  `app/(dashboard)/calendar/page.tsx`         a whole-page Portfolio/Firm paywall
  `app/(dashboard)/properties/[id]/page.tsx`  `hasFeature(tier, "property_intelligence")`, plus the
                                              broker column and the scheme-tick surface
  `app/(dashboard)/leases/new/page.tsx`       an owner-tier convenience branch (not an entitlement)
  `app/(dashboard)/properties/page.tsx`       the `mine`→`all` scope widening left open below
  `app/(dashboard)/properties/[id]/edit/page.tsx`, `app/(dashboard)/reports/page.tsx`   display

**The lesson is aperture, not implementation.** The rule guarded one ROUTE to a forgeable value
while the value itself was handed out at the source, to anyone who asked. A control on "who may
import the dangerous reader" is only as good as the claim that the dangerous reader is the only way
to get the value — and that claim was never checked. **Removing the field was a strictly better
control at a lower rung: `tier` no longer exists on the type, so `tsc` refuses every one of those
seven reads, and it caught all seven in one pass with no baseline and no allowlist.**

Replaced by `lib/auth/__tests__/membership-carries-no-forgeable-field.test.ts`, aimed at the source
rather than at a route to it: a `@ts-expect-error` on `Membership["tier"]` (which fails the build in
BOTH directions — the directive goes unused the moment the field returns) plus a source assertion
that the function still delegates to `resolveOrgMembership` rather than re-deriving a local cookie
reader. Both probed against planted regressions before being believed.

**The judgement site this entry left open is closed by the same change**: `properties/page.tsx`'s
`mine`→`all` scope widening now reads the canonical tier, so it never needed the ruling.

**As built, before it was superseded:**

- **BUILT in `71e746c9` as `eslint:pleks/no-forgeable-tier-in-gate`, and it was not a ratchet on a clean tree.** Its first run found **five of the eight importers gating a paid capability on the forgeable value**: a `403 upgrade_required` paywall on `/api/leases/preview-document`, and four `hasFeature(...)` checks standing in front of spend the platform pays for (Anthropic on application documents, SMS, WhatsApp, AI maintenance triage). All five repointed to `getOrgTierCanonical` in the same commit.
- **The forgeability was PROBED, not read off the module's own comment** — the memory-of-record says mechanism claims read off code are reliably wrong in the same direction. `pleks_org` is plain JSON, `httpOnly` + `sameSite:lax` + `secure`, and **unsigned**; `getServerOrgMembership` (`lib/auth/server.ts:58-64`, as at `71e746c9`) validates exactly one field, `parsed.user_id === user.id`, and returns `tier` as supplied. `httpOnly` stops browser JavaScript, not the authenticated user replaying their own request with a crafted `Cookie` header — and here the user is the party who benefits.
- **One judgement site left open on purpose**, recorded in the rule header rather than swept in: `app/(dashboard)/properties/page.tsx` uses the forgeable tier to widen a listing scope from `mine` to `all` **within the caller's own org**. Visibility inside one organisation is not obviously an entitlement; it wants a ruling, not a guess.
- **Probed in its own suite**, not as a case in `all-rules-probed`. That harness gives one filename per rule, and two of this rule's three "decides-entitlement" tests ARE the filename (`app/api/`, `"use server"`) — one filename can only probe one arm and the other two would ship unprobed, which is precisely the false-green the harness exists to prevent.
- **This entry's prediction held and is worth keeping**: the rule is a path match, and a path match is only available because the module was split first. Do not simplify it into a name test.

**As originally filed:**

- **Rule:** the forgeable tier is display-only. `getOrgTier` reads the `pleks_org` cookie, which a user can set to `tier:"bespoke"`; every entitlement, capability and lease gate must read `getOrgTierCanonical` instead. Stated in both modules' headers and in the function's own doc comment — rung 3, prose, three times over.
- **Where it lives:** `lib/tier/getOrgTierFromCookie.ts` (the forgeable reader) vs `lib/tier/getOrgTier.ts` (the two authoritative ones).
- **Rung:** eslint · **Blast:** money — the tier is what gates lease creation, property count and screening spend. A gate that trusts the cookie lets a caller assert their own entitlement.
- **Satisfied when:** test:lib/auth/__tests__/membership-carries-no-forgeable-field.test.ts (was eslint:pleks/no-forgeable-tier-in-gate, deleted with its subject)
- **Why it was not mechanisable until 2026-08-23.** All three readers were exported from ONE module, so a rule could only tell them apart by IMPORTED NAME — `getOrgTier` forbidden, `getOrgTierCanonical` and `getOrgTierAny` fine, one substring apart and one a prefix of the others. That is the token-anchoring shape this repo has now got wrong four times (`bash-gate`'s regex rebuild, the consent-route skip lists, the `{ data }`-vs-`{ count }` aperture of M-090, and the read/write rule pair of the 2026-08-22 scar). Splitting the module makes the same rule a **path** match, which has no near-misses.
- **The split also removed the ambient hazard**, which is the part worth keeping even if this entry is never built: `import { getOrgTier, getOrgTierCanonical } from "@/lib/tier/getOrgTier"` put the forgeable reader and the gate reader on the same line, so choosing wrong was a typo rather than a decision. As at `48f12fc6` there were **8 files importing the forgeable reader and 9 importing an authoritative one, and not one file imported both** — so no call site was actually relying on the ambiguity, and the separation cost nothing. The count is stated because it is what made the move a pure repoint rather than a refactor.
- **Sketch:** a rule forbidding any import of `lib/tier/getOrgTierFromCookie` from a module that also imports a gate helper (`requireAgentWriteAccess`, `requireCapability`, `canActivateLease`, `canDowngradeTo`) or that declares `"use server"`. Probe both directions: a page importing it for a plan badge must PASS; a server action importing it beside `requireCapability` must FAIL. And the degenerate third — a file importing neither must not report clean by accident.
- **Do not build it as a name test.** If a future edit re-exports `getOrgTier` from `lib/tier/getOrgTier.ts` for convenience, the path rule silently stops covering the re-export path. The rule should therefore also assert that no module re-exports the forgeable reader — the cheap half of the check, and the half that keeps the expensive half honest.
- **Provenance:** the module split (CD ruling 2026-08-23) was made for three reasons and this was the third; the first was blast-radius isolation and the second was direction of dependency. The import cycle it also broke was the least of them.
- **Covering spec:** NEW

### M-092 — ✅ RULED AND FIXED 2026-08-23: the session cookie's `org_id` was caller-supplied, and a service client trusted it

**CD RULING (2026-08-23), cited — `lib/auth/server.ts` head 85 read in-session. Converge on
`resolveFromCookieHint`; delegate, do not reimplement.** The cookie branch was never a different
design — it was a cache in front of a correct check that skipped the check, and the correct
implementation was already twenty lines down in this same function's own DB fallback.

**The hint pattern is right, and "always query" is not.** `user_orgs` has no unique constraint on
`user_id`, so the existing `.single()` fallback already errored — and returned null — for anyone
belonging to more than one org. **The cookie CHOOSES which membership; the database AUTHORISES it.**

**Shipped:** `getServerOrgMembership` now delegates to gateway's `resolveOrgMembership` (exported for
this). One implementation, so one aperture — two functions reading one forgeable input with
*identical* apertures is still the 2026-08-22 scar, waiting for one of them to be edited.

**`tier` was dropped from the return in the same change, and that was the ruling's second half:
partial validation is worse than none.** With `org_id` and `role` validated and `tier` still verbatim
from the cookie, the sound fields lend their credibility to the unsound one — nobody reading
`membership.tier` has cause to suspect it is weaker than `membership.role`. M-091 had repointed the
*importers*; leaving the field re-armed it for anyone reading it directly, which **seven** call sites
did. See M-091 for what that exposed and why removing the field beat the lint rule that guarded it.

**Severity, stated precisely, because "buys a rendered button" covered only half of it.** Forged
`role` reaching `isOwner`/`isAdminUi` is UI. Forged **`org_id`** reaching `createServiceClient()` in
`leases/page.tsx` is an **RLS-bypassing read whose only boundary is an `.eq("org_id", …)` filter fed
by the caller** — the consent-IDOR shape with a wider aperture, and the **third** instance of
caller-supplied identifier with no ownership proof, this time on the tenancy boundary itself.

#### ✅ CLOSED 2026-08-23 — the THIRD reader, and a FOURTH the first sweep missed

Filed here as still-open at `88f530fe`; ruled and fixed the same day in `3ded96b7`. Kept rather than
deleted because the miss below is the reusable part.

`getCurrentOrgCapabilities` read `pleks_org` directly for `type`, `name` and `sub_status` and passed
them to `getOrgCapabilities(...)` **without validating any of them** — its own DB fallback reached
only on a cookie miss. The results gate routes: `app/(dashboard)/hoa/page.tsx:23`
(`if (!caps?.hasHOA) redirect("/dashboard")`) and `app/(dashboard)/landlords/page.tsx:20`
(`if (!caps?.hasLandlordsList) redirect("/properties")`). Setting `type:"hoa"` in your own cookie
passed the first.

**CD ruling: drop the fast path entirely — do not validate three fields.** A split invites "which
fields are safe?" to be re-answered later by someone with less context, and `name` looking harmless
is the same argument as `role` being UI-only: a statement about today's call sites, not about the
mechanism. Narrow-today is not a reason.

**The finding worth keeping is that this section named ONE remaining reader and there were TWO.**
`getCurrentSubscriptionState` sat twenty lines further down reading the same `sub_status` from the
same cookie, and a fix scoped to this section's words would have left it. Its fast path also
null-filled every lifecycle date from a fallback, so `past_due_since`/`paused_at`/`cancelled_at` read
as "not set" whenever the cookie answered rather than "not in the cookie". All three fast paths are
gone; the replacement probe asserts **whole-file** rather than per-function absence, for exactly this
reason.

**Severity was confirmed before implementing rather than assumed** (CD asked): nothing gates a write
or a spend on caps-derived subscription state. `requireAgentWriteAccess` reads `subscriptions`
directly via `getSubscriptionState(gw.orgId)`; `isLockedDown` has **zero** readers in the tree;
`subscriptionStateVariant`'s only consumer is `components/layout/SubscriptionStateBell.tsx`; and the
client-side `useOrgCapabilities` is sound by a different route — it reads through the RLS-bound anon
client, where RLS is the boundary rather than a filter. The blast was route visibility only. That
bounded it; it was not a reason to keep the fast path.

**Found and NOT fixed while closing this** — `getSubscriptionState` (`lib/auth/server.ts`) does
`if (error || !data) return { status: "active", … }`, so a transient DB error reads as a healthy
subscription on the lockdown gate's own data source. Fail-open on the money path, one function below
the three that were just fixed. Not folded in here because it is a different class (error handling,
not cookie provenance) and the honest alternatives — throw, or return an `"unknown"` status every
caller must handle — are a decision. **Needs its own ruling.**

**As originally filed — ⛔ NOT A MECHANISATION GAP: the session cookie's `org_id` is caller-supplied, and a service client trusts it**

**This entry is filed here because M-091 found it and it must not be lost, NOT because a lint rule is
the answer. It needs a ruling before it needs a mechanism, and the ruling is CD's.** Do not close it
with a check.

- **Rung:** n/a — architecture · **Blast:** data-boundary. Cross-org read of another organisation's records.
- **Satisfied when:** none — ruled and fixed 2026-08-23, all four cookie readers included. One residual, a DIFFERENT class: `getSubscriptionState` fails open to `"active"` on a DB error (see the closed section above), which needs its own ruling
- **What was observed, as at `71e746c9`** (three files, read in this order):
  1. `lib/auth/cookie-config.ts:8-13` — `AUTH_COOKIE_OPTS` is `httpOnly`, `sameSite:"lax"`, `secure` in prod. **There is no signature and no HMAC anywhere in the repo for this cookie** (grepped).
  2. `lib/auth/server.ts:58-64` — `getServerOrgMembership` does `JSON.parse(cookie)` and accepts it if `parsed.org_id && parsed.role && parsed.user_id === user.id`. `org_id` and `role` are **never checked against `user_orgs`** on this path.
  3. `proxy.ts:~200` — `if (hasOrgCookieRaw && orgDetailCookieRaw && orgCookieHasRole(orgDetailCookieRaw)) return null`. A well-formed cookie makes the middleware return **without re-hydrating**. The re-hydration path (`refreshOrgCookieParallel`) *does* verify membership with `.eq("user_id", userId).eq("org_id", orgId)` — but it is only reached when the cookie is absent or malformed. **A forged cookie is well-formed, so it takes the branch that skips the check.**
- **Why `httpOnly` is not the mitigation it looks like.** It stops page JavaScript reading or writing the cookie. It does nothing about the authenticated user sending their own request with a chosen `Cookie:` header, and in this threat model the user IS the attacker — an agent at agency A wanting agency B's book.
- **What it reaches.** `app/(dashboard)/leases/page.tsx:17-27` takes `org_id` straight from `getServerOrgMembership()` and passes it to a **`createServiceClient()`** query — the service client bypasses RLS, so the explicit `org_id` filter IS the boundary, and here that filter's value came from the caller. Roughly two dozen pages follow the same `const membership = await getServerOrgMembership()` → `const { org_id: orgId } = membership` shape; **they were NOT individually classified in this pass and the count above is a shape match, not a finding.** Classify per site before anyone acts on a number.
- **`role` has the same shape and was not investigated.** The cookie carries `role`, the same single check covers it, and `leases/page.tsx:21` reads `membership.role === "owner"`. Whether that reaches an authorisation decision anywhere is **unknown** — stated as unknown rather than folded into the finding, which is the distinction M-088 exists to keep.
- **This is the caller-supplied-id class for the FOURTH time** (CLAUDE.md §6 has three: 2026-07-06 writes, 2026-08-19 reads, 2026-08-22 consent). Each previous instance arrived through a request parameter, and every control built for the class inspects query shape. This one arrives through the **session cookie**, so `require-org-scope-on-service-*` sees a perfectly scoped query — `.eq("org_id", orgId)` is present and correct — and has no way to know the value is attacker-chosen. **The rules are not wrong; they are aimed at the argument rather than at where the argument came from.** That is why a lint rule is not obviously the remedy and why this entry refuses to sketch one.
- **Provenance:** found 2026-08-23 while verifying M-091's forgeability claim rather than citing the module comment for it. M-091's own fix (five capability gates repointed to the canonical tier read) does **not** address this: `getOrgTierCanonical(orgId)` is only as sound as the `orgId` handed to it.
- **Covering spec:** NEW

#### ADDENDUM, as at `88f530fe` — the repo already contains the fix, applied to the same cookie by the other reader

Three things were left open above. Two are now closed and the third changes what CD is actually being
asked to rule on, so it is recorded here rather than left to the next session to re-derive.

⚠ **SUPERSEDED BY THE RULING — read the closed sections above first.** Everything below is the
grounding pass that produced the ruling, anchored at `88f530fe`, and its present-tense statements
about `lib/auth/server.ts` describe the tree BEFORE `a5eb7d0d`/`3ded96b7`. It is kept as the evidence
trail, not as a description of current code.

1. **`pleks_org` has TWO readers, and only one of them validates.** `lib/supabase/gateway.ts`'s
   `resolveFromCookieHint` — read, not taken from its comment — parses the same cookie, then queries
   `user_orgs` with `.eq("user_id", userId).eq("org_id", parsed.org_id).is("deleted_at", null)` and
   **returns `role` and `is_admin` from the DB row, never from the cookie**. Only `tier` passes through
   verbatim, which is exactly the M-091 hole and is now closed by the lint rule. So `gateway()` and
   `gatewaySSR()` are sound on `org_id` and `role`. `getServerOrgMembership` (`lib/auth/server.ts:51-68`)
   reads the same cookie and does none of it.
   **This is the 2026-08-22 scar's shape, one layer up: two mechanisms for one class, different
   apertures, and the pair's coverage is their intersection rather than their union.** It also makes the
   ruling much cheaper than "design a signing scheme" — the question is whether `getServerOrgMembership`
   should simply do what `resolveFromCookieHint` already does, and if not, why the two differ.
2. **The "roughly two dozen" shape match is now an enumeration: 20 call sites** (`grep -rl`, `app` +
   `lib`) — 19 of them `app/(dashboard)` server components, plus `lib/auth/server.ts` itself and
   `lib/tier/getOrgTierFromCookie.ts`. Still **not classified per site**; what changed is that the
   population is counted rather than estimated.
3. **`role` — the stated unknown is now partly answered, and the answer is "not yet, in two places".**
   Every `membership.role` read in the tree was enumerated. The two fed by the unvalidated cookie are
   `app/(dashboard)/leases/page.tsx:21` (`isOwner`, passed to a client component as a prop) and
   `app/(dashboard)/properties/[id]/page.tsx:633` (`isAdminUi`) — both UI-shaping, neither a server-side
   authorisation decision **today**. The one route that genuinely gates on role,
   `app/api/suppliers/[id]/people/route.ts:102`, gets its membership from `getMembership(service, user.id)`,
   a DB read, and is unaffected. So the forged `role` currently buys a rendered button, not an operation —
   but the value is one refactor away from a gate, and the names (`isOwner`, `isAdminUi`) do not warn anyone.


---

### M-093 — the platform-email retry replays 5 of ~20 sender fields, and drops the audit trail with them

- **Rule:** a retried send is the SAME send. Whatever the first attempt carried — recipient identity, audit provenance, portal linkage — the replay carries too, or the retry path silently produces a different email and a different log row.
- **Where it lives:** nowhere. No CLAUDE.md bullet, no rule file, no check. The invariant is asserted once, for one field, as a runtime `throw`.
- **Rung:** check (+ migration) · **Blast:** data-boundary
- **Satisfied when:** check:check-retry-replay-superset

**Measured 2026-08-23 at `73a734e6`.** `SendEmailParams` (`lib/comms/send-email.ts`) declares ~20 fields. `drainPlatformEmailRetries` (`lib/subscriptions/sendWithRetry.ts:95-100`) reconstructs the call from `platform_email_retries` (010 §1248 — columns `subject` + `body_html`) and passes **exactly five**:

```ts
orgId · templateKey · to{email,name} · subject · rawHtml
```

**Dropped on every retry**, grouped by what the loss actually costs:

| Dropped | Consequence on the retry |
|---|---|
| `tenantId` | `communication_log.tenant_id` is null — the send **disappears from tenant-portal queries**, which is the column's stated purpose |
| `toneVariant`, `triggerEventType`, `triggerEventId` | the BUILD_63 audit fields — the log row no longer records **what caused the email** |
| `entityType`, `entityId`, `triggeredBy` | provenance; a system retry is indistinguishable from an unattributed send |
| `attemptNumber`, `firstAttemptLogId` | the retry chain does not know it is a retry — `attempt_count` is tracked on the retry ROW but never passed to the send, so every replay logs as attempt 1 |
| `replyTo` | falls back to the org default — a reply may go somewhere the first attempt did not |
| `attachments`, `mergeValues`, `previewText`, `bodyPreview`, `to.contactId` | content and addressing detail |

**The tell that this is a class defect and not a gap.** `sendPlatformEmail` already refuses ONE field for exactly this reason (`:33`):

> `throw new Error("sendPlatformEmail: contentHtml is not supported — pass emailElement or rawHtml so the retry can replay the exact HTML")`

The author identified the hazard, and defended the single field in front of them. **A one-field guard against a whole-class problem reads as coverage** — the throw is proof the class was known, which is precisely why nobody looked at the other fifteen.

**Why the failure is invisible.** Every dropped field is optional, so nothing type-errors, nothing throws, and the email still arrives. The evidence of loss is a null column and an absent audit row — the same one-directional silence as the 2026-08-19 cross-org READ hole (CLAUDE.md §6) and, per M-082, the same reason a retention list with no importer went unnoticed. It only fires on the retry path, i.e. **only for recipients whose delivery already failed once**.

- **Sketch — the general form, not a longer column list.** A check that reads `SendEmailParams`'s field set and the drain's constructed object, and fails when the sender accepts a field the replay cannot produce. Each field is then resolved deliberately: persisted to `platform_email_retries`, or explicitly declared replay-exempt at the site with its reason. That converts "fifteen fields nobody has considered" into "a decision per field", and makes the NEXT field added to `SendEmailParams` fail the gate rather than join the silent set.
- **Probe both directions:** a field added to `SendEmailParams` but not to the replay must FAIL; a field explicitly marked replay-exempt must PASS.
- **Do not build the migration first.** Widening `platform_email_retries` before the check exists fixes today's fifteen and leaves the sixteenth to the same silence.
- **Provenance:** surfaced 2026-08-23 while closing **M-071**, whose sketch item (3) named this check in the general form but framed it as an attachment concern; the attachment half was ruled away 2026-08-20 and would have taken this with it. Filed separately for that reason.
- **Covering spec:** NEW

### M-094 — the repo can see the SHAPE of production and never its CONTENTS, so a required row can be absent indefinitely

- **Rule:** a migration that seeds required data — a sentinel org, the platform org, reference rows, template seeds — is only correct if that data is actually **present in production**. Being correct in the file is not the property that matters.
- **Where it lives:** nowhere. `.claude/rules/migrations.md` documents the drift workflow and the two safe apply workflows, but every assertion in this repo about production is structural.
- **Rung:** check · **Blast:** data-boundary
- **Satisfied when:** check:check-required-rows
- **The class, stated once so both instances stop reading as unrelated bugs:** `check-schema-drift.mjs` compares tables, columns, policies, indexes and constraints. **Nothing in the repo can assert what rows must exist.** So any seeding migration can be right in the file and absent in prod forever, with every gate green — the drift check included, because the thing it compares is intact.
- **⚠ THIS IS THE SECOND INSTANCE, NOT THE FIRST.** **M-070** is the same class seen from the other side: `gen-template-seed.mts` is referenced by nothing, so generated-vs-source agreement is a property of whoever last ran it by hand, on rows carrying `legal_review_ref` and `locked: true`. **M-070 is about the CORRECTNESS of seeded rows; this entry is about their PRESENCE.** Both are "the repo cannot see data." Filing the second one without naming the class is how two symptoms of one blind spot get burned down separately and the blind spot survives both.
- **Measured 2026-08-23, at `08df4a30`, against prod — not inferred:** `sentinel_exists` was **false**. The `__purged__` sentinel org (`…0001`) had never existed in the live database. Its seed was sitting in `006_seed.sql §X.5`, idempotent (`ON CONFLICT (id) DO NOTHING`), correct, and never run. Applied and verified the same day.
- **The severity is the point, and it is not cosmetic.** Four of the six `RETENTION_PROTECTED_TABLES` carry `org_id … REFERENCES organisations(id) ON DELETE RESTRICT`, and `purge_org_cascade` Step 1 repoints them **to the sentinel** before deleting the org row. With no sentinel row, that repoint violates the FK and **the first real purge aborts at Step 1** — a POPIA/PPRA compliance mechanism failing at the exact moment it first matters, having reported nothing wrong for as long as it was never exercised. Every check in this repo was green over that for the entire life of the seed.
- **Why no existing gate could have caught it, spelled out so the sketch is not aimed short** (M-067 and M-082 both had mechanisms recorded that could not reach their defect): `check-schema-drift.mjs` compares structure and passes, correctly — `organisations` and every FK are exactly as the migrations describe. `check-migration-integrity.mjs` reads migration TEXT and the seed is present in it. The DB test tier runs against a **fresh** database, which replays 001→012 and therefore *always has the sentinel* — a from-scratch replay is structurally incapable of detecting "prod never had this row", and is the check most likely to be mistaken for covering it.
- **Sketch — the missing half of drift-checking: a required-rows manifest.** A tracked list of `(table, predicate)` pairs that must each return **at least one row**, evaluated **against live**, because that is the only place the answer exists. `check-schema-drift.mjs` is the precedent for a check whose truth lives in production, and this belongs beside it — same credential, same staleness/throttle treatment, and the same DUE AND NOT RUN degenerate path on a clone holding no token, so a docs push is not blocked on a credential it never had. First entries: the sentinel org, the platform org (`is_platform = true`), and the prime-rate history. Probe both directions: a manifest row whose predicate returns nothing must FAIL, and a satisfied manifest must PASS.
- **What NOT to build, and why the cheaper thing is the wrong thing.** Do not settle for a check that greps migration files for `INSERT … ON CONFLICT DO NOTHING` and asserts the statement exists. That is another structural check over text, it would have passed on the day the sentinel was missing, and it would leave the class exactly where it is while looking like it closed it.
- **Related:** M-070 (same class, correctness rather than presence) · M-082 (the purge path this defect would have aborted) · M-067 (the other guard on that path, found the same day)
- **Provenance:** found 2026-08-23 while censusing M-067's org-iterating queries. The sentinel came up only because `purge_org_cascade` was being read line by line for a different reason; nothing pointed at it, and no gate would have.
- **Covering spec:** NEW

### M-095 — the forward-reference check knows TABLES and not COLUMNS, so half its own failure class is invisible to it

- **Rule:** a migration statement may not read a **column** that a later statement in replay order declares. Same rule `check-migration-forward-refs.mjs` already enforces for tables; same abort; different token.
- **Where it lives:** `scripts/check-migration-forward-refs.mjs` — which states its own scope plainly ("a `REFERENCES <table>` in file N must not name a table first created in file M > N"). Columns are not mentioned because they were never in scope, so this is an aperture, not a bug.
- **Rung:** check · **Blast:** other
- **Satisfied when:** extends:check:check-migration-forward-refs
- **Measured 2026-08-24, from a real CI failure, not inferred:** the M-067 fix (`8c9a3554`) added `o.is_platform = false` to two dormancy RPCs and an `is_platform` read to `purge_org_cascade`, at lines 1479/1521/1617 of `010_platform_features.sql`, while `ALTER TABLE organisations ADD COLUMN … is_platform` sat at line **3915** of the same file. A fresh 001→012 replay died at **statement 250** with `column o.is_platform does not exist` (SQLSTATE 42703). Fixed 2026-08-24 by hoisting the declaration to line 1456, above its first use; a fresh `supabase db reset` then replayed 001→012 clean and the DB tier passed 181 tests against it.
- **⚠ THE INTRA-FILE HALF IS THE ONE THAT BIT, AND IT IS THE HALF THAT READS AS COVERED.** The check's third rule — "within one file, the reference must not appear ABOVE the CREATE TABLE — same failure, same file" — already anticipates the intra-file direction. It just anticipates it for tables. A reader checking whether this class is covered finds a rule that names the exact shape of the defect and still would not have fired.
- **Why the existing gates were all green.** `npm run check` never replays migrations, so the local commit gate structurally cannot see this. `check-migration-integrity.mjs` reads migration text for policy-idempotency patterns, not symbol order. `check-schema-drift.mjs` compares against a production database that **already has the column**, so it agrees. The control that caught it was CI's `db-tests` job — which is post-push by design, and is exactly the "the local gate was supposed to catch what the remote was catching" cycle CLAUDE.md §5 names as the anti-pattern.
- **Sketch, with its difficulty stated rather than hidden.** Track column declarations in replay order — `ALTER TABLE t ADD COLUMN [IF NOT EXISTS] c` plus the column lists of `CREATE TABLE t` — then flag a read of `c` that appears earlier. The table version is sound because `REFERENCES <table>` is an unambiguous token; the column version is **not** equally sound, because a bare column name is ambiguous (`o.is_platform` resolves through an alias, and the same identifier may be a variable, a parameter or another table's column). Two narrowings that keep it honest: match only **alias-qualified** reads (`<alias>.<column>`) where the alias is bound to that table in the same statement, and require the column name to be one this repo actually declares — a closed set read from the migrations themselves, so an unknown identifier is skipped rather than guessed at.
- **Probe both directions, and the second one is the one that matters:** a planted read above its own declaration must FAIL, and — because the ambiguity above is where a naive version generates noise — a column name that also appears as a plpgsql variable, a function parameter, and a same-named column on a different table must all still PASS. **Classify per site before recording any number** (CLAUDE.md §4): the first run's count is a hypothesis, and this check's own ancestor family produced 328/29/21 across three rebuilds before anyone believed it.
- **Related:** M-067 (the fix whose landing produced the defect) · M-094 (the other blind spot found on the same path, structure-vs-contents rather than order)
- **Provenance:** found 2026-08-24 by CI's `db-tests` job on PR #265, on the second push of the M-067 fix. Nothing local reported it; the entry exists because the failure was read rather than retried.
- **Covering spec:** NEW

### M-096 — ✅ BUILT 2026-09-07 — the hook probe seam is an ungated `--no-verify` equivalent, and it is documented in the file the denial sends you to read

- **Rule:** the commit gate is not bypassable. `bash-gate.js` denies `--no-verify` outright, and CLAUDE.md §3 states the reason: no gate downstream can see a hook that did not run.
- **Where it lives:** `.claude/hooks/bash-gate.js` (`isHookSeamAssignment`, the deny) · `.githooks/pre-commit:42-43` (the seam) · `.githooks/pre-commit:53` (the marker write) · `.githooks/prepare-commit-msg` (the marker read) · `scripts/check-bash-gate.mjs` (ten deny probes, seven allow probes, and the SEAM_VARS parity assertion).
- **Rung:** hook · **Blast:** other
- **Satisfied when:** extends:hook:bash-gate — denies a seam assignment token at command position, both directions
- **Measured 2026-09-07 (CD audit, verified in-session at `919c2c38`).** `PLEKS_HOOK_PROBE=1 PLEKS_PRECOMMIT_CMD=true git commit` takes the seam at `.githooks/pre-commit:42`, and that path **still reaches line 53**, which writes the gate-ok marker. `prepare-commit-msg` then matches that marker and skips its own chain. **Both rungs gone from one command** — a strictly larger bypass than `--no-verify`, which only skips the one hook. Same shape for `PLEKS_PREPUSH_CMD` and the `PLEKS_DRIFT_CMD` tail.
- **Why this is not a duplicate of the calibration already in the register.** The seam is discussed at `docs/MECHANISABLE.md:963` — but as a *design note under the default-branch-guard entry*, arguing that two variables make the act deliberate rather than convenient. The CD audit reported it as absent from the register; it is present, and reading it strengthens the finding rather than closing it. That note **already carries its own ⚠ retraction**: the seam shipped a defect once (the guard fired during an ordinary `npm run check` — the exact outcome the note said the seam prevented). A design whose stated safety property has been retracted once is not a control.
- **The calibration is right for a person and inverted for an agent.** "Two variables is not security; it is the difference between a deliberate act and a convenient one" holds when the actor has to *learn* the seam. An agent denied on `--no-verify` reads the hook to find out why — and the seam is defined in that same file, in a comment explaining what it is for. The loud door is locked and the quiet one beside it is labelled.
- **Sketch.** Add a DENY to `bash-gate.js` matching an **environment-assignment token at command position** — `PLEKS_(HOOK_PROBE|PRECOMMIT_CMD|PREPUSH_CMD|DRIFT_CMD|BRANCH_PROBE)=` as a leading token of a command — the same token-matching discipline that makes the force-push deny survive `git -C`, an absolute path, or an alias.
- **Probe both directions, and the second is the one that matters:** `PLEKS_PRECOMMIT_CMD=true git commit` must FAIL, and `grep PLEKS_HOOK_PROBE .githooks/pre-commit` must PASS. A substring match on the variable name reproduces **M-069** — the `-n`-read-as-`--no-verify` false deny — in a new place, and a deny that fires on *reading* the hook is a deny that gets deleted within a day.
- **~~Open question, Stéan's not CC's~~ — RULED 2026-09-07, and the answer was NEITHER horn.** The question was framed as a choice between carving out `check-git-hooks.mjs` by name (which publishes the bypass string inside the control) and having the check invoke the hooks by a path `bash-gate` cannot observe (a deliberate blind spot). Both were unnecessary. `check-git-hooks.mjs:73` and its five siblings set the seam through **`spawnSync`'s `env` object, in-process — they never construct a shell assignment**; the only shell-assignment spellings anywhere in that file are in comments and probe *description strings*. `check-prepush-composition.mjs:111` is the same shape. So a rule keyed on **shell assignment syntax at command position** — the only form reachable through the Bash tool at all — is structurally invisible to the legitimate driver, with nothing exempted and no path hidden. The dilemma was an artefact of describing the rule by the variable name rather than by the syntax.
- **A SECOND vehicle, found while building and not in the original finding.** `PLEKS_BRANCH_PROBE` needs no master switch: `.githooks/pre-commit:25` reads `BRANCH="${PLEKS_BRANCH_PROBE:-$(git branch --show-current)}"` *before* the default-branch guard tests it, so setting it alone spoofs the branch name and defeats that guard — independent of `PLEKS_HOOK_PROBE`. The deny therefore covers all five seam variables, not just the master switch. This is why the sketch's "two variables make it deliberate" calibration was already the wrong frame: one of them is sufficient on its own.
- **Built as:** `isHookSeamAssignment` in `.claude/hooks/bash-gate.js`, using the same `segments()` tokenizer as the force-push and `--no-verify` rules — the M-068 consolidation that M-072 records as *not* having propagated to its neighbours, carried across deliberately this time. A shell assignment is only an assignment while it PRECEDES the command word, so the scan stops at the first token that is not one; `export` and `env` are the two verbs that shift it one token right. **The deny list is five NAMED variables, not the `PLEKS_*` namespace** — `PLEKS_BRANDING` already exists in this tree as an unrelated identifier, and a prefix rule would forbid shapes nobody has reason to forbid. Naming them costs drift, so `check-bash-gate.mjs` asserts `SEAM_VARS` **equals the `PLEKS_*` variables the `.githooks` actually consume**, read out of the hooks rather than restated — the same single-source discipline `check-migration-integrity` uses for its `org_id` exemptions. A sixth seam variable now fails the check until the deny covers it, which is the only moment anyone can classify it. That parity assertion distinguishes *consumption* (`$PLEKS_X`) from *mention* (a name in a comment), probed both ways.
- **Probed live, through the real tool path, not only through the harness:** `PLEKS_HOOK_PROBE=1 git status` was refused by the hook in-session; `grep PLEKS_HOOK_PROBE .githooks/pre-commit` ran; `node scripts/check-git-hooks.mjs` ran **and stayed green**, which is the load-bearing one — if that ever goes red, the rule has stopped being structurally invisible to its own driver and someone has reached for the exemption this ruling avoided.
- **Bearing on the 2026-09-07 25-second commit:** the seam is the only path found that produces a commit 25 seconds after checkout without tripping `bash-gate`. **Not claimed as the cause** — the actual cause was established independently (dependencies declared by the lockfile and absent from `node_modules`, so the chain could not have run). Recorded because the two are indistinguishable after the fact, which is itself part of the finding.
- **Provenance:** CD agentic-setup audit, 2026-09-07. Found by reading the denial and then reading the file it points at.
- **Covering spec:** NEW

### M-097 — the MCP namespace is written in four places and nothing asserts they agree

- **Rule:** every Supabase MCP mutation passes a gate. `.claude/hooks/mcp-ddl-gate.js` shows the statement before asking; `.claude/settings.json` carries the coarse twin for when the hook is dead.
- **Where it lives:** `.claude/hooks/mcp-ddl-gate.js:29` (`@matcher`) · `.claude/settings.json` PreToolUse matcher · the settings `ask` entries (from line 17) · `scripts/check-mcp-ddl-gate.mjs:18`. **No `.mcp.json` in the repo** — verified 2026-09-07; the namespace is set by user-scope config, outside version control.
- **Rung:** check · **Blast:** data-boundary
- **Satisfied when:** check:check-mcp-ddl-gate asserts the four namespace copies agree
- **Measured 2026-09-07 (CD audit, four copies confirmed in-session).** The hook's header reasons that the settings ask-list answers *"if this hook is dead"*. **True for hook death, false for a namespace change:** the `@matcher` and the ask-list stop matching *together*, silently, and every Supabase MCP call then runs ungated **and** unprompted. The hook cites L-01 for exactly this class, but its prefix-match mitigation covers renames *within* the prefix, not the prefix itself.
- **Not hypothetical.** The same server surfaces as `mcp__Supabase__*` in a different client — observed 2026-09-07. The prefix is client-derived, so it can change without anyone editing this repo, which is what makes a four-way copy dangerous rather than merely redundant.
- **Sketch.** Assert the four copies agree — hook `@matcher`, settings matcher, settings `ask` prefix, and the check's own constant — resolved from one source and compared, so a prefix change is a red build rather than four silent agreements to stop matching.
- **Probe both directions:** a deliberately divergent copy must FAIL, and the four in agreement must PASS. Add the degenerate guard this file makes routine: a parse yielding **zero** namespace copies must FAIL, never read as four-way agreement.
- **Coverage boundary, stated rather than discovered.** The static half cannot tell you the namespace is *currently correct* — only that the copies agree with each other. Four copies agreeing on a stale prefix passes. The live half needs a periodic re-probe (the 2026-08-19 one is the precedent); it wants a **cadence**, not a date, and this entry is not satisfied by the static check alone.
- **Provenance:** CD agentic-setup audit, 2026-09-07.
- **Covering spec:** NEW

### M-098 — `db-inspector` is documented as SELECT-only and is not

- **Rule:** CLAUDE.md §7 lists `db-inspector` as *"read-only, SELECT"*, and the brief tells a session to treat its runs as the authority on live state.
- **Where it lives:** `.claude/agents/db-inspector.md:4` (grants `mcp__claude_ai_Supabase__execute_sql`) · `.claude/hooks/mcp-ddl-gate.js` · CLAUDE.md §7 agent table.
- **Rung:** hook · **Blast:** data-boundary
- **Satisfied when:** hook:mcp-ddl-gate denies non-read statements when `agent_type` is `db-inspector`
- **Measured 2026-09-07 (CD audit, grant confirmed in-session).** `db-inspector` holds `execute_sql`. `mcp-ddl-gate` treats `execute_sql` as **ask**, with DDL/DML/read-shaped as a *label on the prompt* — never a deny. So the agent can mutate production on an approved prompt, and "read-only" is prose with no mechanism behind it.
- **Why this is worth closing rather than restating in prose, which is the whole point.** The brief instructs a session to treat a `db-inspector` run as authoritative about live state. That makes it easy to slide from *"read-only agent"* to *"its runs cannot have changed anything"* — a claim the reader never consciously adopted and that nothing would contradict. The risk is not a rogue agent; it is a correct-looking audit trail that quietly assumes an isolation property the setup does not provide.
- **Sketch.** `mcp-ddl-gate` reads `agent_type` and denies DDL/DML when it is `db-inspector`. The field is known to arrive — `agent-write-scope` already decides on it per tool call — so this is a discriminator this repo has already proven, applied to a second gate.
- **Probe both directions:** a `SELECT` as `db-inspector` must PASS, an `UPDATE`/`DROP` as `db-inspector` must FAIL, and the same `UPDATE` from the **main session** must still reach the ordinary ask rather than being denied — without that third case, a deny that blocks everyone scores green.
- **Provenance:** CD agentic-setup audit, 2026-09-07.
- **Covering spec:** NEW

### M-099 — the pre-push drift tail evaluates the CHECKED-OUT branch, not the ref being pushed

- **Rule:** `.githooks/pre-push` gates what is *being pushed*. Both of its arms — the scope decision and the schema-drift tail — must reason about the pushed ref, not about whatever happens to be checked out.
- **Where it lives:** `.githooks/pre-push:58-64` (the `$DRIFT` tail) · `scripts/check-drift-if-sql-changed.mjs:143-146` (`@{u}...HEAD`) · `scripts/prepush-scope.mjs:45-56,136-152` (`refsToRange`, the arm that WAS fixed).
- **Rung:** hook · **Blast:** other
- **Satisfied when:** `check-drift-if-sql-changed.mjs` bounds its committed-range window by the pushed ref when the hook supplies one, and a probe asserts a cross-branch push is not reported clean
- **Observed 2026-09-07, in-session, at `c2e41210`.** `git push origin chore/canonicalise-external-links` while checked out on `chore/check-deps-installed` printed **"No migration SQL in commits vs origin/main"**. That was true of the checkout and false of the pushed ref — `010_platform_features.sql` was in the pushed range. The drift arm therefore reported clean about a branch it never looked at.
- **This is a HALF-FIXED class, which is why it is worth an entry rather than a note.** `prepush-scope.mjs` was hardened for exactly this bug: it parses git's pre-push stdin and its own header says so — *"the scope was computed for the CURRENT BRANCH rather than for what was actually being pushed"*. The fix stopped at that file. The drift tail is invoked at the END of the same hook, after the stdin has already been consumed by the pipe at line 22, and `check-drift-if-sql-changed.mjs` reads no stdin at all — it resolves `@{u}` of HEAD. **One hook, two arms, one of them fixed.** Same shape as **M-072** (a consolidation that did not propagate to its neighbours), now on the hook the consolidation was written for.
- **Why the existing probes cannot see it.** `check-git-hooks.mjs` drives the tail through `PLEKS_DRIFT_CMD`, which substitutes the command and therefore never exercises the range computation. The script's own `--selftest` asserts *"with an upstream, the window includes the committed range"* — true, and silent on **whose** committed range. Neither probe is wrong; neither is about this property.
- **Sketch.** `pre-push` reads its stdin once into a variable and passes the ranges to BOTH arms (`prepush-scope.mjs` already accepts them on stdin; the drift script gains the same input, falling back to `@{u}` when run by hand). Escalate on absence exactly as `refsToRange` already does — a new branch or an unbounded range means RUN, never SKIP.
- **Probe both directions:** a cross-branch push of a migration-bearing ref must report the migration (not "no migration SQL"), and a plain same-branch push must still hit the throttle stamp rather than being escalated into a live drift run on every push. The second is the one that decides whether the fix survives — a drift arm that runs unconditionally reaches the network on every push and gets deleted.
- **Provenance:** observed while pushing the #276/#278 batch, 2026-09-07. Not caused by that work; surfaced by it.
- **Covering spec:** NEW

### M-100 — the Trivy strictness gate keys on the manifest PATH, so a `scripts` edit inherits main's strictness

- **Rule:** the CVE gate fails the build on `main` and on any PR that could introduce a dependency, and stays advisory elsewhere — so an unfixable upstream disclosure cannot block unrelated work. The rationale is written at `.github/workflows/ci.yml:4-6`.
- **Where it lives:** `.github/workflows/ci.yml:215-220` (`grep -qE '^(package\.json|package-lock\.json)$'` → `code=1`).
- **Rung:** ci · **Blast:** other
- **Satisfied when:** the gate goes strict on a change that can actually alter the dependency graph, and stays advisory on a manifest edit that cannot
- **Observed 2026-09-07.** `origin/main`, #276 and #278 all carried lockfile `d3e63a95` — byte-identical. #276 passed (advisory: no manifest touched) and #278 **failed strict, minutes later**, on six HIGH findings that were published between the two runs. #278's only `package.json` change was to `scripts` — adding `check-deps-installed.mjs` to the check chain. A `scripts` edit cannot introduce a CVE; the gate matched the file's *path*, not the part of it that changed.
- **Strict is the safe direction to be wrong in, which is why this is an entry and not an incident.** But the cost is exactly what the `else` branch exists to prevent: any `scripts`/`engines`/`version` edit now inherits main's strictness and can be blocked by an unrelated upstream disclosure landing between two runs — while the lockfile it is being judged on is unchanged from the `main` that is already green.
- **Sketch.** Narrow the strict arm to a change that can move the dependency graph: `package-lock.json` changing at all, OR a `package.json` diff touching the `dependencies` / `devDependencies` / `optionalDependencies` / `peerDependencies` / `overrides` / `resolutions` keys. `git diff` plus a `jq` comparison of those subtrees between `$BASE_SHA` and `$HEAD_SHA` decides it — no parsing of the diff text.
- **Probe both directions, and the second is the load-bearing one:** a `scripts`-only edit must stay ADVISORY, and an `overrides` edit with an unchanged lockfile must still go STRICT. Without the second, "narrower" quietly becomes "off for package.json", which is a worse gate than the over-broad one it replaces.
- **Not to be confused with a suppression.** `.trivyignore` is for an architectural exception we intend to keep, with a rationale and a review date. Narrowing *when the gate is strict* is a different act from deleting a finding, and this entry is only the former.
- **Provenance:** diagnosed while clearing the 6 HIGH findings (PR #280), 2026-09-07. Reported in that PR body as an observation; filed here so it does not live only in a merged description.
- **Covering spec:** NEW

### M-101 — `external_links` is written in three places and nothing asserts they agree

- **Rule:** an external URL must be identical in the constant the pages render, the seed a fresh replay applies, and the row the link-check cron reads.
- **Where it lives:** `lib/external-links.ts:28-44` (`EXTERNAL_LINKS`) · `supabase/migrations/010_platform_features.sql` §20 (the `ON CONFLICT (key) DO NOTHING` seed) · §53 (the guarded UPDATE that moves live rows) · `app/api/cron/check-links` (reads the TABLE, never the constant).
- **Rung:** check · **Blast:** other
- **Satisfied when:** a check parses the constant and the §20 seed and fails when a key's URL differs between them
- **The hazard is already written down and that is the problem.** `lib/external-links.ts:8-13` carries a ⚠ block naming all three copies and the failure mode in both directions — *"a URL fixed only here still shows green while the pages link somewhere else, and a URL fixed only in the DB leaves the pages pointing at the dead one."* That is a well-written comment with **no mechanism behind it**, in a file whose whole reason for existing is that the copies drift. Prose at the site is the right rung for the ORDER rule below it (a sequencing judgement); it is the wrong rung for an equality that a parser can decide.
- **Two of the three copies are statically comparable; the third is not, and the split matters.** The constant and the §20 seed are both in the tree — a parse-and-diff is exact. The **live row is not in the tree** and deliberately diverges: §53's UPDATE is guarded so it no-ops if an admin has already edited the row via `/admin/external-links`, which is a feature. So the check covers code-vs-seed only, and the DB copy stays a runtime concern. Recording that boundary is the point — a check claiming to cover "all three" would be asserting something it cannot observe, and would read as covering the case it does not.
- **Sketch.** Parse `EXTERNAL_LINKS` from the constant (it is a flat `as const` object literal) and the §20 `INSERT ... VALUES` rows from the migration, join on `key`, and fail on any key present in one and not the other, or present in both with different URLs. Same shape as the `SEAM_VARS` parity assertion built for M-096 — read both sides from their real sources, restate neither.
- **Probe both directions:** a planted mismatch (constant moved, seed not) must FAIL, and the tree as it stands after the §53 sweep must PASS. Add a third: a key added to the constant with no seed row must FAIL, because that is the shape the 2026-09-07 sweep would have taken had a link been *added* rather than corrected.
- **Provenance:** the 2026-09-07 canonicalisation sweep (PR #276) had to touch all three copies by hand, guided only by the comment. Nothing would have caught missing one.
- **Covering spec:** NEW

### M-102 — `/_\d$/` strips ONE digit, so a two-digit slot index silently becomes a different document type

- **Rule:** a stored document's type is recovered from its `docKey` by stripping the slot index. `payslips_12` is the twelfth payslip, not the first.
- **Where it lives:** `app/api/applications/[id]/detect-document/route.ts` (the PDF branch's `body.docKey.replace(/_\d$/, "")`) · `lib/applications/docCategories.ts` (`categoryForFilename`, which does this correctly with a longest-key-first scan).
- **Rung:** check · **Blast:** other
- **Satisfied when:** no call site recovers a category from a docKey with a single-digit-anchored regex; the SSOT helper is the only path
- **Observed 2026-09-07 at `3cc8edbd`.** `"payslips_12".replace(/_\d$/, "")` returns `"payslips_1"` — a string that is neither the category nor a real slot. `\d` matches exactly one character, so the strip only works for indices 0–9. The returned value becomes `documentType` in the response, so a two-digit upload is reported as a different document than it is.
- **Not fixed where it was found, deliberately.** It surfaced inside a security PR (BUILD_71 D10, the docKey allowlist). Changing extraction behaviour there would have mixed a data-correctness fix into a boundary fix and made the security diff harder to review — the commit-granularity rule in CLAUDE.md §5, applied to a case where the two concerns happen to touch adjacent lines.
- **The real remedy is not a longer regex.** `categoryForFilename` in `docCategories.ts` already solves exactly this problem, correctly, by scanning the known keys longest-first instead of pattern-matching the suffix. A second, weaker implementation of the same mapping is the finding; `/_\d+$/` would fix the symptom and leave two implementations to drift.
- **Probe both directions:** `payslips_12` must recover `payslips`, and a key with a legitimate underscore in its name (`bank_main`, `proof_of_address`) must NOT be truncated at that underscore — the second is what a naive `split("_")[0]` would break, and it is why the scan is longest-first.
- **Provenance:** found while building the docKey allowlist for PR #268, 2026-09-07. Not caused by it.
- **Covering spec:** NEW

### M-103 — a structural exemption dissolves a baseline entry, and a file-level baseline then silences the whole file forever

- **Rule:** a baseline entry means *read and classified*, never *exempt*, and baselines only shrink (CLAUDE.md §4). An entry whose finding no longer exists is not a shrunk baseline — it is a live suppression with nothing behind it.
- **Where it lives:** `eslint-rules/require-org-scope-on-service-read.mjs` (`SESSION_SCOPED_TABLES`, and `create()`'s file-level `if (BASELINE.has(rel)) return {}`) · its baseline JSON · `lib/supabase/gateway.ts` (the dissolved entry).
- **Rung:** check · **Blast:** data-boundary
- **Satisfied when:** a baseline entry that no longer corresponds to any finding fails the gate as stale, the way an unused eslint-disable directive does
- **Observed 2026-09-07 on PR #269 (walker pass, branch head `5d4c947a`).** That PR adds `SESSION_SCOPED_TABLES`, which structurally exempts a `user_orgs` read bounded by `.eq("user_id", …)`. `lib/supabase/gateway.ts` is baselined, and its only two service reads are exactly that shape — so the entry now suppresses nothing, while continuing to suppress the entire file.
- **The compounding half is the file-level aperture.** `create()` returns `{}` for a baselined path, so the rule does not run on that file at all — not on the baselined sites, not on anything added later. `gateway.ts` is the module that *defines* the org boundary. An unscoped read added there would never be seen, and the gate would stay green.
- **"The baseline did not grow" is the wrong half of the ratchet.** Growth is already forbidden and already checked. This is the first pass that made the baseline able to *shrink* without anyone noticing it should — and a ratchet that only resists one direction drifts in the other.
- **Sketch.** After a run, assert every baselined path still produces at least one finding when the baseline is ignored; report the ones that do not as stale and fail. Mechanically the same as ESLint's own `--report-unused-disable-directives`, applied to this repo's baseline files rather than to inline directives. The rule already computes both halves — it needs to compare them, not to gain a new analysis.
- **Probe both directions:** a genuinely-still-violating baselined file must PASS (not be reported stale), and a baselined file whose violations have been fixed must FAIL until its entry is removed. Without the first, the check reports every file the moment any unrelated exemption lands.
- **Provenance:** adversarial walk of PR #269, 2026-09-07.
- **Covering spec:** NEW

### M-104 — `saveOrgBusinessAccount` edits the management-fee payout account with no role check and no audit row

- **Rule:** changing the bank account an organisation is paid into is a payout-banking mutation. The F1 scar (`eslint:pleks/require-audit-on-sensitive-mutation`) exists because swapping a bank account left no who/when; the sibling path `createOrgBankAccount` carries an owner/property_manager check for the same reason.
- **Where it lives:** `lib/actions/orgBanking.ts` (`saveOrgBusinessAccount`) · `lib/auth/server.ts` (`requireAgentWriteAccess`, and `ACTION_CAPABILITY`) · `eslint-rules/require-audit-on-sensitive-mutation.mjs`.
- **Rung:** eslint · **Blast:** money
- **Satisfied when:** the RBAC arm cannot silently no-op on an unregistered action name, and a `bank_accounts` write on this path either carries a role check or fails the gate
- **Observed 2026-09-07 at `3cc8edbd`.** `saveOrgBusinessAccount` gates with `requireAgentWriteAccess("save_org_business_account")` and nothing else — no role check, no audit write. Its sibling `createOrgBankAccount` has both. Any member of the org (`agent`, `accountant`, `maintenance_manager`) can therefore rewrite the account management fees are received into; RLS `bank_accounts_org_update` would refuse the same write.
- **The typing is what makes it invisible.** `save_org_business_account` is absent from `ACTION_CAPABILITY`, so `reqCap` is `undefined` and the capability arm short-circuits rather than denying. The parameter is typed `AgentWriteAction | string`, so an unregistered action name is not a compile error — the `| string` arm turns a missing registration into a silent pass. **A gate that accepts an unknown action name and allows it is a fail-open with a gate's shape**, which is why this is filed at the mechanism rather than as a one-line fix.
- **Pre-existing, and deliberately not closed inside PR #268.** #268 fixes a storage-path boundary; adding a role check here would change who can perform an existing action, which is a product decision with its own blast radius and belongs in its own change. The header at the site was corrected in #268 because it *claimed* the check existed — a false header is worse than none — but the behaviour was left alone.
- **Sketch.** Two independent halves, and the first is the general one: make an action name absent from `ACTION_CAPABILITY` a hard failure inside `requireAgentWriteAccess` (or drop the `| string` arm so the compiler rejects it), so no future call can gate on a name nothing knows about. Then extend `require-audit-on-sensitive-mutation`'s table set to cover this write, which its T1 list already reaches for `bank_accounts`.
- **Probe both directions:** an unregistered action name must be REJECTED (today it passes), and every currently-registered action must still pass unchanged — the second is what decides whether the first can ship without breaking every gated write in the repo.
- **Provenance:** adversarial walk of PR #268, 2026-09-07; the header half corrected in that PR, the behaviour half filed here.
- **Covering spec:** NEW

### M-105 — the lease documents tab links to a route that does not exist

- **Rule:** a rendered link to an internal API route resolves. A document list that cannot fetch its documents is a broken contract, not a styling issue.
- **Where it lives:** `app/(dashboard)/leases/[leaseId]/DocumentsTab.tsx` (four links to `/api/documents/lease?path=…`) · `app/api/documents/` (holds only `[jobId]/print/route.ts`).
- **Rung:** check · **Blast:** other
- **Satisfied when:** a static check resolves every internal API path referenced from app code against the route manifest and fails on a miss
- **Observed 2026-09-07 (walker pass on PR #269, branch head `5d4c947a`).** `/api/documents/lease` has no route file, no catch-all that would match it, and no rewrite; `git log --diff-filter=D` shows it was never deleted, so it appears never to have existed. Signed in as the owning org, opening a lease's communications tab and clicking any listed document returns a 404.
- **Why it is worth a mechanism and not just a fix.** `architecture-audit.mjs` already verifies the link graph in the *other* direction — `checkCrossOriginLinks` forbids a `<Link>` to a path a redirect would send to another subdomain, and `checkRouteManifest` checks manifest/origin consistency. Neither asserts that a referenced API path **exists**. The existing machinery reads the same two inputs this check needs; the gap is an assertion, not an analysis.
- **This is the counterpart half of what PR #269 hardened.** That PR bound the document LIST to the session org. The FETCH those listings point at is a route that isn't there — so the surface was made correct on the half that works and left broken on the half that doesn't, which is exactly the split-aperture shape the 2026-08-19 scar records.
- **Probe both directions:** a link to a nonexistent API path must FAIL, and every currently-rendered link (including dynamic segments and query strings) must PASS — the second is the load-bearing one, because a checker that cannot resolve `[jobId]`-style segments reports the whole app and gets deleted.
- **Provenance:** adversarial walk of PR #269, 2026-09-07. Pre-existing; not introduced by that PR.
- **Covering spec:** NEW

### M-106 — nothing forces a build to check that the spec it is building from was verified

- **Rule:** a spec's present-tense claims about the tree are observations, and an implementer briefed from a spec that is unverified, or whose anchor is stale, returns `decision-needed` rather than building (CLAUDE.md §8's anchor rule, applied at the receiving end).
- **Where it lives:** `scripts/check-spec-verification.mjs` (the instrument) · `.claude/commands/verify-spec.md` (the brief that produces the block) · `.claude/commands/build.md` step 2 · `.claude/agents/implementer.md` project surface (the two places that are supposed to call it).
- **Rung:** hook · **Blast:** other
- **Satisfied when:** a build cannot proceed from a spec whose verification block is absent, whose anchor is not an ancestor of HEAD, or whose refuted rows are unruled — without a session having chosen to check
- **Shipped 2026-09-07 at `1b684408`, and shipped INCOMPLETE on purpose.** The deterministic half exists and is probed both directions (`--selftest`, 14 cases): given a spec path it decides FRESH / STALE / ABSENT / UNRULED from the stamped SHA's ancestry, and the ancestry test is the load-bearing one — a rebased-away branch leaves a SHA that `git cat-file` resolves and `merge-base --is-ancestor` rejects, which an existence check would pass.
- **The half that does not exist is the calling discipline.** Both callers are rung-4 prose: `/build` step 2 and the implementer's project surface tell a session to run the script, and nothing notices when it doesn't. A session that skips the check leaves no trace, and a spec that was never verified is textually identical to one that was — which is the same shape as the rule it is meant to enforce.
- **Why the obvious mechanisms do not reach it.** The specs live under `brief/`, a OneDrive symlink outside version control, so there is nothing for CI to run and no tree-wide invocation — the script takes one path. A `PreToolUse` hook is the closest rung, but it would have to know *which spec a session was briefed from*, and that is in the prompt, not in the tool call. The tractable slice is narrower: gate the `implementer` **agent spawn** on its prompt naming a spec path whose block does not check out, since `agent-write-scope.js` already inspects `agent_type` on every subagent tool call and the brief is available at spawn.
- **The honest limit of the whole verifier, worth carrying with the entry: it catches facts, not judgement.** Every one of the four spec failures behind it was an unverified read, which is exactly what this closes. The rulings that sat beside them — *bind on `application_id` because `org_id` is nullable*; *move the display reader out rather than pulling auth in* — were arguments made against plausible alternatives, and no verifier reaches those. This closes the failure class the evidence shows. It does not close the other one and must not be sold as doing so.
- **A second gap, found by the first real run and not by design: squash-merge manufactures false staleness.** Verifying from a feature branch stamps a SHA that stops being an ancestor of `main` the instant the branch lands, so a correct verification reports STALE with nothing having changed. A mechanism that cries wolf on its own merge trains people to ignore it, which is worse than not having it. Mitigated in prose for now (`/verify-spec` §4: verify on `main`, or substitute the merge-base **and prove with `git diff --name-only` that no read file differs**). The mechanisable slice: have the instrument itself attempt the substitution — if the stamped SHA is unreachable but some ancestor of HEAD has an identical tree for every path named in the `File read` column, report FRESH against that ancestor rather than STALE. It has the rows; it does not read them for paths yet.
- **Probe both directions:** a build briefed from a stale-anchored spec must STOP, and a build briefed from a freshly-verified one must proceed untouched — the second is load-bearing, because a check that interrupts every build is removed within a week, and most specs have no block at all today.
- **Provenance:** built 2026-09-07 to Stéan's specification, in the same session that merged PRs #268/#269. The incompleteness is stated in the spec that commissioned it: *"that's the only part that fires without my cooperation, and my record is why that matters."*
- **Covering spec:** NEW

### M-107 — `contractor_view` still reads the deprecated inline contact block, so 25A's people model is half-applied

- **Rule:** the entity views (`contractor_view`, `landlord_view`, `tenant_view`) derive the displayed person from the primary CHILD contact (`organisation_contact_id = contacts.id AND is_primary_contact`), not from the inline `contact_first_name` / `contact_last_name` columns ADDENDUM_25A deprecated.
- **Where it lives:** `supabase/migrations/005_operations.sql:1590-1618` (the surviving `contractor_view` definition) · `lib/contacts/contactScope.ts` (the shared sub-person predicate the app side already uses).
- **Rung:** check · **Blast:** other
- **Satisfied when:** no view definition selects a deprecated inline `contact_*` column once a primary-child model exists for that entity, or the deprecated columns are dropped so the view cannot compile against them.
- **This is a CODE defect the spec verifier happened to surface, not spec drift** — 25A row 14 asserted the views were updated and they were not. Ruled by Stéan 2026-09-07 into the third disposition (`gap-filed`): the claim stays, the code is wrong. Filing it here rather than correcting the spec is the whole point of that disposition existing.
- **Why no mechanism catches it today.** `check-migration-integrity` validates policy pairing and table shape, not view column selection, and nothing cross-references a view's SELECT list against a deprecation recorded only in an addendum. The app side migrated (`referenceCache`, the supplier `/people` route, `insertCompanyPeople` all use `organisation_contact_id`); the SQL side did not, and the two cannot disagree loudly because the view still compiles.
- **The tractable slice:** the deprecated columns are named and finite. A check that greps view definitions in `supabase/migrations/**` for `contact_first_name` / `contact_last_name` and fails on any hit would decide it, with the surviving sites baselined and classified — but confirm first whether `landlord_view` and `tenant_view` share the defect, which this pass did NOT establish (it looked for a re-defined `landlord_view` matching 25A's description and found none, which is not the same as confirming the old shape survives).
- **Probe both directions:** a view selecting a deprecated inline column must fail; a view selecting the primary-child join must pass untouched.
- **Provenance:** found 2026-09-07 by the seven-spec verification pass, anchored at `1b684408`.
- **Covering spec:** ADDENDUM_25A_COMPANY_CONTACTS §7

### M-108 — a tolerant helper whose only consumer defeats the tolerance

- **Rule:** when a helper deliberately accepts several spellings of one signal so that no caller can bypass it by holding the wrong one, its call sites must actually be capable of reaching each branch. A defence with one consumer is only as good as that consumer.
- **Where it lives (the instance):** `lib/applications/juristicParties.ts:44-53` — `requiresSuretyParty` accepts BOTH `entity_type='organisation'` and `applicant_type='company'`, and its own docstring states this "means this gate cannot be silently bypassed by a caller that happens to hold the other one". Its sole consumer, `app/api/billing/screening/route.ts:71`, passes `application.entity_type ?? application.applicant_type` — and `entity_type` carries `DEFAULT 'individual'` with nothing writing it, so the right-hand operand is never evaluated for any row current code can produce. The tolerance is real and unreachable.
- **Rung:** check · **Blast:** money
- **Satisfied when:** a helper documenting multi-spelling tolerance cannot have every call site collapse to one spelling without something saying so.
- **What makes it a class rather than a bug.** The helper is correct, the call site is syntactically ordinary, and the TEST SUITE ASSERTS BOTH HALVES WITHOUT CONNECTING THEM: `__tests__/juristicParties.test.ts:40` asserts `requiresSuretyParty("individual","pty_ltd")` is false ("entity_type wins"), and `:47` asserts `requiresSuretyParty("company", t)` is true. Both pass. Neither asserts what the call site actually passes, so the suite proves the defence works and proves the precedence that defeats it, in adjacent lines. Nothing is red.
- **Why no existing mechanism reaches it.** ESLint sees a `??` between two property reads and has no model of which operands are nullable in the database; the audit's censuses check that a gate is PRESENT, never that it can FIRE. This is the "divergent expressions of one rule" family from `crawler-doctrine` §B, with a twist — the two expressions are not two implementations but a helper and the single call that renders half of it dead.
- **The tractable slice:** narrow, and worth taking as a lint rule rather than a general analysis. Flag `a.X ?? a.Y` where `X` is a column the schema gives a non-null DEFAULT and no writer — the fallback is unreachable by construction. That needs a schema-derived nullable/default map, which `check-migration-integrity` already parses migrations to build.
- **Probe both directions:** a `??` whose left operand is a defaulted, never-written column must fail; a `??` over a genuinely nullable column must pass.
- **Confirmed against the LIVE database 2026-09-08** (the entry above was derived from migration text alone): `information_schema.columns` for `applications` returns `entity_type` — `is_nullable=YES`, `column_default='individual'::text`; `applicant_type` and `company_info` — nullable, no default. So the left operand of the `??` is non-null on every row an insert can produce, and the fallback is unreachable in the deployed schema, not only in the migration source. **`select count(*) from applications` returned 0 on the same date** — the defect has never been exercised, and no row exists to break when it is fixed.
- **Provenance:** found 2026-09-07 walking the `entity_type` gap. Named as a class at Stéan's direction — *"a defence defeated at its only consumer, which is a class worth naming beyond this instance."*
- **Covering spec:** NEW

### M-109 — 14B's orchestration layer is built and unwired; the deferral is now recorded, the wiring is not done

- **Rule:** `declareDirectors` / `replaceDirector` / the director-invite path in `lib/applications/commercial.ts` are the commercial orchestration layer. They are written, correct as far as they go, and have **zero callers**.
- **Where it lives:** `lib/applications/commercial.ts:44-48,272-274` (the `@knipignore … gate-before-wiring … unwired today` comments) · `docs/DEAD-CODE-QUEUE.md:143-144,288-291` (zero importers, two independent sweeps) · `ADDENDUM_14B_COMMERCIAL_APPLICATIONS.md` header, corrected 2026-09-07.
- **Rung:** n/a — this is a DECISION to record, not a control to build · **Blast:** money
- **Satisfied when:** the repo records whether the wiring was deferred deliberately (and on what) or dropped, and — if deferred — what unblocks it. **ANSWERED 2026-09-08 — see the ruling below. This entry stays open only for the wiring itself.**
- **The ruling (Stéan, 2026-09-08): DEFERRED, deliberately, on the individual applicant path — and that path has shipped.** *"we did not yet get to it, we focussed on individual path first (because that was required for commercial - directors - anyway) and then commercial was the logical next step."* The dependency is not incidental: **a director IS an individual applicant**, so the commercial flow consumes the individual machinery rather than paralleling it, and building commercial first would have meant building that machinery twice. So the correct reading of the `@knipignore … gate-before-wiring` comments is *written ahead of its prerequisite*, not *abandoned* — which is the opposite of what a dead-code sweep concludes from the same evidence, and precisely why this was filed rather than left to the next reader. Commercial is the sequenced next step, not a revival.
- **The reason this is filed rather than just fixed.** The `@knipignore … unwired today` comment proves somebody knew at the time. It does not say whether wiring was **deferred** behind something (14G's entry flow, the `entity_type` writer, a pricing ruling) or simply **dropped**. Those have opposite remedies and identical evidence, and the difference is currently in nobody's head. Filing forces the answer instead of letting the next reader inherit the ambiguity. Ruled by Stéan 2026-09-07: *"built-but-not-wired is either a deferred decision or a forgotten one and nobody has recorded which."*
- **What it blocks — NARROWED 2026-09-08 by the ruling above.** ADDENDUM_14G and ADDENDUM_14S both carry `dependency-unmet:14B` rows against this. The bar was *"a builder must not start either until this is answered"*; it is now answered, so what remains blocking them is **14B's wiring, not the open decision**. Do not read the `dependency-unmet` rows as still awaiting a ruling.
- **Note the interaction with M-108, and DO NOT FIX HALF OF IT — CORRECTED 2026-09-08, anchored at `116e49b4`.** This bullet, and the CLAUDE.md §6 scar drawn from it, both said `declareDirectors` was the sole writer of BOTH `applications.entity_type`'s organisation value and `application_co_applicants.is_surety_director`. **It writes only the latter** (`lib/applications/commercial.ts:105`, `:355`). Its single `from("applications")` is a SELECT at `:156-159` inside `sendDirectorInvite`; it never writes that table. `applications.entity_type` has **zero writers anywhere** under `app/` or `lib/` — every other occurrence is a read, or a different table (`contacts`, `communication_log`, `hoa`). The failure modes are exactly as described; only their authorship was wrong.
- **What the correction changes, and the direction it moves in.** Wiring `declareDirectors` writes only the harmless-while-open half, so the "both together, or `is_surety_director` first" ordering is now satisfied **structurally** — the dangerous half needs code that exists in no file, and cannot land as a side effect of building the director flow. That is the good news. The bad news is the other half: reaching the unsafe state no longer requires writing a director flow at all, because M-108's unreachable `??` is a one-line tidy in a file that mentions no director. **The dangerous edit shrank and moved away from the work that would make someone careful**, which is a worse hazard shape than the one originally recorded even though the recorded ordering was more conservative than needed. Do not read this correction as a relaxation.

- **The wiring's real blocker is UPSTREAM of the function, and it is not a call site.** `commercial.ts` is `"use server"`, so `declareDirectors` is directly callable — the hosting mechanism was never missing. What is missing is its ARGUMENT: `DirectorDeclaration[]` has no source. `CompanyInfo` (`app/(applicant)/apply/[slug]/applyCompany.tsx:22-52`) carries identity, address, a cash-flow ledger, documents and sign-off, plus `fillerDesignation` — the FILLER's own relationship to the company — and no director list. The juristic phase is six panes (`applyNav.tsx:76-83`: `co-info`, `co-address`, `co-finances`, `co-docs`, `co-docs-opt`, `co-review`) and none asks who the directors are or which stand surety. Everything DOWNSTREAM exists — the roster hub filters `is_surety_director`, the `director-portal/[token]` flow has consent and payment, the PayFast director webhook reconciles. The chain is built from the invite onward and has no beginning. The pane goes before `co-review` with `PTY_COMPANY_PANES` 6 → 7 (the orchestrator splits company from personal panes at `step - PTY_COMPANY_PANES`, so that constant is the single hinge), and the call belongs at the `co-review` sign-off. See M-115 and M-116 for what must be fixed before it is written.
- **The spec also asserts a CIPC dedup key as though implemented** (row 18, gap-filed): there is no unique index on `(org_id, registration_number)` and no app-level dedup. Anything built on 14B inherits a false uniqueness premise — the wiring work must not assume one company contact per registration number.
- **Provenance:** ADDENDUM_14B SPEC-VERIFIED row 35, anchored at `1b684408`.
- **Covering spec:** ADDENDUM_14B_COMMERCIAL_APPLICATIONS

### M-110 — a cross-spec dependency cites the dependency's PROSE STATUS, not its verification

- **Rule:** when spec A declares a dependency on spec B, it must cite B's verification anchor, not B's prose status line. A spec whose dependency is UNRULED, or whose depended-on row is itself refuted, is blocked.
- **Where it lives:** `scripts/check-spec-verification.mjs` (already parses the blocks this needs) · every `Dependencies:` / `§10 cross-reference` line in `brief/build/_ADDENDUM/*.md`.
- **Rung:** check · **Blast:** other
- **Satisfied when:** a spec cannot report FRESH while a spec it declares a dependency on is ABSENT, STALE or UNRULED, or while the specific row it relies on is refuted.
- **The measurement that justifies it: THREE SPECS WERE WRONG FROM ONE ROOT.** 14B's header claimed "Shipped — orchestration layer complete". 14G's header said "gated on 14B having shipped (it has)"; 14G §10 repeated it; 14S listed 14B among its shipped dependencies. All three inherited a false status because each cited 14B's PROSE rather than checking it — and 14S's row is the sharpest illustration: it verified that 14B *said* shipped, which was true, rather than that 14B *was*, which was not. **A verification that confirms the citation exists, rather than that the cited claim holds, is the fabricated-citation class operating between specs** — the same failure CLAUDE.md already names for code citations (`JOINT_APPLICATION_FEE_CENTS` citing a rate-card section that never mentioned joint applications), one level up.
- **Why it is cheap NOW and was not before.** This needed the blocks to exist. They do: seven commercial specs carry anchored, machine-checkable `SPEC-VERIFIED` blocks as of 2026-09-07, and the instrument already parses the anchor, the rows and the rulings. This is **one more relation over data it already reads** — resolve a named dependency to its file, run the same evaluation, and refuse to report FRESH above a non-FRESH dependency. The only new input is a machine-readable dependency declaration, which the headers already carry in prose.
- **What this entry is NOT for — restated 2026-09-07 so nobody builds a second detector for something already detected.** Its job is not to catch a class the verifier misses. The verifier already catches intra-spec citation defects: all five of 14B's (`inviteDirector`, `runScreeningLine`, `contractors.access_token`, the `juristic_type` set, the Shipped header) surfaced as `refuted` or `not-found` in its own block, which is this mechanism's value demonstrated on a real spec rather than argued. **M-110's job is to stop an UNVERIFIED spec being cited by another spec.** 14G and 14S depended on 14B's prose header precisely because 14B had no block at the time. Once every spec carries one, this is simply the rule that says *cite the anchor, not the claim*.
- **Why prose cannot hold it.** Every one of the three specs was written by someone who believed the status line. A rule saying "check your dependencies" is exactly the rung-4 instruction that produced this. Ruled by Stéan 2026-09-07: *"without it, the next 14G repeats exactly this."*
- **Probe both directions:** a spec whose dependency is UNRULED must not report FRESH; a spec whose dependencies are all FRESH must report FRESH untouched — the second is load-bearing, since a dependency check that blocks everything is removed in a week.
- **Provenance:** found 2026-09-07 by the seven-spec verification pass; the cascade was visible only because all three specs were verified in the same run.
- **Covering spec:** NEW

### M-111 — a screening line that throws is stranded in `running` forever, paid and consented

- **Rule:** a cron that claims a row optimistically must be able to RELEASE the claim when its work fails, or the claim is a permanent lock held by a process that is no longer running.
- **Where it lives:** `app/api/cron/screening-line-runner/route.ts:53-57` (the catch), `:92,101` (the claim), `:131,136` (the only status writes) · `app/api/cron/screening-portal-reminders/route.ts:39` (the filter that also cannot see it).
- **Rung:** check · **Blast:** money
- **Satisfied when:** a line whose run throws returns to a re-claimable status, or moves to a terminal status something else sweeps — and either way stops being reported to the applicant as in-progress.
- **The failure, concretely.** The runner claims a line with `UPDATE … WHERE searchworx_check_status IN ('pending','not_run') RETURNING id`, setting `'running'`. On success it writes `'complete'`. On failure it writes NOTHING to the database: it increments a local counter, puts `failed: <msg>` into the HTTP response body, and calls `Sentry.captureException`. The row stays `'running'` — which the claim predicate can never match again. The line is now invisible to the runner (not `pending`/`not_run`), invisible to the reminder cron (its view state is `ready_to_run`, not one of the three states that cron filters on), and rendered to the multi-party portal as still in progress. **The applicant has paid and consented, and nothing will ever run their check or tell anyone.** One transient SearchWorx timeout is sufficient.
- **The route's own header is wrong about this** (`:9` — "marks 'complete' or 'failed'"), which is why it reads as handled. `'failed'` appears in the file five times and never as a database write. A header asserting behaviour the body lacks is the file-header class CLAUDE.md §5 already names as unenforceable.
- **Why no mechanism catches it.** Nothing models "a status a claim predicate cannot re-match", and Sentry receiving the exception makes it look observed — but Sentry sees the throw, not the stranded row, and no alert fires on a line sitting in `running` past a threshold. This is the fail-open shape `/walk` step 3 hunts for: the system fails toward "the line looks fine".
- **The fix is BOTH halves, not either — corrected 2026-09-07 (Stéan).** The first framing offered them as alternatives; that is wrong. The catch-block write handles the exception path only. **The sweep is the one that must exist**, because it is the only mechanism that does not assume the code got a chance to run: a process killed mid-run — OOM, deploy, timeout — never reaches any catch, by construction. The catch is better diagnostics; the sweep is the actual recovery.
- **The sweep's threshold must be stated relative to the longest legitimate SearchWorx call, not picked round.** A threshold below the real tail reclaims rows mid-flight and produces a second defect wearing the first one's fix — a line run twice, billed once. Derive it from observed p99 call duration with a stated multiple, and write the derivation next to the constant.
- **Probe both directions:** a line whose run throws must become re-claimable or terminal; a line that succeeds must be untouched by the sweep.
- **Provenance:** found 2026-09-07 while checking whether ADDENDUM_14B §6.2's retry/backoff spec was aspirational. The spec row (14B row 28) recorded "no retry, failures logged to Sentry, line left as-is" — accurate, but it did not notice that *left as-is* means *left unreclaimable*.
- **⚠ ONE CLAIM ABOVE IS WRONG, and the truth is worse — corrected 2026-09-08 on grounding.** The
  bullet says a stranded line is *"invisible to the reminder cron (its view state is `ready_to_run`)"*.
  It is not `ready_to_run`: `running` matched no CASE arm and fell to the `ELSE`, which is
  `pending_both` — **the first of the three states that cron does filter on.** So a co-applicant line
  stranded mid-run was not ignored by the reminder cron; it was *adopted* by it, chased with "your
  portion is still outstanding" emails to someone who had paid and consented, and at T+14 declined
  `expired_no_completion` with a refund flagged. A record asserting the applicant failed to do a
  thing they did. Invisibility would have been the mild version. **Company lines are the invisible
  half** — as at `5f566d7f` the cron filters `subject_type = 'co_applicant'`
  (`screening-portal-reminders/route.ts:38`), so nothing reached them at all.
- **⚠ THE INSTANCE IS CLOSED; THE ENTRY STAYS OPEN.** Shipped at `3d00c508` (2026-09-08): `sweepStrandedClaims`
  (`lib/screening/sweepStrandedClaims.ts`) with the threshold derivation at the constant, the
  catch-block release (`markLineFailed`), explicit `running`/`failed` arms in the view so the state
  has an owner, and a `Check failed — contact the agency` chip so the surface stops asserting
  progress. Probes in `test/db/screening-claim-recovery.dbtest.ts`, **all seen red before green** —
  the view arms reproduce as `expected 'pending_both' to be 'running'`, and removing the sweep's age
  predicate turns both "left alone" negatives red, so they are load-bearing rather than vacuous.
  **No MECHANISM was built:** nothing yet fails when the NEXT cron claims a row it cannot release.
  The generalisation — relate a claim predicate to the statuses its own writers can produce — is
  unbuilt, so this entry stays open. **The threshold is 30 minutes on a structural bound, not an
  observed p99** (`applications` held 0 rows), and replacing it once production has a real tail is
  part of what closing this entry means.
- **Covering spec:** ADDENDUM_14B_COMMERCIAL_APPLICATIONS §6.2 · **See also:** M-120 (found while
  building this — the company claim could never have succeeded), M-112 (`running` and `failed` were
  two more unowned states in the same view; both now have owners, which does not close M-112 —
  `expired_no_consent` still has none).

### M-112 — a derived view is used as a work queue, and two of its six states have no owner

- **Rule:** when a work queue's state is COMPUTED rather than stored, a row changes state with nothing acting on it. Every reachable state must have an owner, or the complement of the consumers' filters is a silent drain.
- **Where it lives:** `supabase/migrations/005_operations.sql:2050-2059` (the CASE) and `:2096` (the declined exclusion) · `app/api/cron/screening-portal-reminders/route.ts:39` (filters three states) · `app/api/cron/screening-line-runner/route.ts:38` (filters `ready_to_run`) · `app/(applicant)/apply/[slug]/co-parties/page.tsx:87` (display).
- **Rung:** check · **Blast:** money
- **Satisfied when:** every state `v_application_screening_lines` can emit is either terminal by design or named in some consumer's filter, and that correspondence is asserted rather than assumed.
- **The state space, and who owns it.** Six values. `complete` is legitimately terminal. `pending_both`, `paid_pending_consent` and `consented_pending_payment` are owned by the reminder cron. **`ready_to_run` and `expired_no_consent` have no owner**, and both are reachable.
- **`expired_no_consent` strands on the DEFAULT path, not an edge case.** `application_screening_payments.expires_at` defaults to `now() + interval '14 days'` (`005:1858`). The reminder cron expires a line at `daysElapsed >= 14` computed from `application_co_applicants.created_at` (`screening-portal-reminders/route.ts:35,37`). Same deadline, two anchors, both rows created in the same flow. The moment `expires_at` passes, the view flips the line from `pending_both` to `expired_no_consent` — which is not in the cron's filter. The cron runs daily, so the window in which `daysElapsed >= 14` is true AND the line is still `pending_both` is approximately zero. **Every unpaid, unconsented director line therefore expires out of reach: no `declined_at`, no `decline_reason`, no expiry email, no roster recompute.** `expireDirectorLine` is effectively dead for that population, which is the population it was written for.
- **What is NOT affected, and why that hid it.** A PAID line never reaches `expired_no_consent`, because the paid branches precede the expiry branch in the CASE — so `paid_pending_consent` stays selectable indefinitely and the refund path (`expired_state='paid_but_no_consent'`, `refund_amount_cents`) works correctly. The money path is sound; the no-money path is the stranded one, which is why nothing complained.
- **The common root with M-111.** Both are the same defect class: a computed state changed underneath a consumer that filters on a subset, with no one owning the complement. M-111's `ready_to_run` strands after a throw; this one strands on a clock. Fixing either by adding a state to a filter fixes one instance and leaves the class.
- **Why no mechanism catches it.** Nothing relates a view's CASE arms to the `.in("state", [...])` filters of its consumers; they are in different languages in different files. The audit's censuses check that a route is gated, never that a queue is drained.
- **The tractable slice:** extract the six values from the view definition and the filter arrays from the consumers, and fail when a value appears in neither a filter nor a declared-terminal list. Both are literal arrays in the source; this is a parse, not an analysis.
- **Probe both directions:** adding a seventh state to the view with no consumer must fail; the current set with both holes closed must pass.
- **Provenance:** found 2026-09-07 by Stéan's question — *"does the reminder cron's filter excluding ready_to_run strand any other state? a filter that misses one reachable state has usually missed more than one"* — asked while M-111 was open. It had missed two.
- **Covering spec:** ADDENDUM_14B_COMMERCIAL_APPLICATIONS §6.1

### M-113 — commercial leases receive residential deposit treatment, because the discriminator shipped and the behaviour did not

- **Rule:** a schema discriminator with no consumer is worse than no discriminator. It records the distinction, so every reader assumes the distinction is being made — while a single code path applies one regime to both.
- **Where it lives:** `lib/deposits/` — nine modules (`balance.ts`, `calculateReturn.ts`, `depositBalance.ts`, `disburse.ts`, `interestConfig.ts`, `justification.ts`, `rateUtils.ts`, `generateSchedulePDF.ts`) and `grep lease_type|leaseType|commercial` across all of them returns **nothing**. `calculateDepositReturn(leaseId)` (`calculateReturn.ts:16`) takes only a lease id; `resolveDepositInterestConfig` (`interestConfig.ts:49`) resolves by scope candidate, never by lease type. The discriminator itself is `leases.lease_type` CHECK residential/commercial (`004_leases_financials.sql:38-39`).
- **Rung:** check · **Blast:** money
- **Satisfied when:** the deposit path either branches on `leases.lease_type`, or something asserts that it deliberately does not and states the legal basis for treating both regimes identically.
- **What is wrong TODAY, not what is missing.** Every commercial lease on the platform is having its deposit handled under residential rules — interest accrual, return timeline, and the justification narrative generated for the tenant. The Rental Housing Act deposit regime is a residential statute; applying it to a commercial letting is not a degraded feature, it is a wrong answer produced confidently, in a document handed to a party. This repo built a five-rule CPA s5/s6 applicability ladder (`lib/leases/cpaApplicability.ts`) precisely because residential and commercial legal treatment diverge — and then applied one deposit regime to both.
- **The schema is what proves this is a halted implementation, not a dropped idea.** A dropped idea leaves no trace. This left `leases.lease_type` (`004:38-39`), `org.property_types` (`001_foundation.sql:48`), and `lease.deposit_return_days` / `notice_period_days` (`004:46,78`) — all confirmed shipped by the ADDENDUM_02B verification pass. Someone built the discriminator on purpose and stopped before the behaviour.
- **What ADDENDUM_02B specified and nothing built:** `units.letting_type` (5 values, absent from all twelve migrations); the `split` arm of `deposit_interest_to` (shipped as tenant/landlord only, `004:55-56`); and `lib/deposits/rules.ts` exporting `getDepositRules(leaseType)` alongside `jointInspectionRequired` and `tribunalJurisdiction` — the last of which is the sharpest, because tribunal jurisdiction genuinely differs by regime and the code currently has no concept of it.
- **Why no mechanism catches it.** Nothing relates a CHECK constraint's value set to the branches of the code that reads the column. A discriminator with zero consumers is invisible to every gate here: it is a legal column, legally written, legally never read.
- **The tractable slice:** the general form (every CHECK-constrained discriminator has a consumer that branches on it) is a large analysis. The narrow form is a parse: assert that some module under `lib/deposits/` references `lease_type`, and fail when none does. That is a ratchet against the current state rather than a theory of discriminators.
- **Probe both directions:** a `lib/deposits/` with no `lease_type` reference must fail; one that branches on it must pass.
- **Provenance:** found 2026-09-07 in the ADDENDUM_02B verification pass, and materially sharpened by the `not-found` rule added the same day — the original row recorded "`lib/deposits/rules.ts` does not exist" from a file glob and three symbol greps. The capability re-check found nine modules in that directory, which turns "a file is missing" into "the differentiation is missing while the machinery is fully built". Ruled gap-filed by Stéan on the schema evidence.
- **Covering spec:** ADDENDUM_02B_RESIDENTIAL_COMMERCIAL

### M-114 — the pooling engine's five shipped tests prove it works; the five unwritten ones would prove it does not leak

- **Rule:** a test suite over an aggregation engine must cover isolation, not only correctness. Tests that assert the mechanism produces the right answer cannot detect the mechanism producing that answer from the wrong inputs.
- **Where it lives:** `lib/applications/__tests__/companyRuling.test.ts:89-131` — five of the ten tests ADDENDUM_14P §7 names. Absent: no-cross-bleed, §5.4-per-director-floor, bank_main-collision-regression, 0b-specific determinism, registry-drift. The engine under test is `lib/applications/companyRuling.ts:118-131` (`company-ruling.v0b`, three aggregations over a director set: strongestSingle / combined / suretyGroupPooled).
- **Rung:** test · **Blast:** money
- **Satisfied when:** the five named isolation tests exist and fail when director data is allowed to cross between subjects.
- **The five missing ones are not a random half.** Cross-bleed between directors, per-director affordability floors, and a `bank_main` collision regression are exactly the isolation properties of a pooling engine — the properties that distinguish "pooled correctly" from "pooled things that should not have been pooled". The five that exist assert the engine computes; nothing asserts it computes over the right set.
- **What the failure looks like.** A pooling engine that pools when it should not produces a wrong FitScore **attributed to the wrong person**, on a screening decision that gates a lease application. Not a crash, not a blank — a confident number about someone, derived partly from someone else's bank data. The `bank_main` collision name in the spec's own test list suggests the author had already identified the concrete vehicle.
- **Nobody decided to drop the isolation half.** This is the reason it is gap-filed rather than spec-corrected: a spec-correction would record that ten was the plan and five was the build, which asserts a decision that no artefact shows anyone making. Rows 1-7, 9 and 10 of the 14P pass all confirmed, so the 0b plumbing genuinely is complete — it is only the test claim that overstates, and it overstates in the direction of the properties nobody checked.
- **Why no mechanism catches it.** `check-test-floor.mjs` counts tests and files, so five tests is five tests. Nothing compares a spec's named test list against the suite that claims to implement it, and nothing distinguishes a correctness test from an isolation one.
- **The tractable slice:** the general form needs a spec-to-suite correspondence, which is M-110's family. The narrow form is that each of the five named tests exists by name in that file — a grep, ratcheted.
- **Probe both directions:** a suite missing a named test must fail; the complete ten must pass.
- **Provenance:** found 2026-09-07 in the ADDENDUM_14P verification pass (row 8, refuted). Priority raised by Stéan on the observation that the missing five are the isolation half — *"the tests prove the mechanism, and nothing tests the boundary"*, named as the recurring shape of this month's findings.
- **Covering spec:** ADDENDUM_14P_COMPANY_DIRECTOR_VERIFICATION §7

### M-115 — a client-supplied price that also becomes the amount its own reconciler expects

- **Rule:** a value a caller supplies must never become BOTH the amount charged and the amount a downstream reconciler validates that charge against. A mismatch detector fed from the same field it is checking cannot fire.
- **Where it lives (the instance):** `lib/applications/commercial.ts:33` — `DirectorDeclaration.feeCents`, a caller-supplied money parameter on a `"use server"` module, written to `application_co_applicants.individual_fee_cents` at `:106` (and `:356` in `replaceDirector`). That column is read in exactly two consequential places: `app/(applicant)/apply/[slug]/director-portal/[token]/payment/page.tsx:69`, which sizes the payment the director is actually charged, and `app/api/webhooks/payfast/director/route.ts:96`, which reads the same column as `expectedCents` and compares it to what PayFast reports. Both sides resolve to the one field, so a poisoned value reconciles clean and `flagMismatch` never fires.
- **Rung:** eslint · **Blast:** money
- **Satisfied when:** no money amount reaching a persisted fee column originates from a server-action parameter — the fee is derived server-side from the SSOT, and the parameter does not exist to be passed.
- **Why the existing controls all miss it.** It is not an org-scope defect, so none of the three `require-*-scope` rules apply. Cat-15 asks whether a gate is present, and one is: `verifyApplicantToken` is genuinely called at `commercial.ts:57` and genuinely binds the caller to the application. **The auth is correct and irrelevant** — the legitimate applicant is the one who sets the price. And the fee-literal rules guard against a hardcoded `25000` at a call site, which is the opposite defect: here the problem is that no literal and no constant appear at all, only a parameter.
- **The SSOT it should read instead already exists:** `screeningFeeCents` / `APPLICATION_FEE_CENTS` (`lib/constants.ts:128-137`); per surety director the amount is simply `APPLICATION_FEE_CENTS`, since the juristic total is `APPLICATION_FEE_CENTS * (1 + suretyCount)`. **The remedy is to DELETE the parameter, not to validate it** — a validated client price is still a client price, and the next caller passes the check with a number the check was not designed to reject.
- **Not currently exploitable, and that is a property of the calendar rather than the code.** `declareDirectors` has zero callers and `applications` held 0 rows on 2026-09-08. The defect activates on the first line of the director-declaration pane (M-109). It is filed now precisely because that pane is the next build: the cheapest moment to delete a parameter is before anything passes it.
- **The tractable slice:** flag a parameter typed as cents/amount flowing into a `.insert()`/`.update()` on a known fee column within a `"use server"` module. Narrow, and the fee-column set is small and enumerable.
- **Probe both directions:** a fee column written from a function parameter must fail; one written from an imported constant or a server-derived computation must pass.
- **Provenance:** found 2026-09-08 grounding the M-109 wiring at `116e49b4`. Sibling of the `orgId` hazard in the same function — but that one carries a warning in its own docstring and this one carries nothing, which is the reason it is the more dangerous of the two.
- **⚠ THE INSTANCE IS CLOSED; THE ENTRY STAYS OPEN.** Fixed at `67f2527c` (2026-09-08): `feeCents` is deleted from `DirectorDeclaration` and `ReplacementDirector`, and both write sites take `APPLICATION_FEE_CENTS`. The `orgId` sibling was closed in the same commit, from the same rule — a value the caller supplies must not become the write scope or the price. **No mechanism was built**, so the register entry is still a mechanisation item: nothing stops the next `"use server"` module from taking a cents parameter and writing it to a fee column. Fixing the site one knows about is not the same as acquiring the ability to find the next one, and collapsing the two is how a register turns into a changelog.
- **Covering spec:** ADDENDUM_14B_COMMERCIAL_APPLICATIONS

### M-116 — a re-enterable step whose commit is an unconditional INSERT with nothing unique underneath

- **Rule:** a step a user can legitimately re-enter must commit idempotently, or the table beneath it must make the duplicate impossible. Neither alone is enough when the duplicate is a billable subject.
- **Where it lives (the instance):** `declareDirectors` (`lib/applications/commercial.ts:70-145`) loops over the declared directors and INSERTs each into `application_directors`, then INSERTs a surety's `application_co_applicants` row and sends an invite — unconditionally, with no upsert and no existence check. `supabase/migrations/005_operations.sql:1814-1833` creates `application_directors` with two plain indexes (`idx_app_directors_application`, `idx_app_directors_surety`) and **no UNIQUE constraint**; there is no unique index on `application_co_applicants` either. The apply flow explicitly supports re-entering the company sign-off after an edit — `save-draft/route.ts:190-193` exists precisely because the `draft_step` cursor moves back into the company panes and cannot distinguish edited from unfinished.
- **Rung:** check · **Blast:** money
- **Satisfied when:** re-running the declaration for one application cannot create a second row for the same director — enforced at the table, not only in the function.
- **The cost is not a duplicate row, it is a duplicated CHARGE.** A second sign-off re-invites every director and inflates `suretyCount`, which is a direct multiplier on the fee: `screeningFeeCents` returns `APPLICATION_FEE_CENTS * (1 + suretyCount)` (`lib/constants.ts:135`). So an applicant who edits the company section after signing off is quoted more money, and each phantom director receives a real invitation email to a real portal.
- **Same family as the CIPC gap already recorded on M-109** — a uniqueness premise the schema does not hold. Worth fixing as one piece of work: both are missing unique constraints on commercial identity, and both are invisible until the flow that writes them is wired.
- **The tractable slice:** the general form (which steps are re-enterable) is a judgement. The narrow form is a schema assertion — the tables a declaration step writes carry a unique constraint over their natural key — checked the way `check-migration-integrity` already parses migrations.
- **Probe both directions:** a table written by a re-enterable declaration with no UNIQUE must fail; one carrying it must pass.
- **Provenance:** found 2026-09-08 grounding the M-109 wiring at `116e49b4`, by asking what a second sign-off does. Not reachable today — `declareDirectors` has zero callers — and activated by the same pane as M-115.
- **⚠ THE OBVIOUS REMEDY DOES NOT WORK, AND THAT IS THE FINDING (2026-09-08).** "Add a UNIQUE over the natural key" cannot be applied to `application_directors` as the table stands. Live schema, as at 2026-09-08 (`pg_index` join on `pg_class`, `information_schema.columns`): the table's only unique index is its PK; `email` is NULLABLE; and **the table carries no `declined_at`/`decline_reason` marker at all** — unlike `application_co_applicants`, which has both. `replaceDirector` inserts a SECOND `application_directors` row with `is_signing_surety: true` for the same application and never marks the first, so a unique key over `(application_id, lower(email))` would reject a legitimate replacement whenever the same person is re-invited, and there is no column to exclude the superseded row by. On `application_co_applicants` the same key is applicable but must be partial — `WHERE is_surety_director = true AND declined_at IS NULL` — both to leave the live individual/joint apply flow untouched and to let a declined line be replaced.
  **So this is a schema decision, not a sweep:** either `application_directors` gains a decline marker mirroring its sibling, or `replaceDirector` updates in place instead of inserting. Left unfixed rather than guessed at — picking one changes what `replaceDirector` means, and the whole point of the entry is that a uniqueness premise the schema does not hold is invisible until something writes it.
- **⚠ THE INSTANCE IS CLOSED; THE ENTRY STAYS OPEN.** Fixed at `c9ac7800` (2026-09-08). The schema decision above was resolved the FIRST way — `application_directors` gains `declined_at`/`decline_reason` mirroring its sibling — because "X was declared and then declined" is the true history and update-in-place erases it. Two PARTIAL unique indexes in `005_operations.sql`: `uq_app_directors_live_email` over `(application_id, lower(email)) WHERE declined_at IS NULL AND email IS NOT NULL`, and `uq_co_applicants_live_surety_email` over `(primary_application_id, lower(applicant_email)) WHERE declined_at IS NULL AND (is_surety_director = true OR role = 'guarantor')` — the second marker per M-118, so the WIRED writer is covered and not just the declaration path. `replaceDirector` now stamps the predecessor fail-closed, and the roster route translates `23505` to a 409 `duplicate_party`. Eleven probes in `test/db/surety-party-uniqueness.dbtest.ts`, both directions on every predicate. **No mechanism was built:** nothing asserts that the NEXT re-enterable declaration step's table carries a unique key over its natural subject, which is the tractable slice above and the reason this stays open.
  **A gap in `check-migration-forward-refs` was found on the way and is NOT fixed — filed as M-119.**
- **Covering spec:** ADDENDUM_14B_COMMERCIAL_APPLICATIONS

### M-117 — ✅ BUILT 2026-09-09 (by ADOPTION) — the implementer's write scope is `null`, and CLAUDE.md claimed it was gated

- **Rule:** an agent type declared in the write-scope table must be BOUNDED by that declaration. A declared scope of `null` must mean "bounded by what the caller declared for this run", never "unchecked".
- **Where it lives (the instance):** `.claude/hooks/agent-write-scope.js:99` declares `implementer: null`; `:194-195` guards the entire path check with `if (allowed !== null)`. So the `implementer` spine — the only WRITE spine — may write anywhere in the tree. **Being declared with a null scope is WEAKER than being absent from the table:** an unrecognised `agent_type` falls through to `ask` at `:191`, which is visible; a null-scoped one is allowed silently.
- **Rung:** hook · **Blast:** other
- **Satisfied when:** no agent type can write outside a scope that some artefact declares for that run, and CLAUDE.md's claim matches what the hook does.
- **The fix already exists and is not ours to write.** dev-standards ships `agent-write-scope` **v2** in `kit/project-kit/`, whose MANIFEST entry states the reason verbatim: *"v2 closes the hole v1 documented: an unrestricted scope is now refined per run by `.handoff/write-manifest.json`, so `null` means 'bounded by what the caller declared' rather than 'ungated'."* pleks runs v1 (225 lines, no `@kit` marker; canon v2 is 391) and appears in `ledgers/projects.json` with `kitAdopted: []`. **This is an ADOPTION, not a build** — and adopting brings a caller obligation with it: the main session must write `.handoff/write-manifest.json` before spawning an implementer, or the run is bounded to nothing and asks on every write.
- **What made it a finding rather than a known gap: the marker.** CLAUDE.md §5 carried `<!-- @enforced hook:agent-write-scope -->` on a sentence asserting BOTH halves — *"an implementer may only write inside its declared scope, and no subagent may create or publish a commit"*. The second half is genuinely enforced (the `Bash` branch at `:169-183` denies the commit family for every `agent_type`, ahead of any path logic). The first was false. **A false `@enforced` tag is the exact defect the marker vocabulary exists to prevent**, and it is worse than a mis-measuring instrument: an instrument's error gets written down once discovered, while the tag is still being believed by every session that loads the file. Corrected 2026-09-08 by splitting the rule — the covered half keeps the tag, the uncovered half became an `UNENFORCEABLE` line pointing here, which is the coverage-boundary rule in CLAUDE.md §4 applied to itself.
- **Probe both directions:** an `implementer` write outside the run's declared manifest must be denied; one inside it must pass, and a main-session write must be untouched.
- **CLOSED 2026-09-09 by adopting canon's `agent-write-scope` at v4** — not v2; canon had moved twice more while this entry sat open, and the entry's "canon ships v2" line above is preserved as written rather than back-edited, because it was true when read and the drift is the point. `null` is now refined per run from `.handoff/write-manifest.json`, and an undeclared run **asks** rather than allows. Adopted with its config and probe (v4 extracts the scope table into `agent-write-scope.config.mjs`, so the `.js` alone would import a missing module); pleks's table was DERIVED from `.claude/agents/` @ `63c4cf21` and lands on canon's defaults. Kit probe **57/57**; pleks's own `check-agent-write-scope.mjs` reconciled — three rows inverted, each an assertion of a permission v4 withdraws. **Two things the adoption found that this entry did not predict:** (1) the hook was registered without `Agent` in its matcher, so the `SPAWNERS` half — which decides who may fan out — had never been able to fire; (2) pleks's local grant of `.claude/crawlers` to `crawler-doctrine` was the L-62 over-grant canon's config cites by example, and the spine settles it (`crawler-doctrine.md:75` — the agent emits to stdout and `scripts/crawl.mjs` writes the file). **The caller obligation this entry warned about is now live**: write `.handoff/write-manifest.json` before spawning an implementer, or every write asks.
- **Provenance:** found 2026-09-08 running `dev-standards`'s `check-kit-drift.mjs`, which reported the file as present-but-unreconciled; the version gap and the false tag were found by reading pleks's copy against canon at `35745519`. **Not** found by any pleks gate — `check-claude-md.mjs` verifies that a marker RESOLVES to a live control, and this one does: the hook exists, is registered, and fires. It has no way to know the control does not cover the sentence it is attached to.
- **Covering spec:** NEW

### M-118 — one concept, two markers, and the money path reads the narrower one

- **Rule:** when two columns can both denote a role, every consumer must agree on the set. A consumer that reads the narrower marker while a live writer only produces the wider one is not stricter — it is blind.
- **Where it lives (the instance):** "surety director" is denoted TWICE on `application_co_applicants`. `lib/applications/assembleAssessment.ts:117` treats a row as a guarantor when `c.role === "guarantor" || c.is_surety_director === true` — either marker. The payment gate at `app/api/billing/screening/route.ts:76-87` counts **only** `.eq("is_surety_director", true)`. The two are not interchangeable in practice, because of who writes them: the **live, wired** roster route `POST /api/applications/[id]/co-applicant` (`:46-59`) sets `role: body.role === "guarantor" ? "guarantor" : "co_applicant"` and **never sets `is_surety_director` at all**, while the only writers of `is_surety_director` are `declareDirectors` and `replaceDirector` — both unwired, zero callers.
- **Rung:** check · **Blast:** money
- **Satisfied when:** every consumer of "is this person a surety party" resolves it through one predicate, so a new writer cannot satisfy one reader and not the other.
- **The live consequence, today.** A director added through the roster — the only wired path that exists — is a guarantor to the assessment engine and **invisible to the fee gate**. `suretyCount` is 0, so `validateJuristicParties` rejects the application at payment with `surety_party_required` for a person the applicant has already declared and invited. The applicant has no way to satisfy the gate, because the pane that writes the marker it counts does not exist.
- **This is a SECOND, independent route to the outage recorded on M-108/M-109**, and unlike that one it needs no `??` fix to reach: it is reachable the moment `requiresSuretyParty` returns true for any reason. The scar in `CLAUDE.md` §6 frames the hazard as ordering between two unwired halves; this is a third half, and it is wired.
- **The tractable slice:** a check that the set of predicates used to test surety/guarantor status across `lib/` and `app/` is one predicate — i.e. flag a direct `.eq("is_surety_director", …)` or a bare `role === "guarantor"` outside a single named helper, the way the money-format and date SSOTs are guarded.
- **Probe both directions:** a consumer resolving the role through the shared helper must pass; one testing either raw column directly must fail.
- **Provenance:** found 2026-09-08 at `e194301c`, answering "where is the commercial build" — by grepping for every writer of `application_co_applicants` rather than trusting the register's claim that `declareDirectors` was the only one. It is not: it is the only writer of that COLUMN. The distinction is the finding.
- **⚠ THE INSTANCE IS CLOSED; THE ENTRY STAYS OPEN.** Fixed at `1169d288` (2026-09-08). The predicate is now one thing in `lib/applications/juristicParties.ts` — `isSuretyParty(row)` for in-memory rows and `SURETY_PARTY_OR_FILTER` for the PostgREST side — and the three consumers share it: the fee/gate count in `app/api/billing/screening/route.ts`, the co-parties page, and `assembleAssessment`. The schema half went in with M-116 at `c9ac7800`: `uq_co_applicants_live_surety_email`'s predicate names BOTH markers, so the uniqueness key and the reader now agree on the same set. `orgMarkerFrom` landed beside them for the sibling ambiguity on the `applications` row (`entity_type` vs `applicant_type`) and is used by the new declaration route — **deliberately NOT retrofitted into `screening/route.ts:71`, which is the M-108/M-109 hazard**; that site carries a comment saying so.
  **No mechanism was built:** nothing flags a NEW `.eq("is_surety_director", …)` or a bare `role === "guarantor"` outside the helper, which is the tractable slice above and why this stays open. The three sites were fixed by classification, not by a sweep, so the next one is as invisible as these were.
- **Covering spec:** ADDENDUM_14B_COMMERCIAL_APPLICATIONS

### M-119 — the forward-ref checker walks statements, and an index PREDICATE is not one of its shapes

- **Rule:** a migration checker that validates reference ORDER must see every place a column name can appear, or its green is scoped to the shapes it happens to parse and reads as scoped to the file.
- **Where it lives (the instance):** `scripts/check-migration-forward-refs.mjs`. `CREATE UNIQUE INDEX … ON application_co_applicants(…) WHERE … role = 'guarantor'` was placed at `005_operations.sql` ~line 1816, roughly 1,180 lines AHEAD of the `ALTER TABLE … ADD COLUMN IF NOT EXISTS role` that creates the column. The checker passed the file. `npx supabase db reset` did not: `ERROR: column "role" does not exist (SQLSTATE 42703)` at statement 269, which is the whole file unapplied from that point down.
- **Rung:** check · **Blast:** schema
- **Satisfied when:** a column referenced inside an index predicate (or any other clause the checker currently skips) is subject to the same ordering rule as one referenced in a column list.
- **Why it matters more than the one instance.** The failure is not a wrong answer, it is a green that means less than it looks like it means — and the file is 3,000 lines, so nobody re-derives the ordering by eye. The instance was caught by a full local replay; a session that skips the reset (most of them, it is slow and needs Docker) ships the file and finds out on the next fresh environment, which is production's replay path.
- **The tractable slice:** the checker already tokenises statements. Extend the column-reference extractor to the `WHERE` clause of `CREATE INDEX`, and audit what else it skips — `CHECK` constraint bodies, `USING`/`WITH CHECK` in a policy, function bodies, `GENERATED ALWAYS AS` — rather than patching only the shape that bit.
- **Probe both directions:** an index whose predicate names a column added later in the same file must fail; the same index placed after that `ADD COLUMN` must pass. Both shapes exist in `005_operations.sql` history and can be used as fixtures.
- **Provenance:** found 2026-09-08 building M-116's indexes at `c9ac7800` — by running `npx supabase db reset` after the checker had already passed, which is the only reason it was found before the merge.
- **Covering spec:** NEW

### M-120 — a CHECK constraint excluded the status the code writes, and the error was read as a race

- **Rule:** an optimistic claim distinguishes "somebody else got there first" from "the write was
  rejected" by the ERROR, not by the empty result. Collapse the two and every rejection — a
  constraint, a permission, a renamed column — is silently reported as healthy contention.
- **Where it lives (the instance):** `app/api/cron/screening-line-runner/route.ts` (the claim) ·
  `supabase/migrations/005_operations.sql` (the two constraints).
- **Rung:** check · **Blast:** money
- **Satisfied when:** a claim's error path is separated from its zero-rows path, and the status
  vocabulary of a column is stated identically everywhere the column exists.
- **The failure, concretely.** `applications.searchworx_check_status` carried
  `CHECK (… IN ('not_run','pending','complete','failed'))`. The runner claims a line by writing
  `'running'`. So a company claim could only ever raise **23514**; `logQueryError` logs and returns,
  `data` comes back `null`, and `if (!claimed || claimed.length === 0) return` reads the `null` as
  *another runner owns this line*. The batch then reports `ok`, with the company subject silently
  skipped. Constraint verified against live prod 2026-09-08 before the fix.
- **⚠ SAY THIS PRECISELY: the claim was IMPOSSIBLE, not OBSERVED-FAILING.** The defect is structural,
  and it is tempting — and wrong — to report it as an incident. Two guards sat in front of it. The
  view only emits a company line `WHERE app.entity_type = 'organisation'`; `entity_type` DEFAULTs to
  `'individual'` and **has no writer at all** (the M-108/M-109 hazard), so no company line has ever
  been emitted for the runner to claim. And `applications` held **0 rows** in prod on 2026-09-08. So
  the correct claim is *"the company path could not have worked"*, not *"it failed in production"* —
  nobody has been harmed by this. **It is worth fixing precisely BECAUSE of that ordering**: the
  M-108/M-109 scar says wiring `entity_type` is the change that switches the juristic flow on, and
  this constraint was the mine directly behind that switch. It is now defused ahead of the step that
  would have stepped on it, which is the only cheap moment such a thing is ever fixed.
- **The sibling table had NO CHECK at all**, so the identical code worked there. One column, two
  tables, two vocabularies — and the table that worked is the one anybody testing by hand would have
  reached for, because it is the multi-director path the feature is *about*.
- **Why no mechanism catches it.** Three separate blind spots, and it needed all three: `logQueryError`
  logs and never throws, so a rejected write is indistinguishable from a satisfied one at the call
  site; nothing compares a CHECK's value set against the literals the code writes into that column;
  and nothing requires two tables sharing a column NAME to share its constraint. The Supabase error
  rule (`pleks/require-supabase-error-check`) was **satisfied here** — `error` was destructured and
  passed to a logger. Checking the error is not the same as acting on it, and the rule cannot tell.
- **The tractable slice:** for each column with a value CHECK, collect the string literals assigned to
  it across `lib/` and `app/` and fail on any not in the CHECK's set. Both sides are literal arrays —
  the constraint is already extracted into `scripts/schema-manifest.json` (`checkConstraints`), so
  this is a parse against an artefact that exists, not a new analysis. Second, cheaper slice: fail
  when two tables declare a same-named column whose CHECK sets differ, or where one has none.
- **Probe both directions:** a write of a literal outside the column's CHECK set must fail; the
  current set must pass. The schema half is already probed in
  `test/db/screening-claim-recovery.dbtest.ts` — reverting the constraint locally turns the company
  claim red with `expected { code: '23514' } to be null`.
- **⚠ The instance is FIXED at `3d00c508` (2026-09-08, in the M-111 change-set); the entry is OPEN.** Both tables now
  state the same five values, and the claim's error path throws instead of returning. **No mechanism
  was built** — the next constraint/code disagreement is exactly as invisible as this one was.
- **Provenance:** found 2026-09-08 while grounding M-111 — by reading the CHECK constraint on the
  column M-111's fix writes to, rather than assuming the write it describes had ever succeeded.
  M-111 is a real defect on the co-applicant path; on the company path it described the failure mode
  of a code path that had never once run.
- **Covering spec:** ADDENDUM_14B_COMMERCIAL_APPLICATIONS §6.2

### M-121 — an inert witness counted as coverage for two months, and nothing could tell

- **Rule:** a control that cannot run must not be indistinguishable from a control that ran and found
  nothing. Optional-credential witnesses fail this by construction: the no-key path and the
  all-clear path produce the same output, so the design is read off the source and believed.
- **Where it lives (the instance):** `lib/dates/holidayAuditFetch.ts` (the removed
  `fetchCalendarificZA`) · `app/api/cron/holiday-sentinel/route.ts` · `.claude/rules/crons.md`.
- **Rung:** check · **Blast:** other (statutory-notice arithmetic, via a missing holiday)
- **Satisfied when:** every optional-credential dependency either reports its own absence in the
  artefact a human reads, or is removed.
- **The OTHER optional-credential dependency on this path was confirmed LIVE 2026-09-10, by delivery,
  and the distinction matters.** `sendCronDigest` (`lib/cron/cronDigest.ts:47-48`) reads BOTH
  `ADMIN_EMAIL` and `RESEND_API_KEY` through `optionalEnv` and no-ops to `console.error` when either is
  unset — the same shape as the Calendarific defect, on the channel that carries every cron's alerts.
  Stéan received a holiday-sentinel digest on 2026-09-10; the sentinel calls `sendCronDigest`
  (`app/api/cron/holiday-sentinel/route.ts:88`), and the no-key branch produces no email, so delivery
  proves both vars resolve in prod. **That retires "is it configured?" and NOT "would we notice if it
  stopped?"** — the silent-no-op branch is unchanged, so this entry stays open on the second question.
  ⚠ Note also that `lib/env.ts:88` declares `RESEND_API_KEY` as `required: true` while this call site
  reads it as optional; the schema and the call site disagree about whether its absence is survivable.
- **The failure, concretely.** The holiday sentinel was documented in three places — the module
  docblock, the route header and the crons rule — as a TWO-witness design: Nager.Date plus
  Calendarific, with a `witnessDisagreement` escalation between them. `fetchCalendarificZA` read an
  **optional** env var and returned `null` when it was unset. The key was never set in any
  environment (checked 2026-09-09 across six env files in four locations, matching on key NAME only).
  So the fetcher returned `null` on every run the code has ever made, `witnessDisagreement` was
  called **zero times**, and the cron reported a clean two-witness audit while doing single-witness
  work. The CLI even printed `(Calendarific: no key — single witness)` — a line nobody reads on a
  cron, and the cron's own digest said nothing at all.
- **⚠ SAY THIS PRECISELY: no holiday was ever missed BECAUSE of this.** Calendarific is another
  aggregator; had the key been set it would very likely have agreed with Nager and escalated nothing.
  The defect is the **claim**, not a lost detection: three documents asserted a redundancy that did
  not exist, and the redundancy is exactly what a reader checks before deciding the subsystem is
  covered enough to stop thinking about. Understating it as "a dead code path" misses that it was
  load-bearing in the *documentation*, which is where coverage decisions are actually made.
- **What it was hiding.** Nager.Date does not carry SA ad-hoc s2A proclamations reliably. Measured
  2026-09-09 against the three known ones: 2023-12-15 (Springbok victory) **present**; 2016-08-03 and
  2021-11-01 (municipal elections) **absent** — permanently, not with a lag. One in three. The
  subsystem's whole purpose is catching a proclamation the bundled table lacks, and its only live
  witness is blind to two-thirds of the class.
- **Why no mechanism catches it.** Nothing asserts that a named env var a module branches on exists
  in any environment; `.env.example` is not a contract and was not consulted by any check. Nothing
  compares a docblock's description of a control against whether the control can execute. The
  `optionalEnv` helper is doing exactly what it says — the defect is that "optional" and "documented
  as present" were allowed to coexist unremarked.
- **The tractable slice:** collect every `optionalEnv("X")` call site and fail when `X` is absent
  from `.env.example`, forcing each optional dependency to be declared and its absence to be a
  visible, reviewed state rather than a silent one. Cheaper and narrower than trying to read prose.
- **Probe both directions:** an `optionalEnv` on a name absent from `.env.example` must fail; every
  current optional name must pass.
- **⚠ The instance is FIXED at `88780323` (2026-09-09): Calendarific removed, and replaced with a
  witness of a DIFFERENT KIND** — gov.za's notices RSS, title-matched for proclamations. It is
  the publisher, so it carries all three of the proclamations above, including the 2021-11-01 one
  Nager has never had. **The entry is OPEN: no mechanism was built.** The next optional-credential
  control to go inert will be exactly as invisible.
- **Two residuals the replacement does NOT close, both deliberate:**
  1. **The pre-gazette window.** gov.za publishes at GAZETTING. A holiday announced by the Presidency
     but not yet gazetted is invisible — correctly, since gazetting is the legally operative moment,
     but it means the sentinel is silent during precisely the days everyone is talking about the new
     holiday. 4 November 2026 was in this state on 2026-09-09.
  2. **The ten-item count cap.** The feed returns ten items regardless of elapsed time, and gazette
     publication is bursty. A daily poll can silently drop notices on a heavy day. The run cannot see
     what rolled off, so it reports the CONDITION (`windowOverrun`) instead of pretending to be clean
     — the same rule this entry is about, applied to the replacement. If it starts firing, the fix is
     a faster cadence in cPanel **and** `GOVZA_POLL_INTERVAL_MS` together.
- **Provenance:** found 2026-09-09 when Stéan asked whether the checker had picked up 4 November 2026
  being declared a public holiday. It had not — and answering *why* meant reading the witnesses
  rather than the design, which is what surfaced that one of the two had never run.
- **Covering spec:** ADDENDUM_70K Phase C (D-7d — the auditor is a skeptic, never an authority)

### M-122 — a session is minted BY EMAIL, and only a partial index makes that unambiguous

- **Rule:** an identity lookup must be unique by construction, not by a predicate that happens to
  hold. `mintSupabaseSessionForUser` resolves a user by **email** and mints a full Supabase session
  for whoever comes back; that is single-valued only because `auth.users` carries
  `users_email_partial_key`, `UNIQUE (email) WHERE (is_sso_user = false)`.
- **Where it lives (the instance):** `lib/auth/passkeys/mint-session.ts:26-29` (the
  `admin.generateLink({ type: "magiclink", email })` step) · its one caller
  `app/api/auth/passkeys/auth-verify/route.ts:34`.
- **Rung:** check · **Blast:** auth
- **Satisfied when:** either the platform asserts it has no SSO users, or minting is bound to
  `userId` end-to-end so the email lookup is never the identity step.
- **LATENT, NOT LIVE — and the distinction is the whole entry.** Verified live 2026-09-09 against
  project `noexjtlrffkzzclibvbq`:
  `SELECT count(*) FILTER (WHERE is_sso_user) FROM auth.users` returns **0 of 2 users**, and
  `SELECT indexdef FROM pg_indexes WHERE schemaname='auth' AND tablename='users'` confirms the
  partial index verbatim. So nothing is exploitable today. The moment one SSO user shares an email
  with a non-SSO user, the uniqueness the mint relies on stops holding, and the function picks a
  row rather than *the* row — while every test still passes, because the tests have no SSO user
  either.
- **Why the existing control does not reach it.** `PRIVILEGED_MINT_CALLERS` in
  `test/credential-mint-census.test.ts` pins WHO may call the minter, which is a different
  question. A pinned, correct, passkey-verifying caller still hands over a `userId`, and the minter
  still throws that away in favour of an email round-trip. The caller pin cannot see inside.
- **Provenance:** CD ruling 2026-09-09, precondition (c) on ADDENDUM_62F §24.5. Surfaced while
  ruling on `mint-session.ts`'s classification in PR #288 — the file was being read for a different
  reason, which is how the email round-trip was noticed at all.
- **Covering spec:** ADDENDUM_62F §24.5 (preconditions), §3.1(a)
