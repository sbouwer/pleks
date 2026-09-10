# CANON-FINDINGS — findings about the method, owed to `dev-standards`

`C:\dev\dev-standards` is **read-only from a pleks session** (CLAUDE.md §1), so a finding about the
METHOD cannot be filed where it belongs. It is written here instead, in the §1 report format, ready
for an estate session to lift **verbatim**.

**This is an OUTBOX, not a register.** A finding leaves when the estate session files it, and drops
to the filed list at the bottom with the canon SHA that closed it. It exists because the alternative
— carrying a finding in a chat report — failed once: CF-1 was nominated, reported, and still
undelivered a session later, with `CURRENT.md` at its 8 KB ceiling and no room to hold the relay.

⚠ **Never pre-file anything here into `LESSONS.md` as "pending".** That ledger's `Applied:` has
exactly two states, a date or `n/a:` with a reason; a known-but-unapplied lesson is an open item in
the project's own queue, not a ledger value.

---

## Open

*None.*

---

## Filed

Kept as a pointer, not a restatement — the ledger entry is the record, this is how to find it.

| # | Finding | Filed as | Canon SHA |
|---|---|---|---|
| CF-1 | A fail-closed error's remediation text is a control, and codegen silently invalidates it — including, second-order, the TEST pinning the obsolete half of the message, which stayed green throughout | `LESSONS.md` **L-99** | `cf14e65` |
| CF-2 | A mandatory rotation whose trigger and whose test are independent is unsatisfiable on a seeded register | BRIEF-STANDARD **§2.4 v2** | `71cc38f` |

**Both were corrected on the way in, and the corrections belong here rather than only in canon:**

- **CF-1** shipped in pleks as `19a49d5e` (PR #296, merged `1db5c871`) — both horizon errors rewritten
  to name the generator, the proclamation bundle and the refusal to lift; the assertion re-pinned from
  the stale file name to the remediation that resolves the outage.
- **CF-2's reported count was wrong: 51 rows, not 52.** The sweep was reported as *"52 (33 Settled ·
  9 Consensus · 10 Standing)"*; counted in the tree the log holds 32 + 9 + 9 = **50**, plus **1**
  archived. The Standing count was one high. The argument was unaffected — 50 of 51 still bind and
  the file still grew — which is precisely why the error survived: **legs ② and ③ never depended on
  the number, so nothing in the reasoning pushed back on it.** A count quoted in support of a
  conclusion that does not rest on it gets no scrutiny from the conclusion.
- §2.4 v2 is **mechanised** (`check-brief.mjs`, +175 lines in `71cc38f`). pleks does **not** run
  `check-brief.mjs`, so its `DECISIONS.md` conformance is unenforced here and held by hand — the
  sweep line was written to v2's exact shape rather than approximated.
