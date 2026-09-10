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

### CF-3 · A `tracked` kit file's header narrates the ADOPTING project's incident, so every other adopter reads a false account of its own repo

```
OBSERVED   scripts/check-hook-registration.mjs is byte-identical in kit/project-kit/, in pleks
           and in yoros. Its header says "PORTED FROM `pleks/scripts/check-hook-registration.mjs`,
           NOT REINVENTED" and "WHY THIS PROJECT NEEDED IT, specifically. On 2026-08-30 this
           session proved the hooks were live by running `npm publish --dry-run` and reading the
           denial back." Read in pleks, the first sentence says the file was ported from itself,
           and the second describes a session that never happened here — pleks publishes nothing
           to npm and has no such commit.

COMMAND    $ diff -q C:/dev/dev-standards/kit/project-kit/scripts/check-hook-registration.mjs \
                     C:/dev/pleks/scripts/check-hook-registration.mjs
           (no output — identical)
           $ diff -q C:/dev/yoros/scripts/check-hook-registration.mjs \
                     C:/dev/pleks/scripts/check-hook-registration.mjs
           (no output — identical)
           $ grep -n "WHY THIS PROJECT NEEDED IT" \
                  C:/dev/dev-standards/kit/project-kit/scripts/check-hook-registration.mjs
           15: * WHY THIS PROJECT NEEDED IT, specifically. On 2026-08-30 this session proved …

WHY IT IS  The row is tagged `@kit check-hook-registration v2 — tracked. Edit it in dev-standards
CANON'S    and re-adopt; a local change here is a fork, and check-kit-drift.mjs will say so.` So
           the adopter is not permitted to correct the header — the falsehood is load-bearing
           canon text, not local rot. The header is also the surface a session reads to decide
           whether the check applies to it and what it is for, which is the one place a false
           account of the reader's own repo costs something.
           Portability: true on a repo with any stack, because the defect is in the tracked text
           rather than in anything a project built. Related to L-62 and distinct from it — L-62 is
           prose stating the reference implementation's incidental DESIGN as a requirement; this is
           prose stating another project's HISTORY as the reader's.

SMALLEST   A tracked file's header speaks in the kit's voice only. KEEP, because every adopter
FIX        needs them: the L-06 rationale for spawning the real subprocess, the twin contract
           ("ask is the floor; absent is the violation"), the two marker traps LT recorded, and
           the shipped-placeholder warning (a `@no-twin` reason that is the instruction to write
           a reason). MOVE to the kit row's register entry, where provenance belongs: "PORTED
           FROM pleks…, NOT REINVENTED" and the whole "WHY THIS PROJECT NEEDED IT" paragraph.
           Must not break: the `@kit` tag line itself, which check-kit-drift keys on, and the
           `Run:` lines naming the selftest.
```

---

## 2 · Lesson answers

From `node C:/dev/dev-standards/tools/check-lessons.mjs --emit-open pleks`. Read the entry from its
line in the ledger before answering — never the whole 240 KB file. A date is the day pleks's tree
came to carry the lesson, with the evidence that shows it; a reasoned `n/a:` closes an item as surely
as a date. **"Not yet" is not an answer** — leave the lesson off this table and it stays open, which
is what an unanswered lesson should look like.

| Lesson | Answer — `YYYY-MM-DD` or `n/a: <reason>` | Evidence — SHA, path or command |
|---|---|---|
| L-14 | 2026-08-21 | `.claude/hooks/bash-gate.js` matches the **resolved** target, not its spelling: it token-matches (find `git`, then `push`, then a force flag as a standalone token anywhere after), so `git -C /repo push --force`, an absolute path, an env prefix and an alias are all caught. `CLAUDE.md:174-182` states the appearance-vs-resolved split as the reason the settings twin is only a partial floor. The by-reference case is reasoned through explicitly at M-096: the `.githooks` probe seam is denied **as a shell assignment at command position**, and `check-git-hooks.mjs` — which supplies the same seam through `spawnSync`'s `env` object, never a shell string — is therefore not matched and needs no exemption. Probes in `scripts/check-bash-gate.mjs` (`fd818c0c`), three directions. |
| L-15 | 2026-08-21 | The serial-layer model is stated correctly and from measurement, not reasoned: `CLAUDE.md:174-182` — *"The hook is the control; the twin is a partial floor for canonical forms"*, and *"hook-dead is not 'degraded but complete'"*. Mechanised in `scripts/check-hook-registration.mjs`, which takes the set difference **deliberately NOT equal-or-stronger**: *"settings speaks in prefix-globs and a hook in separator-aware regex, so ask is the floor; absent is the violation."* **Boundary, stated rather than papered over:** the dormant layer is enforced by the harness, not by this repo, so pleks cannot probe the twin with the hook disabled from a script — that A/B stays a human act, as it was in life-therapy. |
| L-16 | 2026-08-20 | `scripts/check-hook-registration.mjs`, wired into `npm run check` (verified: `package.json`'s `check` chain contains it, alongside `check-bash-gate`, `check-mcp-ddl-gate` and `check-git-hooks`). Each hook rule declares `// @twin <settings pattern>` at the rule it implements or `// @no-twin <reason>`; the audit takes the set difference against `permissions.deny ∪ ask` and fails on a rule with neither. 6 `@twin` markers in `bash-gate.js`, 11 in `mcp-ddl-gate.js`. Landed `fd818c0c` (PR #257). |
| L-17 | 2026-08-21 | `docs/EXPERIMENTS.md`, `ac3c9456` (PR #258). Both halves of the general form are carried and were paid for: **never report on a signal you cannot observe** — E12's *"The prompt this run DID raise, reported by Stéan mid-turn and invisible to every instrument"*, with the negative confirmed by search (*"NO transcript record"*), so the human supplied what no instrument could see; and **run it twice** generalised past the corollary in E13 — *"MEASURE ACROSS SESSIONS BEFORE BELIEVING A CHANNEL IDENTIFICATION"*, after E13 was refuted twice and E14's primary result was **withdrawn as confounded** rather than kept. The transcription rule reaches agents at `CLAUDE.md:591`: *"Every agent claim about the tree carries the SHA it observed."* |
| L-18 | 2026-08-20 | Three measured refusals, each carrying its number beside the rule. `CLAUDE.md:178-182` — a narrower `Bash(git -C*)` twin *"considered and rejected on measurement: `git -C` appears 112 times in this machine's transcripts, almost all read-only, so the twin would fire constantly and be gone within a day."* `docs/MECHANISABLE.md` **M-004** — the rest of "audit every state change" is not built because those tables are dominated by routine traffic; the classification of every site lives in the entry. `CLAUDE.md:229` — *"A check's first number is a hypothesis, not a finding"*, from a migration check whose first run reported 27 violations of which 23 were legitimate. And the refusal to publish a number at all: `CLAUDE.md:573`, a policy-pairing scan that reported 328, then 29, then 21, *"left unmeasured rather than publish a fourth number."* |
| L-24 | 2026-09-10 | pleks acquired its first generated-artefact pair in `1db5c871` (PR #296) — `lib/dates/saHolidays.json` from `scripts/codegen/gen-sa-holidays.mts` — and did not use the sibling as the correctness check. The byte-for-byte comparison (`lib/dates/saHolidayDerivation.test.ts:38`) is scoped to the one question a common-ancestor diff can answer, **hand-editing**, and its limit is tested rather than assumed: the next case, *"that diff has TEETH — a single changed row makes the render differ"*, exists because `committed === expected` *"would pass just as happily if the renderer emitted a constant, or if both sides were empty."* Correctness is verified against **ground truth**: `lib/dates/holidayAudit.ts` + the sentinel read Nager.Date and the gov.za notices RSS as external read-only witnesses, and `app/api/cron/holiday-sentinel/route.ts:12` records where that witness is known to be weaker than the table rather than treating agreement as proof. |

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
