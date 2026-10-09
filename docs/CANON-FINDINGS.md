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

CF-7 to CF-20 dropped to Filed on 2026-10-08 — canon took all fourteen between `98f9636` and
`1ae8c14` (CF-12 was already closed by `77f1c58`). CF-21 and CF-22 followed the same day: canon took
them as bash-gate v17 at `b9f9979` and v18 at `58faa9a`. Their reports are not restated here; canon's
entries are the record.

### CF-23 · The kit's gate runs uncached ESLint serially in CI, when lint in parallel costs no coverage and halves the step

Stéan asked (2026-10-09) for this to become the standard commit and CI method on every project.

```
OBSERVED   pleks CI's "Lint & Typecheck" took ~6m, of which tsc + uncached serial ESLint were one 225s
           stretch. Linting is uncached in CI on purpose (a cold cache on a fresh runner only adds cost,
           and an uncached lint is what makes the local cache a speed choice rather than a coverage
           one), so the cache cannot be the lever. ESLint >= 9.34 has `--concurrency`: every file, every
           rule, split across worker threads.
COMMAND    measured on pleks @ deada755, uncached, ESLint 10.11, typed linting (projectService):
             npx eslint . --max-warnings 0                    → exit 0, 150s
             npx eslint . --max-warnings 0 --concurrency 4    → exit 0,  69s
             CI=1 node scripts/lint.mjs  (with the flag)      → exit 0,  69-83s
           planted `export const probe: any = 1` with workers on → exit 1, error reported (fails closed)
           warm local cache: serial 6-10s; with workers 12s, plus ESLint's own
             "ESLintPoorConcurrencyWarning: You may reduce or disable concurrency"
WHY IT IS  Nothing here is about pleks's stack beyond ESLint itself. Any repo that lints uncached in CI
CANON'S    pays the serial cost on every PR and every push, and the saving grows with the size of the
           repo. The two conditions that keep it safe, and the one that makes it slower, are about
           ESLint, not about this project.
SMALLEST   In the kit's lint runner, add `--concurrency min(4, os.availableParallelism())` on the
FIX        UNCACHED path only (CI, and a local fallback that distrusts its cache). Leave the warm cached
           path serial, because workers make it slower there.
           It must not break:
           (a) A rule that aggregates ACROSS files. Under workers, module-level state is per worker,
               so a rule reporting e.g. unused baseline entries would see only its share of the files
               and report entries as unused when they are not. Before adopting, audit each custom rule
               for module-level state that is written, not merely read.
           (b) Memory. Typed linting builds one TypeScript program per worker, so cap the count; 4
               matches GitHub's hosted runner.
           (c) ESLint < 9.34, where the flag does not exist. Gate on the version rather than assuming it.
           pleks's own implementation is scripts/lint.mjs (PR "ci: lint in parallel on the uncached
           path"), with the audit for (a) in its header.
```


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
| L-104 | 2026-10-08 | Carried by adopting canon `bash-gate` **v16** (`9b6b1b7`) in this PR (`chore/kit-bash-gate-v16`; the squash carries a new SHA, so the PR number is the stable name). The held gate (`98d8a9a0`) already denied most `$(…)` inside a quoted commit message. What it lacked, and v16 has, is the general form: masked text is asked where it is going before it is treated as prose. A sink heredoc stays data, while `bash <<X`, `cat <<X \| bash`, `source <(…)` and a substitution used as the command word all deny or ask. Measured on 380 payloads (`.handoff/bash-gate-v16/01-scout.md` §3): no executable shape *in that corpus* is looser than the held gate. The walker then found executable shapes *off* the corpus: a gated string handed to a runner outside canon's table, such as `cmd //c`, `wsl sh -c`, `find -exec sh -c` or `filter-branch`. They are CF-21, and a pleks-region backstop closes them, probed both ways. Two gaps remain. A runner in neither canon's table nor pleks's list is still read as an argument: the set is open. And a file written in one Bash call and run in a later one cannot be seen by any text gate; the held gate allows `sh x.sh` alone too. `scripts/check-bash-gate.mjs` asserts both interpreter-fed heredoc denies. |
| L-109 | n/a: pleks gives authority to no value that existed before the grant. Every value that opens something is minted for it at that moment, random, with an expiry or a revoke: `randomBytes(32)` hex application and step-up tokens, `randomUUID()` WO, signature and team-invite tokens, `gen_random_bytes` notice tokens, and HMAC-signed result links. A survey of every minting and accepting site found none that promotes an existing, inert value (an id, an email, a hash) into a credential (`.handoff/canon-lessons-l109/01-scout.md`, read at `826b5722`). **An adjacent finding, now fixed:** copies of those tokens were reaching Sentry in request URLs, contexts and browser frames. That is the lesson's "every copy already made", for a value that was a credential from the start. It was fixed in #362 and #363. | `.handoff/canon-lessons-l109/01-scout.md` · #362 · #363 |

**The 13 answers from the 2026-09-10 triage were lifted in `fa7b92f` and have dropped to Filed** —
canon's `LESSONS.md` is their record now, and this file does not restate it. **L-64, L-68, L-71, L-104 and
L-109 above are the five still awaiting canon**; all were given after the outbox was read at `9430df2a`.

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

**Evidence for L-31, 2026-09-14. Not an answer; L-31 is not open for pleks.** This is a fresh instance,
caught by the pre-PR walk of `fix/cron-digest-intermittent` (walker F1). The digest's reader was changed
to trust *recency*: "failing" meant the latest `cron_runs` row had failed. The writer drops rows
silently on exactly the failures being graded. Its insert's `{ error }` was never read, and postgrest-js
returns errors rather than throwing (`shouldThrowOnError = false`, and fetch rejections are converted
too), so the `catch` around the insert was dead code. The result: a job that failed once, succeeded
once and then stopped recording read "intermittent, has succeeded since" for a day. **The portable
shape is a change to what a reader trusts, not to what it reads:** the query and the rows were the
same before and after, so nothing in the diff pointed at the writer. Fixed in the same PR: the writer
reads and reports the error, and the reader treats a success older than the job's staleness limit as
stale. The walker's project surface carries it under step 3.

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

**Canon `37a030c` — six rows adopted 2026-10-08** (branch `chore/kit-canon-37a030c`; the PR number is
the stable name). One `apply-kit --carry-only --write` carried all six, so they ship as one kit PR:
`bash-gate@18` · `bash-gate-probe@18` (URGENT, below canon's floor; CF-22 taken at `58faa9a`) ·
`canon-inbox@5` · `canon-inbox-probe@6` (blindly CF-12: a backslash-escaped `git -C my\ repo push`
was read as no push) · `context-budget@2` · `check-context-budget@2` (life-therapy CF-9: the
measurements are attributed to pleks instead of "this repo"; the thresholds are unchanged).
- **Probe regions:**
  - **Dropped:** the `PROJECT_LOOSENED` declaration for "v17: an interpreter is known". v18 reads a
    script's quoted argument as run, so that case is no longer looser than the held gate, and canon
    removed it.
  - **Declared looser than the held gate:** two new v18 allows. A `tee >(wc -l)`, because wc runs
    nothing. A `node -e` whose act sits in a code comment, while v13's literal reading still denies
    one inside a string.
- **Measured:**
  - bash-gate probe: 471 pass, with 39 verdicts tightened;
  - `--against` the held gate (`98d8a9a0`): 40 looser, all declared, and 93 stricter;
  - `check-bash-gate.mjs`: 500 KB inputs decided in 326–563 ms;
  - canon-inbox probe: 29 held, 1 advisory;
  - `check-context-budget`: green;
  - `check-hook-registration`: green.
- **New cost, as canon declared it:** `node tools/x.mjs "<gated act>"` now gets that act's verdict.
- **Needs a restart (L-64)** for bash-gate v18.

**context-budget v1 + check-context-budget v1, canon `2c2bbb9` — adopted 2026-10-08** (branch
`chore/kit-context-budget-v1`; the PR number is the stable name).
- **Adopted:** `context-budget@1` · `check-context-budget@1`. Each is byte-identical to `git show
  2c2bbb9:kit/project-kit/<path>`, and the `apply-kit --carry-only` dry run then reports `= identical`
  for both. Canon's v1 *is* pleks's bytes at `4635041c` (nortiercupboards CF-4), plus four changes:
  a `@kit` header, the thresholds wrapped in a KIT:CONFIG region whose values are unchanged, a
  literal BOM in a regex written as `﻿`, and, in the check, `--hook`/`--settings` options and
  two regexes rewritten without backtracking. pleks takes it rather than pinning its own copy,
  because nothing pleks holds is lost.
- **An observation for L-64, not yet a finding.** On 2026-10-08, a session restarted with `main`'s
  `.claude/settings.json`, which had no `PostToolUse` entry. It then checked out
  `chore/kit-canon-inbox-v4`, which adds `hooks.PostToolUse` for canon-inbox. The session's very next
  `git push` printed canon-inbox's after-push line, as `PostToolUse:Bash hook additional context`.
  So a hook *registration* added mid-session took effect in that session. L-64 says hooks are read at
  session start. Either Claude Code re-reads `settings.json` when it changes, or a new event key is
  picked up while edits to an existing hook's file are not. One observation cannot tell those apart.
  Either way, "restart, then verify" stays the safe rule: what this shows is that a mid-session change
  *can* take effect, not that it always does.

**canon-inbox v4 + check-hook-registration v8, canon `9b6b1b7` — adopted 2026-10-08** (branch
`chore/kit-canon-inbox-v4`; the PR number is the stable name). One PR because the two interlock: v8
reads every `@event`/`@matcher` pair, and v4 declares a second one.
- **Adopted:** `canon-inbox@4` · `canon-inbox-probe@5` · `check-hook-registration@8`, carried by
  `apply-kit.mjs pleks --carry-only --write`. Outside KIT:CONFIG all three are byte-identical to
  `git show 9b6b1b7:<path>`. Inside it, pleks's v1 comment described a canon lookup the code dropped
  in v2, so it now carries canon's text and the file is byte-identical. Canon's working tree was dirty
  at the time (`M kit/project-kit/hooks/bash-gate.js`, `.probe.mjs`), and none of the carried files was.
- **After-push registration:** `hooks.PostToolUse`, matcher `Bash`, beside the existing
  `SessionStart`/`startup`. `check-hook-registration` is green, and its selftest includes v8's
  two-event probes. canon-inbox probe: 21 held, 1 advisory.
- **Run by hand:** after a `git push`, it printed the one line, with `--after-task` wording. After a
  `git status`, it printed nothing in 65 ms.
- **Observed, not a finding yet:** `bash <(echo git push)` is not read as a push. `segments` sees
  `<(echo` and `push)`. The hook's own header calls a miss "one reminder", so this goes no further.
- **The inbox line names `bash-gate.js`/`.probe.mjs` as "not canon's copy"**, because it compares
  them with canon's *working tree*, which has uncommitted bash-gate edits. This was corroborated
  once canon committed those edits as `b9f9979` (bash-gate v17): at `2c2bbb9`, with a clean tree, the
  line lists bash-gate as *behind* rather than "not canon's copy". It is the CF-19 shape again, on the
  inbox rather than the probe.
- **Finding for canon: check-hook-registration is one-directional, in v7 and in v8.** It checks that
  every declared `@event`/`@matcher` pair is registered, and never the reverse. A hook that declares
  only `SessionStart`/`startup` but is also registered under `PreToolUse`/`Bash` audits clean, so it
  runs as a blocking gate on a surface its header never claims. Walker reproduction:
  `.handoff/kit-canon-inbox-v4/01-walker.md` F3.
  Smallest fix: fail any registration whose (event, matcher) pair is not among the declared pairs.
  It must not break a hook that legitimately declares several pairs.

**bash-gate v17, canon `2c2bbb9` (merge of `b9f9979`) — adopted 2026-10-08** (branch
`chore/kit-bash-gate-v17`; the PR number is the stable name). Canon marked it URGENT: below canon's
floor, and to be taken before the next push.
- **Adopted:** `bash-gate@17` · `bash-gate-probe@17`, carried by `apply-kit.mjs pleks --carry-only
  --write` with pleks's regions. The same carry rewrote canon-inbox and check-hook-registration as
  well. Those three files were restored to `main` here because they are their own PR
  (`chore/kit-canon-inbox-v4`).
- **The CF-21 floor stays in pleks's regions.** It guarantees the held gate's verdict **only on
  commands that name a runner on its list**, so it does not hold the "no regression" bar in general.
  The walker found shapes that run a gated act, which the held gate denied and which v16, v17 and
  the floor all allow. They are filed as CF-22. **None of them is a regression against v16**: every
  v17 verdict the walker measured equals v16's. "39 looser, all declared" holds for the probe corpus
  only. Retiring the floor is a later call, made by measuring v17 alone `--against` the held gate.
- **Probe regions:**
  - **Two pleks cases tighten from ask to deny:** `npm pkg set` → `npm run` of a force push, and
    `cmd //c` with a `+refspec`. v17 reads the runner's string, and both acts deny when typed
    directly, so the runner form now matches.
  - **Two canon v17 cases are held stricter:** the `wsl` hard reset, under pleks's hard-reset deny;
    and a gh `--body` naming `wsl` with a push, which the floor gates. In the probe's spelling it
    asks. In ordinary spellings, such as `--body "wsl sh -c 'git push -f' …"`, it **denies**, and
    did under v16 too. This is the cost CF-21 declared; the workaround is `--body-file`.
  - **Costs that are new against pleks v16** (walker F4): an unknown program's quoted argument
    naming a gated act now gets that act's verdict. `npm test -- -t "git reset --hard is denied"`
    denies. `npm run test -- -t "git push asks"`, `pnpm vitest -t "…git push…"` and
    `tsx scripts/x.mts "git push origin main"` ask. Each matches the held gate's verdict. Canon's own
    example, `npx vitest -t "rejects rm -rf ~"`, was already denied under pleks v16, by the floor.
  - **Three canon v17 allows are declared looser than the held gate:** a `-m` message, `curl -d`
    data, and a node script's argv.
- **Measured:**
  - probe: 447 pass, with 39 verdicts tightened;
  - `--against` the held gate (`98d8a9a0`): 39 looser, all declared, and 91 stricter;
  - `check-bash-gate.mjs`: green, with a 500 KB runner input decided in about 380–450 ms. That
    shape holds no quoted `|` or `;`, and a 469 KB `npx "a | a | …"` takes about 2 s (CF-22).
- **Live check after the #364 restart** (bash-gate v16):
  - `cmd //c "git push --force …"` was denied, with the runner reason;
  - `gh pr merge` asked;
  - `sh x.sh` was allowed.
- **v17 needs its own restart (L-64).**

**canon-inbox (M-KIT-32), canon `b96db8b` — adopted 2026-10-05 in pleks `4105f18b`** (branch
`chore/kit-canon-inbox`; the squash onto `main` will carry a new SHA — the PR number is the stable name).
- **Adopted:** `canon-inbox@1` · `canon-inbox-probe@1`, both byte-identical to `git show b96db8b:<path>`.
  KIT:CONFIG left empty: canon is `../dev-standards`. Registered under `hooks.SessionStart`, matcher
  `startup`. The probe runs in `npm run check` (and is in `scripts/check-scope.mjs`'s map, which the
  gate requires of every step): 8/8, the live case naming `bash-gate v1→v9` in 144 ms.
- **Run by hand once against the real canon:** it reported 2 handovers addressed to pleks
  (`2026-10-03-pleks-pr-flow.md`, `2026-10-04-pleks-bash-gate-v9.md`) and canon `@ ff2314d (uncommitted)`.
- Kit upgrades from here are `node ../dev-standards/tools/apply-kit.mjs pleks --carry-only --write`, run
  from this checkout (Stéan, 2026-10-05) — which supersedes CLAUDE.md §1's "never run apply-kit --write"
  for that one invocation; CLAUDE.md is corrected in the same PR.

**Artefact-first agents, canon `a4ff0b5` — adopted 2026-09-30.** Canon's working tree was not clean
at the time (`M playbooks/4-AGENT-PIPELINES.md`); every kit byte was read with `git show a4ff0b5:<path>`.
- **Adopted:** `check-handoff-contract@6` (canon bytes; the only diff was scout joining its three sets) ·
  `agent-write-scope-config@2` (canon bytes outside KIT:CONFIG; inside, pleks's derivation note kept and
  `scout: [".handoff"]` present — probe: "✅ 145 agent-write-scope probes pass (31 derived from your 7
  agent(s) …)").
- **Spines** (`propagate-spines.mjs`): grounder v8 · census v11 · walker v9 · implementer v6 ·
  db-inspector v6 · **scout v1** created (canon frontmatter + `SPINE:scout v1` verbatim + pleks surface).
  crawler-doctrine stays v3 (pleks-local).
- ~~HELD — the three agent-brief-gate rows at v1~~ — superseded by the entry below the same day.

**Canon main `8993e2c` (merge of `77f1c58`) — adopted 2026-09-30.** Canon's checkout was on
`kit/batch-1` with a dirty tree; every byte was read with `git show 8993e2c:<path>`.
- **Adopted:** `agent-brief-gate@2` · `agent-brief-gate-config@1` · `agent-brief-gate-probe@1`, all
  byte-identical to canon (the config's default BRIEFED set is exactly pleks's six spined agents, and
  crawler-doctrine is absent as the config says it must be). Registered in `.claude/settings.json`
  (PreToolUse, `Agent|Task`); probe chained in `npm run check` → `✅ agent-brief-gate: 77 of 77 probes
  pass (6 briefed types, 2 redirects)`. **Canon: record the three in `kitAdopted`.**
- **Re-confirmed at `8993e2c`, no change needed:** `check-handoff-contract@6`, `agent-write-scope@6` and
  its probe are byte-identical (`diff -q`); `agent-write-scope-config@2` differs only inside KIT:CONFIG
  (pleks's derivation note).
- **Spines — no lag to pin.** `git diff --stat a4ff0b5 8993e2c -- kit/agents` is empty, and every
  pleks spine marker equals canon main's: grounder v8 · census v11 · walker v9 · implementer v6 ·
  db-inspector v6 · scout v1. The HOLD is therefore against batch 2, which is not on main (it sits
  uncommitted on canon's `kit/batch-1`). **No `kitPins` entry is owed today;** when batch 2 lands on
  main, pleks either re-propagates or files the pins then (review 2026-10-14, exit = batch 2 lands and
  pleks re-propagates).
- **`.claude/commands/build.md` — project-owned, patched locally** until canon's command kit (item 3)
  replaces it: step 3's grounder brief opens with the `pipeline: … · step … · artefact: …` line; step 5
  writes `.handoff/write-manifest.json` (`{"agent":"implementer","paths":[…]}`) before the implementer
  spawn.
- **Live check (the four yoros step-6 cases) — RUN 2026-10-01, all four pass**, see the batches 2 + 3 entry below: (a) scout,
  no artefact → refused; (b) `Explore` → refused, redirected to scout; (c) scout with a `pipeline:` line
  → reply is the block only, artefact well-formed; (d) `git status` clean outside `.handoff`. Results
  recorded there.

**Batch 1, canon `1476fb8` — adopted 2026-09-30.** Canon on `main` at `1476fb8`, `status --short` empty.
- **Adopted:** `check-handoff-contract@7` (canon bytes at `1476fb8`) · **`agent-distribution@2`**
  (canon bytes at `34bd4aa`, per the correction superseding v1). v2's `RECORD` default is empty; pleks
  sets `RECORD = "docs/EXPERIMENTS.md E4"` inside `KIT:CONFIG measure` — the only line changed.
- **BUDGETS markers v1** on all seven agent files via `propagate-spines.mjs .` → `7 agent file(s)
  rewritten, 0 target(s) absent`, +2/−0 lines each, spine versions unchanged (census v11 ·
  crawler-doctrine v3 · db-inspector v6 · grounder v8 · implementer v6 · scout v1 · walker v9).
- **The old pleks agent-distribution was replaced, not merged — no finding.** Canon's header names it
  as the source ("PORTED FROM pleks/scripts/agent-distribution.mjs"), and every behaviour it had is in
  canon's copy. The one surface change is the old positional `<dir>` argument becoming `--root <dir>`;
  nothing in `docs/` or `package.json` called the positional form (grep: zero hits), and `--selftest`,
  the only form on the gate, is unchanged.
- **Two pleks-local gate edits the adoption needed, neither a canon defect:** the old script's
  `sonarjs/no-unenclosed-multiline-block` suppression no longer fires on canon's copy, so it was
  pruned from `eslint-suppressions.json` (the list shrinks); and v7's selftest fixture mentions
  `MECHANISABLE`, so pleks's `check-mention-fixtures` registry classifies the script
  `searches: false` with that reason.
- **Step 3 (v7's >3 walker / implementer cap):** no task directory is over it — `63e-b0-sa-wallclock`
  holds 1 walker, the other two hold none. Nothing to decide.
- **v7 surfaced one undisposed Promote** (`63e-b0-sa-wallclock/02-walker.md`, F1). Filed as CF-13 (now in Filed);
  the line now reads `→ filed: docs/CANON-FINDINGS.md CF-13`, and `--clearable 63e-b0-sa-wallclock`
  exits 0.
- **`node scripts/agent-distribution.mjs`**, first line: `🤖 agent distribution — 10 run(s) across 6
  type(s)`. Trigger line: `⏱ re-measure trigger at 20 TOP-LEVEL runs under the current budgets: 0/20`.
  **Before the marker commit** it continued `NOT COUNTED — no committed marker to date them by: census,
  db-inspector, grounder, scout, walker`, as expected. **After it** (v2): `census 0 since 2026-09-30 ·
  walker 0 since 2026-09-30 · grounder 0 since 2026-09-30 · db-inspector 0 since 2026-09-30 · scout 0
  since 2026-09-30` — counted, and dated from the commit.

**Batches 2 + 3, canon `de8af9d` — adopted 2026-09-30** (handover `docs/handovers/2026-09-30-pleks.md`).
Canon was already on `main` at `4dd30bf`, clean, with `de8af9d` an ancestor — no pull was needed, so
nothing was written to canon's checkout. `git diff --stat de8af9d 4dd30bf` over `kit/agents`, the four
commands, both scripts and `propagate-spines.mjs` is empty (`4dd30bf` adds only the handovers), so the
working tree propagate-spines read IS `de8af9d` on every path taken.
- **Spines (batch 2):** `propagate-spines.mjs .` → `6 agent file(s) rewritten, 0 target(s) absent`;
  a second run rewrote 0. census v12 · walker v10 · grounder v9 · implementer v7 · db-inspector v7 ·
  scout v2, each carrying `SPINE:contract v1`; crawler-doctrine untouched (v3). Outside the spine
  regions the only change per file is one blank line — every `Project surface — pleks` section is
  intact (diffed with the spine blocks stripped).
- **Carry-forward (§1.3):** nothing to change. CLAUDE.md §7 restates neither the artefact's section
  order nor the return contract; its Access column says "one artefact", which `scratch/` under
  `.handoff/` does not contradict. Its `/build` example brief (`pipeline: /build 63E · step 1 of 3`)
  differs from canon's `P1 · step N of 3`; both pass agent-brief-gate, so it stays.
- **Commands (batch 3):** `walk@1` · `wrap@1` · `build@1` · `verify-spec@1`, canon bytes outside their
  regions. Regions filled from the old copies:
  - **walk** `range` `origin/main..HEAD`. `surfaces` holds only what walker v10's pleks section does
    not already say: the "false proof" framing and "uncommitted work called done, twice". Every
    shipped fail-open shape the old step 3 listed is already in the walker's project surface.
  - **wrap** `gate` `npm run check`. `push` states the pleks rule: approval-gated push with
    announcement, nominations filed BEFORE the push gate, and **`.handoff/` cleared once work is
    pushed, not merely committed** (the deliberate difference from canon's text, carried in the
    region as the handover suggested). `registers`: INDEX mints the slot after checking its registry
    (70H), the row goes in its band file, plus CURRENT.md (replace the head, 8 KB) and DEBT.md.
  - **build** `specs`, `preflight` (the four exits, M-106), `nonnegotiables` (the old step 4,
    verbatim).
  - **verify-spec** `resolve`, `instrument` (exits incl. MISCITED 5 with M-107/M-113), `unversioned`
    (`brief/`, ADDENDUM_02B), `ruler` (Stéan; CD drafts), `downstream` (M-106). **The pleks precedents
    canon stripped — 14B, ADDENDUM_04A, 14S row 9, 57I, SPEC_TIER_CHANGE — live in the `instrument`
    region** as a short list keyed to the rule each paid for.
- **Scripts:** `check-handoff-contract@8` · `check-commands@1` (canon bytes), wired as
  `node scripts/check-commands.mjs --selftest && node scripts/check-commands.mjs` in `npm run check`.
  `📜 commands: 4 command(s) against 8 spine block(s) across 7 agent(s) — none restates a spine, every
  spawn is briefed`. v8 on the existing `.handoff/`: `🤝 handoff-contract: 4 artefact(s) carry a
  well-formed contract block`.
- **Nothing canon's copies got wrong for pleks.** Canon: delete the 6 spinePins and the
  check-handoff-contract kitPin; record `check-commands`, `walk`, `wrap`, `build`, `verify-spec`.
- ~~Still owed: the four brief-gate live checks~~ — run 2026-10-01, below.

**Live check, the four yoros step-6 cases — RUN LIVE 2026-10-01, all four as canon expected.** Fresh
session started after #318 merged, so agent-brief-gate v2 and the batch-2 spines were both loaded
(L-64, E9); HEAD `03a689f7` on `main`, clean tree.
- **(a)** `scout`, brief `Where is SA_UTC_OFFSET declared?`, no path. Refused:
  `PreToolUse:Agent hook error: agent-brief-gate: the scout brief names no artefact
  (.handoff/<task-slug>/<NN>-scout.md). Re-brief it as: …`.
- **(b)** `Explore`, the same brief. Refused: `PreToolUse:Agent hook error: agent-brief-gate:
  "Explore" is not spawned in this project — it has no spine, so nothing sends its work to an
  artefact, and every run comes back inline. Spawn "scout" instead. …`.
- **(c)** `scout`, brief `pipeline: — · step — · artefact: .handoff/adopt-check/01-scout.md` plus
  "and what is its value?". It ran (3 tool uses) and **the reply was the fenced block only**:
  `Agent scout · — · step —` / `Verdict ✅ proceed — answered` / `Summary SA_UTC_OFFSET = "+02:00",
  declared at lib/dates/index.ts:34 (module-private const). Used only at lines 184 and 220 of the
  same file.` / `Artefact .handoff/adopt-check/01-scout.md` / `Promote none`. On disk, 1322 bytes:
  anchor `task=adopt-check · agent=scout · spine=scout v2 · contract=v1 · … · commit=03a689f7`, then
  `## Inputs`, `## Question`, `## Answer`, `## Read vs inferred`, `## Not found`, and **`## Contract`
  last**. `node scripts/check-handoff-contract.mjs` → `🤝 handoff-contract: 5 artefact(s) carry a
  well-formed contract block`, exit 0. The answer is right: `lib/dates/index.ts:34` is
  `const SA_UTC_OFFSET = "+02:00"`.
- **(d)** `git status --short --untracked-files=all`, filtered of `.handoff/`: empty.
- **One note, not a finding:** v8's L-41 line reports `.handoff/restart-verify/01-scout.md: 1 cited
  path(s) NOT MEASURED … docs/_scout-probe-DELETE-ME.md (no such file here)`. That artefact records
  the 2026-09-30 write-scope probe, whose whole point was that the file was never created; the
  check marks it unmeasured rather than failing, which is the right direction.

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

- **Adopted 2026-09-11 — canon: record in `kitAdopted`.** `check-hook-registration` v6,
  `check-handoff-contract` v5, `check-install-platform` v3 (fresh, wired into `npm run check`),
  `agent-write-scope` + probe v5, and the stamped spines census v10 · db-inspector v5 · grounder v7 ·
  implementer v5 · walker v8 — all in `d6220076`. `check-claude-md` v17 in `96de5fc8`, its ceiling
  renamed to `scripts/check-claude-md.ceiling.json`. agent-write-scope v5 was re-measured against
  v4 after CF-9 surfaced, on the rule most likely to share the regression — subagent commit denial,
  10 payloads including the wrapper and keyword shapes: **0 of 10 looser.**

- **Adopted 2026-09-11, later that day — canon: record in `kitAdopted`, and the pin
  `kitPins.pleks.check-hook-registration` (v6, review 2026-09-25) is overtaken.**
  `check-hook-registration` v7, from canon `98f9636`. It is a straight copy: the marker and two
  finding messages ("the dormant layer" → "the fallback layer") change, and no check moves. There
  is no KIT:CONFIG region in the diff. It was copied by hand, not applied, because `apply-kit`
  refuses a pinned row and this session does not write canon's ledger.

- **bash-gate v16, canon `9b6b1b7`: ADOPTED 2026-10-08 in this PR (`chore/kit-bash-gate-v16`). Canon:
  record `kitAdopted` for `bash-gate`, `bash-gate-config` and `bash-gate-probe` at v16, and drop the
  v9 pin below.** Every canon byte was read with `git -C <canon> show 9b6b1b7:kit/project-kit/hooks/<file>`.
  - **Candidate.** Canon's v16 bytes, with pleks's five hook regions and three probe regions spliced in from
    the v9/v15 candidates. The region markers match canon's. The config module is canon's, plus pleks's
    merge-message line.
  - **Probe.**
    - Plain v16: 356 pass.
    - Configured: 369 pass, 37 tightened `verdicts`. One was added: `$(echo git) reset --hard`, which
      canon asks on and pleks denies.
    - `--against` the held gate (`98d8a9a0`): **33 looser, all 33 declared, 84 stricter, exit 0.** The two
      looser cases new in v16 are both written-file shapes. One writes a file and only reads it. The
      other writes one file and runs a DIFFERENT one, which is the same class as the cross-call gap.
  - **CF-18 re-measured, 380 payloads** (`.handoff/bash-gate-v16/01-scout.md` §3). Looser than held: v9 56,
    v15 21, **v16 14, none executable in the corpus** (but see CF-21: off the corpus, runners outside
    canon's table were executable and looser; a pleks backstop closes them). v16 closed all seven
    executable shapes v15 left open:
    - process substitution into `source`, `.` or a shell;
    - `$(printf …)` used as the command word;
    - a file written and run in one command (`>x.sh && sh x.sh`, and the heredoc form);
    - `npx -c`.
    
    The extra variants also hold: `;` or newline between the write and the run, `tee`, `>>`, `chmod`+`./`,
    `npm exec -c`, `eval "$(printf …)"`, `xargs sh -c`, and `env`/`command`/`exec` prefixes. The 14
    still looser are prose, data, or commands that do not run. `git push -n` goes deny to ask, because it is
    `--dry-run`.
  - **The structural limit, accepted by Stéan 2026-10-08:** a file written in one Bash call and run in a
    later one. No text gate can see it, and the held gate allows `sh x.sh` alone too, so this is not a
    regression.
  - **`check-bash-gate.mjs`: the three corrections the v9 hold listed, plus two asserts.**
    - `git push -n` → ask (`--dry-run`).
    - The heredoc-line seam → allow (sink body), now asserted beside `bash <<X` and `cat <<X | bash`, which
      both deny.
    - 500 KB adversarial input → ask with the work-budget reason, never deny. Over budget, the gate
      fails to a prompt (213 ms); the assert names the reason, so an ask for any other cause fails it.
  - **Walker F1 → CF-21, closed in pleks's regions.** A command that names a runner canon does not read
    gets at least the held gate's verdict, with its rules ported verbatim. There is one rule in deny and
    one in ask. Four walks went into it, and the probes cover every payload they raised. One accepted
    cost is pinned by a probe: `npx` beside a commit body that names `rm -rf /` gets the held gate's
    false deny.
    - Configured probe: 418 pass.
    - `--against` held: 36 looser, all declared, 87 stricter. The three new looser cases are prose: a gh
      `--body` and a `-m` message that name a runner.
    - `check-bash-gate.mjs` decides a 500 KB runner input in about 300 ms.

    What stays open:
    - a runner that is in neither canon's table nor pleks's list;
    - expansions (variables, `$'…'`, braces), which the held gate did not read either;
    - a file written in one Bash call and run in a later one.
  - **Carried:** the probe in `npm run check` and `check-scope.mjs`. `gh pr merge` joins CLAUDE.md §3's
    hook-ask list. v16 asks on it, so §1's routine `--auto` arming prompts every time, which is intended.
  - **L-64:** the hook takes effect at the next session start. The adopting session verifies it after a
    restart.

- **⚠ (SUPERSEDED 2026-10-08 by the v16 adoption above) HELD at v9, 2026-10-04, on CF-18. Canon: do NOT record `kitAdopted`. Pin `bash-gate`,
  `bash-gate-config` and `bash-gate-probe` at pleks's held gate (`98d8a9a0`) against v9
  (`aa901cc`), reason CF-18, review when canon ships CF-18's fix or 2026-10-18, whichever comes
  first.**
  Handover: `docs/handovers/2026-10-04-pleks-bash-gate-v9.md`. Every byte was read with
  `git -C <canon> show aa901cc:kit/project-kit/hooks/<file>`.
  - **How far it got.** The configured candidate below was built, committed and walked on
    `chore/bash-gate-v9`. The walk refuted the "(c) none" line further down: about 25 executable
    shapes go deny/ask → allow outside the probe corpus (CF-18).
  - **Why hold, not backstop locally.** The handover's own rule says a looser verdict nobody can
    argue for is "a reason not to adopt yet". The defect is in canon's masking mechanism, not in
    pleks policy, and the handover says a better mechanism goes back as a finding: "don't fork it
    locally".
  - **Cost of holding is nil.** The held gate decides 500 KB in 204 ms, so CF-17 never affected
    pleks.
  - **What is kept.** The commit was undone before push. The candidate (hook, config, probe) is
    kept at `.handoff/bash-gate-v9/scratch/candidate/` as the starting point for re-adoption, which
    is a copy and a re-run, not a re-derivation.
  - **Re-adoption also carries:**
    - the three `check-bash-gate.mjs` corrections listed below;
    - the probe in `npm run check` and `check-scope.mjs`;
    - CLAUDE.md §3's hook-ask list gaining `gh pr merge`, which v9 asks on. §1's routine
      `gh pr merge --auto` will then prompt every time.

  **The measured candidate (for the record; the "(c) none" line is REFUTED by CF-18):**
  - **Hook bytes are canon's outside KIT:CONFIG.** All five hook regions are marked; the drift
    check's "0 of 5 config regions marked" would be answered.
  - **`seams`:** the five `PLEKS_*` variables (M-096).
  - **`deny`:** hard reset, and `--force-with-lease` treated as force. pleks's
    `check-bash-gate.mjs` asserts the latter, so it is closed by config, not declared looser.
  - **`ask`:** every push. Push detection uses a subcommand finder, so `git stash push` stays
    allowed and `git -C x push` asks. Also `.env`, `supabase db push|reset`, and `apply-prod.mjs`.
  - **`fallbacks`:** 15 rules, 8 twinned and 7 with a reason. `check-hook-registration` passes.
  - **Probe:** canon's bytes, with 30 tightened `verdicts` and 14 `loosened` entries, each with its
    reason.
  - **Measured, pleks `b41b189b` + this PR:**
    - plain v9 gives 203 pass;
    - configured: 216 pass;
    - `--against` the held gate (`98d8a9a0`) gives **19 looser, all 19 declared, 29 stricter, exit 0**;
    - unconfigured v9 against held gave 47 looser, 5 declared.
  - **Class (c), a real regression on an executable shape: none — REFUTED, see CF-18.** This was
    true only of the probe corpus. The 14 loosened entries are
    prose or data the held gate false-denied:
    - quoted strings;
    - commit-message text;
    - sink-heredoc bodies;
    - `echo` / `grep` / `gh --body` arguments;
    - a comment;
    - single-quoted `$(…)`.

    Interpreter-fed heredocs still deny: `bash <<X` and `cat <<X | bash`. On adoption, pleks asserts
    both in `check-bash-gate.mjs`, beside the flipped heredoc case.
  - **Two pleks assertions to correct on adoption, not loosen.** `git push -n` is `--dry-run`
    (`git push -h`), so it asks rather than denies (canon's declared CF-10 case). And the
    heredoc-line seam case is now `allow`, because v9 masks sink bodies only.
  - **The 15 CF-9 walk payloads:** none looser on the configured gate beyond those two.
  - **Observation:** commit messages that mention `.env` or `supabase db push` used to ask and now
    allow, because a project RegExp sees masked text. That fixes a held false-ask. It is outside the
    probe corpus, so no entry was needed.
  - **M-KIT-28 does not hold this row:** `npm run check`, lint included, is green on v9's bytes.
  - **L-64:** the hook takes effect at the next session start. The adopting session verifies it
    after a restart.
  - Detail: `.handoff/bash-gate-v9/01-scout.md` and `02-walker.md` (untracked).

- **⚠ (SUPERSEDED 2026-10-04 by the v9 hold above) HELD — row `bash-gate` (+ `bash-gate.config`, `bash-gate-probe`), at pleks's v4-lineage gate
  (`98d8a9a0`), against canon v7. Reason: CF-9 — v6 allowed 15 payloads the held gate denies or
  asks. Canon's v7 (`98f9636`) answers CF-9 and ships CF-10's differential as
  `bash-gate-probe --against <previous gate>`. Canon measured v7 against this held gate as
  **40 looser, 1 declared**. It says the other 39 are pleks's own policy or the held gate's old
  any-token false-denies, and that none is a CF-9 shape. That is canon's classification, not
  pleks's yet.**
  **How it moves (Stéan's relay, 2026-09-11).** Take v7 with its probe, then run the probe
  `--against` the held gate. pleks's two deliberate policies are the ask on **every** push and the
  hard-reset deny. Both go into the hook's own deny/ask lists (its KIT:CONFIG), so they stay stricter
  instead of being declared looser. Anything else v7 deliberately loosens is named in the probe's
  new `loosened` region. **Review: the move lands when `--against` exits 0 with every looser
  verdict either restored by those lists or named in `loosened`.** A looser verdict nobody can
  argue for blocks the move, just as CF-9's fifteen did.
  Adopted in `64e02a19`, reverted before merge; nothing of v6 reached `main`. `check-hook-registration`
  v6 was **silent** about the held gate's rules, and v7 still is — both measured, exit 0 with no per-rule lines — because the
  held gate carries no `@rule-fallbacks` marker, so per-rule reconciliation never engages. Its floors
  are the `@twin` lines at each rule, exactly as before v6. So the fallbacks region canon asked every
  project to answer is **unanswered here by design, not by oversight**. When it is
  re-adopted, the answered regions in `64e02a19` are the starting point (with CF-9's `.env` twin
  correction), not a fresh derivation.

- **⚠ Held, and canon owes the fix: M-KIT-28.** Canon's bytes still fail pleks's eslint. The
  suppressions this bullet used to list (`check-hook-registration` ×9, `check-handoff-contract` ×1)
  were pruned in `d6220076`, since the re-copied bytes no longer needed them. What remains are the
  four rule `off`s in `eslint.config.mjs`: remove them and lint shows 10 warnings, **6 of them in
  canon's own agent-write-scope v5 bytes** and 4 in pleks's own hooks. Any named row that a
  re-adoption would turn red stays **held** under M-KIT-28. This is not a version pin; it is the
  CF-5 class recurring on other rows, and CF-5's structural fix closes it: run the estate's own rule
  set over the kit before shipping a `tracked` row.

**Build in arcs, canon `574460f` — adopted 2026-10-03** (handover `docs/handovers/2026-10-03-pleks.md`,
`d235b18`; every kit byte read with `git -C <canon> show 574460f:<path>`).
- **Adopted:** `build` v2 · `verify-spec` v2 · `wrap` v2 — canon bytes outside KIT:CONFIG; every v1 region
  carried by name (build: specs, preflight, nonnegotiables · verify-spec: resolve, instrument, unversioned,
  ruler, downstream · wrap: gate, push, registers). No region was v1-only or v2-only. Canon may delete the
  three v1 pins.
- **Ruled, not carried — `build` · `preflight`:** STALE (1) mid-arc diffs the stamp's anchor against HEAD;
  staleness from THIS arc's merged PRs only is expected, stated, and cited by commit; any other commit is
  still a stop. UNRULED (3) mid-arc stops only under (a)–(c), otherwise builds to the tree and records the
  row under `Decided in build`. Both stay `decision-needed` outside an arc. The region says the exit code
  cannot tell arc staleness from rot, so `1` opens the question and never answers it.
- **Ruled, not carried — `verify-spec` · `downstream`:** the same in-arc exception, and the same sentence
  about the exit code.
- **`CLAUDE.md` line:** §1, ahead of "Session state" — *"pleks builds in arcs (`dev-standards/playbooks/
  5-ARCS.md`; ruled `brief/DECISIONS.md` 2026-10-03)…"*, naming (a)–(c), the default, `Decided in build`,
  the spec freeze and the queue at `brief/build/ARCS.md`.
- **Census:** re-label confirmed on disk 2026-10-03 — `01`–`05` all classify as EXISTS (wired) /
  DISCONNECTED / ABSENT; the one surviving `RUNS` is `01`'s re-label note itself. The arc order is Stéan's
  ruling, not derived from the old labels. Prod evidence: one row so far
  (`.handoff/auth-user-triggers-1003/01-db-inspector.md`, L2/T2 DISCONNECTED); the screening arc's
  db-inspector rows come when Arc 1 is walked.

**WITHDRAWN (2026-10-03) — "the `agent-write-scope` probe reads the LIVE manifest" was pleks's defect, not
canon's.** The two failing cases are in pleks's own `scripts/check-agent-write-scope.mjs`, which builds its
payloads with `cwd: process.cwd()`, so a leftover `.handoff/write-manifest.json` flipped its two no-manifest
cases from ask to deny. Canon's v6 kit probe (`.claude/hooks/agent-write-scope.probe.mjs`, installed here)
builds every manifest case in a temp directory and never had the bug. Canon classified this in its pleks
handover §5 (`e66a014`) and left pleks the choice: retire the local script, or give it temp directories.
**Chose the temp directory** for those two cases. The local script keeps cases the kit probe does not carry:
- the `.claude/handoff` move regression;
- crawler-doctrine's scope;
- the commit denial naming its alternative;
- `.handoff/` being gitignored.

Probed in both directions with a valid manifest planted: the old script failed 2 cases and the new one passes.
Nothing here is for canon to lift.

**KIT CANDIDATE (not a finding) — scoped commit gate, built 2026-10-02 from canon's handover
`docs/handovers/2026-10-02-pleks.md` (`88de00a`).** `scripts/check-scope.mjs` plus `pre-commit` →
`npm run check:scoped`. Push and CI are unchanged. It is not proposed for a kit row yet: canon's kit has
no git hooks, life-therapy's `.githooks` share only 8–17 lines per hook with pleks's, and yoros has
none. A git-hooks row needs those read side by side first. Report back once E18 (`docs/EXPERIMENTS.md`)
has a week of timings. Three things in it that would be portable:
- the map keyed by the chain's exact command strings, with a selftest that fails in both directions on
  drift;
- CONFIG checked BEFORE the map, because source globs match `*.config.ts` / `eslint.config.mjs`. The
  brief's "leave config unassigned" does not hold in any repo whose checkers glob `**/*.ts`;
- "inert" as an explicit list (`**/*.md`, `docs/**`), not "unmatched". Otherwise "unmatched → full"
  and "docs-only → universal" contradict each other, as the brief's §2 and §5 do read literally.

**PR flow, canon handover `2026-10-03-pleks-pr-flow.md` (`53aec5d`) — ruled 2026-10-03 (Stéan).**
- **Adopted, §2 items 1–3:** one PR open at a time, armed with `gh pr merge <n> --auto --squash` after its
  walk; one PR per arc step (docs, register and outbox edits ride in the next code PR; a migration, a
  same-day security fix and a kit adoption stay separate); commit per phase. Written into `CLAUDE.md` §1
  beside the arcs line.
- **One local narrowing:** a PR carrying migration SQL is NOT armed, because Stéan applies its DDL through
  the gate and so merges it himself. Auto-merge on such a PR would land code ahead of its schema.
- **Item 4 (pre-push vs CI)** stays deferred to E18's review on 2026-10-09. **Item 5** (`strict` off) not
  taken; whether a merge queue exists on this plan is unchecked.
- **Arc 1's numbers** go to E19 in `docs/EXPERIMENTS.md` and are reported here at arc end. First PR under
  the rule: #340.

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
| CF-6 | L-72's "a credential of this kind" has a narrow reading that leaves the threat open, and pleks took it | canon's own filing — relayed 2026-09-11 | `a108fd9` |
| CF-7 | a mass mechanical rewrite is verified by recomputing the transform, not by reading its hunks | `bash-gate` **v7** | `98f9636` |
| CF-8 | `bash-gate`'s protected-branch rule reads a merge's argument as its TARGET, but for `git merge` that argument is the SOURCE | `bash-gate` **v7** | `98f9636` |
| CF-9 | `bash-gate` v6 is WEAKER than the v4-lineage gate it replaces — 15 of 15 payloads go from deny/ask to allow | `bash-gate` **v7** | `98f9636` |
| CF-10 | the kit's adoption steps validate a REPLACEMENT gate with two suites that cannot see a regression | `bash-gate` **v7** (runs a differential) | `98f9636` |
| CF-11 | a literal `..` test is not a path-traversal guard wherever the path later passes through a URL parser | `bash-gate` **v8**; `LESSONS.md` **L-102** | `dc7b225` |
| CF-12 | `agent-brief-gate` at `a4ff0b5` fails the kit's own `check-hook-registration` v7 | already closed by `agent-brief-gate` **v2** (yoros CF-14); named in the `1ae8c14` triage | `77f1c58` |
| CF-13 | a validator's "already well-formed" pass-through branch skips the checks its main branch enforces | `LESSONS.md` **L-108** | `647fd38` |
| CF-14 | `agent-distribution` v2's selftest writes into the REAL repository when run from a hook in a linked worktree | `--selftest` drops inherited `GIT_*`; new gate member `check-kit-gitenv` | `1ae8c14` |
| CF-15 | NEW LESSON (CD, 2026-10-02): a precedent's shape is a pointer to check, not a shape to inherit | `LESSONS.md` **L-106** | `ae9c6fc` |
| CF-16 | NEW LESSON (CD, 2026-10-02): a stamp's meaning is whatever the LAST writer certified | `LESSONS.md` **L-105** | `02a8dd8` |
| CF-17 | `bash-gate` v7 and v8 run out of heap on a large command and print no decision | `bash-gate` **v9** | `3b1f113` |
| CF-18 | `bash-gate` v9 masks text as data without asking where the data goes, and some of it goes into a shell | `bash-gate` **v13** | `f6140b8` |
| CF-19 | canon-inbox-probe's live case makes a project's commit gate read canon's working tree | outbox triage | `1ae8c14` |
| CF-20 | `check-handoff-contract` v8 drops a cross-task input that shares the artefact's own filename | outbox triage | `1ae8c14` |
| CF-21 | bash-gate v16 read a quoted string only for runners in its own table, an open set | `bash-gate` **v17**, which inverts the rule: an unknown program's spaced and key=value arguments are read as commands | `b9f9979` |
| CF-22 | bash-gate v17's known programs (git bisect run / submodule foreach, bun x, node .bin, interpreter argv, gh alias --shell, tee >(sh)) run a shell anyway; a 470 KB quoted pipeline asked under the wrong reason | `bash-gate` **v18**, which reads each of them; failures in reading ask as `GATE_FAILED` | `58faa9a` |
| — | §2.4's sweep test measured enforcement, not force (entry below, verbatim as relayed 2026-09-30) | BRIEF-STANDARD §2.4 test; `check-brief` v9; `brief-kit/DECISIONS.md` | `bfed62c` |

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
- §2.4's sweep test measured enforcement, not force. The first literal re-sweep marked 21 of 51 live
  rows as not binding. Corrected 2026-09-30 (dev-standards bfed62c; check-brief v9 and
  brief-kit/DECISIONS.md now quote the corrected test). Also: the B-9 decisions/ admission was
  retracted the same day, because §2.4 already routed the archive to _ARCHIVE/.
