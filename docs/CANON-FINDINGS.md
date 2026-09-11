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

### CF-7 · a mass mechanical rewrite is verified by recomputing the transform, not by reading its hunks

```
OBSERVED   A commit repaired 861 mojibake runs across four live, amend-forward SQL migration files
           (~1,360 changed lines). The reviewable question — "did any repaired byte change SQL
           SEMANTICS rather than rendering?" — is not answerable by reading hunks: at that volume
           every hunk looks like the last one, attention degrades, and the one hunk that matters is
           indistinguishable from the 860 that do not. Sampling answers a weaker question than the
           one asked, and says so only if the reviewer is honest about the sample size.

COMMAND    Instead of reading the diff, the reviewer reimplemented the cp1252 inverse independently
           and recomputed `repair(origin/main)` for all four files, diffing the result against what
           was committed:
             005, 006, 012 → byte-identical to the commit
             010           → sole residual is the 45-line tail added by a later commit in the range
           Then, enumerating all 861 repairs BY DISTINCT OUTPUT rather than by site: every one
           resolved to a box rule, dash, section sign, arrow, middot, bullet, ellipsis, times,
           divide, approx or c-cedilla — **none produced a letter, digit or identifier character**.
           Codepoint sets were compared against pre-corruption blobs to show nothing was lost.

WHY IT IS  Nothing here is about mojibake, SQL, or this stack. The shape is: a mechanical transform
CANON'S    applied at a volume no reviewer can read, where the review question is "did the transform
           do only what it claims". Codemods, formatter migrations, mass renames, encoding repairs
           and lint --fix sweeps all have it, and they are exactly the changes that get waved through
           because the diff is enormous and boring. The method generalises as three moves:
           (1) reimplement the transform independently and diff against the commit — this catches a
           hand-edit smuggled into a mechanical change, which is the actual risk;
           (2) enumerate outputs by DISTINCT VALUE, not by site — 861 sites collapse to ~11 classes,
           which a human can genuinely check;
           (3) assert a property over the output class ("no repair produced an identifier character")
           rather than spot-checking instances.
           Move (2) is what makes it cheap, and it is the one nobody reaches for unprompted.

SMALLEST   Add it to the ledger as a review method, keyed on the trigger rather than the subject:
FIX        a diff whose changes are mechanically generated and too numerous to read is reviewed by
           recomputing the transform and diffing, and by enumerating distinct outputs — never by
           sampling hunks. Must not become "all large diffs need a reimplementation": the trigger is
           that the change claims to be MECHANICAL, which is what makes it independently recomputable
           in the first place. A large hand-written diff has no transform to recompute and still
           needs reading.
```

---

### CF-8 · `bash-gate`'s protected-branch rule reads a merge's argument as its TARGET, but for `git merge` that argument is the SOURCE

```
OBSERVED   bash-gate v6 asks on `git merge main` run from a feature branch — the single most common
           operation there, and one that does not touch the protected branch at all. `git push
           origin main` targets main; `git merge main` merges main INTO the current branch. The rule
           applies one argument test to both verbs, and the direction is inverted for one of them.

COMMAND    $ node .claude/hooks/bash-gate.js   # payloads piped as PreToolUse JSON
           ask   | "git merge -n main"      | bash-gate: this targets `main` …
           ask   | "git merge main"         | bash-gate: this targets `main` …
           ask   | "git merge origin/main"  | bash-gate: this targets `main` …
           allow | "git merge feature-x"    | bash-gate: allowed — no gate matched
           $ git branch --show-current
           chore/kit-adopt-2026-09-11          # HEAD was NOT the protected branch for any of these

           The NAMED arm of `targetsProtectedBranch`, verbatim:

             if ((args.includes("push") || args.includes("merge")) &&
               args.some((t) => t === b || t === `origin/${b}` || t === `refs/heads/${b}` ||
                                t.endsWith(`:${b}`))) return true;

           Its comment reads "NAMED: v4's test, kept whole. Every command it asked on still asks." —
           so the conflation is INHERITED from v4 and preserved for continuity, not re-derived. That
           is also why the BY REFERENCE arm below it, which already reads HEAD, never gets the
           chance to answer: the NAMED arm returns true first.

WHY IT IS  The direction of `git merge` is a property of git, not of this repository. On any project
CANON'S    with a protected branch and feature branches, `git merge <protected>` is how a branch is
           brought up to date, and this rule prompts on every one of them. That is the failure mode
           canon's own kit names twice over: a gate that fires on ordinary work is one people learn
           to wave through, and pleks's CLAUDE.md §3 rejected a `Bash(git -C*)` twin on exactly this
           measurement. A rule that is right for `push` and inverted for `merge` also reads as
           covered, because the finding it produces is well-formed and names a real branch.
           The machinery to fix it is already present and already trusted: `headBranch()` and the
           BY REFERENCE arm exist, and the "HEAD on protected" cases prove they work.

SMALLEST   Split the NAMED arm by verb. For `push`, keep the argument test unchanged — every command
FIX        it asks on today still asks. For `merge`, the protected branch is the DESTINATION, so the
           test is `headBranch() === b`, which is what the BY REFERENCE arm would have answered had
           it been reached. `git merge main` from a feature branch then allows; `git merge feature-x`
           run while ON main still asks, which is the case that actually matters and which the
           current rule MISSES — so this narrows one direction and widens the other.
           Must not break: the four `+refspec` cases and the `endsWith(":"+b)` push spellings, none
           of which involve `merge`. A probe both directions belongs with it — `git merge <protected>`
           from a working branch must ALLOW, and `git merge <anything>` from the protected branch
           must ASK — because the second half is what no existing case asserts.

           NOT PATCHED LOCALLY, deliberately. The file is canon's outside its KIT:CONFIG regions,
           and the error is in the safe direction (an extra prompt, never a missed gate).
           UPDATE 2026-09-11: pleks does not run v6 at all — the adoption was reverted before
           merge for CF-9 — so this finding is now reported against canon's file only. The corpus
           case that recorded it (`git merge -n main` → `ask`) went back to `allow` with the
           revert, and must return with CF-8 named at the site when v6 is re-adopted.
```

---

### CF-9 · `bash-gate` v6 is WEAKER than the v4-lineage gate it replaces — 15 of 15 payloads go from deny/ask to allow

```
OBSERVED   Three mechanisms new in v6 each let through a command the previous gate refused. pleks
           adopted v6 in `64e02a19` on the strength of its own probe (132 green) and the project
           corpus (green), then reverted it before merge when the pre-merge walk found the gap.

COMMAND    $ node diff-gates.mjs    # scratchpad; same payload through two gates, one run
           # OLD = .claude/hooks/bash-gate.js at pleks 98d8a9a0 (v4 lineage + local rules)
           # NEW = canon kit/project-kit/hooks/bash-gate.js v6 at dev-standards 2e79fdb, UNMODIFIED
           WEAKER  old=deny  new=allow  ① if/then
           WEAKER  old=deny  new=allow  ① bash -c
           WEAKER  old=deny  new=allow  ① eval
           WEAKER  old=deny  new=allow  ① timeout wrapper
           WEAKER  old=deny  new=allow  ① xargs
           WEAKER  old=deny  new=allow  ① sh -c rm
           WEAKER  old=deny  new=allow  ① sudo -E rm
           WEAKER  old=deny  new=allow  ① bash -c no-verify
           WEAKER  old=deny  new=allow  ① then hard reset
           WEAKER  old=ask   new=allow  ① bash -c plain push (ask)
           WEAKER  old=deny  new=allow  ② here-string <<<
           WEAKER  old=deny  new=allow  ② heredoc piped to sh
           WEAKER  old=ask   new=allow  ② unquoted heredoc $()
           WEAKER  old=deny  new=allow  ③ -m mask hides rm
           WEAKER  old=deny  new=allow  ③ -m mask hides push
           15 of 15 payloads: new gate weaker than old.
           The same run against pleks's v6 WITH its regions filled (64e02a19): 15 of 15. Against
           the reverted tree: 0 of 15. So the defect is canon's file, not pleks's region values.
           (Payloads assemble their lethal tokens from parts; the shapes, with <P> standing for a
           force-push and <R> for `rm -rf /*`: `if true; then <P>; fi` · `bash -c "<P>"` ·
           `eval "<P>"` · `timeout 60 <P>` · `echo x | xargs <P>` · `sh -c '<R>'` ·
           `sudo -E <R>` · `cat <<< EOF⏎<P>⏎EOF` · `cat <<'EOF' | sh⏎<P>⏎EOF` ·
           `cat <<EOF⏎$(<P>)⏎EOF` · `echo -m 'a\' && <R> && echo 'b'`.)

           ① COMMAND POSITION. `atCommand` asks whether a name is the segment's command WORD, via
             `commandWordIndex`: skip `VAR=x` and the WRAPPERS set, take the next token. The
             previous gate's `commandIndex` found the name at ANY token of the segment. So every
             shell keyword (`then`, `do`, `!`), every command-runner not in WRAPPERS (`bash -c`,
             `sh -c`, `eval`, `xargs`, `timeout`, `winpty`), and every WRAPPER given a flag
             (`sudo -E`, `env -i`, `nice -n 5` — the skip stops at the flag, which becomes the
             "command word") moves the real command off position 0 and out of every rule's sight.
           ② HEREDOC MASKING. `maskSinkHeredocs` blanks the body of a heredoc whose receiver is in
             HEREDOC_SINKS, and it runs inside `segments()`, before every rule. Its opener regex
             `<<-?\s*(['"]?)([A-Za-z_]\w*)\1` also matches the last two characters of `<<<`, so a
             here-string's following lines are masked though bash executes them; the receiver is
             read BEFORE `<<`, so `cat <<'EOF' | sh` masks a body that `sh` runs; and an unquoted
             delimiter's body still expands `$(…)`, which the mask discards.
           ③ MESSAGE MASK. `maskMessageText` wraps the whole command before `segments()` (line
             634), so it too precedes every rule. It honours `\` as an escape inside SINGLE
             quotes, where bash does not: `'a\'` never closes, and the mask runs to the next `'`,
             blanking ` && rm -rf /* && echo `.

WHY IT IS  Nothing here is pleks-specific: all three are bash semantics read wrongly, and the run
CANON'S    above used canon's bytes. Every adopter that re-copies v6 swaps a gate that caught these
           for one that allows them, and its probe suite stays green through the swap — v6's probe
           asserts v6's intended shapes, and a project corpus asserts the shapes its previous gate
           was written for, so neither contains a case that exercises the new mechanisms. This is
           the failure CLAUDE.md §6 records as the 2026-08-19 scar ("a probe suite confirms the
           cases you thought of"), now in the gate every other rule depends on.

SMALLEST   ① Keep `atCommand` for rules that need the command word (it is what makes `echo 'rm
FIX           -rf /'` prose), but have the DENY rules — force-push, hard reset, rm-on-root,
             --no-verify, the seam assignments — also match the name at ANY token of the segment,
             as the previous gate did, accepting its documented false-deny on mentions. Opening a
             segment at `then`/`do`/`else`/`!` and at `-c`'s argument is not enough on its own:
             the runner list is open-ended, and a deny rule must fail toward deny.
           ② Refuse `<<<` explicitly (a here-string is never a heredoc); mask only when the opener
             line has no `|` after the `<<` token; mask only QUOTED-delimiter bodies, since an
             unquoted body is expanded by the shell.
           ③ Inside `'…'` a backslash is literal — end the span at the next `'`. And run the
             message mask for the --no-verify rule only, which is the one it exists to serve,
             rather than before every rule.
           Must not break: every case in v6's probe, plus the fifteen above as deny/ask cases in
           it, plus a differential run against the previous gate (see CF-10) showing 0 weaker.

           Also observed on the same walk, NOT blocking, recorded so they are not lost:
           · Abbreviated long options (`--no-veri`, `--har`) bypass BOTH gates — git accepts any
             unambiguous prefix of a long option. True of pleks's current gate as well.
           · `git push --mirror` only ASKS in both; it can rewrite or delete every remote ref.
           · agent-write-scope v5 answers ASK for a Bash redirect outside `.handoff/` and DENY for
             a Write to the same kind of path — one fence, two verdicts by tool.
           · pleks-local, for the re-adoption: its v6 fallbacks named `Read(.env)` twins for a
             Bash rule; a Read-tool rule cannot match `cat .env`. And its commit message claimed
             4 twinned / 11 reasoned, and "no double claim", where the region held 7 / 8 and two
             twins were each claimed by two rules. Corrected in the revert commit.
```

### CF-10 · the kit's adoption steps validate a REPLACEMENT gate with two suites that cannot see a regression

```
OBSERVED   Adopting bash-gate v6, pleks ran every check the kit asks for — v6's own probe, the
           project's corpus, check-hook-registration — all green, and wrote "PROVED NO WEAKER" in
           the commit and the PR. The claim was false (CF-9) and nothing in the procedure could
           have shown it.

COMMAND    $ node .claude/hooks/bash-gate.probe.mjs     → 132 probes pass     (at 64e02a19)
           $ node scripts/check-bash-gate.mjs           → all pass, with 2 expectations changed
           $ node diff-gates.mjs                        → 15 of 15 weaker     (same tree)

WHY IT IS  A probe asserts the shapes its author thought of. The new gate's probe is written for
CANON'S    the new mechanisms' INTENDED behaviour; the old corpus is written for the old
           mechanisms. A regression lives exactly in the gap — shapes the old mechanism handled by
           accident of design and the new one handles differently — and neither suite has a case
           there by construction. Any project replacing any gate hits it.

SMALLEST   Add to the kit's INSTALL steps for a gate row whose version changes a MECHANISM (not
FIX        just a rule): run the previous gate and the new one over the same payloads and require
           0 cases where the new verdict is looser (allow < ask < deny). Draw the payloads from
           the mechanism DIFF — for each new function, the bash constructs it reinterprets — not
           from either suite. A green corpus is necessary and is not this check.
           Nominated for LESSONS.md, canon's to file: "a replacement gate is validated by
           differential run against its predecessor on shapes drawn from the mechanism diff; its
           own probe and the old corpus cannot see a regression."
```

### CF-11 · a literal `..` test is not a path-traversal guard wherever the path later passes through a URL parser

```
OBSERVED   pleks's storage-path guard rejected `path.includes("..")`, and a caller-supplied key of
           `%2e%2e/%2e%2e/%2e%2e/{otherOrg}/{app}/id_document` passed it and resolved into another
           organisation's prefix. Found by the pre-merge walk of PR #268 (2026-09-07); fixed before
           merge. Its PROMOTE line nominated a lesson for canon, and that nomination was never
           relayed. It surfaced on 2026-09-11 when the handoff directory holding it was cleared.

COMMAND    Walker, against PR #268's head `3cc8edbd` (the handoff record, verbatim):
             "The WHATWG URL parser … defines a double-dot path segment as `..` or `%2e%2e` /
              `%2E%2E` / `.%2e` / `%2e.` (ASCII case-insensitive). Verified by parsing all four
              forms: each pops a segment. `@supabase/storage-js` … applies no percent-encoding,
              so the encoded form reaches `fetch` intact and is resolved client-side exactly as
              `..` is."
           The fix, and why it is shaped as it is, is at the site:
           `app/api/applications/[id]/documents/upload/route.ts:48-58`, with probes in
           `lib/applications/applicationStoragePath.test.ts` ("REJECTS percent-encoded dot
           segments after a valid prefix").

WHY IT IS  Nothing here is pleks's stack. Any string test for traversal is checked against one
CANON'S    definition of a dot segment, and the parser that later resolves the path uses another,
           wider one. A client SDK that builds `${base}/object/${key}` without encoding hands the
           key to `new URL`/`fetch`, which apply the WHATWG rule on every runtime. The guard looks
           correct and a probe with a literal `../` passes, which is the 2026-08-19 scar's shape:
           the probe confirms the spelling its author had in mind.

SMALLEST   A lesson, not a kit change. Nominated for LESSONS.md, canon's to file: "a path guard
FIX        that string-tests `..` is checked against a narrower definition of a dot segment than the
           URL parser the path later reaches; allowlist the caller-supplied component against a
           closed set, so that no decode depth has to be chosen." The allowlist is what pleks
           shipped (`parseDocKey`). A sanitiser would have to pick a decode depth and match every
           layer's idea of one — Next's params, URLSearchParams, the SDK — which is the same
           mismatch moved elsewhere.
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

- **Adopted 2026-09-11 — canon: record in `kitAdopted`.** `check-hook-registration` v6,
  `check-handoff-contract` v5, `check-install-platform` v3 (fresh, wired into `npm run check`),
  `agent-write-scope` + probe v5, and the stamped spines census v10 · db-inspector v5 · grounder v7 ·
  implementer v5 · walker v8 — all in `d6220076`. `check-claude-md` v17 in `96de5fc8`, its ceiling
  renamed to `scripts/check-claude-md.ceiling.json`. agent-write-scope v5 was re-measured against
  v4 after CF-9 surfaced, on the rule most likely to share the regression — subagent commit denial,
  10 payloads including the wrapper and keyword shapes: **0 of 10 looser.**

- **⚠ HELD — row `bash-gate` (+ `bash-gate.config`, `bash-gate-probe`), at pleks's v4-lineage gate
  (`98d8a9a0`), against canon v6. Reason: CF-9 — v6 allows 15 payloads the held gate denies or
  asks. Review: when canon ships a v6 successor that passes CF-10's differential run with 0 looser.**
  Adopted in `64e02a19`, reverted before merge; nothing of v6 reached `main`. `check-hook-registration`
  v6 is **silent** about the held gate's rules — measured, exit 0 with no per-rule lines — because the
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
