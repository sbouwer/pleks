# INTENTIONAL — deliberate design that looks like residue

**Every crawler reads this before reporting anything.** A finding matching an entry is
**suppressed, not downgraded**. `standards/CODEBASE-CRAWLERS` §6, and D6 makes it a build blocker:
without it a first run confidently flags considered decisions as defects, and first impressions
decide whether the tool is ever run again.

**Every entry carries its reason, not just its pattern.** A crawler handed a bare pattern list
finds the near-miss variant and flags that instead. Same rule this repo's eslint baselines follow:
an allowlist is a decision log, not a silencer.

**What does NOT belong here.** Anything a mechanism already decides. If a check, hook or lint rule
covers it, the crawler should never have looked — and if it did, the fix is to narrow the crawler,
not to add an entry. Entries here are for judgement-bound classes only.

**Exit condition.** An entry leaves when the design changes, or when the class becomes mechanically
decidable and moves to a check. An entry that can never leave is a rule, and rules live in
`CLAUDE.md`.

---

## Encryption and PII

### DOB is encrypted on `applications`, PLAINTEXT on `contacts`/`tenants` — by column TYPE

⚠ Corrected 2026-08-19, having originally been written here as a flat "date_of_birth is plaintext".
That is what CLAUDE.md's carve-out says, and it is true of the columns the carve-out is about, but
stated flatly it is wrong in a way a crawler would act on. The split is by TYPE, and
`lib/crypto/idNumber.ts` states it at the site:

- `applications.date_of_birth` / `application_co_applicants.date_of_birth` are **text**, and ARE
  encrypted — through `encryptDob`/`decryptDob`, which are aliases of the id_number pair.
- `contacts.dob` / `tenants.dob` are a real `date` and stay **plaintext**. This is the CD ruling of
  2026-07-07: the SA ID's first six digits already encode the DOB, so a separate ciphertext is
  marginal once `id_number` is encrypted, and the column is used for age and affordability
  arithmetic — text-for-ciphertext breaks date maths.

`gender` is plaintext everywhere: not POPIA "special personal information", and low-cardinality
enough that encrypting it is theatre.

**A finding proposing to encrypt the `date` columns, or to decrypt the `text` ones, is out of
scope.** A finding that an `applications.date_of_birth` write BYPASSES `encryptDob` is a real
defect — the writer/reader pair is the thing that must not drift. A finding about `id_number`
belongs to `eslint:pleks/require-id-number-encryption`, not here.

### `id_number_hash` is deterministic across every organisation, and that is not the bug

`hashIdNumber` salts with a single GLOBAL env var rather than a per-org one, so the same human
hashes identically platform-wide. That is by construction, because the hash exists for dedup and
import identity matching. **The rule is about where it may be READ, not about the salt**: never
under `app/`, never on a cross-org path, service-role only —
`eslint:pleks/no-id-number-hash-in-app` decides that half. A finding proposing to make the salt
per-org is out of scope and would break every historical join; a finding that a NEW caller resolves
identities across orgs is exactly the incident that rule exists to prevent, and is worth reporting.

---

## Pricing and product

### Estate, Huru and criminal screening are CANCELLED — the rate card still describes them

`brief/legal/SEARCHWORX_RATE_CARD.md` is a supplier-pricing reference, not a decision log, and its
`updated:` date is the last EDIT rather than the last ruling: it was edited 2026-07-10 still
describing the Estate bundle as live, seven weeks after ADDENDUM_14E cancelled it. **When the rate
card and `INDEX.md`/ADDENDUMs disagree about a DECISION, INDEX/ADDENDUM wins** (Stéan ruling
2026-08-15). A finding that the rate card mentions a cancelled product is describing a known,
ruled-on inconsistency in an unversioned reference document. Supplier per-call prices remain the
card's domain and are not stale by default.

### Pleks sells ONE bundle, and the single-bundle economics assertion lives inside the SSOT

`lib/screening/searchworxBundle.ts` derives cost and margin rather than stating them, and asserts
price > cost inside the module. A finding that "there is only one bundle" or that the margin is
computed rather than declared is describing the design.

### No per-user seat caps on any tier

Lease count is the only gate. A finding that the tier table omits seat limits is describing a
product rule, not an omission. Annual pricing is not live and bespoke/white-label are deferred —
their absence from the tier SSOT is deliberate, not incomplete.

---

## Naming traps

### The Supabase key is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, never `ANON_KEY`

`ANON_KEY` is the name every other Supabase project uses, so it reads as correct and this repo's
name reads as the mistake. It is the other way round. A finding proposing to rename it, or
reporting the long name as inconsistent with Supabase convention, is out of scope. A raw
`process.env` read of ANY env var outside `lib/env.ts` is decided by
`eslint:pleks/no-raw-process-env`.

### `brief/` is a symlink to OneDrive and is NOT version-controlled

Anything under `brief/` is invisible to git and absent on a fresh clone or in CI. That is why
tooling never depends on it. A finding that a doc under `brief/` is untracked, or that a spec
referenced from `brief/` cannot be resolved in CI, is describing the arrangement. A finding that a
SCRIPT or CHECK reads from `brief/` is a real defect — it will fail on any other machine.

---

## Migrations

### Twelve migration files, amended forward forever

`007_enhancements.sql` and `008_enhancements2.sql` are never amended; the rest are amended in place
rather than superseded. So the files are enormous and full of `DROP POLICY IF EXISTS` /
`CREATE POLICY` churn, and read like a history nobody cleaned up. That is the doctrine, asserted by
`check-migration-integrity`. A finding proposing to split, squash or renumber them is out of scope.

### Four different idempotency patterns coexist in the migrations

`DROP POLICY IF EXISTS` before `CREATE POLICY`, an `IF NOT EXISTS (SELECT 1 FROM pg_policies …)`
guard, a dynamic `EXECUTE format('DROP POLICY IF EXISTS %I …')` loop, and a
`DO $$ … EXCEPTION WHEN duplicate_object` block. All four are genuinely safe and all four are
recognised by the check. A finding that the codebase is "inconsistent about policy idempotency" is
describing four correct answers to one question.

---

## Architecture

### Pleks is NOT in the payment flow, and the absence of a payment SDK is the design

Agencies hold debit-order mandates bank-side, between themselves and their bank. Pleks reads bank
statement matches only. A finding that there is no payment integration, no PSP, or no mandate
initiation path is describing D-TRUST-01. The named payment SDKs are forbidden by
`eslint:no-restricted-imports`. A finding that some flow is quietly reconstructing a mandate out of
ordinary Supabase writes is a REAL finding and nothing decides it — that is M-010, and exactly the
judgement-bound class a crawler is for.

### Cross-org reads on the public applicant API are token-bound, not org-bound

`app/api/applications/**` and `lib/actions/delivery-notice.ts` resolve an org by resolving a token
or a public listing slug, because the caller is an unauthenticated applicant and there is no
session org to scope to. Those reads sit in
`eslint-rules/require-org-scope-on-service-read.baseline.json` with that classification. A finding
that they lack `.eq("org_id", …)` is re-reporting a classified baseline entry.

### Seventeen circular imports are baselined, classified into four families

`scripts/import-cycles.baseline.json` carries the reasons. Sixteen are type-only and cost nothing
today; the one that is not — `lib/auth/server` → `can` → `orgRoles` → `getOrgTier` → back — is
named there as the priority. A finding re-listing any baselined cycle is out of scope; a finding
about a cycle NOT in that file cannot exist, because `check-import-cycles` fails the build first.

---

## Known-loose controls, deliberately

### `ORG_AWARE` in the service-read rule tests the whole enclosing function

So a read is exempt if the function is org-aware anywhere, including after the read. Measured, not
assumed: tightening it to source order gives 52 findings across 33 files, and that classification
has not been done. Tracked as **M-061**. A finding restating the looseness is re-reporting a
documented, measured, queued decision; a finding naming a SPECIFIC site where the looseness hides a
genuine cross-org read is a real finding.

### The baselines here GROW when a rule's scope widens

An eslint baseline in this repo grows only when the rule starts seeing files it was previously
blind to — `require-org-scope-on-service-read` went 72 → 80 that way, and the commit says so. A
finding that "a baseline grew, therefore a finding was silenced" must check the rule's diff first;
growth with a scope change is the documented, permitted case.

---

## Dead-code findings that are not dead code

### Superseded FitScore prompt versions are an audit record

`lib/screening/prompts/fitScoreNarrative.v1.0.ts` and `v1.1.ts` are imported by nothing — only the
current version is. They stay because `fitscore_narrative_prompt_version` is **stored on the decision
row** (`narr.v1.0` appears in `fitScoreReplay.test.ts`'s fixtures) and replay exists to answer "what
was in force on the decision date?" for a tribunal. Deleting a superseded prompt deletes the answer.
A finding that they are unused is describing the design; they leave when the DECISIONS naming them
fall out of retention, not when the code stops importing them.

### `QuickPaymentButton` → `lib/actions/payments.ts` is a dead chain around a LIVE money path

Nothing renders `QuickPaymentButton`, so `recordPayment` and the `rent.payment_received` template
under it are unreferenced. But `recordPayment` is the only single-payment recording implementation —
bulk-import calls `record_payment_atomic` directly, so the RPC is live and the UI path is not. Either
the button was deliberately pulled from the lease page or agents quietly lost the ability to record a
one-off payment. **That is a product question on a money path, and deleting the chain decides it.**
Left in place deliberately, and out of scope until it is decided.

### An eslint baseline that GREW is not necessarily a silenced finding

Restated here because a dead-code or divergence finding will keep meeting it:
`require-org-scope-on-service-read` went 72 → 80 entries when its client discriminator widened to
see files it had been blind to. Growth WITH a scope change is the documented, permitted case; growth
without one is not. Check the rule's diff before reporting.
