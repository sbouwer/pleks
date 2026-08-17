# DDL_LOG

Every production schema or data application made under the **standing DDL authorisation**
(NOW.md, granted 2026-08-16 by SB on CD's advice) appends one line here.

**The log is what makes the grant oversight rather than a blank cheque.** SB reviews the list, not
each item — asynchronous control, same scrutiny, none of the interruptions.

**Record:** date · migration section (or "data") · what it did · which of the three conditions it
met (1 shape · 2 data disposition · 3 reversible) — or, for anything outside the grant, **who
authorised it and when**.

Newest last.

---

| Date | Section | What | Conditions / authorisation |
|---|---|---|---|
| 2026-08-16 | `010 §51` | `tenant_portal_tokens.communication_log_id` — nullable uuid FK to `communication_log`, plus a partial index `WHERE NOT revoked`. Binds a portal token to the comm that delivered it, so a hard bounce revokes exactly the credential that reached nobody (ADDENDUM_62F §17.1). | **1** nullable column + index · **2** no PII (a FK to a log row; the token table already has RLS and org scoping) · **3** revertible — dropping it loses only the binding, and `expires_at` remains the backstop. **Logged retroactively**: applied on Stéan's explicit ask, hours before the standing grant existed. Meets all three. |
| 2026-08-17 | data | **Backfill** — inserted 34 `contact_emails` rows from `contacts.primary_email` where no primary row existed (`is_primary`/`is_active` true, `email_type` `'personal'`). Step 1 of `ADDENDUM_CONTACT_REPRESENTATION_UNIFICATION` §7. | **OUTSIDE the standing grant** — a data operation, not a shape change. **Explicitly authorised by SB 2026-08-17.** Ran under CD §10.4's two conditions: dry-run count named in advance as **34** and matched exactly before executing, and a **single transaction** with post-conditions asserted inside it. Verified after: 34 total rows · 34 primary+active · **B = 0** divergence · **0** contacts remaining unbackfilled. INSERT-shaped — no existing row modified. |
