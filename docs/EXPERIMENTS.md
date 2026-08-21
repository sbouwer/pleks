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

`CLAUDE.md` §7 tells you to spawn the implementer with `isolation: "worktree"`, and that is the
documented default for the mechanical-transform lever. **On any feature branch, that agent is
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

**"acceptEdits ⇒ no prompts" is therefore false**, which retires the entire framing. The open
question is no longer *which mode was the session in* but *what does a mode actually predict*, and
that cannot be answered without an instrument that detects a prompt — which does not exist, because
**the only detector of a permission prompt in this system is the human watching the screen.**

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

**And the counting instrument is the lesson repeating one section later.** "Roughly a dozen" was a
recollection written into a document that had just spent 3,000 words on why recollections about the
tree must be counted. The count cost two minutes, moved the figure by an order of magnitude, and
turned a soft anomaly into `settings.json` ×13 — which is the version of this finding that is hard to
explain away. Anchored: transcripts under `~/.claude/projects/c--dev-pleks/`, as at 2026-08-21.

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
