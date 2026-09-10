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

CF-4 and CF-5 dropped to Filed on 2026-09-10 — canon fixed them in `49ca9b9` and pleks adopted the
result the same day. Their reports are not restated here; canon's entry is the record.

### CF-6 · L-72's "a credential of this kind" has a narrow reading that leaves the threat open, and pleks took it

```
OBSERVED   L-72 says: authorise a credential-MINTING operation on the state of the ACCOUNT, never
           the session — and asks whether the account "already possesses a credential of this
           kind". Building M-127 against that sentence, pleks read "of this kind" as the
           credential's TYPE and counted passkeys. A TOTP-only account holds zero passkeys, so it
           read as a bootstrap account: a stolen AAL1 session was waved through both halves of the
           ceremony, minted a permanent passkey, and took an AAL2 grant with it
           (registration-verify → issuePasskeyAal → lib/auth/facts.ts) without ever knowing the
           TOTP secret. That is verbatim the attack the lesson exists to close, surviving a fix
           written from the lesson, reviewed, tested and committed.

COMMAND    Not a command — a walk of the fix's own commit (8bf4c593, now effb2481), reproduced by
           reading the guard against `proxy.ts`, which exempts /api/* from the manifest AAL2 gate,
           so both routes are reachable at AAL1. Ten tests were green throughout; every one of them
           asserted the passkey count, which was the thing that was wrong.

WHY IT IS  The bootstrap carve-out is unavoidable and the lesson is right to allow it: enrolling
CANON'S    requires being signed in, so the first credential cannot demand what every later one
           should. The defect is that the lesson does not say what the carve-out is keyed on, and
           the obvious reading is the wrong one. Portability: nothing here is about passkeys, or
           WebAuthn, or this stack. Any system with two or more assurance factors and a
           first-credential exemption has this shape, and the narrow reading gives every account
           holding a DIFFERENT second factor a free mint. The wider the factor menu, the larger the
           exposed population — pleks's was the older majority, since every agent route is
           requiresAal2 and TOTP shipped first.

SMALLEST   Add one clause to L-72: the bootstrap exemption is keyed on the ASSURANCE THE ACCOUNT
FIX        CAN OFFER, not on the credential's type — no factor of any kind → a bare session may
           mint; any factor at all → step up, satisfiable by any of them. Must not break the
           bootstrap case itself (an account with genuinely nothing must still enrol, or the
           lesson becomes an outage), and must not be read as requiring a same-type factor, which
           would lock a TOTP-only user out of ever adding a passkey.

           Two corollaries worth carrying with it, both learned here:
           - The check that says "no factor" must read EVERY factor source and fail closed on each
             — an unreadable count is not a zero. pleks reads both sources unconditionally and
             comments that the short-circuit is deliberately absent, because `if (passkeys === 0)`
             around the second read looks like an optimisation and silently restores the bug.
           - Gating the mint of ONE credential type while its sibling's mint stays ungated is not a
             fix: the ungated sibling is minted for free and then satisfies the gate. pleks filed
             that half as M-132 rather than claiming M-127 closed it.
```

---

## 2 · Lesson answers

From `node C:/dev/dev-standards/tools/check-lessons.mjs --emit-open pleks`. Read the entry from its
line in the ledger before answering — never the whole 240 KB file. A date is the day pleks's tree
came to carry the lesson, with the evidence that shows it; a reasoned `n/a:` closes an item as surely
as a date. **"Not yet" is not an answer** — leave the lesson off this table and it stays open, which
is what an unanswered lesson should look like.

| Lesson | Answer — `YYYY-MM-DD` or `n/a: <reason>` | Evidence — SHA, path or command |
| L-71 | 2026-09-10 | `scripts/check-mojibake.mjs`, in `npm run check` with its selftest, plus the repair of the four damaged migration files. **The rule's stated half was already carried** (`CLAUDE.md` §8: *"never author a pattern through a shell string… write the script to a file with an editor"*); what pleks lacked was **detection**, which a stated rule cannot supply for damage that predates it. **Two things worth sending back with the date.** First, the survey that opened this answer reported **436** sequences and was wrong by half — the real figure is **861** runs. It was a grep of the `Ã`/`â€`/`Â` families, and the dominant damage here is a doubly-encoded box rule whose third character is `U+0090`, an invisible C1 control that no family grep names. A blacklist of the mojibake you have already seen cannot find the mojibake you have not, and the number it produces looks like a measurement. Second, the detection that replaced it needs no list at all: re-encode a run to cp1252 and try to decode those bytes as strict UTF-8 — correct text cannot survive that, so success *is* the diagnosis. **That is portable and canon may want it**: it is arithmetic on codepoints, with no repo, stack or language in it. Evidence: repair verified by running it over all twelve migrations and confirming the eight undamaged files came out byte-identical, and by re-running the detector against `HEAD:` where it still reports all 861. |
| L-64 | 2026-09-10 | `CLAUDE.md` §3 now states it, in the gates section where a session reads about hooks rather than in a hooks appendix: a hook installed **or edited** mid-session is not loaded by that session; restart, then verify with a throwaway call that would previously have prompted. The extension beyond the lesson's wording is deliberate — the lesson says *installed*, and an edit to an already-registered hook is the same inert change with none of the "did I wire it up right?" suspicion attached. **Prose, not a mechanism, and correctly so:** no control in this repo can observe when a hook file was written relative to session start. |
| L-68 | 2026-09-10 | Given the same day it was raised, by the only person who could give it. `CLAUDE.md` §7 now carries: *"**STANDING AUTHORISATION — Stéan, 2026-09-10, from this date onwards.** Agents listed in the table above may be spawned without per-session approval; writes stay bounded by `.handoff/write-manifest.json`; nothing here authorises a push."* **What was wrong before is worth recording, because it is the lesson's whole shape:** the warrant was §7's agents table itself, which a session had to read as "the repo asking" — inference from a table's existence, re-derived from scratch by every session and attributable to nobody. The scope clause is not decoration: a bare dated signature would have authorised everything and nothing, and the next session would have gone back to inferring. It removes the question of whether spawning was permitted; it does not widen §5's write bound or §3's push gate, both of which still hold. |

**The 13 answers from the 2026-09-10 triage were lifted in `fa7b92f` and have dropped to Filed** —
canon's `LESSONS.md` is their record now, and this file does not restate it. **L-64, L-68 and L-71
above are the three still awaiting canon**; all were given after the outbox was read at `9430df2a`.

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

**The 5 open lessons below are NOT answers**, and that is the point — `--emit-open` should keep
reporting them until pleks carries them. They are listed so the next session knows the triage
finished rather than stopped. **⚠ Canon: do not lift this list.** None is an `Applied:` value; each
is an open item with an owner in this repo.

| Lesson | Why it is open | Queued as |
|---|---|---|
| L-22 | 3 sites mark work done without reading the send result — one flips a never-retry flag. Canon's entry records pleks had never been surveyed for this shape; this was that survey. | **M-128** |
| L-23 | 80-entry ESLint baselines carry no per-entry reason, and only one allowlist has a staleness check — which catches a deleted route, not a reclassified one. | **M-130** |
| L-63 | `claude-module-kind`'s verifier exists but runs only from canon, so emptying `.claude/package.json` leaves `npm run check` green. | **M-129** |
| L-67 | The file-header template in `CLAUDE.md` §9 is a second copy `check-file-headers.mjs` never reads. | **M-131** |
| L-72 | **Half carried, so still open — and the open half is the one that reopens the closed half.** The passkey mint is gated on account state as of `effb2481` (M-127, 2026-09-10). The TOTP mint is not: `supabase.auth.mfa.enroll` runs on the browser client with no server gate, so a stolen session mints a TOTP for free and then satisfies the passkey guard with it. A date here would claim a coverage pleks does not have. | **M-127** ✅ built · **M-132** open |

---

## 3 · Kit reports

Adoptions canon has to record in `kitAdopted`, and pins: a row deliberately behind canon, with the
row id, the version held, the reason, and a review date. A pin means *read and deliberately behind*,
never *exempt*, so the reason has to argue it.

- **Re-adopted — row `check-hook-registration`, v2 → v3, 2026-09-10.** CF-3's fix, taken the session
  it shipped. Copied from canon and verified byte-identical (`diff -q` → no output); `--selftest`
  green, live run green. Comment-only, −21/+18. **Canon: lift the v2 pin you were holding (review
  2026-09-24); it is not needed.** Record v3 in `kitAdopted`.

- **ADOPTED — row `delivery-report`, v2, 2026-09-10. The 2026-09-17 pin is LIFTED; do not carry it
  forward.** Canon shipped v2 at `49ca9b9` carrying both fixes, and pleks took it the same session.
  Copied byte-identical from `kit/project-kit/scripts/delivery-report.mjs` (`diff -q` → no output),
  landed here in `ef0e20c6`. **Canon: record v2 in `kitAdopted`.** Verified rather than assumed:
  `npx eslint scripts/delivery-report.mjs` exits **0** (CF-5 closed), `--selftest` green with the new
  probes naming the ignored-plan and linked-private-repo cases, and `planVersions` read directly to
  confirm it now resolves the plan's own repository. `--check` prints
  `⊘ delivery-report: no brief/build/90-release.md` and exits 0 — the honest answer for a project
  whose plan is not in this tree, and the shape CF-4 asked for.

  **Where the plan lives — RULED by Stéan, 2026-09-10: it stays in OneDrive, untracked.** Canon put
  the question to the owner rather than choosing it (v2 works either way), and this is the answer.
  `brief/` remains a gitignored OneDrive symlink; no second checkout is created for the plan.
  **What that forgoes, stated rather than left to be discovered:** the baseline rule moves a
  milestone date only on a recorded reason, and it reads that record from the plan's git history —
  so with no history to read, **the rule never fires, and a milestone date that slips with no
  recorded reason is invisible to the gate.** `--check`'s `⊘` is an honest abstention, not a pass,
  which is exactly why it is tolerable: the control says it did not measure, instead of reporting a
  ✅ it had not earned. The residual risk is carried by the owner, not by a mechanism.
  **Do not "fix" this by tracking the plan here: this repo is PUBLIC** and the plan carries contract
  value, day rate and budgets — irreversibly, once pushed. A private repo outside OneDrive
  (canon's L-32 / DELIVERY-STANDARD §4.1 shape) remains the only route that would restore the rule,
  and it was considered and declined today; re-opening it needs a new ruling, not a re-reading of
  this one.

  `scripts/check-delivery-plan-tracked.mjs` was **deleted** in the same commit. It was the
  project-owned stand-in for CF-4 and became redundant the moment the fix landed in `planVersions`;
  two controls answering one question is one control with a hole. It was never a kit candidate.

  **Two corrections canon made to this project's report, recorded so the next session does not
  re-send the old ones:**
  - **Six lint problems, not seven** — `sonarjs/super-linear-regex` ×5 and
    `single-character-alternation` ×1. The seven in CF-5's COMMAND block counted an ellipsised line
    twice. Same class as CF-2's 51-not-52: the argument never rested on the number, so nothing in
    the reasoning pushed back on it.
  - **CF-5's suggested fix would have broken the parse.** It proposed `\s` → `[ \t]` throughout, on
    the reasoning that these regexes parse one already-split line. A plan line typed with a
    non-breaking space then stops matching — a silently dropped row, which is worse than the lint
    error. v2 keeps `\s` and is linear by construction instead, with a probe pinning the NBSP case.
    **The narrowest fix I could see was narrower than the correct one**, and the lint rule was
    pointing at backtracking, not at the character class.

- **⚠ Held, and canon owes the fix: M-KIT-28.** Canon's bytes still fail pleks's eslint on six other
  kit rows — 21 problems in all. Two suppressions stay in place on canon's files until clean versions
  ship (`check-hook-registration` ×9, `check-handoff-contract` ×1), and any of the six named rows
  that a re-adoption would turn red is **held**, citing M-KIT-28. This is not a pin against a
  version; it is the CF-5 class recurring on other rows, and the structural half of CF-5's fix —
  run the estate's own rule set over the kit before shipping a `tracked` row — is what closes it.

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
| CF-4 | The baseline rule read `git log` from the PROJECT's repo, so an untracked plan produced "1 version(s) read" and a ✅ — a control reporting on a file whose history it had never seen | `delivery-report` **v2**, `planVersions` resolves the plan's own repository (`realpathSync` → `rev-parse --show-toplevel` → `ls-files --error-unmatch` → `check-ignore`) | `49ca9b9` |
| CF-5 | `tracked` kit mode offered an adopter whose gate rejects canon's bytes no legal move — fix, disable and exempt are all forks | `kit/INSTALL.md`: hold the row. Plus the six sites repaired in `delivery-report` v2 | `49ca9b9` |

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
- **CF-5's two corrections — six problems not seven, and the proposed `[ \t]` fix would have broken
  the parse on a non-breaking space — are written up in §3 beside the adoption**, where the next
  session reading the kit report will meet them. Not restated here.
- §2.4 v2 is **mechanised** (`check-brief.mjs`, +175 lines in `71cc38f`). pleks does **not** run
  `check-brief.mjs`, so its `DECISIONS.md` conformance is unenforced here and held by hand — the
  sweep line was written to v2's exact shape rather than approximated.
