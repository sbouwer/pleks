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

### Current members (exhaustive — extend only via a CD ruling)

| Table | Why |
|---|---|
| `user_passkeys` | A credential authenticates a human. Read before org selection. |
| `passkey_challenges` | Transient, bound to a credential ceremony. |
| `passkey_aal_grants` | Session assurance for a user, not a tenancy. |

Planned members from ADDENDUM_62F: `device_enrolment_tokens` and `account_recovery_codes` — both
recover **a person's access**, both consulted before org selection. Confirm against the test when
their DDL is written; do not assume.

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

### Why this is written down at all

An exception invoked once is a judgement call; invoked three times without a written test it becomes
precedent, and the non-negotiable quietly stops being one. The failure mode is not someone abusing
it deliberately — it is a future session reading "org_id on every new table", seeing a table without
it, and either adding the column (breaking `/switch-role`) or copying the omission somewhere it does
not belong.
