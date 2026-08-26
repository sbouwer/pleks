# HARNESS EXPERIMENT REGISTER

**In-repo E-register for the CLAUDE.md Standard.** These are **OBSERVATIONS of one harness version**,
not documented mechanisms. Anthropic documents none of this; all of it is behaviour probed from
inside a session and may change without notice on any upgrade.

**Anchor:** E1–E6 measured **2026-08-18**, Opus 5 via the Claude Code VSCode extension; the exact CLI
version string was NOT captured then (`claude --version` was unavailable in that sandbox) and the
2.1.235 attributed to E5 is inferred from the same session, not read off the binary. **E7, E8 and
E9** were measured **2026-08-20** with the version read directly: **2.1.235**. Record it on every
future run — "which version was this true of" is the whole value of an anchor.

**RE-RUN TRIGGER:** on any Claude Code major-version upgrade, re-run **E1b**, **E2**, **E5**, **E7**,
**E8**, **E9**, **E10**, **E12** and **E13** *before* trusting rule scoping, marker invisibility, the
assumption that MCP tool schemas are deferred, the handoff write control, any conclusion drawn from a
subagent's behaviour after a spine edit, any output from a worktree-isolated write agent, the write
fence at depth 2, or either instrument that reads the permission mode. Tracked as an OUTSTANDING
item.

**E12 and E13 added 2026-08-21, and both are payload/transcript SHAPE observations — the most
upgrade-fragile kind there is.** E12 rests on `agent_type` being present in a depth-2 PreToolUse
payload and on no depth field existing there; a release that adds one, renames the other, or stops
sending either silently changes what the write fence can decide. E13 now rests on records carrying a
top-level `permissionMode` whose values are the permission vocabulary — if that field is renamed,
dropped, or starts reporting a configured default rather than a live one, the statusline begins
reporting a mode nobody is in. **Both failure modes are silent**, which is why they are on this list
rather than left to be noticed.

**E13's re-run has a specific first step, and it is not re-reading this session.** Count the field's
distinct values ACROSS transcripts (`{"type":"mode"}.mode` measured cardinality 1 over 1735 records;
`permissionMode` measured 3 with mid-session transitions). The entry's superseded diagnosis was
confirmed twice against a single session, where a constant and a steady state are byte-identical.
Any future claim about which field is live is worth exactly the cross-session count behind it.

All nine are load-bearing: E1b decides whether
scoped rules are a control or a convenience, E2 decides whether the entire marker vocabulary costs
context budget, E5 decides whether connected MCP servers impose a flat per-turn floor (on 2.1.235
they do not — a revert to eager tool loading would change the economics of every session),
**E7/E8 together decide whether the agent write scope is enforced or merely asserted** — E8 removed
the frontmatter control this repo thought it had, and E7 is what replaced it — and **E9 decides
whether a spine edit can be evaluated at all by the session that made it** (on 2.1.235 it cannot,
which is how a false finding about agent disobedience got as far as canon).

---

## E2 · Are HTML comments stripped before injection? — **ANSWERED: BLOCKS YES, INLINE NO**

A canary token was planted in `CLAUDE.md` at one exact position — **between the `# Repository:` line
and the `---` that follows it** (record this; a re-run must plant in the same slot for the result to
be comparable). Then a session that had **demonstrably loaded the post-canary file** — it quoted the
new tier POINTER text and named commit `0bf57989` — was asked to reproduce the first 12 lines from
context.

It reproduced line 3 and then `---`, **skipping precisely the canary's five lines**, while
positively identifying both neighbours.

That positive ID either side is what makes the absence **evidential** rather than "didn't notice" —
a session that simply failed to recall the region would have been vague about the neighbours too.

⚠ **REFINED 2026-08-19 against the canonical register — the earlier reading here was too broad.**
The result is **placement-dependent, and the two placements have opposite outcomes**:

| Placement | Fate | Cost |
|---|---|---|
| Comment **block alone on its lines** (what this canary tested) | **stripped** | free |
| **Inline** `<!-- @enforced ns:id -->` at the end of a rule line | **SURVIVES** | visible, not free |

This file previously said markers "are **free**" without qualification. That is true only of blocks.
The `@enforced` tag format is deliberately the *surviving* placement — same-line position is what
binds a tag to its rule for the resolver — so **every `@enforced` tag costs visible budget**.
Measured in this repo 2026-08-19: 16 tag-bearing lines, ~3.0k chars, previously counted as zero.

**CONSEQUENCE:** the tagging economy is real but not free. A budget measurement that strips all
comments UNDERCOUNTS the always-loaded file, which is exactly how this repo reported a saving on a
change that cost. Strip blocks only when measuring.

---

## E1b · Do scoped rules trigger on WRITE? — **ANSWERED: NO — READ-TRIGGERED ONLY**

Five probes, four rules, both directions, with a positive control:

| Probe | Rule expected | Result |
|---|---|---|
| **Read** `lib/screening/…` | `fitscore.md` | **ARRIVED** |
| **Read** `lib/comms/delivery-notice-…` | `comms-urls.md` | **ARRIVED** |
| **Bash-edit that SAME comms file** | `comms-urls.md` | did not arrive ← *the A/B* |
| **Bash-edit** `lib/tier/…` | `billing-gates.md` | did not arrive |
| **Write NEW** `lib/offline/_probe.ts` | `inspections.md` | did not arrive |

The comms pair is the clean experiment: **one file, one rule, one variable** (read vs. write).
Everything else is held constant, so the difference is attributable.

**Scope of exposure.** The `Edit` tool **refuses to run without a prior `Read`**, so `Edit` can never
be the uncovered case. The exposed paths are exactly **Bash-mediated edits** and **`Write`-tool
creations** — which means coverage is roughly proportional to the care already being taken.

**Untested:** `Write` **OVERWRITING an existing** file (the probe created a new one). A re-run should
close this.

### ⚠ CONSEQUENCE FOR THIS REPO, AND IT IS NOT SMALL

All 18 rule files are scoped, so **all** path-scoped doctrine is absent from any session that writes
without reading first:

- `migrations.md` — 176 lines of amend-forward discipline
- `identity-scoped-tables.md` — the `org_id` exception + membership test
- `data-access.md` — the gateway rules

The spec said *do not move incident-class content to a scoped rule until E1b resolves.* **It has now
resolved AGAINST that, and this repo moved everything before the question was asked.**

**Rung 4 is a convenience layer for reading sessions, NOT a control.** Anything in a scoped file that
must hold regardless needs a **rung-1/2 twin** (a hook or a check). That twin audit is open work.

---

## E1 · Does `paths:` frontmatter defer loading? — **OBSERVED YES, not A/B tested**

Scoped rule files arrive mid-session on relevance, not at launch. This is **not** the controlled
cross-session A/B the spec specifies — treat as **suggestive**, not established. Distinguish it from
E1b, which *is* controlled.

---

## E3 · Does this file reach a subagent? — **ANSWERED: YES**

Resolved in the canonical register (`C:\dev\dev-standards\standards\CLAUDE-MD-STANDARD.md` §9), not by a
probe in this repo: subagents **do** receive this file.

**But presence is not enforcement, and the qualifier is load-bearing:** a narrow-task agent *skims*
it. Combined with E1b, the delegation picture is that a subagent gets `CLAUDE.md` and gets **none**
of the scoped rule files unless it reads a matching path. So incident-class content must sit at
rungs 1–2 to reach delegated work reliably — handing an agent the doctrine is not the same as the
doctrine binding it.

---

## E4 · What does delegation actually cost? — **MEASURED**

**Anchor:** session `2678b6e4`, transcript at 41.5MB, measured 2026-08-20, CLI **2.1.235**, Opus 5
via the VSCode extension. Method: walk the main transcript and every
`<transcript-dir>/<sessionId>/subagents/agent-*.jsonl`, scoring each turn at
`input + cache_write×1.25 + cache_read×0.1 + output`.

| | turns | billable-equivalent | |
|---|---|---|---|
| main session | 6,826 | 351.8M | |
| subagents | 3,292 | 55.7M | 27 invocations — **13.7% of total spend** |

Derived, and these are the numbers that matter:

- **2.1M billable-equivalent per invocation**
- **122 turns per agent** — an agent is not a lookup, it is a second full session
- ~~**45k tokens returned per invocation**~~ **CORRECTED 2026-08-20, same session.** That figure was
  the agent's TOTAL output across all its turns, not the report handed back. It conflated internal
  generation with permanent weight in the caller's window, which are different quantities by an
  order of magnitude. **The returned report is 1.9k–6k tokens** (median by type: implementer 1,910 ·
  census 3,271 · walker 4,444 · grounder 5,274 · db-inspector 1,354). The original claim overstated
  the carrying cost of delegation by ~10x and should not be cited.

**Per-type distribution**, measured across the same 27 runs — the numbers any turn/output budget has
to be set against:

| type | runs | turns med/max | returned tokens med/max |
|---|---|---|---|
| implementer | 10 | 196 / **336** | 1,910 / 2,188 |
| census | 5 | 62 / 139 | 3,271 / 9,433 |
| walker | 6 | 118 / 129 | 4,444 / 4,973 |
| grounder | 5 | 100 / 117 | 5,274 / 6,035 |
| db-inspector | 1 | 18 / 18 | 1,354 / 1,354 |

**Revised reading with the corrected return figure:** an agent costs ~2.1M to run and leaves only
~4k of permanent weight behind. Against an inline alternative that would add ~250k of permanent
context (≈2.5M billable over 100 later turns), delegation comes out **slightly ahead, not behind** —
the opposite of what the uncorrected 45k implied. The 2.1M run cost is still the dominant term, and
**turn count, not report size, is what drives it**.

**The doctrine said delegation wins when an agent reads a lot and returns a little. At 122 turns and
45k returned, this repo has been doing neither half.** A rough inline comparison: an agent replacing
50 file-reads saves ~250k of permanent main-context weight (≈2.5M billable over 100 later turns) and
costs 2.1M to run plus ~450k to carry its own output — **approximately break-even**, not the clear
win the spines assume. The saving is real only when the agent's turn count stays low and its report
stays short; neither is bounded today.

Composition by type, for scoping the fix: `implementer` 10, `walker` 6, `census` 5, `grounder` 5,
`db-inspector` 1.

**RULED AND LANDED 2026-08-20 (CD).** Turn and output budgets are now clauses in all six spines
(walker v4, others v2) — see `dev-standards/standards/AGENT-SPINES.md`. They are **backstops, not
targets**: budgets sized from the 122-turn aggregate would have truncated every role's *median* run,
and a truncated run is re-invoked, paying the agent's startup context twice. One 196-turn run becomes
two runs plus a second startup. Landed values: implementer 250/3k · census 150/4k · walker 150/6k ·
grounder 150/6k · db-inspector 40/2k (**n=1**) · crawler-doctrine 150/4k (**n=0**).

**⏱ RE-MEASURE TRIGGER — after ~20 agent invocations under the new spines**, re-run the per-type
distribution and record the second table directly beneath the first above. The batching guidance is
the actual forcing function; the budget is only the net. Tighten then, against the new distribution,
not before. This is a count, not a "later".

The instrument that trigger depends on is **M-062**, and it is now a command rather than a
rediscovery: `node scripts/agent-distribution.mjs` prints the table above, budgets read from the
spines. The turn budget itself is UNENFORCEABLE (an agent has no reliable turn counter; it
estimates), so its mechanical half is visibility.

**The trigger counts TOP-LEVEL invocations only** (2026-08-20, when `census` gained the `Agent`
tool with a width cap of 4). One ask that fans out to six children is one ask: counting the fan-out
would let a single delegation decision fire a trigger meant to observe twenty. Nested runs are still
measured — depth comes from each run's `spawnDepth` sidecar field and the parent edge is recovered
by tool-use-id containment — they are reported as their own subset rather than folded into a
per-type median that would then describe two populations at once.

**The 27 runs above are all PRE-generation, and the trigger counts none of them.** The script's first
live run said "TRIGGER MET (27 ≥ 20)" — against runs that every one of them predated the budgets,
which would have meant tightening against exactly the behaviour the budgets were meant to change. It
now takes the newest spine mtime as the generation boundary and reports **0/20 as at 2026-08-20**.
The count restarts here; the table above is the *previous* generation's baseline, kept for comparison,
not evidence about the budgets.

---

## E6 · Does `autoCompactWindow` apply to SUBAGENT windows? — **INCONCLUSIVE, and the reason matters**

**Anchor:** same session and CLI version as E4. Asked because the consequence is large: if subagents
never compact, a turn budget is the *only* control that exists in that window.

Walked all 27 subagent transcripts for `compact_boundary` lines:

| | |
|---|---|
| subagent runs | 27 |
| `compact_boundary` lines found | **0** |
| highest peak context in any run | **249,142** |
| highest turn count | **336** |
| runs exceeding 300k context | **0** |

**Zero compactions — but zero runs came within 50k of any threshold.** These runs also predate
`autoCompactWindow` being set, so they executed under the ~1M default. The null result therefore
proves "no compaction below ~250k", which is **not** the question. It cannot distinguish "subagents
never compact" from "none got close enough to find out", and it is recorded as inconclusive rather
than allowed to read as proof.

**The incidental finding is the useful one:** subagent context plateaus around 250k even at 336
turns, so agents are not heading for a compaction boundary in normal use. Whatever the answer, it is
not currently load-bearing — which lowers this question's priority rather than raising it.

**To settle it:** run one deliberately long agent (a repo-wide census with no early exit) against
`autoCompactWindow: 300000` and check its transcript for a boundary. Cheap, but it needs a task that
genuinely exceeds 300k, and nothing in normal use does.

---

## E5 · Do MCP tool definitions tax every turn? — **ANSWERED: NO, THEY ARE DEFERRED — but they accumulate**

**Anchor:** same session and CLI version as E4.

The hypothesis was that seven connected MCP servers (~150 tool definitions, plausibly 15–40k tokens)
sit in static context and are re-sent every turn, making server enablement the largest cheap win
available. **On CLI 2.1.235 that is not what happens.** Tools arrive *deferred*: the session receives
tool NAMES only, with schemas fetched on demand via `ToolSearch`. The session is told so explicitly —
"Their schemas are NOT loaded — calling them directly will fail with InputValidationError."

**But deferral is not a permanent exemption, and this is the part worth knowing.** Each compaction
boundary records `preCompactDiscoveredTools` — the schemas that had been fetched and were therefore
resident. Across this session's three boundaries:

| boundary | trigger | discovered tools resident |
|---|---|---|
| 1 | auto | **5** |
| 2 | auto | **34** |
| 3 | manual | **34** |

So a fetched schema is **sticky**: it stays resident, and the resident set only grows within a
window. The tax is not a flat 15–40k floor; it is an incremental cost that accrues as a session
touches more servers, and compaction is what resets it.

**Not measured, and the method is recorded so a re-run can close it:** the token cost of the NAME
list itself, and the per-schema cost of a discovered tool. The clean A/B is a fresh session's first
usage line with all servers enabled versus a subset — **not run, because spawning a nested `claude`
process to measure it consumed the user's session limit on the first attempt.** Any re-run should
use a separate machine or an idle window, not the session being measured.

**Consequence:** per-session server enablement is worth *less* than hypothesised on this CLI version
— the floor is already low. It becomes worth doing again if a future version reverts to eager tool
loading, which makes this an E-register re-run trigger alongside E1b and E2.

---

## E7 · Does `PreToolUse` hook input carry subagent identity? — **ANSWERED: YES**

**Anchor:** measured 2026-08-20 against **CLI 2.1.235** (captured this time — see the header caveat),
Opus 5, VSCode extension, repo at `1d127015`. Asked because it decides whether the handoff write
scope (`4-AGENT-PIPELINES.md` §8) can be a rung-1 deny or must stay a post-run check.

Method: `bash-gate.js` temporarily appended its raw stdin to a scratch file — the hook is spawned per
invocation, so editing it takes effect with no settings reload. Then one main-session `Bash`, one
`grounder` subagent running a single `echo`, one main-session `Bash` again. The dump was reverted and
the revert verified with `git diff` before anything else was written.

| Invocation | Keys present |
|---|---|
| main session (before) | `session_id, transcript_path, cwd, prompt_id, permission_mode, effort, hook_event_name, tool_name, tool_input, tool_use_id` |
| **grounder subagent** | the same **plus `agent_id`, `agent_type`** |
| main session (after) | as the first — the two fields are gone again |

`agent_type` is the spine name verbatim (`"grounder"`); `agent_id` matched the id the `Agent` tool
returned to the caller (`ae9550e7a3a1d8b58`), so it is a usable join key onto the transcript tree.

**Both directions fired.** The control ran before *and* after the treatment, so this is not a field
that is simply always absent from a hook that never sees it — the fields appear and then disappear.

**`session_id` and `transcript_path` are the MAIN session's inside the subagent**, identical to the
control. They cannot discriminate; only `agent_id`/`agent_type` can. A hook that tried to detect a
subagent by transcript path would silently never fire.

**Consequence:** the handoff write scope becomes an enforced deny, not an attention-held instruction.
E8 is why that upgrade is *required* rather than merely available.

---

## E8 · Can `tools:` frontmatter withhold `Write` from a custom subagent? — **ANSWERED: NO**

**Anchor:** same session, CLI 2.1.235, repo at `1d127015`. Fell out of E7's probe and was not the
question being asked.

`grounder.md` declares `tools: Read, Grep, Glob, Bash` — no `Write`, no `Edit`. Asked to name its own
tools and to attempt a write, the running agent reported its list as **`Read, Grep, Glob, Bash,
Write, Edit`** and the write **succeeded**. The same two names are appended to every custom spine in
the agent registry, including `crawler-doctrine` (declares `Read, Grep, Glob`) and `walker` (declares
`Read, Grep, Glob, Bash`). Built-in agent types are *not* treated this way — `Explore` and `Plan` are
listed as "all tools except … `Edit`, `Write`", so exclusion is expressible; it is custom-spine
frontmatter that does not achieve it on this version.

**Consequence, and it is the uncomfortable one:** "read-only agent" was a property this repo believed
it had by declaration, and it does not have. Four spines describe themselves as read-only in prose
and are not read-only in fact. Nothing bad has come of it — no agent has written outside its remit —
but that is the absence of an occurrence, not a control. E7's `agent_type` is what turns it back into
one, which is why the two experiments are recorded as a pair and why the deny hook shipped in the
same commit rather than being queued.

**Re-run trigger:** on any CLI major-version upgrade, alongside E1b/E2/E5. If a later version honours
the frontmatter, the deny hook becomes belt-and-braces rather than the only control — worth knowing,
not worth removing it for.

---

## E9 · When does an edited agent definition reach a spawned subagent? — **ANSWERED: AT THE NEXT TURN BOUNDARY, NOT AT SPAWN**

**Anchor:** same session, CLI 2.1.235, repo at `d18e344e`, 2026-08-20 17:03–17:31 SAST. Not the
question being asked — it surfaced as a false finding about agent disobedience and was chased down
because the finding was about to be written into canon.

The agent registry is **snapshotted at `UserPromptSubmit`**. Writing `.claude/agents/<name>.md` does
not refresh it, and a subagent spawned later in the same assistant turn runs the definition that was
on disk when the turn began — however many minutes and edits ago that was.

**The controlled pair** (everything else held constant: same agent, same task shape, same
instruction, spawns 30 s and ~4 min after the edit respectively):

| | Edit → spawn, SAME turn | Edit → turn boundary → spawn |
|---|---|---|
| Marker `## Probe` / `B2`, added to the definition mid-turn | **ABSENT** | **PRESENT** |

Corroborating, in the order it was measured:

1. grounder v4 spliced 17:03:43. Three spawns at 17:09, 17:17 and ~17:22 — all inside one long
   assistant turn that began before 17:03 — each produced **v3's** anchor template verbatim
   (`task: … · UTC: …`, not v4's `anchor: task=… · utc=…`) and v3's six-section artefact.
2. `touch .claude/settings.json` at 17:21, spawn in the same turn: still v3. **An mtime-only touch of
   the settings file is not a trigger** — worth stating because hooks *do* hot-reload from that file,
   so the two reload paths are not the same path.
3. First spawn of the next turn, 17:26: **v4** — the literal anchor with a genuinely read clock
   (`utc=2026-08-20T15:26:34Z`, matching the run), and section 7 `## Contract` written verbatim.
4. Then the controlled pair above.

**Two things this retroactively killed.** A finding already written into
`dev-standards/playbooks/4-AGENT-PIPELINES.md` §11 said "grounder followed the artefact contract and
not the return contract" — it was executing **v2**, which contains no return contract at all
(`git show bd3817a3:.claude/agents/grounder.md`: six artefact sections, no anchor template, no
`VERDICT/ARTEFACT/SUMMARY/PROMOTE`). Nothing was ignored; the instruction was not there. And the
whole v3→v4 bump was motivated by that non-event. v4 is a better spine on its own merits — the
literal anchor closed a real defect, visible in a v3 run that wrote `UTC: 2026-08-20T00:00:00Z`, a
recalled placeholder rather than a read clock — but it was not the fix to the bug it was written for,
because there was no bug.

**The operational rule, which is the whole value of this entry:** after editing any spine, **prove
which version is in effect before believing anything an agent does.** Put a nonce in the file and
require the agent to echo it into its artefact. One caveat measured the hard way — the first nonce
attempt was a section headed "TEMPORARY PROBE" saying "this is not part of your role", and the agent
reasonably skipped it, producing a false negative. **Make the nonce an artefact-structure
instruction** (a required extra section), which is a class of instruction the agent demonstrably
obeys, not an aside.

**Re-run trigger:** on any CLI major-version upgrade, alongside E1b/E2/E5/E7/E8. Also re-run if
subagent behaviour ever contradicts a spine that was edited in the same session — that is the
symptom, and it looks exactly like disobedience.

---

## Why this file exists separately from CLAUDE.md

By E2's block-placement finding, a register recorded as a comment BLOCK inside `CLAUDE.md` is **stripped before
any session sees it** — it instructs nobody. The findings are already load-bearing in the artefacts
themselves (E2 justified the marker format; E1b produced the twin audit, the SECURITY RULES
annotations, and the M-register), so the lab notebook does not need to travel with them.

What stays in `CLAUDE.md` is a two-line citation. What lives here is the narrative and the **re-run
protocol** — including the canary's exact plant position, which is re-run instructions and belongs
with the protocol rather than at the site being probed.

---

## E10 · What commit does `isolation: "worktree"` base a subagent's tree on? — **ANSWERED: `origin/main`, NOT THE SESSION'S HEAD**

**Anchor:** same session, CLI 2.1.235, session HEAD `fcec5044` on branch
`docs/claude-md-standard-v3-pass1`, 2026-08-20 ~19:15 SAST. Surfaced as four "misfit" findings from
an implementer run and was chased because the misfits were about to be recorded as census defects.

A subagent spawned with `isolation: "worktree"` gets a fresh branch created from **`origin/main`**.
Not the session's HEAD, not the session's branch, and not local `main` either — local `main` was at
`72e7004f` while `origin/main` and the worktree were both at `4fa29e51`.

**Controlled probe** (a second agent, spawned solely to report, no transform, no edits):

| | value |
|---|---|
| session HEAD | `fcec5044` (branch `docs/claude-md-standard-v3-pass1`) |
| worktree agent `git rev-parse HEAD` | `4fa29e51` |
| `origin/main` | `4fa29e51` |
| local `main` | `72e7004f` |
| distance | **79 commits behind the session** |

`git branch --contains HEAD` inside the worktree lists `docs/claude-md-standard-v3-pass1`, confirming
the base is an ancestor of the session branch rather than an unrelated line — which is exactly why
the failure is quiet: everything builds, everything typechecks, nothing looks wrong.

### ⚠ CONSEQUENCE, AND IT IS NOT SMALL

As at the time of this experiment, `CLAUDE.md` §7 **told** you to spawn the implementer with
`isolation: "worktree"`, and that was the documented default for the mechanical-transform lever.
(Corrected to the opposite instruction in `fd818c0c`; `.claude/commands/build.md` was NOT swept at
the same time and went on instructing the refuted form until `2026-08-25` — see the sweep note below.) **On any feature branch, that agent is
working on a different tree from the one you are.** Three ways it goes wrong, all of them silent:

1. **Its `npm run check` green is worthless to you.** It was measured on a tree that does not exist
   in your session. The gate ran, passed, and proved nothing about your HEAD.
2. **Its findings are ghosts.** This run returned four "misfits" — sites the census called
   caller-free that the implementer found callers for. All four callers were files deleted on the
   session branch by *tranche 1 of the same burn-down*. Real at `origin/main`, gone at HEAD. Had
   they been believed, the census would have been recorded as ~7% unreliable and a working method
   would have been thrown away on the strength of a stale checkout.
3. **Its diff may not apply.** 79 commits of drift, and the diff was produced against the wrong side
   of them.

The direction of the error is the dangerous one: a stale base makes an agent report **more** work to
do and **more** callers than exist, so it fails toward false caution — which reads as diligence.

**Mitigation until this is fixed upstream:** either (a) spawn write agents **without** worktree
isolation when the session is not on `origin/main`, accepting the loss of parallelism, or (b) instruct
the agent to `git rev-parse HEAD` first and **stop and report** if it does not match the SHA you name
in the brief. (b) is cheap, is one line in the brief, and turns a silent class into a loud one — and
a brief that names its expected base is the same discipline as anchoring a grounding claim.

**Untested and worth knowing:** whether the base is `origin/main` specifically, the remote's default
branch, or the repo's configured default. One repo, one observation of each — do not generalise the
`origin/main` spelling to a repo whose default branch is named otherwise.

---

## E11 · Does `spawnDepth` distinguish a nested subagent run from a top-level one? — **ANSWERED: YES, AND THE PARENT EDGE RESOLVES INDEPENDENTLY**

**Anchor:** same session, CLI 2.1.235, HEAD `a5b6f541` on branch `fix/day0-cancellation-copy`,
2026-08-21. Design pre-registered at `.claude/handoff/fanout-probe/01-main.md` **before the run**,
per §4b item 5 — a prediction written after the result is not a prediction. **That artefact was
disposed of at wrap under §9**, so the citation is a provenance record, not a live path: the four
predictions, the 49/49 readiness measurement and the result are all reproduced below, which is what
makes the disposal safe. The observation dies, the decision survives.

**Why it needed testing.** `scripts/agent-distribution.mjs` reports a `spawn depth` line and a
`spawnedBy` edge, and neither had ever been exercised: **49 of 49 recorded runs were top-level**,
the script saying so itself — *"every run is top-level (d1). No agent has spawned an agent."* A
reporting path that has never had a non-trivial input is the green-and-unfailable shape. The
script's own comment — *"the CLI writes spawnDepth: 1 for a run the main session asked for, 2+ for
one another agent asked for"* — read as measured and was not: every observation behind it was a `1`,
and `1` is what you get whether the CLI counts depth or hardcodes the field. Same shape as E8, where
a `tools:` line was believed to withhold because nothing had tested it withholding.

**Readiness established rather than assumed.** `spawnDepth` was present in 49/49 `agent-*.meta.json`,
every one literally `1` — so the d1 baseline was a real observation, not `Number(j.spawnDepth) || 1`
firing on an absent field. Had the field been absent, "every run is d1" would have been an absence
dressed as an observation and the probe could not have discriminated. `toolUseId` was present in
49/49 as a SECOND, independent discriminator: the parent edge is recovered by containment and does
not depend on `spawnDepth` at all.

**Result — outcome (a), the clean one.** A census parent fanned out three children over a real knip
partition; a fourth nested census came from the scope probe:

```
spawn edges (4 nested run(s), deepest d2):
  census → census  ×4
```

| prediction | outcome |
|---|---|
| 1 · children resolve `parent: census` by tool-use-id containment | HELD |
| 2 · children carry `spawnDepth: 2` | HELD — the uncertain one, and the point of the run |
| 3 · no grandchildren (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2`) | HELD — deepest is d2 |
| 4 · negative space needs no new run — 49 existing d1 runs supply it | HELD by construction |

Prediction 4 is worth keeping as method: manufacturing a 50th unnested run to "prove" an unnested
run reports 1 would have been testing the fixture.

**What this does NOT establish.** Three things, kept separate from the result because each was
confounded and none is closed by it:

- **Whether an unattended fan-out completes.** It did not. The parent dispatched four children and
  closed saying it would synthesise once they returned — a turn ends when the agent stops emitting,
  and a child's completion notifies the SESSION, not the parent. It was not paused, it was finished,
  and the children sat unread until a human resumed it by hand. Fixed in census v9 as prose, marked
  UNENFORCEABLE: nothing counts a run's children against its returns, so a stranded parent and a
  complete one are the same artefact on disk.
- **Whether the write-scope fence holds at depth 2.** Recorded as proven and then WITHDRAWN. The
  evidence was that two out-of-scope `DELETE-ME` files were absent from disk — but absence is equally
  consistent with a human clicking No on a prompt. The discriminator was only ever the hook's deny
  string (`may only write to .claude/handoff`), which was never captured.
  **→ SETTLED by E12 (same day, `0fd292df`): it holds.** The deny string was captured, from inside
  the hook, and depth 2 was established by `agent_id` rather than inferred. E12 also returns the
  negative result this entry could not have predicted — the payload carries **no depth field at
  all**, so `spawnDepth` is a transcript fact and not a hook fact.
- **Whether a hook's `allow` grants anything.** `agent-write-scope.js` returns
  `permissionDecision: "allow"` for a main-session write and for an in-scope census write — verified
  by piping both payloads through it. Writes prompted anyway, while the session ran in `acceptEdits`
  (67 transcript records, no other value) and the session logged **zero `permission_denials`**. So a
  hook returning `allow` may be an ABSENCE OF DENIAL rather than a grant. If that holds, five spines
  and three canon documents overstate what the fence does. Not concluded here — it needs the
  deny-string evidence above.

**A measurement failure worth recording, because it nearly inverted the answer.** Two instruments
were built to read the session's permission mode and both read `permissionMode`, camelCase. The
`UserPromptSubmit` payload spells it **`permission_mode`**, snake_case, so both returned `undefined`
— and `undefined` rendered as silence, which the design had defined to mean "settings won". A key
typo was indistinguishable from a measurement. It was caught only because a throwaway probe dumped
the payload's key list alongside the value; the shipped instrument would have reported agreement
forever. Read both spellings, and never let an unread field share an output state with a real one.

---

## E12 · Does a DEPTH-2 subagent's PreToolUse payload carry `agent_type`? — **ANSWERED: YES, AND THE FENCE HOLDS AT DEPTH 2**

**Run 2026-08-21, tree at `0fd292df`.** Closes the link E11 left open and un-withdraws the result
E11 recorded as withdrawn. Prediction pre-registered before the hook was instrumented and before any
agent was spawned; the design is unchanged from that file.

### Why it mattered

`agent-write-scope.js` treats an absent `agent_type` as "this is the main session" and returns
`allow`. E7 measured the field's presence at **depth 1** only. If it were absent at depth 2, the hook
would read a nested child as the main session and **wave through every write it made** — a hole
precisely where the caller is least able to notice, because a depth-2 child's tool calls never appear
in the main session's transcript.

### The instrument, and why the previous attempt had none

The first attempt concluded "the fence held" from two out-of-scope `DELETE-ME` files being absent
from disk. Absence is equally consistent with the child never attempting the write, with the attempt
being denied, and with a human clicking No — so the result was withdrawn.

This run instrumented **the hook itself** to append every payload it received, plus the decision it
returned, to a JSONL file outside the repository and outside the conversation. The evidence is
therefore what the hook actually saw and actually returned, written from inside the hook process. No
agent's self-report is load-bearing. The instrument was verified not to change behaviour — the same
out-of-scope payload produced a byte-identical decision before and after, and `check-agent-write-scope`
stayed green — and the hook was restored byte-for-byte afterwards (md5 `342e3c6e846c2c05d3b9e912916dceac`).

**The full key set was logged, never a hand-picked subset.** That was a direct response to this
session's `permission_mode` failure, where two instruments read a mis-guessed camelCase key, both got
`undefined`, and `undefined` had been defined to mean a real reading.

### Result — all four predictions held

| # | Prediction | Outcome |
|---|---|---|
| P1 | the hook fires at depth 2 at all | **held** — both child writes logged |
| P2 | `agent_type` present, naming the CHILD | **held** — `census`, not the parent's identity |
| P3 | out-of-scope write DENIED with the hook's own string | **held** — `deny`, `may only write to .claude/handoff` |
| P4 | in-scope write ALLOWED | **held** — `allow`, `census writing inside its scope` |

**Depth 2 was established by identity, not inferred from the outcome.** The parent returned
`agentId: ab052ca529035c1d0`; both logged writes carry `agent_id: a17325f9b71ab3aa4`. A different
agent made them, and the parent made exactly one tool call (the spawn). The known-good half matters
as much as the denial: P3 alone would prove only that the hook denies things, not that it
discriminates — a gate that denies everything is not a gate.

The main session's own `Bash` calls logged in the same file carry **neither `agent_id` nor
`agent_type`**, re-confirming E7's both-directions claim at the same moment and on the same
instrument. Absence really is a signal.

### The negative result, which is the more useful half

**The PreToolUse payload carries NO depth field.** The complete key set on a subagent call is:

```
session_id · transcript_path · cwd · prompt_id · permission_mode · agent_id ·
agent_type · effort · hook_event_name · tool_name · tool_input · tool_use_id
```

E11 observed `spawnDepth` in the **transcript record**; it is not in the hook payload, under that or
any other spelling. Two consequences, and neither is hypothetical:

- **A hook cannot scope by depth.** It can know *which agent type* is calling and *which specific
  agent*, never *how deep*. A rule of the form "an implementer may not spawn" or "no writes below
  depth 1" is not buildable at rung 1 as the payload stands.
- **`agent_type` is the child's own, not the parent's.** So scope does not inherit down a chain: a
  `census` that spawned an `implementer` child would give that child implementer's unrestricted
  grant, not census's handoff-only scope. **The fence is per-call, not per-lineage.** That is the
  correct behaviour for the rule as written, and it is also the shape of the next hole — nothing
  bounds what an agent may spawn, and the payload carries nothing a hook could use to bound it.

### What this does NOT establish, stated so it is not later claimed

- **Nothing about why writes prompt in this session — and it could not have, which was missed until
  Stéan reported the prompt.** The run looked clean because neither write path exercised the open
  question: the in-scope handoff write is covered by the two `Write(.claude/handoff/**)` /
  `Edit(.claude/handoff/**)` lines live-but-uncommitted in `.claude/settings.json` **as at the run**
  (both deleted later the same day with the handoff move out of `.claude/` — see E13), and the
  out-of-scope write was hook-DENIED, which is terminal and raises no prompt. **A confound that makes
  a result clean is more dangerous than one that makes it noisy**, because nothing about the output
  says to look. Both logged main-session lines still show `permission_mode: acceptEdits` with
  decision `allow`, the same contradiction E11 recorded, now seen from inside the hook.

### The prompt this run DID raise, reported by Stéan mid-turn and invisible to every instrument

**Exactly one prompt, on an `Agent` spawn — not on any write.** `Agent` is not in this hook's matcher
(`Write|Edit|MultiEdit|NotebookEdit|Bash`), so it went to the ordinary permission layer, where no
`Agent` allow rule exists. That part is unremarkable and is NOT the session's prompting mystery.

**What is remarkable: two spawns, one prompt.** Depth 0→1 (main session) and depth 1→2 (the parent's
child). Neither Stéan nor the instrument can say which one prompted — the run was not timestamped,
which is a design miss to fix before the next one. The hypothesis that would explain it, untested:
**a subagent's tool calls raise no interactive prompt at all**, because a subagent has no channel to
ask. If that holds, then at depth ≥ 1 **this hook is the only gate that exists**, and every claim
resting on "the user would be asked" is false below the top level. That would make the fence more
load-bearing than any document currently says, not less.

**And it re-establishes the instrumentation gap as a first-class finding.** A permission prompt leaves
NO transcript record — searched by record type across the session, there is no prompt record, and
`permission_denials` is zero. The `{"type":"mode","mode":"normal"}` records are the EDITOR mode, not
the permission mode (the permission mode appears elsewhere as `acceptEdits`); reading them as the
latter would have repeated this session's `permission_mode` error one field over.
<!-- This sentence was contradicted by E13's original diagnosis, held for several commits as the
     stale half of a documented conflict, and is now VINDICATED — see E13's cardinality table. It was
     written from the same evidence that was later argued away. Left exactly as authored, because a
     register whose wrong entries are quietly corrected teaches nothing about which reasoning to
     trust; this one was right and lost the argument anyway. -->
**The only detector
of a permission prompt in this system is the human watching the screen** — which is why the
three-states problem keeps recurring and cannot be closed from inside a session.
- **Nothing about whether `allow` is a GRANT.** Unchanged and still open. A logged `deny` at depth 2
  settles the fence; it does not settle what an `allow` buys. The hook-allow correction across five
  spines and three canon documents was gated on THIS result and is now unblocked — but it should be
  written to say the fence denies at depth 2, which is measured, and not that `allow` grants
  anything, which is not.
- **Nothing about depth 3+.** `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2` makes depth 2 the deepest
  reachable case here. "Deepest reachable today" is a setting, not a property; raising the cap
  re-opens the question, and with no depth field in the payload nothing would report that it had.

### A protocol conflict the run surfaced, unprompted

The parent census closed `⚠️ decision-needed` rather than silently picking a side: the task forbade
it from writing any file, its spine requires every run to close with a handoff artefact, and it
reported the conflict instead of resolving it quietly. That is the census v9 hand-back behaviour
working on a case nobody designed it for. **A task-specific instruction that contradicts the spine
should surface as `decision-needed`, and it did** — worth keeping in mind before writing "do not
write any file" into a brief again, since it costs the run its artefact.

---

## E13 · Why every write in this session prompted — **REFUTED twice, then given a documented cause that this repo's own session partly contradicts**

**2026-08-21.** An arc that cost three VS Code restarts, three rebuilt instruments, two withdrawn
results and a half-dozen falsified hypotheses — and the entry now records a WRONG diagnosis and how
it was caught, which is worth more than the answer it claimed.

> **⚠ SUPERSEDED CONTENT BELOW.** This entry originally read *"DIAGNOSED: the session ran in `normal`
> mode; CONFIRMATION PENDING"* and asserted that `{"type":"mode"}` carries the live permission state.
> That is refuted. The reasoning is kept in full because the failure mode is the finding.

### What was claimed, and what refuted it

The claim: the transcript's `{"type":"mode","mode":"normal"}` records — 224 of them in this session,
every one `normal` — showed the session sitting in the first position of the permission cycle, and
`normal` prompts on every write. Every symptom appeared to fall out of that one fact.

**The refutation is a two-minute count, and it is the whole lesson: MEASURE THE FIELD'S CARDINALITY
ACROSS SESSIONS BEFORE BELIEVING A CHANNEL IDENTIFICATION.** Across 12 transcripts on this machine:

| field | records | distinct values | verdict |
|---|---|---|---|
| `{"type":"mode"}.mode` | 1735 | **1** — `normal`, always | a constant, not a state |
| record `.permissionMode` | 549 | **3** — `acceptEdits` ×540, `auto` ×8, `default` ×1 | varies, and TRANSITIONS mid-session |

A field that never varies across any session on the machine cannot be reporting something the user
toggles. `normal` is not in the permission vocabulary at all — `default` is, and it sits on the
*other* field; `normal` is the editor mode's word, which was **CC's original reading, abandoned under
a confident correction.** `permissionMode` transitioning within a single file (`auto → acceptEdits`,
`default → auto`) is the positive evidence that it tracks a session-level setting.

### Why one session could never have caught this

**Within a single transcript, a constant and a genuine steady state are byte-identical.** Every check
run during the diagnosis read *this* session, where `normal` appeared 224 times and was consistent
with both readings. The discriminating observation is only available ACROSS sessions, and nothing in
the arc looked there — including the check that "confirmed" the diagnosis by re-reading the same file.

### The symptom table, corrected

The original table is the tell: every row said "yes", which should have been the warning rather than
the conclusion. A hypothesis that explains everything, effortlessly, has usually stopped being
constrained by the evidence.

| Symptom | status |
|---|---|
| writes prompted | **unexplained.** This session ran in `acceptEdits` (×70 records) and a prompt still occurred |
| `Bash` never prompted | consistent with `permissions.allow`, independent of mode |
| the hook returned `allow` and a prompt appeared anyway | **unexplained** — and the most interesting one |
| `defaultMode: acceptEdits` had no effect | **still stands.** `permissionMode` reaching `acceptEdits` does not show the settings key is what put it there |

⚠ **Row 1 and row 4 both moved on 2026-08-21, in opposite directions — see E14.** Row 1 is now
largely explained for writes under a PROTECTED PATH: `acceptEdits` is documented to *prompt* there,
so a prompt in `acceptEdits` is the specified behaviour rather than an anomaly, and approving once
grants the tree for the session — which is why it then went quiet. What remains unexplained is
narrower: the one prompt on a write OUTSIDE any protected path.

Row 4 is the correction that matters, because it moved the other way. **The reason for believing
`defaultMode` inert WAS row 1** — a session configured `acceptEdits` prompted anyway, so the key
looked dead. Row 1 now has a different explanation that does not implicate the key at all, so that
inference is withdrawn: `defaultMode: acceptEdits` is set and `permissionMode` reads `acceptEdits`,
which is consistent with the key working. It is still not PROOF (a CLI default and a UI selection
produce the same record), but "had no effect" is no longer supported by anything. **Do not delete
the key as inert** — that would act on a premise that has dissolved, and would destroy the only
cheap measurement available: remove it in a FRESH session and see whether `permissionMode` still
reads `acceptEdits`.

**"acceptEdits ⇒ no prompts" is therefore false**, which retires the entire framing. The open
question is no longer *which mode was the session in* but *what does a mode actually predict*, and
that cannot be answered without an instrument that detects a prompt — which does not exist, because
**the only detector of a permission prompt in this system is the human watching the screen.**

*(Half-corrected 2026-08-21 by E14: `toolDenialKind: "permission-rule"` records a prompt that was
REJECTED, with timestamp and tool input, and records nothing when one is approved. So a prompt is
detectable after the fact if the human declines it — which makes "reject, don't approve" a
measurement technique. It does NOT reach subagent prompts, since subagent turns are unrecorded.)*

### What the instruments do now

The statusline reports the value from `permissionMode` and **predicts nothing** — dim, no colour, no
advice. It rendered RED with "writes WILL prompt" off the constant field, so it was a permanent false
alarm on the one always-visible surface. The model-facing `[perm]` line is deleted, not repointed: an
always-on token-costed line earns its budget only if the value predicts something actionable.

The probe suite is the sharper correction. It **required** the word "prompt" on a non-`acceptEdits`
mode — so it enforced the false claim rather than catching it. That is **L-44 in its purest form: a
probe and the thing it guards, authored by the same hand, agree by construction.** The replacement
asserts the ABSENCE of a prediction across three modes, which is the only assertion that survives the
author being wrong about what a mode means.

### Three wrong readings, one shape

`permissionMode` (camelCase typo) → `permission_mode` (correct spelling, wrong channel) →
`{"type":"mode"}` (wrong field entirely) → `permissionMode` as a RECORD field, which is where the
first attempt's spelling accidentally pointed all along. Each correction was argued from
plausibility — the name fit, the story fit — and each inherited the previous method's assumption
about what kind of thing it was looking for. That is L-43's third instance and the sharpest: **the
verification inherited the original method's assumption.** What finally settled it was not a better
argument but a different operation: counting.

### CC's own miss — and it is not the one recorded here first

The original entry recorded CC's miss as *reasoning past the evidence*: the
`{"type":"mode","mode":"normal"}` record was dumped in full, then dismissed on a NAME COLLISION,
because `normal` is also the editor mode's vocabulary (`normal`/`vim`). That was written up as
"dumping the channel is not the same as reading it".

**The dismissal was correct.** `normal` was the editor mode. The recorded "miss" was CC abandoning a
right answer under a confident correction, and then writing an entry explaining why the right answer
had been wrong. The argument used to overturn it — that the editor reading "requires 224 records of
an unset default explaining none of the symptoms" — is a precise description of what an unset default
looks like, deployed as evidence against itself.

So the useful half is not about reading evidence carefully. It is about what happens to a correctly
held position when someone states the opposite with confidence and a plausible mechanism: **it was
given up without a single new measurement being taken.** The measurement that would have settled it
cost two minutes and was available the entire time.

### NOT CONFIRMED — and now not confirmable in this form

The predicted fix was one keystroke (Shift+Tab), pre-registered here with three branches. **That
protocol is retired with the diagnosis it was testing.** It asked what happens to a field that is
constant across every session on the machine; the answer is "nothing", and it would have been
misread as branch two (*"the keystroke is not wired in the extension"*) — a plausible, wrong,
actionable-looking conclusion, arrived at through a correctly-designed experiment aimed at the wrong
variable. **Pre-registration protects against motivated reading of a result. It does not protect
against measuring the wrong thing**, and the entry that carried it was, at that moment, three
sections of careful reasoning built on an uncounted field.

What remains open, stated as questions rather than pending confirmations:

1. **What actually predicts a permission prompt?** Unknown, and currently unmeasurable from inside a
   session. `acceptEdits` was live when a prompt occurred, so mode alone does not. *(Partly answered
   below — the PATH matters as well as the mode — but the answer does not fit this session's own
   writes, so the question stays open rather than closing.)*
2. **Does `permissions.defaultMode` do anything in the VS Code extension?** Still unestablished.
   `permissionMode` reaching `acceptEdits` does not show the settings key put it there — the CLI
   default and a UI selection produce the same record.
3. **Is `permissionMode` itself the live state, or another configured value?** It varies and it
   transitions, which is much stronger evidence than the previous field had. It is not proof. It is
   read by exactly one instrument, which now makes no claim about what it means. *(Corroborated
   below: all three of its observed values — `acceptEdits`, `auto`, `default` — are members of the
   documented six-mode enum, and the refuted field's single value is not. Vocabulary was the second
   of the three cheap instruments, and it fires here too.)*

### The documented answer, supplied from outside the session (Stéan, 2026-08-21)

Every reading in this arc was derived from transcripts. The thing that settled it was **the product
documentation**, which nobody in the arc had read, and it collapses two of the three open questions
above:

- **The permission modes are six, and `normal` is not one of them:** `default`, `acceptEdits`,
  `plan`, `auto`, `dontAsk`, `bypassPermissions`. This is decisive on its own — a field whose only
  value is outside the enum is not the permission channel, no cardinality count needed. It was
  available the whole time and would have cost one lookup.
- **Writes to PROTECTED PATHS are never auto-approved.** `.git` and `.claude` are protected; a write
  under either raises a prompt in every mode a pipeline would actually run in. `bypassPermissions` is
  the sole exception, and `dontAsk` — the mode whose name suggests otherwise — DENIES a protected-path
  write rather than approving it. `auto` is plan- and model-gated, so it is not a general answer either.

That is fatal to the handoff protocol as built. The protocol put every agent artefact in
`.handoff/`'s predecessor, `.claude/handoff/` — inside the one tree the permission system refuses to
wave through — so an unattended pipeline stalls on a prompt per artefact, BY DESIGN, with no hook and
no settings rule able to change it. Two corroborating observations that had been sitting unexplained:
writes to `brief/**` and to the scratchpad never prompted in any session, and both are outside
`.claude/`.

**The fix is structural, not diagnostic: move the handoff root out of `.claude/`.** Done 2026-08-21 —
repo-root `.handoff/<task-slug>/`, gitignored, same shape; `SCOPES` in `agent-write-scope.js` changed
by one string per agent; the two `Write(.claude/handoff/**)` / `Edit(.claude/handoff/**)` allow lines
in `settings.json` deleted as no longer addressing anything. Everything else in the protocol stands.

### What this session's own evidence does NOT let us claim

Stated because the temptation is to file this closed, and because a symptom table that reads all-yes
on the first pass is the failure this entry exists to record:

> **⚠ THIS SECTION'S ARGUMENT IS WITHDRAWN — it counted the wrong population.** All the writes below
> are MAIN-SESSION writes; the prompting complaint is about SUBAGENT artefact writes, and **zero
> subagent writes are recorded in any transcript** (E14 proves this with a positive control). A
> contradiction between main-session behaviour and a subagent-write claim is not a contradiction. The
> counting is kept because the figures are correct and the lesson about *which* figure to count is
> the point; the inference drawn from them is not. E14 answers the question properly, and its answer
> — neither path prompts — happens to land in the same direction by a different route.

The first draft of this section said "roughly a dozen" writes under `.claude/` outside handoff. **It
was counted instead, over the four transcripts on this machine, and the real figure is 27 distinct
files across 125 write calls — every single one with `permissionMode` reading `acceptEdits`, and none
reported as prompting.** The heaviest are the hooks themselves (`context-budget.js` ×27,
`bash-gate.js` ×23, `agent-write-scope.js` ×16, `statusline.js` ×13) and — the one that should settle
the "narrower protected set" reading — **`.claude/settings.json` itself, 13 times**, plus
`settings.local.json`. If any path in that tree is protected, the permission file is.

Meanwhile the one prompt Stéan reported on a write in that window was `hook-path-probe-DELETE-ME.md`
at the REPO ROOT — outside `.claude/` entirely — and the mode live at that write, recovered from the
transcript, was **`acceptEdits` as well** (`2026-08-21T09:42:52Z`). So the two observations are the
inverse of what "protected-path writes prompt, ordinary writes do not" predicts, on both halves, with
the mode held constant across them. Mode does not separate them; path does not separate them.

**One of the two surviving readings is now dead.** "An explicit `permissions.allow` entry overrides
the protection" requires such an entry to exist, and all three settings files were read: project
`settings.json` allows `Bash`, `WebSearch`, `WebFetch` and a list of read-only Supabase tools and
nothing else; `settings.local.json` carries five `Bash(...)` entries; the user file at
`~/.claude/settings.json` grants `Write`/`Edit` only under `brief/**` and a OneDrive path, plus
`Read(...)` on `.claude/agents/**` — **no `Write` or `Edit` rule anywhere covers `.claude/hooks/`,
`.claude/rules/`, `.claude/agents/` or `settings.json` itself.** (`additionalDirectories` lists
`.claude\rules`, which grants reachability, not approval — and does not cover the hooks or the
settings file, which took 66 of the 125 writes between them.)

So what is left is that the protection, as this build applies it, does not cover an ordinary
`Write`/`Edit` under `.claude/` in `acceptEdits` — or covers a narrower set than the documentation's
wording suggests. **The move is still correct: it removes the dependency on the answer**, which is
precisely why it remains not-evidence, and why the hook's header says so at the site rather than only
here. What it is no longer is a mystery with a settings-file explanation available.

**And the counting instrument is the lesson repeating one section later — twice, in opposite
directions.** "Roughly a dozen" was a recollection written into a document that had just spent 3,000
words on why recollections about the tree must be counted; counting cost two minutes and moved the
figure by an order of magnitude. Then the corrected count was *itself* wrong at a level the count
could not see, because **a cardinality is only as good as the population it ranges over.** 125 is the
right number for the wrong set. L-45 says a new channel is a hypothesis until you count it; the
missing half is that **counting a channel does not establish that it contains the thing you are
asking about** — one `isSidechain` tally would have shown it did not, and that tally is as cheap as
the first one. Anchored: transcripts under `~/.claude/projects/c--dev-pleks/`, as at 2026-08-21.

### The kit gap, which survives the refutation intact

It was asserted that `dev-standards` ships `defaultMode: acceptEdits` and every adopter inherits a
dead line. **Grepped: `defaultMode` appears NOWHERE in `dev-standards` — zero hits.** So it is a
pleks-local dead line, not a kit defect — but the correction inverts into a worse finding rather than
dissolving: **the kit says nothing about permission mode at all.** An adopter installs the pipeline
protocol, hits a prompt on every agent artefact write, and has nothing to name the failure by — the
exact cost incurred here, arriving with no documentation to recognise it. That gap does not depend on
which field is the live one, so it is actionable now: the kit needs the mode as a SETUP STEP WITH ITS
SYMPTOM NAMED. What it must NOT yet claim is which field to read or what a mode guarantees.

### The methodological finding, which is the part that generalises

The original finding was: **when a search comes up empty, ask which CHANNEL you have not read, not
which PATTERN you have not tried.** That still holds, and it is what got the arc unstuck. But on its
own it produced three wrong answers in a row, because opening a new channel feels like progress
whether or not the channel means anything.

The complement is the one this entry was written to add, and it is cheap enough that there is no
excuse for skipping it:

> **A NEW CHANNEL IS A HYPOTHESIS UNTIL YOU COUNT IT. Before believing a field reports a state,
> measure its CARDINALITY ACROSS SESSIONS. A constant is not a state.**

It takes one pass over the transcripts already on disk. It requires no theory about what the field
means, which is exactly why it works when the theory is wrong — it is a question about the DATA, not
about the story, and every wrong reading in this arc was defeated by a story that fit.

Three properties make it the right first check, in order of how often each would have fired:

- **Cardinality 1 ⇒ not a state.** Refutes outright. This is what settled it.
- **Vocabulary.** `normal` is not a permission-mode value; `default` is, and it was on the other
  field. Free, and available from the moment both fields were visible.
- **Transitions within one file.** Positive evidence — a field that changes mid-session tracks
  something changeable. `permissionMode` does; nothing else looked at did.

And the scope note that makes all three usable: **none of them can be run against a single session.**
Within one transcript a constant and a steady state are byte-identical, which is why the "confirming"
check — re-reading this session and finding `normal` again — reported success while proving nothing.
The instruments now read the counted field (`2b3a9ca9`), with a probe putting BOTH fields in
disagreement in one fixture, since that is the only configuration where reading the wrong one is
detectable at all.

---

## E14 · Does a SUBAGENT write prompt because of the PATH, or because it is a subagent? — **RESULT WITHDRAWN AS CONFOUNDED. The secondary result stands, and the documentation answers the primary question outright.**

**Pre-registered 2026-08-21T13:33Z, before the spawn.** Written first precisely because E13's arc
shows what happens when the reading is composed after the result is in view.

### Why E13's evidence could not answer this

E13's contradiction — 126 unprompted `.claude/` writes against a documented "protected paths always
prompt" — was measured over the wrong population, and the measurement that shows it is one line:

| population | writes to `.claude/` (non-handoff) | writes to the handoff dir |
|---|---|---|
| main session | **126** | 26 |
| subagent (`isSidechain: true`) | **0** | **0** |

**58 `Agent`/`Task` spawns are recorded and not one subagent tool call appears in any transcript.**
`isSidechain` exists in the record schema and is `true` on zero of 34,279 records. So subagent turns
are not written to the project transcript at all, and NO transcript-derived count can speak to them.
E13 compared main-session writes against a subagent-write complaint and called it a contradiction.
That claim is corrected there rather than deleted; this entry is the measurement it needed.

### The instrument that does exist, and its asymmetry

`toolDenialKind: "permission-rule"` — 12 records across four transcripts, carrying timestamp and the
tool input, including `"Permission to use Bash with command rm -f …"` and `"The user doesn't want to
proceed with this tool use"`. **It fires when a prompt is REJECTED and records nothing when one is
APPROVED.** E13's statement that no instrument detects a prompt is therefore half wrong, and the half
that is right is exploitable: *reject every prompt* and each one writes itself into the transcript.
The human stops being the detector and becomes the trigger for a logged one.

Known limit, stated before the run: if subagent turns are unrecorded, a denial raised inside a
subagent's context may be unrecorded too. Stéan's observation remains the primary channel; the
`toolDenialKind` sweep is a second, and disagreement between them is itself a result.

### Design

One `census` spawn, TWO writes, same run, same mode, same actor:

1. `.handoff/perm-probe/01-census.md` — treatment (the post-move location)
2. `.claude/perm-probe/01-census.md` — control (inside the protected tree)

`.claude/perm-probe` is temporarily added to `census`'s `SCOPES` for this run. **Without that, the
control write is hook-DENIED — terminal, and raising no prompt — which is exactly the confound E12
hit and recorded.** A treatment with no control is what produced three wrong answers in E13's arc.

Stéan REJECTS anything that prompts, rather than approving it.

### The three branches, fixed in advance

| observed | reading |
|---|---|
| prompt on the `.claude/` write ONLY | Protected-path theory HOLDS for subagents. The handoff move is the fix. The 126 main-session writes become a separate question, not a refutation. |
| BOTH writes prompt | Path is irrelevant — a subagent write prompts as such. The move does not help, and the pipeline needs a different fix (an allow rule for `.handoff/**`, or a mode). |
| NEITHER prompts | Protected paths do nothing in this build. The move is insurance, not a remedy, and the original stall had another cause entirely. |

The third row is what the control buys. Without a `.claude/` write in the same run, "no prompts"
reads as success — the treatment appearing to work because nothing was ever going to prompt.

A fourth outcome is possible and would supersede the table: **the subagent raises no prompt at all
and instead fails or silently proceeds**, which is E12's open hypothesis (a subagent has no channel
to ask). If that is what happens, this hook is the only gate below the top level, and every claim
resting on "the user would be asked" is false for agents.

### Result — run 2026-08-21T13:34Z, `permissionMode: acceptEdits`, branch THREE

**Both writes succeeded. Neither prompted. No denial was recorded.**

| arm | path | tool result | prompt |
|---|---|---|---|
| treatment | `.handoff/perm-probe/01-census.md` | `File created successfully` | none |
| control | `.claude/perm-probe/01-census.md` | `File created successfully` | none |

`toolDenialKind` records in the window: **0**. Both files verified on disk by the agent's own
`ls -la` (204 and 382 bytes, 15:34 local). The agent was instructed to quote any rejection text
verbatim and reported none, while correctly refusing to assert anything about a UI dialog it has no
channel to see.

**That was read as branch three — "protected paths do nothing in this build" — and it is wrong.**
The reading survived about twenty minutes, until the protected-path documentation was actually
looked up. Two documented sentences dissolve it:

- **`acceptEdits` PROMPTS on a protected path.** Not "is allowed" — prompts. The per-mode table is
  explicit (`default` prompts, `acceptEdits` prompts, `dontAsk` denies, `bypassPermissions` allows,
  `plan`/`auto` route to the classifier).
- **Approving a `.claude/` write once offers "Yes, and allow Claude to edit its own settings for
  this session", and that auto-approves every later `.claude/` write in the SAME SESSION.**

**So the control arm was run inside a session that had already been granted.** This session wrote to
`.claude/` more than a hundred times before E14 was designed; whichever of those was first is where
the prompt appeared and the session-scoped grant was given. By the time the probe agent wrote
`.claude/perm-probe/01-census.md`, the tree had been open for hours. The experiment measured a
standing grant and reported it as an absence of protection.

**The same grant explains the 125-write anomaly in E13**, which is the more useful half: those
writes were not evidence against protection, they were evidence of one approval early in each
session. It predicts something sharp and cheap — **the FIRST `.claude/` write in a fresh session
should prompt, and only the first** — which is the re-run.

### Re-run protocol, pre-registered

**In a FRESH session, before any write under `.claude/` has occurred:** spawn one agent that writes
`.claude/perm-probe/01-census.md` first and `.handoff/perm-probe/01-census.md` second — control
before treatment this time, since the control is what contaminates. Stéan REJECTS. Branch table:

| observed | reading |
|---|---|
| the `.claude/` write prompts, `.handoff/` does not | Documentation confirmed. The move is a genuine fix. |
| both prompt | Something prompts on subagent writes independent of path — the original question, still live. |
| neither prompts | The session grant was not the confound and the documented table does not describe this build. Only THIS outcome, from a fresh session, would support what E14 originally claimed. |

**A precondition check belongs in the protocol, not in the reasoning afterwards:** the run is only
valid if no `.claude/` write precedes it in that session, and that is verifiable from the transcript
before spawning. E14 had no such check because the confound was not known — which is the argument
for reading the documentation of a mechanism *before* designing the experiment about it, not after.

**Result depended on one human step**, stated when it was written and still true: Stéan was
instructed to REJECT any prompt. Both writes succeeded, which is consistent with "no prompt appeared"
and inconsistent with "a prompt appeared and was rejected".

### The secondary result, which is larger than the primary one

**Subagent tool calls are not recorded anywhere in the project transcript, and this run proves it
with a positive control.** Two writes are known to have happened — the files are on disk, the agent
quoted the tool results — and a sweep of all 94 records written after the spawn window found:

| looked for | found |
|---|---|
| `isSidechain: true` records | **0** |
| `tool_use` records naming `perm-probe` | **0** |
| `toolDenialKind` records | 0 |

Before this run, "subagent turns are unrecorded" was an inference from an absence (58 spawns, no
sidechain records) and could have meant the agents simply never wrote. Now it is a measured blind
spot: writes we can PROVE occurred appear nowhere. Consequences, and neither is small:

- **No transcript-derived count can say anything about subagent behaviour.** That is what invalidated
  E13's contradiction, and it applies to every future measurement of this kind — including any
  attempt to audit what an agent did after the fact. The `agent-write-scope` hook is not merely the
  enforcement point; **it is the only place a subagent's writes are observable at all.** A hook that
  logged its decisions would be the only audit trail there is.
- **`toolDenialKind` cannot detect a prompt raised inside a subagent's context.** The asymmetric
  instrument this entry was built around does not reach the population it was aimed at. It remains
  valid for main-session prompts, which is where E13's one unexplained prompt lives.

### The documented list, which is what should have been read first

`.handoff/` clears — and the reason to record the whole list rather than that one fact is that the
docs' usual phrasing is *"such as `.git` and `.claude`"*, and picking a second protected path would
have repeated the bug silently. It IS enumerated, in the "Protected paths" section of the
permission-modes documentation:

**Directories** (prefix match): `.git` · `.config/git` · `.vscode` · `.idea` · `.husky` · `.cargo` ·
`.devcontainer` · `.yarn` · `.mvn` · `.claude` — **except `.claude/worktrees`**, which Claude writes
to itself.

**Files** (exact name): `.gitconfig` · `.gitmodules` · the shell rc/profile family (`.bashrc`,
`.bash_profile`, `.zshrc`, `.profile`, `.envrc`, …) · the package-manager rc family (`.npmrc`,
`.yarnrc`, `.yarnrc.yml`, `.pnp.cjs`, `.pnpmfile.cjs`, `bunfig.toml`, …) · `.bazelrc` ·
`.pre-commit-config.yaml` and the lefthook family · the gradle/maven wrapper properties ·
`.devcontainer.json` · `.ripgreprc` · `pyrightconfig.json` · `.mcp.json` · `.claude.json`.

**There is no dotfile wildcard.** A repo-root `.handoff/` is unaffected; `.claude/.handoff/` would
not have been. Two further documented points, both load-bearing here:

- **Protection runs BEFORE `permissions.allow` is evaluated**, so an `Edit(.claude/**)` entry cannot
  pre-approve a protected-path write. This is the documented form of what was established by
  inspection in E13 (no such rule existed anyway) — and it retires the two `Write`/`Edit`
  `(.claude/handoff/**)` lines as having been incapable of working, not merely unnecessary.
- **Bash redirections (`>`, `>>`, `2>`) are covered too**, not just the edit tools.

**NOT documented, and it is the gap this entry actually needed:** whether the protected-path guard
applies to a SUBAGENT's tool calls the same way it applies to the main session. That is precisely
E14's primary question, and it remains unanswered by documentation — so the re-run above is still
the only way to settle it.

### Cleanup

`.claude/perm-probe` removed from `census`'s `SCOPES`; both probe directories deleted. The temporary
entry lived for one run, as pre-registered.

---

## E15 · Does `autoCompactWindow: 300000` actually fire? — **ANSWERED: YES, and it is the one settings claim in this sweep that measurement CONFIRMS**

**2026-08-21.** Raised as a suspected layer-claim violation (canon §4.6): `dev-standards/README.md`
§1 calls this key *"worth more than every other efficiency measure combined"*, and **nothing had
measured that it does anything.** The spec's own supporting table shows a compaction taking context
from ~1M to ~16k — which demonstrates that COMPACTION works, not that the WINDOW fires at 300k. Those
are different claims and only one of them had evidence.

### The measurement, which was free and already on disk

`compactMetadata.preTokens` on every `compact_boundary` record across this machine's transcripts.
Near 300k means the key fires; near 1M means the harness default is still in force and the key is
inert. There is a natural before/after: the key landed partway through, so the two sessions either
side of it are the control and the treatment.

| session | date range | trigger | preTokens |
|---|---|---|---|
| `2678b6e4` (before the key) | 15–19 Aug | auto | **1002k · 1002k · 999k** |
| `0d9dadd6` (after the key) | 20–21 Aug | auto | **267k ×6 · 268k ×3 · 269k · 271k · 273k · 317k** |

**n = 12 after, 3 before, and the step is ~1000k → ~268k exactly at the key's arrival.** No overlap
between the two groups; nothing else changed that would move an auto-compaction threshold by a
factor of four. The two `manual` boundaries (735k, 688k) are user-initiated and carry no information
about the window.

**Verdict: the key fires.** README §1's headline claim is supported. Note the trigger sits *under*
the configured window — 267k against 300k, consistently — which is consistent with firing on a
PROJECTED overshoot rather than on crossing the line, and is worth remembering if anyone later reads
"it compacted at 267k, not 300k" as a discrepancy. The one 317k outlier is above the window; a single
point, unexplained, not worth a theory.

### Why this entry exists even though the answer is "it works"

Because the sweep that produced it was looking for violations, and **a sweep that only records its
confirmations is not a sweep.** Three settings claims were examined in one pass and they landed in
three different places:

| claim | verdict |
|---|---|
| `Write(.claude/handoff/**)` pre-approves a protected-path write | **INCAPABLE** — protection is evaluated before allow rules |
| `permissions.defaultMode` controls the live session mode | **UNVERIFIED** — the evidence against it dissolved (E13 row 4); measure, do not delete |
| `autoCompactWindow: 300000` sets the compaction threshold | **CONFIRMED by measurement** |

A pattern-match on "settings keys implicated in the permission mess" would have condemned all three.
One was genuinely incapable, one had no evidence either way, and one was the single most valuable
line in the file. That spread is the argument for §4.6's guard — *can this layer enforce it*, not
*is this claim currently suspected* — and it is why the guard was written at the point of
application rather than left as a principle.

**RE-RUN TRIGGER:** on any CLI major upgrade, and on any change to the key's value. Re-running is one
pass over `compactMetadata.preTokens` and needs no session in a particular state.

---

## E16 · What do the three delegation modes actually cost, and is the work worth it? — **HALF-ANSWERED, TASK 2 ONLY: the workflow did 2.2× the work for 2.0× the spend, at a LOWER price per unit of work. Whether that work was worth doing is UNMEASURED**

⚠ **E16 is task 2's nine runs and nothing else.** It was pre-registered as 27 runs (3 tasks × 3 arms
× 3 replicates); tasks 1 and 3 were **substituted after six runs and conditioned on task 2's result**,
so they carry their own id and their own pre-registration — **E17**, at the end of this file. The
split exists to make a pooled headline unwriteable: under one id somebody eventually writes "E16
found X across 27 runs", and that sentence spans a design change without saying so.

**Question.** For the same task, how do (A) the main session working alone, (B) the original
agent-handover protocol, and (C) the current agent workflow compare on **wall-clock, tokens, and
quality of output** — and does any cost difference buy anything?

**Pre-registered before any arm runs.** Everything below — tasks, metrics, rubric, scoring — is
fixed now, because the person scoring quality is also the thing being scored. A rubric written after
seeing the results is a rationalisation, and this experiment's whole value is that its numbers can be
disbelieved by someone who was not there.

### Design

**Baseline commit: `1c9b6bbd`** (`main`, immediately after PR #265 merged). Pre-registered as **27
runs: three tasks × three arms × three replicates** (settled 2026-08-23 — see the decisions section),
**each in a fresh worktree cut explicitly from that SHA and discarded after.**

⚠ **E16 as REPORTED is the nine runs of task 2 (M-022).** Task 2 ran first as a pilot; on its
sixth run, tasks 1 and 3 were **substituted** — M-093 → **M-061**, M-064 → **M-087** — chosen because
delegation should pay on them, which is a choice conditioned on what task 2 had already shown. Those
eighteen runs are **E17**, at the end of this file, with their own pre-registration saying so. The
paragraphs below are the design as pre-registered on 2026-08-23 and are left standing as the record
of what was fixed in advance; where a later section contradicts one, the later section is the state.

⚠ **The worktree must be pinned to `1c9b6bbd` explicitly. E10 established that `isolation: "worktree"`
bases the tree on `origin/main` rather than the session's HEAD** — that is harmless here only because
the baseline IS `main`, and it is the reason this experiment was sequenced after the merge rather
than before it. Pin it anyway; do not rely on the default agreeing.

**⚠ RE-BASELINED 2026-08-24, BEFORE ANY ARM RAN, from `fbbc59f4` to `1c9b6bbd` — recorded here rather
than silently swapped, because a pre-registration whose parameters move without a note is not one.**
The original pin was `fbbc59f4` (`main` immediately after PR #264), and its stated rationale was that
the baseline **is** `main`, so E10's `origin/main` default would agree rather than diverge. PR #265
merged on 2026-08-24 and that stopped being true: `main` moved to `1c9b6bbd`, the explicit pin became
load-bearing instead of belt-and-braces, and a single worktree created without it would silently have
got a different tree from the other 26.

Two reasons for moving rather than holding, and the second is the one that decides it:
- The doc's own rationale for `fbbc59f4` — baseline equals `main` — now points at `1c9b6bbd`. Holding
  the old SHA would keep the letter of the pre-registration while discarding the reason for it.
- **Task 1 (M-093) is a build PLUS a migration on platform email retry, and PR #265 moved
  `010_platform_features.sql`** (the `is_platform` declaration was hoisted ~2400 lines to sit above
  its first reader). Work built at `fbbc59f4` would have to be rebased across that change to be
  usable, and this design's stated reason for choosing real register tasks is that the surviving
  arm's output is usable.

**Why this does not compromise the pre-registration.** The property pre-registration protects is that
parameters were fixed *before the results were seen*. **No arm has run.** Nothing here is being
adjusted in light of an outcome, because there is no outcome. The tasks, arms, metrics, rubric,
blinding procedure and replicate count are all untouched — and all three tasks (M-093, M-022,
M-064) are still open at `1c9b6bbd`, verified against `docs/MECHANISABLE.md` at that SHA rather than
assumed. *(As at 2026-08-24 this paragraph describes the 2026-08-23 pre-registration only: M-093 and
M-064 were later replaced, after runs existed — which is exactly the compromise its last sentence
names, and precisely why the replacements are E17 and not E16.)* **What would compromise it is re-baselining once a run exists**; if a tree has been cut,
this pin is frozen and a rerun starts a new experiment with a new id.

Same three tasks in every arm, so arm-vs-arm is a like-for-like comparison and nothing is confounded
by task difficulty. The cost of that choice is stated: 27 task-runs for three tasks' worth of
output, and 24 of the 27 trees are thrown away.

### The three arms, defined before they run

**Arm B is defined from Anthropic's published documentation, NOT from a reconstruction.** An
in-house sketch of "the normal way" that this repo's own protocol then beats is a strawman, and the
first fair reply to such a result is that the comparison was rigged at definition time. The source
is `https://code.claude.com/docs/en/sub-agents` (fetched 2026-08-23) — quoted below rather than
paraphrased, because a paraphrase is where a strawman gets in.

| Arm | What it is | Definition source |
|---|---|---|
| **A · solo** | Main session only, **enforced** — launched with `--disallowed-tools Agent Task`, both spellings. Expect zero subagent transcripts: the one arm where finding none is correct. | n/a |
| **B · delegation reachable, no workflow** | A plain brief. The `Agent`/`Task` tools are enabled and this repo's agents are advertised from their own `description` frontmatter. **No pipeline instruction** — B is never told to `/build`, and nothing directs it to the handoff contract. ⚠ **NOT a free-choice arm for tasks 1 and 2, and was never one** — see *The instruction that voids arm B*, below. **Becomes one from task 3**, via the levelled authorisation shipped 2026-08-26 in that same section; every B result already reported predates it. | `code.claude.com/docs/en/sub-agents` |
| **C · this repo's workflow** | The five tuned agents (`grounder`/`census`/`db-inspector`/`implementer`/`walker`), the handoff contract (`scripts/check-handoff-contract.mjs`), the write-scope hook, and the `/build`→`/walk`→`/wrap` sequence. | `.claude/agents/*.md`, `4-AGENT-PIPELINES.md` §9 |

⚠ **B was NOT stripped down to stock agents, and the row above said it had been until 2026-08-24.**
The original wording promised "no handoff-contract artefacts, no `.claude/handoff/` directory, no
pipeline stages" — a *suppression* that was never implemented. What actually ran is stronger for the
comparison and weaker as a claim about stock Claude Code: **B and C are bit-identical in tree and tool
configuration and differ ONLY in the prompt.** This repo's twelve agents are advertised to B exactly
as they are to C. So B is not "Claude Code out of the box" — it is *this repo, without the workflow*,
which is the contrast actually of interest. Corrected here rather than quietly rewritten, because
a reader who took the old row at face value would read a B result as evidence about stock behaviour.

### The instruction that voids arm B — found 2026-08-25, after task 1's nine runs

**Every `claude` session on this account carries the standing instruction *"Do not call the AgentTool
unless the user requested it."*** It is injected at the account level, not by this repo: it reproduces
in an empty scratch directory with no `CLAUDE.md` anywhere up-tree, and survives unsetting
`CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_MESSAGING_*` and `CLAUDE_PID`.
There is no `managed-settings.json` and no HKLM policy key on this machine. It was found by *asking a
`claude -p` run in an empty directory to print its own instructions* — one run, free, and it should
have been the first probe rather than the last.

**So arm B was never a free-choice arm, and every B result that reads as a judgment is compliance.**
B's brief contains no request for an agent, so the instruction binds; 0-for-6 across both tasks is
what an instructed refusal looks like, and it is indistinguishable in the transcript from a model
weighing the task and declining. **Arm C escapes the same instruction not by evading it but by
satisfying it** — `/build`, `/walk` and `/wrap` are skills the user invoked, and `/build` opens with a
`grounder` spawn, so C's delegation *is* user-requested. The consequence is sharper than a caveat:
**the workflow's causal role in this experiment includes AUTHORISING delegation, not only sequencing
it.** Any C÷B ratio therefore prices *authorised-and-structured* against *prohibited*, and calling
that "the workflow's overhead" over-attributes the whole gap to structure.

Two prior claims in this register are retracted by this, and both are struck at their own sites
below: that B "declined every time" **given a free choice**, and that B's refusal is evidence about
**model judgment**. `Task` being *enabled* was true and irrelevant — the arm was instructed not to use
it, and reporting the enabled tool as though it made the choice free is the error.

⚠ **The general form, because this is its second instance.** An arm defined by what is *absent* from
its prompt is only a control if you have read everything present in its context — and the account-level
system prompt is not in the prompt file, not in the repo, and not in the transcript. Both times this
register has been wrong about arm B, the cause was the same: a claim about what B *chose*, resting on
the assumption that the prompt file was the whole input.

**The fix is to LEVEL THE AUTHORISATION, not to strip the instruction** — the instruction is real and
stays. Tasks 1 and 2 are reported as they ran — **forced solo · constrained solo · authorised
workflow** — never as "delegation vs no delegation".

**SHIPPED 2026-08-26, binding task 3 onward.** `run-arm.sh` passes
`--append-system-prompt "$(cat authorisation.txt)"` — through the *invocation*, never the brief, so the
briefs stay bit-identical across arms — and `cmd.txt` records the file's sha256 per cell, so a silent
edit between cells is detectable.

| arm | authorisation | tools | prompt |
|---|---|---|---|
| **A** | identical | `--disallowed-tools Agent Task` | plain brief |
| **B** | identical | all | plain brief |
| **C** | identical | all | `/build` → `/walk` → `/wrap` |

**Two things in that table were NOT in the plan this paragraph originally described, and both are
corrections rather than refinements.**

**1 · The authorisation goes to all three arms, not to B alone.** The plan said "A prohibited
(`--disallowed-tools`, unchanged)". But the defect was never *"B lacked permission"* — it was *"the
arms differed in an instruction nobody had read"*, which is this section's own general form. Levelling
selectively re-creates that in a new place. All three now carry byte-identical text, so **A vs B differ
by one flag and B vs C by the prompt** — one dimension each, which is what the design claimed from the
start.

**2 · The first draft of the authorisation was a nudge.** It read *"use subagents where they earn their
keep"* — a recommendation, not a permission, and an arm told delegation earns its keep and then scored
on whether it delegates measures compliance with the recommendation. That is this experiment's standing
warning ("any wording that moves B measures COMPLIANCE rather than judgment") applied to the fix rather
than to the arm, and the fix walked into it. The shipped text says the opposite in as many words: *"this
is an authorisation, not an instruction: working solo and delegating are both fully acceptable, and
neither is preferred."*

**Probed both directions before first use, and the probe replaced its own predecessor.** The per-cell
capture that asked each session to reproduce its system prompt is **dead as at 2026-08-26** — the same
invocation now declines outright, *with and without* the flag, so its `NOT-REPORTED` verdict could no
longer distinguish *the clause is gone* from *the question was refused*. A control whose negative
reading is ambiguous cannot fail. It is replaced by a behavioural probe that asks about the **binding**
rather than the text — *"if a step would be well served by spawning a subagent, are you permitted to do
that without asking me first?"*:

| session | reply |
|---|---|
| unauthorised | "**Yes** — my operating instructions for this session say **not to call the Agent tool unless you request it**, so I'd need your go-ahead first" |
| authorised | "**Yes** — this session's authorization explicitly permits me to spawn subagents … leaving the decision of whether delegation actually helps to my judgement" |

The unauthorised session names the prohibition **verbatim and unprompted** — a fourth independent
replication, and the first from a session that refuses to quote its own prompt. **Both opened with
"Yes", and one contradicted itself in the next clause**, so the classifier scores the REASON and never
the verdict token; a yes/no grep would have called the defect fixed while it was still live. Three
verdicts, not two — `AUTHORISED` / `PROHIBITED` / `UNCLEAR` — so a refusal cannot collapse into either
answer.

⚠ **One limit the probe cannot reach, and arm A cannot either.** Run with A's exact flags, the session
replied *"this session's authorization explicitly covers spawning subagents … I can delegate at my own
discretion."* **It has no `Agent` tool and does not know it.** So `AUTHORISED` means *permission
granted*, never *capability present*, and no self-report can catch `--disallowed-tools` silently
failing — the class that has now voided cells twice. The detector that can needs no model:
`delegation-requests.mjs` counts Agent requests in the stream, so a **successful** Agent call in an
arm-A stream means the flag did not bind and the cell is void. **Unsuccessful** attempts are expected
under the levelled authorisation and are data, not defects — they say A wanted to delegate, a reading
arm A could not previously produce at all.

The documented behaviour arm B is being held to, verbatim from that page:

> "Each subagent runs in its own context window with a custom system prompt, specific tool access,
> and independent permissions."

> "When Claude encounters a task that matches a subagent's description, it delegates to that
> subagent, which works independently and returns results."

> "the subagent does that work in its own context and returns only the summary"

Two consequences for the measurement, both following from that first quote rather than from anything
this experiment assumes. A subagent's context window is **its own**, so arm B and arm C both move
spend out of the main transcript and into files the main transcript never references — which is the
confound below. And the main session sees **only the summary**, so any quality difference between B
and C must come from what the delegation prompt asked for and what the report was required to carry,
not from the main session having watched the work.

**⚠ AMBIGUITY IN ARM B, RESOLVED 2026-08-24 BEFORE ARM B RAN (Stéan's call).** The definition above
reads two ways, and they measure different things: the repo's five tuned agents **are** `name` +
`description` frontmatter agents, so "delegation exactly as documented" does not by itself say
whether they are present.

**Resolved: arm B keeps the same agents and loses the WORKFLOW.** Arm B is a plain prompt with
delegation allowed and Claude deciding whether to delegate from the descriptions; arm C is the same
tree invoked through `/build` → `/walk` → `/wrap`. The isolated variable is therefore **the
workflow**, not the agent definitions.

Why not the other reading: removing `.claude/agents/` from an arm-B tree makes
`check-rules-tracked.mjs` fail on "a file git tracks that is gone from disk", so all nine arm-B runs
would have failed **criterion 1** for a reason having nothing to do with the task, and the experiment
would have reported "stock delegation cannot get the gate green" — manufactured entirely by the
harness. Exempting that check per-arm would have added a second tree difference to an experiment
designed to have one variable.

**The probe that forced this, and why it is recorded rather than quietly worked around:** the plan was
to suppress the tuned agents at invocation with the CLI's agent-definition flag. Probed both
directions in the arm-B worktree at `1c9b6bbd` — the control listed `census, crawler-doctrine,
db-inspector, grounder, implementer, walker` alongside the stock set, and the flag **changed nothing**:
it merges, it does not replace. An arm B configured that way would have been arm C under a different
label, producing a "workflow makes no difference" result that no reader could have detected from the
output. **Consequence for scoring:** arm B may legitimately choose not to delegate at all, and zero
subagents is then a real finding about the default rather than a harness failure — the reconciliation
finding only fires when `Agent` calls happened and their transcripts are missing, so it stays quiet
here correctly.

⚠ **Arm B is not "arm C minus the good parts".** It is the documented default with the repo's
customisations removed — which means arm B still gets `CLAUDE.md` (the docs are explicit that "every
level of the CLAUDE.md hierarchy the main conversation loads" is in a subagent's initial context, and
E3 measured the same thing independently). An arm B stripped of CLAUDE.md would be cheaper and worse,
and the resulting margin would be this experiment's own construction.

**Tasks — real open register work, so the surviving arm's output is usable:**

| # | Task | Shape | Why chosen |
|---|---|---|---|
| 1 | **M-093** — retry-replay superset check | build + migration | largest; has a genuine design fork (persist vs declare-exempt) |
| 2 | **M-022 SQL half** — `ON CONFLICT` on `auth.users` by table, not by clause | build | smallest; **has a known false-positive trap** (`honeytoken_emails`) already measured |
| 3 | **M-064** — a check must not depend on how the tree was materialised | build | most investigative; least specified up front |

Task 2 is the control for *classification honesty*: the correct answer is **zero violations**, and a
naive implementation scores 1/2 by flagging the honeytoken seed. An arm that reports "1 violation
found and fixed" has failed that task regardless of how fast it was.

### Metrics — every one from transcripts, none self-reported

**Nothing in this table is a number an agent tells you.** Self-reported token counts are unfalsifiable
and would be the single easiest place for this experiment to lie to itself.

| Metric | Source |
|---|---|
| wall-clock per task | first→last transcript timestamp for the run |
| **active time** | sum of gaps between consecutive records **shorter than 60s**; longer gaps counted as idle |
| `input_tokens` · `cache_creation_input_tokens` · `cache_read_input_tokens` · `output_tokens` | `message.usage` per assistant line, **all four reported separately per arm** |
| weighted cost units | same multipliers `.claude/hooks/context-budget.js` already applies |
| turn count · tool calls by type | transcript line counts |
| subagent count · **max spawn depth** · spend by agent type | `agent-*.meta.json` sidecars |
| reconciliation shortfall | depth-1 sidecars vs `Agent`/`Task` tool calls in the main transcript |

**Why active time as well as wall-clock.** Wall-clock over a session that sat overnight measures when
the human went to bed. Active time is the closest honest proxy for how long the work took, and it is
a **floor, not a duration**: any single model turn longer than the threshold is discarded as idle. The
threshold is printed beside the number rather than buried, so a reader can reject it. Both are
reported; neither is presented as "the" time. Measured on session `0d9dadd6`, the two differ by more
than 5× (77h wall against 15h active), which is the whole reason for carrying both.

⚠ **Subagent active time OVERLAPS the main session's rather than extending it** — agents run inside
the parent's wall clock. It is reported as its own figure and never summed into the run duration;
summing would inflate a delegating arm's apparent time and, paradoxically, understate its efficiency.

**Cache split is reported per arm, not just the weighted total.** The arms are expected to differ in
*shape*, not only in size: a delegating arm trades the main session's enormous cache reads for many
small fresh subagent contexts with high cache-WRITE. Collapsing that into one weighted number would
hide the mechanism the experiment exists to find.

### This run also answers M-21

M-21 asks whether the subscription quota counts a cache read at 0.1× or 1×. The harness already emits
raw and weighted sums for a bounded window, and each arm is a bounded window with a known start and
end. **Compare `/usage` attribution for the run window against both sums.** If the quota tracks the
weighted figure, the 0.1× multiplier `.claude/hooks/context-budget.js` applies is vindicated; if it
tracks raw input, every context-cost estimate this repo has made is out by roughly an order of
magnitude, in the direction of comfort.

This is recorded as a **secondary outcome, pre-registered** — not a finding to go looking for
afterwards in whichever direction the numbers happen to support. It may also be inconclusive:
`/usage` may not resolve to a window this tight, and if so that is the result.

⚠ **THE CONFOUND THAT WOULD HAVE INVALIDATED THE WHOLE THING, and it is already documented in this
repo.** `.claude/hooks/context-budget.js` records that subagent spend is **not in the main
transcript** — zero lines carry `isSidechain` despite 32 `Agent` calls in the session it measured;
subagent transcripts are separate files at `<transcript-dir>/<sessionId>/subagents/agent-*.jsonl`.
Arms B and C spend most of their tokens there. **A harness reading only the main transcript would
report the two delegating arms as dramatically cheaper than the solo arm — an error pointing exactly
in the direction that flatters the thing being tested.** The harness MUST sum main + every subagent
file, and MUST also report them broken out, because "where the spend went" is half the finding.

**Probe the harness before trusting it:** run it against a session with a known `Agent` call and
assert the subagent tokens are non-zero. A harness that silently finds no subagent files reports a
clean, plausible, wrong number.

### Outcome — recorded first, because a cheap arm that did less is not a cheap arm

**Cost without outcome is uninterpretable.** Three arms with different token counts and unmeasured
completion invites exactly one reply — *arm C was cheaper because it did less* — and that reply
cannot be answered after the fact. So the first three columns of every run's record are outcome, not
cost, and an arm that did not complete has its cost reported as **incomparable**, not as a win.

| Field | Values |
|---|---|
| **completed** | `yes` / `partial` / `no` — did the arm produce the artefact the task asked for? |
| **gate** | `npm run check` exit code, run identically in every tree |
| **quality** | the six criteria below |

An arm scoring `partial` still has its numbers recorded — a partial run's cost is real data about
what that mode spends before stalling — but it is excluded from any cost comparison and the exclusion
is stated in the results table rather than in a footnote.

### Quality — scored against fixed criteria, not impressions

Per task, decided now:

1. **Gate green** — `npm run check` exits 0. Binary.
2. **Probed both directions** — a planted violation FAILS and a known-good case PASSES. Count each arm's probes; an arm with only failure-direction probes scores zero here, per the 2026-08-19 scar.
3. **Classification honesty** — for task 2, the correct answer is zero violations. Did the arm classify per site, or sweep?
4. **Baseline/allowlist discipline** — entries carry reasons; nothing widened to make the gate green.
5. **Register hygiene** — is the entry closed honestly, including what the build does NOT cover?
6. **Adversarial survival** — `walker` run identically against all 27 outputs; count surviving findings.
   ⚠ **Each walker report is written to its own numbered path — `<task>/<replicate>/walker.md` — and
   never appended to a shared artefact.** This is **M-076** landing on the one criterion that spans
   all 27 runs: the register entry's finding is that the practice had drifted to appending walker
   output in place, which across 27 runs would leave 26 of them overwritten and the 27th reading as
   the whole result. The run outputs are already path-separated by the blinding procedure below; the
   *reports* need the same treatment and do not get it for free. Stated as protocol because M-076's
   sequential-numbering half is unbuilt — nothing will fail if this is skipped, which is precisely
   why it is written down.

Criteria 1, 2, 3 and 6 are countable by someone who was not present. Criteria 4 and 5 are judgement,
and are marked as such in the results table rather than blended into a single score.

**No single "quality number".** Tokens-per-quality-point is the tempting summary and it is not
computed here, because a scalar quality score would be invented precision — the arms differ in kind
(a swept 1/2 on task 2 is not "half as good", it is wrong). Report the six criteria alongside the
cost, and let the trade-off be read rather than asserted.

**Scoring is BLIND, and blinding is a procedure, not an intention.** Before criteria 3, 4 and 5 are
scored, each run's output is exported as a bare diff to `<task>/<letter>.diff` where the letter is
assigned by a shuffle recorded in a sealed file, with arm labels, worktree paths, agent mentions and
`.claude/handoff/` artefacts stripped. The scorer reads the diffs, writes the scores, and only then
opens the mapping. Criteria 1, 2 and 6 need no blinding — they are counts a script produces.

⚠ **Blinding here is weaker than it sounds and the weakness is stated now.** The main session that
scores these diffs is the same session that wrote them, so it may recognise its own output regardless
of the labels — an arm-C diff carrying handoff-shaped structure is identifiable even with the
artefacts removed. The shuffle removes the *label*, not the *fingerprint*. That is why criteria 1/2/6
carry the weight, why the mapping is sealed before scoring rather than after, and why Stéan's
spot-check is part of the design and not a courtesy.

**Conflict of interest, stated.** The main session scores arms it produced. Mitigations: the rubric
above is fixed before any run; criteria 1/2/3/6 are mechanically checkable; `walker` is adversarial
by construction and runs identically on all 27; scoring is blinded as above; and Stéan spot-checks
at least one arm per task against the raw transcripts. This does not eliminate the bias — it makes it
visible. **If the result is that arm C wins, that result is worth less than a null one**, because it
is the outcome the person running the experiment is invested in; it should be reported with that
asymmetry stated, not with the margin emphasised.

### Status

**PRE-REGISTERED. Harness BUILT and PROBED 2026-08-23. No arm has run yet.**

`scripts/transcript-metrics.mjs` — `--selftest` (pure, 29 cases, in the gate), `--probe` (reads real
transcripts, run manually before any arm), and a report mode taking `--since`/`--until` so one arm's
slice cannot inherit another's spend, plus `--project-dir`, `--label`, `--expect-subagents` and
`--json`.

**The project directory is derived from cwd, never hardcoded, and the script refuses to guess.**
Each arm runs in its own worktree, which is its own path, which is its own
`~/.claude/projects/<slug>` — a hardcoded slug would have pointed all 27 runs at the main
checkout's transcripts and reported the same tree three times as a comparison. When the derivation
finds nothing, the script names the candidate directories and exits rather than falling back to one.

**The confound probe passes, and the number it returned is the argument for the whole design.** On
this repo's own session `0d9dadd6` as at 2026-08-23: **36 subagent transcripts carrying 43.90M
weighted units that the main transcript does not contain — 22.3% of total spend.** A
main-transcript-only harness would have reported that session as costing ~153M instead of ~197M, and
would have understated any delegating arm by roughly that fraction. (The session was still running
when measured, so those totals grew as it went; the ratio is the durable part, not the absolutes.)

**⚠ RETRACTED 2026-08-24 — THE "CORROBORATION" WAS TWO COPIES OF ONE DEFECT AGREEING.** This
paragraph read: *"Independently corroborated. `.claude/hooks/context-budget.js` computes agent spend
by its own route and reported '36 invocations, ~43.9M billable-equivalent' for the same session. Two
implementations, written for different purposes, agreeing to three significant figures — which is
worth more than either number alone, and is the closest thing available to a calibration."*

It is not a calibration. **Both scripts summed `message.usage` per transcript LINE**, and one API
response occupies several lines — text, thinking, and one per `tool_use` block — each repeating the
same `usage` object. Both therefore billed a response once per content block, and they agreed
because they shared the defect. This is precisely the trap `check-migration-forward-refs.mjs`'s own
header names: *"a defect both artefacts inherited together agrees with itself. Independent
verification needs an independent reference point."* Agreement between two instruments is evidence
only when they are independent, and these two were not — they were written by the same hand from the
same wrong model of the transcript format.

**Found by an actual independent reference, which existed the whole time and was not used:** the
CLI's own `result` event. On E16 arm A (task 2, r1, session `f2781cac`, 2026-08-24) the transcript
held **170 assistant lines with usage but only 103 distinct `message.id`s**. Per-line: 22,374,437
cache-read. Per-id: 14,520,451 — matching the `result` event exactly, to the token.

**Why this could not be waved through as uniform inflation.** The factor is `lines ÷ ids`, which is
behavioural: an arm emitting more tool calls per response inflates more than one that does not. It
biases arm-vs-arm comparison along the exact axis this experiment measures.

`scripts/transcript-metrics.mjs` was corrected the same day to bill once per `message.id`, with
probes in all three directions (split response billed once; distinct ids still summed; a usage
record with no id counted rather than dropped, erring toward over-counting rather than silent loss).
**`.claude/hooks/context-budget.js` is NOT fixed** — its incremental-offset reader needs the seen-set
persisted across reads, which is a build rather than a line. Filed as **M-096**. Until it lands,
every figure that hook has printed — including the per-turn context cost in this repo's own session
banners — is inflated by that factor.

**What survives of the numbers above.** The 43.90M and ~197M absolutes are wrong and are left
standing above only so this retraction has something to point at. The **22.3% ratio is probably
approximately right** — main and subagent transcripts inflate by similar factors, so the quotient
largely cancels — but it is now an unverified estimate rather than a measurement, and the argument
for summing subagent files does not depend on its precision.

**What the same run says about weighting.** main + subagents: 1,410M cache-read against 7.16M
output. Counting output tokens — the intuitive proxy — would have measured about half a percent of
the real cost and ranked the arms on noise.

**The `Agent×31` vs 36-files gap is RESOLVED, and it was nesting.** Recorded here on 2026-08-23 as
unexplained, with nested spawns and compaction boundaries both named as candidates. Each
`agent-<id>.jsonl` has a companion `agent-<id>.meta.json` carrying
`{agentType, description, toolUseId, spawnDepth}`, and reading them settles it exactly: **31 sidecars
at `spawnDepth: 1`, all 31 `toolUseId`s matching an `Agent` `tool_use.id` in the main transcript, and
5 at `spawnDepth: 2`** — the census→census spawns. Not compaction. The count was never wrong; it was
counting a different thing.

That turns a stated imprecision into two assertions the harness now makes:

- **Reconciliation.** Depth-1 sidecars are matched against `Agent`/`Task` calls. *Fewer* transcripts than
  calls is a FINDING and exits non-zero — that is spend which really happened and was not found, and
  it is the direction that flatters a delegating arm. *More* is reported, not failed. A windowed read
  never raises it, because a window legitimately clips the spawning turn out of the main transcript.
- **Nesting.** Depth comes from `spawnDepth`, not from directory layout — **depth-2 transcripts are
  written FLAT into the same `subagents/` directory**, so a glob finds them but cannot tell you they
  were nested. Max depth is reported per arm. This was the review's sharpest point: if arm C's agents
  fan out further than assumed and those transcripts went uncounted, arm C's cost would be understated
  and the experiment would flatter its own method. They are counted, and now they are also labelled.

⚠ **The delegation tool has TWO spellings and the harness must count both.** A `claude -p` session
names it `Task`; an orchestrating session names the same tool `Agent`. Counting only `Agent` reported
**zero delegations for a session that had delegated** — silent, and in the direction that makes a
delegating arm look solo. Fixed before the E16 batch (`transcript-metrics.mjs`, and `live.sh` in the
run harness); the two labels above said `Agent` alone until 2026-08-24 and are corrected rather than
left, because a label that names one half of what a control checks is how the next reader concludes
the other half is unchecked.

Spend by agent type for that session, which is the shape arm C is expected to produce:
`census×12 17.32M · implementer×5 13.00M · grounder×14 7.20M · walker×4 6.12M`. Note that `census`
costs more in total than `grounder` on **fewer** invocations — repo-wide greps are the expensive
delegation, and that is a prediction arm C can be checked against rather than a post-hoc observation.

**A defect the live run caught, recorded because it is the class this experiment is most exposed to.**
The first fix for the hardcoded project directory derived the slug from `process.cwd()` — which
returns `C:\dev\pleks` with a capital drive letter, deriving `C--dev-pleks`, while the directory
Claude Code actually wrote is `c--dev-pleks`. **Windows' case-insensitive filesystem hid it
completely**: `existsSync` returned true, the report ran, every selftest passed (they fed the function
lowercase literals, not `cwd()`), and the only symptom was a wrong-looking path in a header nobody
would have read. On a case-sensitive filesystem the same code refuses to guess and the arm produces
no datum. Fixed by resolving the derived slug against the real directory listing case-insensitively
and returning the on-disk name — the derivation is a hypothesis, the listing is the check. The
general form: **a green probe on a forgiving platform proves the platform was forgiving.**

### Per-run record

Each of the runs writes one row, and `--json` verbatim is the figure of record — the printed table
rounds above 1M and is for reading, not for recording.

| Field | Source |
|---|---|
| task · arm · replicate · **run order** | assigned before the run |
| worktree path · derived project dir · session id | `--json` `cwd` / `projectDir` / `sessionId` |
| four raw token fields · weighted | `--json` |
| wall-clock · active time · subagent active time | `--json` |
| subagent count · by-type spend · max spawn depth · reconciliation shortfall | `--json` |
| completed · gate exit · six quality criteria | recorded by hand per the rubric above |
| CLI version · model · date | `version` field in the transcript records |

**Run order is recorded and the arms are run in a randomised order per task**, not A→B→C three times.
Model updates, cache state and the operator's own familiarity with a task all drift over a session,
and running the arms in a fixed order confounds every one of those with the arm itself. Randomising
does not remove the drift; it stops it loading onto one arm.

### Two decisions, settled before any arm ran (Stéan, 2026-08-23)

Both were put as explicit choices with their costs, and both were taken at the stronger option.
Recorded here with their date because *when* they were decided is what makes the rest of this
pre-registration mean anything — a design settled after seeing numbers is a rationalisation.

**1 · Replicates: 27 runs, three per cell.** Three tasks × three arms × **three replicates**. n=1 per
cell cannot separate an arm effect from run-to-run variance, and these runs are not deterministic;
the alternative designs (nine runs reframed as observations, or nine runs on a single task) each
bought the saving by giving up either the comparison or the task generality. **Median and full range
are reported per cell — never a mean, and never a single number without its spread.** If the ranges
of two arms overlap, that overlap is the finding and no ordering may be claimed between them.

The cost is stated plainly: roughly three times the tokens and three times the wall-clock of the
original design, for the same three tasks' worth of usable output, with 24 of the 27 trees discarded.

**2 · Compaction: task 1 is scoped to force one.** M-093 is sized so that **arm A compacts at least
once**, so term D is exercised rather than accidentally avoided. This makes arm A look worse — and
that is the point: it looks worse for a real reason, and the alternative was a result silently
covering only sub-compaction-length tasks. Compaction is exactly where the solo arm's cost profile is
supposed to diverge, because a delegating arm discards subagent contexts rather than compacting them.

⚠ **Verify the compaction actually happened; do not assume the scoping worked.** If arm A completes
task 1 without compacting, term D was not measured on that replicate and the replicate says nothing
about it — record that, rather than letting the intent stand in for the event. Term D remains
unmeasured for tasks 2 and 3 by construction, and the finding must say so.

### Next action

The 27 runs. Per run: fresh worktree pinned to `1c9b6bbd`, `--probe` re-run first, the arm's slice
bounded by `--since`/`--until`, `--expect-subagents=false` on arm A so its empty result is quiet and
the delegating arms stay loud, `--json` captured verbatim as the record, `walker` written to
`<task>/<replicate>/walker.md` per criterion 6, and `/usage` sampled for the window per M-21. Arm
order randomised within each task; the order recorded per row.

⚠ **A fresh worktree has no `node_modules`, and the install is NOT part of the arm.** Verified
2026-08-24 by cutting one at `1c9b6bbd`: `git worktree add` copies the tracked tree only, so
`npm run check` — criterion 1, run identically in every tree — cannot execute until dependencies are
installed. Two consequences, both protocol rather than build:
- **`npm ci` runs BEFORE the arm's clock starts**, and its duration is excluded from both wall-clock
  and active time. An install counted into the run would add several minutes of identical cost to all
  27 rows, compressing every between-arm difference toward zero — noise that flatters nothing in
  particular but blunts the whole comparison.
- **The transcript directory does not exist until a session has run in that worktree.** The same
  verification showed `--probe` correctly refusing to guess and naming the four candidate dirs rather
  than falling back to one. So the per-run `--probe` in this list means *probe the harness in the
  main checkout against a session with known `Agent` calls*, before the batch — not inside a
  worktree that has no transcripts yet. Metrics for an arm are read AFTER it completes, from the
  worktree's own cwd-derived slug.

⚠ **The pin is `1c9b6bbd`, not `fbbc59f4`** — see the re-baselining note in Design. This line said
`fbbc59f4` until 2026-08-24 and is called out rather than quietly corrected, because a baseline that
disagrees with itself between a doc's header and its run instructions is the failure this repo has
already paid for once: a status corrected in one place and left standing in four others reads as
reviewed. Both places now say `1c9b6bbd`, and `grep fbbc59f4` over this file should return only the
re-baselining note's own history.

### RESULT — task 2 (M-022), nine runs, 2026-08-24

Every figure below is read by `transcript-metrics.mjs` from the transcripts, or is the CLI's own
`result.total_cost_usd`. **Nothing here is a number an arm reported about itself.** Reconciliation is
clean in all nine rows: depth-1 sidecars equal `Agent`/`Task` calls, max depth 1.

| run | arm | wall | main active | sub active | main turns | cacheWrite | cacheRead | output | **weighted** | **cost** | deleg |
|---|---|---|---|---|---|---|---|---|---|---|---|
| r1 | A | 29.5m | 19.4m | — | 103 | 205k | 14.52M | 77k | 1.79M | $11.24 | 0 |
| r1 | B | 23.1m | 11.9m | — | 46 | 175k | 6.96M | 57k | 0.97M | $6.64 | **0** |
| r1 | C | 51.7m | 17.1m | 12.6m | 71 | 181k | 10.58M | 80k | 2.08M | $13.66 | 2 |
| r2 | A | 24.7m | 13.5m | — | 68 | 167k | 9.41M | 63k | 1.21M | $7.96 | 0 |
| r2 | B | 19.2m | 9.6m | — | 47 | 156k | 6.32M | 57k | 0.88M | $6.14 | **0** |
| r2 | C | 46.5m | 19.1m | 10.9m | 85 | 233k | 15.05M | 116k | 2.45M | $16.32 | 2 |
| r3 | A | 22.1m | 11.5m | — | 51 | 159k | 7.00M | 64k | 0.96M | $6.70 | 0 |
| r3 | B | 17.4m | 9.4m | — | 49 | 144k | 6.13M | 53k | 0.85M | $5.84 | **0** |
| r3 | C | 42.2m | 17.7m | 11.6m | 84 | 215k | 13.32M | 97k | 2.49M | $15.75 | 2 |

⚠ **`result.usage` is NOT a session total and must not be used** — on r1/C it reports 5.50M cache-read
against the harness's 10.58M for the main session alone. `total_cost_usd` from the same event **is**
trustworthy and **does include subagent spend**: verified rather than assumed, twice. On r2 the cost
ratio C÷A is 2.05× against a main+subagent weighted ratio of 2.02× (main-only would give 1.58×); and
on r1, C's main-only weighted total (1.36M) is *lower* than A's (1.79M) while C costs more — which is
impossible if the figure were main-only.

### The negative control, and why it comes before the numbers

**Arms A and B behaved identically** — solo, zero delegations, three replicates each. So *any* measure
on which A and B separate is a measure that cannot be trusted to separate C, because it is separating
two arms that did the same thing. **A-vs-B is this experiment's negative control**, and it is free: it
was already in the design, nobody had to build it, and it went unread for the first eight runs.

With three runs per arm, complete separation of two arms is exactly one of the C(6,3)=20 label
assignments — **one-sided exact permutation p = 0.05**. That is the *same* strength as C-vs-A. So
"every C run cost more than every A run" cannot be evidence for the workflow's premium while "every A
run cost more than every B run" is dismissed as noise. It is one property of the design, and the
control prices it.

**Raw dollar cost FAILS the control.** A separates from B on cost (A [6.70, 11.24] vs B [5.84, 6.64]),
so the C-vs-A cost separation carries no more weight than a separation between two arms known to be
doing the same work. **Cost is therefore not the metric to lead with, and an earlier draft of this
section led with it** — stated here rather than quietly swapped, because leading with the one measure
that fails its own control is the error, not the phrasing.

### Medians with full ranges — never a mean

Per the pre-registration: *median and full range per cell, never a mean, never a single number without
its spread.* This matters here rather than being ceremony — arm A is skewed by r1/A, and a mean pulls A
up, which **shrinks C's apparent premium by 12%** (C÷A reads 1.77× on means against 1.98× on medians).
The banned statistic understated the effect being tested; it would have been the ninth defect running
in the direction that flatters the hypothesis, and the first in the write-up rather than the harness.

| measure | A | B | C | C÷A | C÷B | C vs A | C vs B | **A vs B — CONTROL** |
|---|---|---|---|---|---|---|---|---|
| **$ per min of work** | 0.58 [0.58, 0.59] | 0.62 [0.56, 0.64] | **0.54** [0.46, 0.54] | **0.92×** | **0.87×** | separates | separates | **overlaps ✓** |
| **model-min of work** | 13.5 [11.5, 19.4] | 9.6 [9.4, 11.9] | 29.7 [29.3, 30.0] | 2.20× | 3.09× | separates | separates | **overlaps ✓** |
| weighted tokens (M) | 1.21 [0.96, 1.79] | 0.88 [0.85, 0.97] | 2.45 [2.08, 2.49] | 2.02× | 2.78× | separates | separates | overlaps, **by 0.01M** |
| wall-clock (min) | 24.7 [22.1, 29.5] | 19.2 [17.4, 23.1] | 46.5 [42.2, 51.7] | 1.88× | 2.42× | separates | separates | overlaps ✓ |
| main active (min) | 13.5 [11.5, 19.4] | 9.6 [9.4, 11.9] | 17.7 [17.1, 19.1] | 1.31× | 1.84× | **overlaps** | separates | overlaps ✓ |
| cost ($) | 7.96 [6.70, 11.24] | 6.14 [5.84, 6.64] | 15.75 [13.66, 16.32] | 1.98× | 2.57× | separates | separates | **SEPARATES ✗** |

"Separates" = the two arms' full ranges do not overlap, p = 0.05 exact. **Model-minutes of work is
`main active + subagent active`, and it is a WORK quantity, not a duration** — the rule that subagent
time never sums into a run's *duration* is intact above, where wall-clock and main-active are reported
separately and subagent time is its own column in the per-run table. Summing them as work is a
different quantity, and it is labelled as one.

**Two rows survive the control comfortably and both point the same way.** `$/min-of-work` is the
cleanest of the set — A's range sits entirely *inside* B's, so the control is not merely passed but
passed with room, and C separates from both **below** them:

> **C does more work and pays LESS per unit of it.** C's premium is that it does 2.2× the work, not
> that its work is dearer — per model-minute it is 8% cheaper than A and 13% cheaper than B.

That inverts the naive reading of the cost column, and it is the finding this section exists to carry.
Whether 2.2× the work was *worth doing* on this task is the quality question below, and the answer
there is no — but "the workflow burns tokens inefficiently" is not what these numbers say.

⚠ **Weighted tokens passes the control by 0.01M** (A's [0.96, 1.79] against B's [0.85, 0.97]). That is
a hair, not a margin. It is reported as passing because it passes, and flagged because one more
replicate could move it either way.

⚠ **Main active does NOT separate C from A** (C [17.1, 19.1] against A [11.5, 19.4]). Any claim about
C being faster or slower *in main-session work* remains unsupported — as it was when withdrawn earlier.

### The two-measure agreement is calibration, not corroboration

Weighted units and `total_cost_usd` are **two functions of one set of counts** — both derive from
`message.usage`. They are not independent references, and a defect both inherit would agree with
itself. This register has already retracted exactly that claim once; it is not being made again.

What the agreement *does* establish is worth keeping, and it is a different claim: **the 1.25× / 0.1×
multipliers and the summation path reconcile with the vendor's own cost computation.** Dollars per
weighted-M come out at **A $6.58 [6.28, 6.98] · B $6.87 [6.85, 6.98] · C $6.57 [6.33, 6.66]** — the
three medians spanning **~4.6%**, and every individual run **~11%**, across arms whose token *shapes*
differ by design. That is a calibration check on this repo's cost model, and it passes. It says nothing
about whether C÷A is 1.98×.

### Four findings, in order of how much they constrain the conclusion

**1 · Arm B never delegated — 0 for 3.** B and C are bit-identical in tree and tool configuration; B
simply was not told to run the pipeline. **So A-vs-B is not delegation-vs-no-delegation** — it is two
solo arms that differ only in whether the tool was reachable, and the experiment as designed cannot
answer "does delegation help" from this pair.

> ⚠ **RETRACTED 2026-08-25 — the clause "given a free choice on this task, the model declined every
> time", and the framing of this as evidence about model judgment.** B had no free choice: every
> session on this account carries *"Do not call the AgentTool unless the user requested it"*, and B's
> brief requests nothing. See *The instruction that voids arm B* above. The finding that survives is
> the narrower one left standing: A-vs-B is solo-vs-solo, which is what makes it a usable negative
> control. What does **not** survive is any reading of B's 0-for-3 as the model's own assessment of
> the task.

**2 · A÷B is therefore a floor on this harness's noise, and it is wider than a single figure suggests.**
The honest floor is the **per-replicate** spread, not a ratio of medians and not a range across
measures: on cost **1.15× · 1.30× · 1.69×**, on weighted tokens **1.13× · 1.38× · 1.85×**. An earlier
draft quoted "1.39–1.47×", which is the gap between *two measures' mean ratios* — a between-measure
range wearing the label of a noise range, and it reads about a third tighter than the truth. At its top
end that floor (1.69×) **exceeds r1's entire C÷A cost margin of 1.22×**.

One caveat against calling it pure noise: A exceeded B in **all three** replicates, and A carries nearly
all the within-arm variance (weighted max÷min: **A 1.87×**, B 1.14×, C 1.20×). Whether
`--disallowed-tools` itself perturbs behaviour, or A is simply the high-variance arm, is not decidable
from three points and is **not** claimed either way here.

**3 · Quality is UNSCORED — not tied.** Three of the six criteria were checked, all three came out
level, and **all three were effectively pre-solved by the brief.** Criteria 4 and 5 need blind scoring
and have not had it. Criterion 6, adversarial survival, is the one most likely to discriminate and it
**has not been run as a comparison at all.**

What was checked, and why each is weaker than it looks:
- **Gate green** (criterion 1) — nine of nine. The brief's own exit condition is "end at `npm run check`
  green", so this measures whether each arm did as it was told.
- **Both-direction `--selftest`** (criterion 2) — nine of nine. The brief says "follow this repo's
  conventions as stated in `CLAUDE.md`", and CLAUDE.md already mandates probing both directions. It
  measured **compliance**, which was total.
- **Decoy declined** (criterion 3) — nine of nine. But `docs/MECHANISABLE.md`'s own M-022 entry, which
  the brief points every arm at, already **names the honeytoken and states the live population is
  zero**: *"a naive grep for `ON CONFLICT (email)` scores 1/2 — it flags the honeytoken seed."* The
  arms were handed the trap along with the task.

⚠ **And criterion 2's green is itself refuted where anyone looked.** Arm C's own `walker` on r1 found
that one of that build's cited probe arms is **vacuous** — `ok(Object.keys(ALLOW).length === 0 || …)`
short-circuits on an empty `ALLOW`, so it asserts nothing and *"there is no negative direction at
all"* — alongside **four silent-miss classes** in a detector whose gate was green: unterminated
literals blanking a file to EOF, `DO LANGUAGE plpgsql $$` bodies read as literals (44 live sites), a
spaced or commented dot in `auth . users`, and dynamic `EXECUTE format(...)` SQL (5 live sites).

**Running an arm's `--selftest` and seeing it pass cannot detect any of that** — which is this repo's
own scar restated: *a probe suite confirms the cases you thought of; it cannot report the class you did
not.* The measurement that found it was an adversarial pass, and **only arm C got one**, because only
`/walk` spawns `walker`. A and B's outputs have never been walked. So the arms are not level on
quality; **they are unequally examined**, and the arm examined hardest is the only one with a public
list of its own defects.

**Scoring criterion 6 fairly needs an independent adversarial pass over all nine outputs, blind to
arm.** That is unrun work, and until it is run "quality is a tie" is not a finding this experiment
supports.

**4 · C's overhead is delegation, not more main-session work.** Main-active does not even separate C
from A (C [17.1, 19.1] against A [11.5, 19.4]) while total work separates cleanly at 2.20× — the
entire gap lives in the subagents (median 11.6m, **overlapping** the parent's wall clock and never
summed into its duration) and in the cache-read those fresh contexts drive.

### What this does and does not license

**It licenses:** on a narrow read-and-classify surface, the workflow did **2.2× the work** of a solo
session (3.1× an unprompted one) for **2.0× the spend** — at a *lower* price per unit of work than
either solo arm. Both of those clear the negative control. This repo's own doctrine says do not
delegate such a surface, and arm B — free to choose — agreed with the doctrine three times out of
three. Arm C delegated twice per run anyway, because **`/build` opens with an unconditional `grounder`
spawn** (`.claude/commands/build.md`) — its first delegation is never a judgment call. Task 2 is thus
the one cell in the whole design where mandate and judgment could visibly diverge, and they did.

**It does not license "the workflow is overhead."** Three separate reasons, and the third is the one
that decides it:
- Task 2 was chosen as a surface where delegation *should* lose, and it lost. Generalising one
  deliberately unfavourable cell to the method is the error E17 exists to avoid.
- The premium is **volume of work, not inefficiency** — C is cheaper per model-minute than either solo
  arm. "It costs more" and "it wastes" are different claims and only the first is supported.
- **The benefit side of the ledger was never measured.** Quality is unscored, not tied (finding 3), and
  the only adversarial pass anyone ran found four silent-miss classes and a vacuous probe arm — in the
  arm that *had* the pass. A verdict on whether 2.2× the work bought anything requires walking all nine
  outputs blind, and that has not been done.

**It does not license "the workflow pays for itself" either.** Same missing measurement, other
direction.

---

## E17 · Does the workflow's cost gap close on tasks where delegation actually pays? — **TASK 1 RUN (9/9): the gap did NOT close, it widened — but the premise was never tested, because arm B is under a standing prohibition on delegating. Quality still UNMEASURED**

⚠ **Task selection was CONDITIONED ON E16's RESULT, and this section is written before any E17 run.**
That is the whole reason for a separate id. E16's task 2 was a narrow read-and-classify surface where
this repo's own doctrine says *do not delegate* — so its cost gap measures the price of delegating
where delegation was not warranted, and generalising it to "the workflow is overhead" would be
reading one deliberately unfavourable cell as the whole table. E17 asks the complementary question on
tasks chosen because delegation *should* pay. Choosing the tasks after seeing E16 is a real degree of
freedom; it is declared here rather than defended later.

**Tasks.** M-061 (census-shaped: a repo-wide classification sweep, `data-boundary`) and M-087 (an
`ok()` helper — implementer-shaped, and recorded in the brief as *a decision, not a cleanup*). Chosen
to be different from each other, not only from task 2: they should attract **different agent types**
for **different reasons**, so a delegation result cannot be an artefact of one agent's shape.

**Same as E16, unchanged:** harness (`transcript-metrics.mjs`, frozen from r2 of task 2 onward, with
the two exceptions recorded in the run protocol), rubric, baseline `1c9b6bbd`, arm definitions,
launcher, and the strictly-sequential rule. Arms A/B/C are as E16 defines them — and note that **B
and C are bit-identical in tree and tool configuration and differ ONLY in the prompt.** B is a plain
brief with delegation reachable; C is `/build` → `/walk` → `/wrap`.

**One brief-level change, applied to tasks 1 and 3 only and NOT retro-fitted to task 2:** both briefs
end with *"In the report, state whether you used subagents and why or why not."* That asks the arm to
**report** a choice, never to make one — a brief that nudged toward delegating would destroy the
measurement it exists to take.

### Falsifiable prediction, registered BEFORE the runs

Both delegating arms are expected to delegate here — **B by judgment, C by pipeline mandate** (`/build`
opens with an *unconditional* `grounder` spawn, so C's first delegation is never a judgment call; this
was verified in `.claude/commands/build.md`, and it makes task 2 the only cell in the design where
mandate and judgment could visibly diverge). Therefore:

- **COST CONVERGES.** E16's gap is the cost of delegating where it was not warranted; it should shrink
  where it is.
- **QUALITY DIVERGES.** Criterion 6 (adversarial findings surviving) is where a structured pipeline
  should separate from a free-form one, if it separates anywhere.

⚠ **Criterion 2 is retired as a discriminator, on E16's evidence, before E17 runs.** Both briefs say
"follow this repo's conventions as stated in `CLAUDE.md`" — the same clause task 2 carried — and
CLAUDE.md already mandates probing both directions. On task 2 it scored 9/9 and measured compliance,
not quality; it will do the same here. Worse, E16 showed the measurement is not even sound: arm C's
own `walker` found a **vacuous** probe arm inside a build whose `--selftest` ran green, which running
a selftest cannot detect. **That drops the mechanically-countable criteria from four to three and puts
the weight on criterion 6** — which means E17 is only worth running if criterion 6 is actually scored.

**Therefore, registered as a REQUIREMENT of E17, not an optional extra:** an independent adversarial
pass over every arm's output, **blind to arm**, scored on findings that survive. Without it E17 measures
cost against an unmeasured benefit, which is the exact hole E16 ended in. Note this cannot be arm C's
own `walker` output — that is part of C's process, and only C produces it.

Falsification, stated in advance — and stated against **both** solo arms, because C÷B alone is the
largest of the three ratios and quoting it is how this result would flatter itself:

- **Gap holds AND quality equal** → the workflow is overhead, and E16's task-2 result generalises.
- **Gap converges AND quality equal** → the workflow is neutral.
- **B declines to delegate anyway** → that task reverts to *solo-vs-workflow* and is REPORTED AS SUCH,
  not as delegation-vs-delegation. B delegating on tasks 1 and 3 is a **hypothesis, not a fact**: on
  task 2, B declined in every replicate.
  **RESOLVED, and against the prediction: B declined all three times on task 1 as well — 0 for 6.**
  The registered prediction "both delegating arms are expected to delegate here, B by judgment" is
  **FALSIFIED**, and the reason is not the task: B is under a standing account-level prohibition it
  was never going to break (see *The instruction that voids arm B*). The pre-registered branch above
  therefore fires — tasks 1 and 2 are **solo-vs-workflow**, reported as such.

⚠ **The noise floor is A÷B, and it is not small.** A and B behaved identically on task 2 — neither
delegated, in any replicate — so the spread between them is this harness's floor for a two-arm cost
comparison, and on r1 it exceeded the C-vs-A margin of the same replicate. Any E17 "convergence" claim
must clear that floor before it is a finding rather than a reading.

### No pooled headline — pre-registered, not left to the id alone

Three tasks **built to disagree**. How they combine is a free parameter sitting directly on the axis
of interest, so it is fixed now: **three per-task results reported side by side, no pooled number, and
any cross-task claim stated qualitatively.**

### RESULT — task 1 (M-061), nine cells, all gates green · run 2026-08-24/25

**What ran.** Baseline `1c9b6bbd`, Latin square (r1 `A B C` · r2 `B C A` · r3 `C A B`) rather than
task 2's fixed rotation, which leaves position confounded with arm across the whole task; with n=3 a
square removes that confound exactly, where randomisation removes it only in expectation. Strictly
sequential throughout — one shared `node_modules` junction, and `vitest` writes `.vitest-count.json`
into it, so two arms at once score each other's trees.

Two cells were lost and replaced, both recorded rather than quietly re-run: **r2/A** was launched on
top of a still-running r1/C by a driver whose timeout returned a code the batch loop ignored — killed,
tree removed junction-first, transcript quarantined, re-run. **r3/B** died on *"API Error: Connection
lost mid-response"*, retried as **r3x/B** with the void cell retained as evidence. Scored spend
**$182.18**, plus **$12.47** on the two void cells.

**Arms as they actually were: forced solo (A) · constrained solo (B) · authorised workflow (C).** B
delegated zero times, for the reason above; this is not delegation-vs-delegation and is not reported
as such.

| measure | A | B | C | C÷A | C÷B | **A vs B — CONTROL** |
|---|---|---|---|---|---|---|
| **$ per min of work** | 0.72 [0.70, 0.83] | 0.66 [0.66, 0.75] | **0.60** [0.58, 0.60] | **0.83×** | **0.90×** | overlaps ✓ |
| **model-min of work** | 19.2 [15.7, 22.9] | 22.0 [18.9, 30.1] | 52.0 [46.1, 52.7] | 2.71× | 2.36× | overlaps ✓ |
| weighted tokens (M) | 2.21 [2.13, 2.69] | 2.40 [2.03, 3.56] | 5.09 [4.64, 5.18] | 2.30× | 2.12× | overlaps ✓ |
| cost ($) | 13.50 [13.06, 16.49] | 14.57 [12.38, 22.61] | 30.22 [27.89, 31.46] | 2.24× | 2.07× | overlaps ✓ |
| wall-clock (min) | 48.7 [30.2, 56.3] | 56.8 [31.1, 82.6] | 106.6 [58.0, 108.0] | 2.19× | 1.88× | overlaps ✓ |
| main active (min) | 19.2 [15.7, 22.9] | 22.0 [18.9, 30.1] | 30.7 [26.4, 37.4] | 1.60× | 1.40× | overlaps ✓ |
| turns | 103 [97, 129] | 119 [98, 178] | 166 [150, 198] | 1.61× | 1.39× | overlaps ✓ |

**All seven measures survive the negative control on this task** — including the two that failed it on
task 2. **Cost and turns both separate A from B on task 2 and overlap on task 1**, which is itself the
useful reading: the control is not a property of a measure, it is a property of a measure *on a task*,
and a measure cleared once is not cleared for good. Neither may be headlined from task 2; both are
reportable here, with that history attached.

**The registered prediction was COST CONVERGES. It did not.** The gap on this task is *wider* than
task 2's, not narrower: C÷A on cost 2.24× against task 2's 1.98×, on work 2.71× against 2.20×. The
prediction rested on B delegating by judgment and C's premium being the price of delegating where it
was not warranted; with B prohibited, the comparison never tested that. **The prediction is recorded
as falsified on the numbers and unevaluable on its premise** — those are different failures and
collapsing them would flatter the design.

**What replicates cleanly across both tasks is the price-per-unit result, and it strengthened.**
C does more work and pays less per unit of it: **$0.60/work-min against A's $0.72 and B's $0.66**, with
C's full range [0.58, 0.60] sitting entirely below both. Task 2 read 0.54 vs 0.58/0.62 on the same
measure. Two tasks, two different shapes, same direction, control cleared both times.

**Delegation depth tracked the task, and the wall-clock consequence is the sharper finding.** C's three
runs spawned 2 · 3 · 6 agents (`grounder` every time; `census`×3, `implementer` and `walker` as the
task demanded). **r3/C did the most delegation and finished FASTEST in wall-clock — 58.0 min against
r1/C's 106.6 — at equal work and equal cost.** The difference is not efficiency, it is overlap: r1/C
blocked 25.9 min waiting on a single awaited agent; r3/C's largest idle gap was 3.9 min. **Backgrounded
agents overlap main work; awaited ones serialise it**, and only wall-clock can see the difference —
work, tokens and cost are identical across the two. A pipeline that delegates more is not necessarily
slower, and may be considerably faster.

**Task 1 was census-shaped, and the transcripts say so.** An earlier reading of this register claimed
task 1 was mis-shaped for delegation; that is **withdrawn** — r3/C's three `census` spawns carry prompts
reading *"I need FACTS per site so I can classify"*, which is the KNOW/HOLD split applied correctly:
delegate what you need to know, hold what you need to judge.

**Still unmeasured, and it is the same hole task 2 ended in: criterion 6.** Cost is now measured twice
and quality zero times. Two preconditions are recorded before those 18 review runs — **arm C's output
enters review already walked**, so C must be bundled twice (pre-walk and post-walk, with the pre-walk
state reconstructed as *final tree minus every edit postdating the walker's return*, and reconstructed
BEFORE bundling, since re-shuffling afterwards invalidates the blind labels); and the **resolved system
prompt must be captured per run**, which is owed anyway now that an unread system prompt has voided an
arm once. Until criterion 6 runs, this register may state what the workflow *costs* and must not state
what it *buys*.

### The blind was built, then MEASURED — 2026-08-25. Three harness leaks, and what remains

The corpus exists: 12 bundles per task (A · B · C-post · C-pre × 3 replicates), deterministic shuffle,
key written outside the corpus, `.handoff/**` excluded, each bundle carrying `CHANGES.diff` against
`1c9b6bbd` so the reviewer scores the CHANGE and not the baseline.

**Balanced tell counts were not a measured blind, and the direct probe is what found that.** The
build reported residual tells at A 9 · B 8 · C-post 8 · C-pre 7 and read the evenness as evidence the
blind held. It is not: that measures the blind's INPUTS. The probe — hand a session one bundle, ask it
to name which of four conditions produced it — measures the blind. It found three leaks in a row, and
every one of them was the harness handing over the answer:

1. **mtimes.** `fs.copyFileSync` PRESERVES modification time and `diff -ruN` writes each file's mtime
   into its own `---`/`+++` header lines, so every bundle shipped a second-resolution record of when
   its session wrote each file. A probe named the arm from it in as many words: *"mtimes run strictly
   sequential 19:13→19:29 across all 17 files — one continuous worker"*. Fixed by freezing every
   copied and shadow file to one instant BEFORE the diff runs, and stripping the header timestamps as
   an independent second guard.
2. **Corpus nested under the key.** Bundles sat at `review/<task>/<label>`, two directories below
   `<task>-KEY.tsv` and three below `wt/`, `out/`, `PROTOCOL.md` and `run-arm.sh`. One probe quoted its
   own key row back verbatim, all six fields. Fixed by moving the corpus outside the experiment tree.
3. **The answer key on standard input.** `blind-probe.sh` looped `done < "$KEY"`, which makes the key
   the loop's fd 0 — and `claude -p` reads stdin as ADDITIONAL PROMPT TEXT. Several probes cited a
   *"Manifest row in the prompt"*. Bash re-seeks between iterations on a regular-file redirect, so the
   loop still completed all twelve and nothing looked wrong. Fixed by reading the key into an array
   and closing stdin on the call.

**The first two full-power runs scored 10/10 and 24/24 against a 25% chance line. Neither measured the
arms.** The decisive argument needed no diagnosis: **arms A and B are the negative control — zero
delegations each, six cells each — so no property of their output can separate them, yet the probe
separated them perfectly.** A result that beats what the data can possibly contain is a harness result.
Recorded as `LESSONS` L-55: an implausibly STRONG result impeaches the instrument exactly as an
implausibly weak one does, and the tell is the extremity itself, before any diagnosis.

**Confinement is now audited rather than assumed** (`escape-audit.mjs`). Path auditing alone would not
have caught leak 3, which opened no file — so the load-bearing check is channel-independent: any trial
whose own words contain key vocabulary is flagged and discarded.

#### The clean run — 24 trials, both harness channels closed

| contrast | score | expected | p | reading |
|---|---|---|---|---|
| C-family vs solo | **24/24** | 12 | 6.0e-8 | **decisive leak — the ONLY row carrying its own evidence** |
| C-post vs C-pre | 9/12 | 6 | 0.073 | **unproven — NOT a pass** |
| A vs B (within solo) | 10/12 | 6 | 0.019 | **noise — settled below on evidence, not on p** |
| 4-way exact | 19/24 | 6 | 4.0e-8 | **NOT independent — arithmetically forced by the rows above** |

⚠ **ONE decisive leak, two unmeasured contrasts, and a fourth row that is not evidence at all.** Four
contrasts were tested on one dataset with no correction; at Bonferroni the threshold is 0.0125, which
neither marginal row clears. And 9/12 must not be read as a pass: at n=12 a two-way contrast fails at
10/12, so 9/12 is ONE TRIAL BELOW the failure line, and p=0.073 means a perfect blind produces this or
worse 7% of the time. Calling that "holds" is the four-trial error committed at a larger n — the same
mistake this harness already made once and wrote a header about.

⚠ **THE 4-WAY ROW IS ARITHMETICALLY FORCED AND MUST NOT BE QUOTED AS A HEADLINE.** When the family
call is right 24 times out of 24, a four-way answer is correct exactly when the within-family answer
is — so 10 + 9 = 19 could not have come out otherwise. It corroborates nothing. **The 4.0e-8 belongs
to the 24/24 row and nowhere else**, and "the blind leaks four ways" overstates a result that is one
decisive binary carrying two unmeasured ones. Reporting the composite as though it were independent
evidence is how a single measurement gets counted twice.

**A-vs-B is settled as NOISE — on positive evidence, not on an underpowered p-value.** All twelve solo
evidence lines reason from ABSENCE: *"no subagent trace"*, *"no reviewer"*, *"no `.claude/handoff/`
artefacts"*, *"one continuous narrative"*. Every one of those argues for SOLO, which is what both 1
and 2 are. **An evidence line that argues for a category cannot discriminate within it** — so the probe
committed to a digit and then wrote a justification for the class, and 10/12 is a coin flip wearing a
rationale.

**General form, and it makes the evidence lines conditionally readable rather than worthless: an
evidence line is diagnostic ONLY where its contrast is above chance.** At 24/24 the lines name real
channels and can be mined for what leaks. At 10/12 they are post-hoc, and **nothing in the line itself
distinguishes the two cases — only the contrast does.** Read them in that order, never the reverse.

**The residual leak is intrinsic, not harness.** C's deliverables narrate their own production —
`docs/MECHANISABLE.md` entries reading *"found 2026-08-25 by the walker on the M-061 diff"* and
*"raised by the `walker` agent"*. No bundling change reaches that without editing the artefact under
review. The non-docs hits in the tells file are NOT this: they are baseline vocabulary every arm
inherited (`// org-scope guard (caller-ID census)`, an AST `walker`), which is why raw per-path tell
counts overstate the spread.

#### Consequence for criterion 6, and the two runs that decide the scope

**C vs A/B cannot be run blind by this method.** That is the comparison criterion 6 was designed
around, so the scope decision is not cosmetic. Two measurements were launched before choosing, because
both are cheap and each replaces an assumption with a number:

**1 · Stability repeat, FIRST — the twelve C bundles, two further independent passes.** The contrast
criterion 6 depends on is C-post vs C-pre, and it is the one still unmeasured. If the SAME bundles
miss on every pass, a real channel exists and the evidence lines name it; if the misses move, the
contrast is noise at n=12 and simply has not been measured. No new cells, and it decides the scope
question by measurement rather than by a p-value four contrasts have already spent. **The solo bundles
are deliberately NOT re-probed** — A-vs-B is settled above on the evidence lines, and spending trials
there would buy nothing.

**2 · Code-only variant, only if step 1 leaves anything to decide** (`bundle.mjs --code-only`,
`docs/**` and root `*.md` excluded). Its premise was checked directly against the corpus rather than
assumed, and it is **weaker than the raw tell counts suggested in both directions**:

| string | bundles carrying it | verdict |
|---|---|---|
| `the walker` | A, B, C-post, C-pre alike | **baseline vocabulary** (an AST walker) — not a tell at all |
| `the walk caught` · `M-061 diff` | C-post and C-pre only | real C-FAMILY tell, and shared by both C variants |
| `closed-list version shipped` | exactly one bundle, C-post | real C-POST tell — **and it lives in a test file, not in `docs/`** |

So excluding `docs/**` **narrows the C-vs-solo channel without closing it**, while leaving the
C-post-only narration that sits in code — which is backwards relative to which contrast is needed.
⚠ **And if adopted it bites C-pre/C-post specifically:** part of what a walk contributes IS writing
down what it found, so excluding docs narrows *"did the walk improve the deliverable"* to *"did the
walk change the code"*. Narrower, arguably sharper, and it must be stated in the write-up rather than
discovered in review.

**The decision rule, fixed before the result arrives:** if C-post-vs-C-pre proves stable AND leaking,
then criterion 6 **cannot be run blind by this method at all** — not on the wide comparison and not on
the narrow one — and the honest report is that the quality question stays unanswered rather than
answered unblinded. If it proves noise, the C-pre/C-post comparison stands as criterion 6's scope and
the code-only variant becomes a bonus that might restore the wider one.

Until that reports, criterion 6's scope is undecided and no quality claim is licensed.

### The stability repeat reported — 2026-08-26. Stable, one-sided, and still unmeasured

Twelve C bundles (six C-post, six C-pre), three independent passes each, 36 trials, solo probes, no
new cells. **Errors are deterministic** — a bundle called wrong on pass 1 is called wrong on passes 2
and 3, with one bundle per task splitting 2/3. So the 9/12 above is **not sampling noise**, and the
first thing that follows is negative: more passes over these same bundles cannot settle anything,
because the answers are already reproducible. Only more replicates could, and replicates mean cells.

**Concentration alone does not license a leak reading, and the first cut of `stability.mjs` said it
did.** A probe that answers the same digit for every bundle also produces perfectly stable errors —
deterministically uninformative. The verdict line was wrong in principle before it was checked against
this data, and is now replaced by the answer distribution per class plus a bundle-level Fisher test.
Pooled over both tasks:

| true class | answered 3 (post) | answered 4 (pre) |
|---|---|---|
| C-post | 18 | **0** |
| C-pre | 11 | 7 |

**Not bias — a one-sided detector.** Pure always-answer-3 would give 18/0 and 18/0; the seven `4`s
falsify it. Every `4` call is correct: **precision 7/7 at trial level, 3/3 at bundle level, recall
39%.** The probe has a positive test for C-pre and defaults to C-post when it does not fire.

The evidence lines name both halves, and they are the same fact seen twice:

- **It calls `pre` on doc/code INCONSISTENCY** — *"MECHANISABLE.md claims an in-rule
  `CLASSIFIED_CROSS_ORG_SAFE` list and startup assertion shipped; the rule file contains neither"* ·
  *"`maskSql` returns a string, but `conflictFindings` destructures `{ masked, unterminated }` — the
  shipped check can never fire"*. That is the definition of C-pre: the state where the register
  already describes fixes the code has not received.
- **It wrongly calls `post` on walker MENTION** — *"cites applied reviewer findings: walker
  F1/F2/F3…"* · *"Found by adversarial review"*. **C-pre bundles already carry walker-attribution
  prose**, so mention-of-walker does not separate the two, and the probe treats it as if it does.

**Statistically it does not clear the bar.** At the correct unit — the bundle, since three passes over
one bundle are three looks at the same content — it is 9/12 majority-correct (p=0.073) and Fisher on
the 2×2 gives p=0.091. Per task, p=0.20 and p=0.50. Nothing near 0.05, let alone the Bonferroni
0.0125 four contrasts have already spent.

#### Applying the pre-registered decision rule

The rule fixed two sections above admits two outcomes: *stable AND leaking* kills option 1, *noise*
keeps it. **The result is neither, and saying so is the finding**: stable, mechanistically explained,
one-sided — and below significance. So the rule does not decide it, and the honest statement of where
that leaves criterion 6 has three parts:

1. **C vs A/B is dead as a blind comparison** — 24/24, p=6.0e-8, intrinsic. Unchanged.
2. **C-post vs C-pre is not certified as leaking.** It is also **not certified as blind**, and the
   asymmetry matters: 7/7 precision on the positive call is stronger evidence of a real channel than
   p=0.09 admits, it is just too rare a call to prove at n=6 per class.
3. **The channel, if real, is one criterion 6 cannot remove — because it IS what criterion 6
   measures.** C-pre is identified by doc/code contradictions; the walk exists to remove doc/code
   contradictions; a reviewer counting surviving defects would be reading the same lines the probe
   reads to name the arm. Excluding `docs/**` does not help — both quoted `pre` calls above cite a
   `.mjs` file as one side of the contradiction.

**Scope decision: criterion 6 runs on C-post vs C-pre, and reports its blind as UNVERIFIED with the
mechanism named** — not as verified, and not as broken. That is a weaker claim than the experiment was
designed to support, and it is the strongest one the measurements license. The code-only variant is
**not adopted**: it was built and its premise measured, and it narrows the wrong contrast (§ above)
while leaving this one's identified channel intact.

**One finding here outlives the blind question entirely.** C-pre snapshots contain prose attributing
findings to a walker that had not yet run against them. That is a **reconstruction defect in the
corpus builder, not a blind defect** — the `.handoff/` narration and register entries were written by
earlier legs of the pipeline citing an earlier walk, and the cut point does not separate them. Any
future C-pre/C-post comparison must either cut before that narration exists or state that it does not.

### C-pre cannot be reconstructed for the file that matters — 2026-08-26

The stability probe's misreads pointed at the C-pre snapshots, so the snapshots were opened. Two
defects came out, they are independent, and **neither is the one that was being looked for.**

#### 1 · Five of six C-pre cells contain POST-walk content, and `prewalk.mjs` said so at the time

Every cell ships a `RECONSTRUCTION.md` giving each file its own verdict. Read back across all six C
cells (`prewalk-out/*/RECONSTRUCTION.md`, walker-return stamps 2026-08-24/25):

| cell | unsound files | which | share of bundle bytes |
|---|---|---|---|
| `task1-r1-C` | 1 of 22 | `docs/MECHANISABLE.md` | 46% |
| `task1-r2-C` | 1 of 34 | `docs/MECHANISABLE.md` | 41% |
| `task1-r3-C` | 1 of 42 | `docs/MECHANISABLE.md` | 37% |
| `t2-r1-C` | 1 of 8 | `scripts/check-sql-conflict-target.mjs` | 9% |
| `task2-r2-C` | **0 of 5** | — | — |
| `task2-r3-C` | 1 of 8 | `scripts/check-sql-onconflict.mjs` | 11% |

The verdict is identical in all five: *"record not provably complete AND a post-walk shell command
writes to this file; **POST-walk content substituted, which understates the walk**."*

**The root cause is that the C sessions wrote those files through bash rather than Edit/Write.** A
transcript rewind inverts recorded mutations; a heredoc or a `sed` leaves nothing to invert. So the
one file per cell that the walk most changed is precisely the one that cannot be rewound — not by
coincidence, but because the biggest artefact is the one a session is most likely to write with a
shell command.

**Consequence: criterion 6's C-pre-vs-C-post comparison cannot be scored on this corpus.** For task 1
the walk's principal output IS `MECHANISABLE.md`, unsound in all three cells and 37–46% of the bundle;
for task 2 it is the check script, unsound in two of three. Scoring only sound files would delete the
deliverable from task 1 entirely and leave task 2 with a single clean cell. **The instrument was
honest and the pipeline downstream ignored it** — `bundle.mjs` correctly withholds `RECONSTRUCTION.md`
from a blind bundle (it names the cell and the arm), but nothing else ever read it, so a per-file
`UNSOUND` verdict travelled no further than the directory it was written in.

**This binds task 3's design, which is why it was diagnosed before task 3 ran rather than after.**
Transcript rewind is defeated by shell writes and always will be, so pre-walk state must be captured
**live** — a `run-arm.sh` change, made before nine cells are spent, not discovered in their analysis.

**BUILT 2026-08-26, binding task 3 onward.** `tree-snapshot.sh` records the worktree every 10s by
staging into a **private `GIT_INDEX_FILE`** and calling `write-tree`, so it produces a real tree object
without ever touching the session's index or lock — `git stash create` and a bare `git add -A` both
race the session's own git commands, which is why neither is used. It reads the **filesystem**, which
every write channel must pass through by definition, so a heredoc is as visible as an `Edit`.

**The verdict is a witness, not an estimate, and that is the point.** A timer cannot land on the cut
instant, so "nearest sample" is an approximation of unknown size — the exact species of quantity this
experiment has twice mistaken for a measurement. But **two identical consecutive trees prove no write
landed between them, from any channel.** `snapshot-select.mjs` therefore returns `EXACT` (tree
unchanged across the cut — the sample *is* the pre-walk state, provably), `BRACKET` (changed, with the
window and staleness reported so a reader can weigh it), or `NO-COVER` (no sample precedes the cut) —
three verdicts, because collapsing "imprecise" into "absent" is exactly what made the retired
system-prompt control useless. **The verdict is written into a `SNAPSHOT.md` that ships with the
tree**, which is the half `prewalk.mjs` got right and the pipeline around it got wrong: an honest
per-file `UNSOUND` that no consumer is obliged to read is a comment.

**Probed on every channel and both failure directions.** Idle → identical trees; a tool write → new
tree; **a shell heredoc → new tree** (the class that defeated the predecessor); emitting the pre-cut
tree and grepping for the post-cut heredoc line → absent, with the two lines written *before* the
recording still present. Selector verdicts probed at three cut instants, one per outcome.

Two defects surfaced in the probing and are fixed: a `trap … EXIT INT TERM` that cleaned up **and kept
looping**, so `kill` removed the lock and left an unlocked writer that the next run silently doubled up
on — caught only by counting samples against the interval, since both writers emitted correct rows;
and `git archive | tar` failing on Windows because GNU tar reads `C:/…` as a remote `host:path`,
replaced by `ls-tree` + `cat-file` per blob, which also guarantees content comes from the object
database rather than from a worktree the session may still be writing to.

⚠ **It runs for all three arms, not only C.** A and B have no walk to cut at and nothing will consume
their logs — but an arm-specific recording is an arm-specific difference, and this experiment has twice
been wrecked by precisely that shape.

#### 2 · The probe's misreads are HOUSE STYLE, not walk evidence

The obvious hypothesis — that the probe called C-pre bundles "post" because they contained substituted
post-walk content — **is false, and the numbers above refute it.** `task2-r2-C` has a fully sound
reconstruction, zero unsound files, and was still misread 3/3; `task1-r1-C` and `task1-r2-C` carry
41–46% post-walk bytes and were called correctly. The two defects do not line up.

What actually fires the probe's default is the phrase it quoted: *"Found by adversarial review."*
Counting files carrying `adversarial review` across all 24 bundles, **every bundle in both tasks has
at least one, including every arm A bundle** (task 1: A cells carry 3, 4 and 5 such files; task 2:
uniformly 1–2 across all four classes). Arm A cannot spawn anything. The phrase is inherited from
`CLAUDE.md` §6 — *"Caught by adversarial review, and the reason a new control gets one before it is
believed"* — and every arm reads `CLAUDE.md`.

**Third instance of one class**, after `the walker` (an AST walker) and `caller-ID census`: **the
repo's own doctrine vocabulary appears in every arm's output, because every arm reads the doctrine.**
A tell-counter matching on that vocabulary measures the baseline, not the arm — which is why the raw
per-path tell counts overstated the spread, and why this one fooled a probe rather than a script.

It also settles the reading left open yesterday. The post/pre contrast is not merely *below
significance*; the mechanism behind its errors is now identified and it is **not the walk**. The probe
defaults to "post" on repo idiom that carries no information about which arm produced it.
