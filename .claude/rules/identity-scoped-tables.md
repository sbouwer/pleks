---
paths:
  - "supabase/migrations/**"
  - "lib/auth/**"
  - "app/api/auth/**"
---

## IDENTITY-SCOPED TABLES — the ONE bounded exception to "org_id on every new table"

`org_id` on every new table (CLAUDE.md SECURITY RULE 1) stands. This file defines the single
exception class, and — more importantly — the test that keeps it from becoming a general escape
hatch. **A table is in this class only if it passes the membership test below. Not "it felt
user-ish."**
✅ **Enforcement: `check-migration-integrity.mjs` (M-005, shipped 2026-08-19).** It parses every
`CREATE TABLE` for `org_id` and reads THIS FILE's "Current members" table below as the allowlist —
the doc is the single source, so there is no mirrored constant to drift out of step. A missing or
zero-row "Current members" section fails loudly rather than silently exempting nothing.

This paragraph previously read "**Enforcement: none yet**", written when it was true and left in
place after it stopped being. The check now distinguishes "correctly exempted by the membership
test" from "the `org_id` rule was simply skipped" — which is the thing this file exists to keep
apart. <!-- @enforced check:check-migration-integrity:shared -->

Ratified 2026-08-15 (CD) off the ADDENDUM_62F grounding pass, where `user_passkeys` was nearly
"corrected" by adding `org_id` to it.

### The membership test

> **Does this row describe a HUMAN, independent of any tenancy they happen to occupy —
> such that the same row remains true and useful if the human's org membership changes,
> is added to, or is removed entirely?**

If **yes** → identity-scoped. **No `org_id`.** RLS is self-scoped (`user_id = auth.uid()`).
If **no** → it is org data. `org_id` is mandatory, as always.

Two supporting checks, both of which must also hold:

1. **The multi-org test.** A user in two orgs has ONE of these, not two. A person does not grow a
   second fingerprint by joining a second agency.
2. **The switch test.** Pleks selects role/org *after* authentication via `/switch-role`. Anything
   consulted **before** that selection cannot be org-scoped without a chicken-and-egg failure —
   pinning it to whatever org the user occupied at registration breaks on their first switch.

**UNENFORCEABLE** — both are semantic judgements about a table's meaning ("does a person have two of these", "is this consulted before org selection") that no static check performs.

### Current members (exhaustive — extend only via a CD ruling)

| Table | Why |
|---|---|
| `user_passkeys` | A credential authenticates a human. Read before org selection. |
| `passkey_challenges` | Transient, bound to a credential ceremony. |
| `passkey_aal_grants` | Session assurance for a user, not a tenancy. |

Planned members from ADDENDUM_62F: `device_enrolment_tokens` and `account_recovery_codes` — both
recover **a person's access**, both consulted before org selection. Confirm against the test when
their DDL is written; do not assume.

**This table IS the allowlist — `check-migration-integrity.mjs` parses it out of this file.** A row
added here takes effect on the next run with no code change, and a row removed stops exempting its
table immediately. The sketch this line used to carry proposed mirroring it into a `lib/` constant
kept in sync by a parity test; reading the doc directly is strictly better, because there is no
second copy that can disagree. (Same control as above — not re-tagged, it is one mechanism.)

### Cascade policy — the companion rule

The analytics doctrine says `ON DELETE SET NULL`, **never** `CASCADE` (see
`SPEC_ANALYTICS_CAPTURE` §2 and PR #233). That rule is about **evidentiary fact rows**, and it does
not generalise to everything hanging off `auth.users`.

> **Cascade credentials. Never cascade evidence.**
> The test: does the row retain value after the human is gone?

- An orphaned public key retains **no** value — nobody can ever assert with it again. `CASCADE` is
  correct, and `user_passkeys` has cascaded since 010 §32.
- A screening decision, an audit entry, an application↔lease link retains value — it is the record
  of what happened. `SET NULL`, always. A POPIA s24 erasure removes **identity**, not **facts**.

Getting this backwards in either direction is a real defect: cascading evidence silently destroys
the audit trail on first erasure request; SET NULL-ing credentials leaves unusable rows that make
"does this user have a factor?" answer wrongly.
**UNENFORCEABLE** — MECHANISABLE (rung: check · blast: schema) — sketch: grep migrations for `REFERENCES auth.users` and assert `ON DELETE CASCADE` only on the named credential tables and `ON DELETE SET NULL` everywhere else — but nothing does; classifying a NEW table as "credential" or "evidence" in the first place still requires the semantic judgement this section describes, so the check would need the same allowlist as the two entries above to know which tables are "named credential tables".

### Why this is written down at all

An exception invoked once is a judgement call; invoked three times without a written test it becomes
precedent, and the non-negotiable quietly stops being one. The failure mode is not someone abusing
it deliberately — it is a future session reading "org_id on every new table", seeing a table without
it, and either adding the column (breaking `/switch-role`) or copying the omission somewhere it does
not belong.
