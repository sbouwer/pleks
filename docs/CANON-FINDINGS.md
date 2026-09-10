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
|---|---|---|
| L-14 | 2026-08-21 | `.claude/hooks/bash-gate.js` matches the **resolved** target, not its spelling: it token-matches (find `git`, then `push`, then a force flag as a standalone token anywhere after), so `git -C /repo push --force`, an absolute path, an env prefix and an alias are all caught. `CLAUDE.md:174-182` states the appearance-vs-resolved split as the reason the settings twin is only a partial floor. The by-reference case is reasoned through explicitly at M-096: the `.githooks` probe seam is denied **as a shell assignment at command position**, and `check-git-hooks.mjs` — which supplies the same seam through `spawnSync`'s `env` object, never a shell string — is therefore not matched and needs no exemption. Probes in `scripts/check-bash-gate.mjs` (`fd818c0c`), three directions. |
| L-15 | 2026-08-21 | The serial-layer model is stated correctly and from measurement, not reasoned: `CLAUDE.md:174-182` — *"The hook is the control; the twin is a partial floor for canonical forms"*, and *"hook-dead is not 'degraded but complete'"*. Mechanised in `scripts/check-hook-registration.mjs`, which takes the set difference **deliberately NOT equal-or-stronger**: *"settings speaks in prefix-globs and a hook in separator-aware regex, so ask is the floor; absent is the violation."* **Boundary, stated rather than papered over:** the dormant layer is enforced by the harness, not by this repo, so pleks cannot probe the twin with the hook disabled from a script — that A/B stays a human act, as it was in life-therapy. |
| L-16 | 2026-08-20 | `scripts/check-hook-registration.mjs`, wired into `npm run check` (verified: `package.json`'s `check` chain contains it, alongside `check-bash-gate`, `check-mcp-ddl-gate` and `check-git-hooks`). Each hook rule declares `// @twin <settings pattern>` at the rule it implements or `// @no-twin <reason>`; the audit takes the set difference against `permissions.deny ∪ ask` and fails on a rule with neither. 6 `@twin` markers in `bash-gate.js`, 11 in `mcp-ddl-gate.js`. Landed `fd818c0c` (PR #257). |
| L-17 | 2026-08-21 | `docs/EXPERIMENTS.md`, `ac3c9456` (PR #258). Both halves of the general form are carried and were paid for: **never report on a signal you cannot observe** — E12's *"The prompt this run DID raise, reported by Stéan mid-turn and invisible to every instrument"*, with the negative confirmed by search (*"NO transcript record"*), so the human supplied what no instrument could see; and **run it twice** generalised past the corollary in E13 — *"MEASURE ACROSS SESSIONS BEFORE BELIEVING A CHANNEL IDENTIFICATION"*, after E13 was refuted twice and E14's primary result was **withdrawn as confounded** rather than kept. The transcription rule reaches agents at `CLAUDE.md:591`: *"Every agent claim about the tree carries the SHA it observed."* |
| L-18 | 2026-08-20 | Three measured refusals, each carrying its number beside the rule. `CLAUDE.md:178-182` — a narrower `Bash(git -C*)` twin *"considered and rejected on measurement: `git -C` appears 112 times in this machine's transcripts, almost all read-only, so the twin would fire constantly and be gone within a day."* `docs/MECHANISABLE.md` **M-004** — the rest of "audit every state change" is not built because those tables are dominated by routine traffic; the classification of every site lives in the entry. `CLAUDE.md:229` — *"A check's first number is a hypothesis, not a finding"*, from a migration check whose first run reported 27 violations of which 23 were legitimate. And the refusal to publish a number at all: `CLAUDE.md:573`, a policy-pairing scan that reported 328, then 29, then 21, *"left unmeasured rather than publish a fourth number."* |
| L-33 | `n/a:` **no shared normaliser exists.** The lesson's subject is a pre-processing helper shared across checks that strips comments and blanks string literals, so a check hunting something that only appears inside quotes can never fire. pleks has no such helper: `grep -rn "blankLiterals\|stripStringLiterals" scripts/` returns **0 hits**, and `stripComments` is implemented independently twice (`scripts/check-migration-integrity.mjs`, `scripts/check-import-fields.mjs`) — neither touches literals, and neither is shared. Duplication is its own smell but it is not this failure: there is no single normaliser whose defect propagates to many checks. | `grep -rn "blankLiterals\|stripStringLiterals" scripts/` → 0. **Boundary, recorded rather than folded into the n/a:** the entry's second corollary (state the population in the check's own output) is only partly held — `route-census.mjs` and `check-register-integrity.mjs` state their counts, `scripts/check-legal-localhost.mjs` prints pass/fail with no file count, so an emptied scan directory would look identical to a clean sweep. |
| L-62 | 2026-08-21 | pleks holds 6 `@kit`-tagged adoptions; the other 5 were read line-by-line and none states canon's incidental design as a requirement (`agent-write-scope.probe.mjs:40` cites life-therapy as motivating history, not an imposed rule; `agent-write-scope.config.mjs:36` names canon's `kit/agents/` as provenance and pleks's own 6 agent files independently match those defaults). **The one file that does is canon's own and is filed above as CF-3**, not fixable here — the row is `tracked`. pleks also **paid** this lesson's cost and closed it: `crawler-doctrine` carried a dead `.claude/crawlers` write grant — an over-grant inherited from prose rather than measured against the tree — removed in `8672062b` (PR #293). |
| L-65 | `n/a:` **pleks is not greenfield and the deferral this describes never happened here.** The lesson is about deciding, with no code yet, that hooks/`CLAUDE.md`/agents must wait for a scaffold. pleks's controls were built against a live codebase throughout. `grep -rn "nothing to govern\|no codebase\|once there is" CLAUDE.md docs/` → **0 hits**; the `defer` hits that exist are unrelated (CD-ruling deference, annual pricing, subscription purge). | `grep -rn "nothing to govern\|no codebase" CLAUDE.md docs/` → 0. |
| L-66 | 2026-08-30 | pleks is registered in canon's `ledgers/projects.json:11` and every agent it declares exists: 6 files in `.claude/agents/`, all spine-verified. `node C:/dev/dev-standards/tools/check-agent-spines.mjs` → **18 verified, 0 pinned, 6 not-visible — and all 6 "not visible" name dev-standards' own copies, none names pleks.** The false-absence this lesson describes is therefore not being reported here. **Separate, and not this lesson's defect:** `CLAUDE.md` §7's table lists 5 agents and omits `crawler-doctrine`, which exists and is wired to `npm run crawl` — a doc-completeness gap, logged here so it is not mistaken for an L-66 hit later. |
| L-69 | 2026-08-21 | Same rule, applied to the direction pleks sits on. `CLAUDE.md` §1: *"`C:\dev\dev-standards` IS READ-ONLY FROM THIS SESSION"*, with the reason given as the 2026-09-09 incident — two project sessions fixing defects inside canon while canon's own gate ran, leaving that gate's result **unattributable**, which the file names as worse than wrong. The outbox (`docs/CANON-FINDINGS.md`) is the constructive half: a change landing in canon is made by a canon session, from a report written here. |
| L-70 | 2026-08-21 | All four tier-0 categories are present **and wired into the chain**, not merely available — verified by reading `package.json`'s `check` script: type errors `tsc --noEmit`, lint `scripts/lint.mjs`, dead code `scripts/check-knip-floor.mjs`, circular imports `scripts/check-import-cycles.mjs`. The last two also carry `--selftest` invocations in the same chain, which is the half the lesson says a scaffold never supplies. |
| L-73 | `n/a:` **no pleks check derives its population from build output.** Swept every check that enforces a rule about user-facing surfaces — `check-legal-localhost.mjs`, `check-marketing-consistency.mjs`, `check-retention-claims.mts`, `security/route-census.mjs`, `security/server-action-census.mjs` — and all derive from **source**, not from `.next/`. CLAUDE.md's "derived from disk" means the source tree: Category 8 walks `app/api/**` route files and Category 15 walks `"use server"` files, so a dynamic/on-demand route is as visible to them as a static one. A repo-wide grep for build-artefact paths returns 4 hits, all of them **exclusions**. | `grep -rn "\.next/\|prerender-manifest\|app-path-routes-manifest" scripts/` → 4 hits, all exclusions. |
| L-24 | 2026-09-10 | pleks acquired its first generated-artefact pair in `1db5c871` (PR #296) — `lib/dates/saHolidays.json` from `scripts/codegen/gen-sa-holidays.mts` — and did not use the sibling as the correctness check. The byte-for-byte comparison (`lib/dates/saHolidayDerivation.test.ts:38`) is scoped to the one question a common-ancestor diff can answer, **hand-editing**, and its limit is tested rather than assumed: the next case, *"that diff has TEETH — a single changed row makes the render differ"*, exists because `committed === expected` *"would pass just as happily if the renderer emitted a constant, or if both sides were empty."* Correctness is verified against **ground truth**: `lib/dates/holidayAudit.ts` + the sentinel read Nager.Date and the gov.za notices RSS as external read-only witnesses, and `app/api/cron/holiday-sentinel/route.ts:12` records where that witness is known to be weaker than the table rather than treating agreement as proof. |

| L-68 | 2026-09-10 | Given the same day it was raised, by the only person who could give it. `CLAUDE.md` §7 now carries: *"**STANDING AUTHORISATION — Stéan, 2026-09-10, from this date onwards.** Agents listed in the table above may be spawned without per-session approval; writes stay bounded by `.handoff/write-manifest.json`; nothing here authorises a push."* **What was wrong before is worth recording, because it is the lesson's whole shape:** the warrant was §7's agents table itself, which a session had to read as "the repo asking" — inference from a table's existence, re-derived from scratch by every session and attributable to nobody. The scope clause is not decoration: a bare dated signature would have authorised everything and nothing, and the next session would have gone back to inferring. It removes the question of whether spawning was permitted; it does not widen §5's write bound or §3's push gate, both of which still hold. |

**The 2026-09-10 triage answered 14 of the 21 open lessons. The other 7 are NOT in the table above,
and that is the point** — `--emit-open` should keep reporting them until pleks carries them. They are
listed here so the next session knows the triage finished rather than stopped, and so nobody
re-derives the measurement. **⚠ Canon: do not lift this list.** None of these is an `Applied:` value;
each is an open item with an owner in this repo.

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

- **Adopted — row `canon-findings`.** This file. pleks wrote the first one on 2026-09-10 before the
  row existed; canon turned it into a template row the same day, and this is the merge back onto that
  shape — §2 and §3 added, §1 and **Filed** carried across unchanged with their corrections. Record
  it in `kitAdopted`.

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
