# CANON-FINDINGS — what this project owes `dev-standards`

<!-- Kit row `canon-findings`, a TEMPLATE: ours after the copy, and never compared. This file opened
     on 2026-09-10 as pleks's own outbox, one section deep; canon made it a kit row the same day and
     the shape below is the template's. The preamble is pleks's, kept because it carries the
     incident that produced the file. -->

`C:\dev\dev-standards` is **read-only from a pleks session** (CLAUDE.md §1), so anything owed to it
cannot be written where it belongs. It is written here instead, ready for an estate session to lift
**verbatim**. Three things are owed to canon, and each has a section below.

**This is an OUTBOX, not a register.** An item leaves when the estate session files it, and drops to
**Filed** at the bottom with the canon SHA that closed it. An empty outbox is the healthy state.

It exists because the alternative — carrying an item in a chat report — failed once: CF-1 was
nominated, reported, and still undelivered a session later, with `CURRENT.md` at its 8 KB ceiling and
no room to hold the relay.

⚠ **Never write "pending" anywhere canon will read, and never pre-file anything here into
`LESSONS.md`.** That ledger's `Applied:` has exactly two states — a date, or `n/a:` with a reason. A
lesson this project knows about but does not carry is not a ledger value; it is an open item in
pleks's own queue (`docs/MECHANISABLE.md` if the fix is a control, otherwise `brief/CURRENT.md`), and
it stays in the `--emit-open` list until it is answered. That is correct behaviour, not a gap.

---

## 1 · Findings about the method

A defect in canon — a playbook, a standard, a kit file, a check. The portability test decides whether
it belongs here or in pleks's own scars: *would it still be true on a repo with a different stack?*

```
### CF-n · <the claim, in one line>
OBSERVED   what happened, in one sentence
COMMAND    what you ran, and its output verbatim
WHY IT IS  why it is the method's defect and not this project's
CANON'S
SMALLEST   the narrowest fix, and what it must not break
FIX
```

*None.*

---

## 2 · Lesson answers

From `node C:/dev/dev-standards/tools/check-lessons.mjs --emit-open pleks`. Read the entry from its
line in the ledger before answering — never the whole 240 KB file. A date is the day pleks's tree
came to carry the lesson, with the evidence that shows it; a reasoned `n/a:` closes an item as surely
as a date. **"Not yet" is not an answer** — leave the lesson off this table and it stays open, which
is what an unanswered lesson should look like.

| Lesson | Answer — `YYYY-MM-DD` or `n/a: <reason>` | Evidence — SHA, path or command |
|---|---|---|

---

## 3 · Kit reports

Adoptions canon has to record in `kitAdopted`, and pins: a row deliberately behind canon, with the
row id, the version held, the reason, and a review date. A pin means *read and deliberately behind*,
never *exempt*, so the reason has to argue it.

- **Adopted — row `canon-findings`.** This file. pleks wrote the first one on 2026-09-10 before the
  row existed; canon turned it into a template row the same day, and this is the merge back onto that
  shape — §2 and §3 added, §1 and **Filed** carried across unchanged with their corrections. Record
  it in `kitAdopted`.

---

## Filed

A pointer, not a restatement — the canon entry is the record, this is how to find it.

| # | Item | Filed as | Canon SHA |
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
