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

### CF-4 · `delivery-report --check` fails GREEN when the plan is untracked, and the neighbouring case proves it knew to say so

```
OBSERVED   DELIVERY-STANDARD §4 calls the baseline-moves-only-on-record rule "the rule the whole
           report stands on". It reads history with `git log -- brief/build/90-release.md`. When
           that path is gitignored the log is empty, `planVersions` returns a single "working
           tree" version, nothing can be compared with anything, and `--check` prints ✅ — with
           the words "history: 1 version(s) read", which read as history HAVING been read.

COMMAND    Two throwaway repositories, identical but for one line of .gitignore, each given the
           same undeclared baseline move (MS-01 2026-09-01 → 2026-10-01, no `Changed:` line):

             $ node kit/project-kit/scripts/delivery-report.mjs $TRACKED --check
             ❌ delivery-report: 1 finding(s) in brief/build/90-release.md
               dda5754: MS-01 baseline moved 2026-09-01 → 2026-10-01 with no recorded reason …
             exit 1

             $ node kit/project-kit/scripts/delivery-report.mjs $IGNORED --check
             ✅ delivery-report: 1 milestones (0 done), 1 spend rows, 0 recorded changes ·
                agreed 2026-08-01 · history: 1 version(s) read
             exit 0

WHY IT IS  The script ALREADY handles the neighbouring case correctly: with no `.git` at all it
CANON'S    returns `note: "not a git repository — the baseline's history was NOT checked"` and
           --check prints ⊘. So the quiet arm is the strictly more misleading one — a repository
           IS present, so the reader has every reason to assume the git-backed rule applied.
           Portability: nothing here is about pleks's stack. It is true of any repo that keeps its
           plan out of version control, and that is not an exotic choice — a delivery plan holds
           the contract value, the day rate and per-milestone budgets, so a project on a PUBLIC
           repository (pleks is one, verified `gh api repos/sbouwer/pleks` → `"private": false`)
           cannot commit it. The estate's own three projects already split 2–1 on tracking
           `brief/`, and canon's 60 probes were all written on the tracked side.
           The other two arms fail SAFE and are not part of this finding: `--html` for a past
           period refuses ("the plan was not yet committed on …", exit 1) and `--html` to date
           refuses without `--preview`. It is exactly the GATE that lies.

SMALLEST   In `planVersions`, treat "in a git repo, but this path has no committed versions" the
FIX        same as "not a git repository": return the existing `note`, worded for the case — e.g.
           `the plan is not tracked by git — the baseline's history was NOT checked`. `--check`
           already prints `hist.note` before its verdict, so one added condition reaches the
           output with no new plumbing. Must not break: the genuine first-commit case, where a
           plan is tracked and staged but not yet committed — that is also zero versions and is
           legitimately a draft, so the note must distinguish "untracked" (a finding) from "not
           yet committed" (fine), which `git ls-files` answers.
```

### CF-5 · A `tracked` row that an adopter's own gate rejects leaves the adopter with no legal move

```
OBSERVED   Installing kit row `delivery-report` v1 verbatim turns `npm run check` RED in pleks:
           `sonarjs/super-linear-regex` fires six times on canon's own bytes, plus
           `sonarjs/single-character-alternation` once. pleks may not fix them (an edit outside a
           KIT:CONFIG region forks a `tracked` row and check-kit-drift says so), may not disable
           them at the site (same fork), and may not exempt the path — CLAUDE.md §4 forbids
           widening an allowlist to make CI green, and the eslint config's 2026-08-22 ruling names
           `sonarjs/super-linear-regex` as one of the two families "with an incident behind them",
           kept ON for `scripts/**` deliberately. So the row was HELD, not adopted.

COMMAND    $ cp kit/project-kit/scripts/delivery-report.mjs scripts/ && npm run check
             scripts/delivery-report.mjs
               61:17  error  Replace this alternation with a character class    single-character-alternation
               81:16  error  Simplify this regular expression … backtracking    super-linear-regex
              115:17  error  … 125:15 … 427:13 … 620:19  (same rule)
             ✖ 7 problems (7 errors, 0 warnings)

           $ cd C:/dev/dev-standards && npm run check:lint      # → "eslint ."
             devDependencies: @eslint/js, eslint, knip, madge   # no eslint-plugin-sonarjs

WHY IT IS  Canon cannot see this class, by construction: its lint is `@eslint/js` only, so the
CANON'S    rule that rejects its bytes is one it does not run. That is the exact shape of canon's
           own scar `0195b66` — "a rule canon writes is obeyed somewhere canon cannot see" — with
           the arrow reversed. Portability: it is not about sonarjs or about pleks. `tracked` mode
           assumes every adopter's gate will accept canon's bytes verbatim, and offers no move
           when one does not: fix, exempt and disable are all forks, so the only remaining action
           is to decline the row entirely. A kit that propagates strictness to its adopters and
           does not hold itself to it will meet this again with the next rule any project adds.

SMALLEST   Two, and the first is a one-session fix: repair the seven sites. All are the same
FIX        class — `\s` (which matches newlines) where `[ \t]` is meant, in regexes that parse ONE
           already-split line, plus `(—|–|-)` → `[—–-]` at :61. Concretely :125
           `/^\s*-\s*\*\*([^*:]+):\*\*\s*(.*)$/` → `/^[ \t]*-[ \t]*\*\*([^*:]+):\*\*[ \t]*(.*)$/`.
           Must not break the parse of a line with no leading space, or of `- **Learned:**` with
           an empty value. The second is the structural half and is a separate decision: either
           run the estate's own rule set over the kit before shipping a `tracked` row, or declare
           what an adopter may do when its gate rejects canon's bytes — today "hold the row" is
           the only lawful answer and nothing in the kit says so.
```

---

## 2 · Lesson answers

From `node C:/dev/dev-standards/tools/check-lessons.mjs --emit-open pleks`. Read the entry from its
line in the ledger before answering — never the whole 240 KB file. A date is the day pleks's tree
came to carry the lesson, with the evidence that shows it; a reasoned `n/a:` closes an item as surely
as a date. **"Not yet" is not an answer** — leave the lesson off this table and it stays open, which
is what an unanswered lesson should look like.

| Lesson | Answer — `YYYY-MM-DD` or `n/a: <reason>` | Evidence — SHA, path or command |
| L-68 | 2026-09-10 | Given the same day it was raised, by the only person who could give it. `CLAUDE.md` §7 now carries: *"**STANDING AUTHORISATION — Stéan, 2026-09-10, from this date onwards.** Agents listed in the table above may be spawned without per-session approval; writes stay bounded by `.handoff/write-manifest.json`; nothing here authorises a push."* **What was wrong before is worth recording, because it is the lesson's whole shape:** the warrant was §7's agents table itself, which a session had to read as "the repo asking" — inference from a table's existence, re-derived from scratch by every session and attributable to nobody. The scope clause is not decoration: a bare dated signature would have authorised everything and nothing, and the next session would have gone back to inferring. It removes the question of whether spawning was permitted; it does not widen §5's write bound or §3's push gate, both of which still hold. |

**The 13 answers from the 2026-09-10 triage were lifted in `fa7b92f` and have dropped to Filed** —
canon's `LESSONS.md` is their record now, and this file does not restate it. **L-68 above is the one
answer still awaiting canon**; it was given after the outbox was read at `9430df2a`.

**⚠ Two dates canon corrected on measurement, and one it sent back — recorded here so the next
session does not re-report the old ones:**

- **L-62, L-69 → 2026-09-09** (reported 2026-08-21). Canon is right and the principle is the one
  this table's own header states: an `Applied:` date is the day the tree came to carry the lesson,
  not the day the work was reasoned about. Both first appear in `8672062b`.
- **L-66 → 2026-08-20**, correcting pleks's reported 2026-08-30. **This was my error and the shape
  of it is worth keeping:** I dated the answer from the *lesson's* own date rather than from this
  tree, which is exactly the substitution the header warns against, and it survived because
  2026-08-30 looked like a measurement. Re-measured on canon's challenge:
  `git log --diff-filter=A -- .claude/agents/` shows the sixth agent file, `crawler-doctrine.md`,
  landing in **`fd818c0c` (2026-08-20)** — the day "every agent pleks declares exists" became true
  of the tree. Canon's own half (`bd58b28`, 2026-08-19) precedes it, so the later of the two governs.
  **Canon: rewrite L-66's line to 2026-08-20, evidence `fd818c0c`.**

**The 7 open lessons below are NOT answers**, and that is the point — `--emit-open` should keep
reporting them until pleks carries them. They are listed so the next session knows the triage
finished rather than stopped. **⚠ Canon: do not lift this list.** None is an `Applied:` value; each
is an open item with an owner in this repo.

| Lesson | Why it is open | Queued as |
|---|---|---|
| L-22 | 3 sites mark work done without reading the send result — one flips a never-retry flag. Canon's entry records pleks had never been surveyed for this shape; this was that survey. | **M-128** |
| L-23 | 80-entry ESLint baselines carry no per-entry reason, and only one allowlist has a staleness check — which catches a deleted route, not a reclassified one. | **M-130** |
| L-63 | `claude-module-kind`'s verifier exists but runs only from canon, so emptying `.claude/package.json` leaves `npm run check` green. | **M-129** |
| L-64 | Nothing states that a hook installed mid-session does nothing for that session, or the throwaway-call verification. Genuine zero. | `brief/CURRENT.md` |
| L-67 | The file-header template in `CLAUDE.md` §9 is a second copy `check-file-headers.mjs` never reads. | **M-131** |
| L-71 | The rule is stated; the sweep is not. Running it finds 436 mojibake sequences in four migration files. | **M-126** |
| L-72 | A passkey is minted on session state alone while revoking one demands step-up. | **M-127** |

---

## 3 · Kit reports

Adoptions canon has to record in `kitAdopted`, and pins: a row deliberately behind canon, with the
row id, the version held, the reason, and a review date. A pin means *read and deliberately behind*,
never *exempt*, so the reason has to argue it.

- **Re-adopted — row `check-hook-registration`, v2 → v3, 2026-09-10.** CF-3's fix, taken the session
  it shipped. Copied from canon and verified byte-identical (`diff -q` → no output); `--selftest`
  green, live run green. Comment-only, −21/+18. **Canon: lift the v2 pin you were holding (review
  2026-09-24); it is not needed.** Record v3 in `kitAdopted`.

- **PINNED — row `delivery-report`, v1 held, not installed. Review 2026-09-17.** Read, probed
  against this tree, and deliberately behind. **The reason is CF-5 and it is not a preference:**
  canon's copy fails pleks's lint seven times (`sonarjs/super-linear-regex` ×6,
  `single-character-alternation` ×1), and every way to make it green is forbidden here — fixing or
  disabling at the site forks a `tracked` row, and exempting the path widens an allowlist against a
  rule the 2026-08-22 eslint ruling names as having an incident behind it. **Do not record this in
  `kitAdopted`.** Lift the seven-site fix from CF-5 and pleks will take v2 the day it lands; the
  install and gate wiring were rehearsed on 2026-09-10 and backed out, and `--selftest` passed here
  before it was.
- **Not a pin, but canon should know it is coming:** the pleks-side guard for CF-4,
  `scripts/check-delivery-plan-tracked.mjs`, is already wired into `npm run check` and passes
  quietly while the row is held. It is **project-owned, not a kit candidate as written** — it exists
  because pleks cannot track its plan, which is a property of this repo. If CF-4's fix lands in
  `planVersions`, this check becomes redundant and should be deleted here rather than promoted.

---

## Filed

A pointer, not a restatement — the canon entry is the record, this is how to find it.

| # | Item | Filed as | Canon SHA |
|---|---|---|---|
| CF-1 | A fail-closed error's remediation text is a control, and codegen silently invalidates it — including, second-order, the TEST pinning the obsolete half of the message, which stayed green throughout | `LESSONS.md` **L-99** | `cf14e65` |
| CF-2 | A mandatory rotation whose trigger and whose test are independent is unsatisfiable on a seeded register | BRIEF-STANDARD **§2.4 v2** | `71cc38f` |
| CF-3 | A `tracked` kit file's header narrated the ADOPTING project's incident, so every other adopter read a false account of its own repo | `check-hook-registration` **v3**, provenance moved to the MANIFEST row's `why` | `8aee597` |
| — | The 2026-09-10 legacy triage: 13 lesson answers (10 dated, 3 reasoned `n/a:`), each attributed to this outbox at `9430df2a` | `LESSONS.md` `Applied:` lines | `fa7b92f` |
| — | Row `canon-findings` adopted — this file | `ledgers/projects.json` `kitAdopted` | `fa7b92f` |

**Corrections made on the way in, recorded here rather than only in canon:**

- **CF-3 was fixed as a PAIR, and the second half is the better half.** `check-kit-drift`'s R-5
  exists to catch exactly this class and had missed it, because it matched verb-then-subject only.
  Canon widened it to fire on *the adopter as subject* (`this session proved…`) and measured that it
  hits pleks's line and nothing else in the kit. Fixing the instance without the detector would have
  left the next occurrence to be found by hand, which is how this one was found.

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
