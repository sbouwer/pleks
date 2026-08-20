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
**E8** and **E9** *before* trusting rule scoping, marker invisibility, the assumption that MCP tool
schemas are deferred, the handoff write control, or any conclusion drawn from a subagent's behaviour
after a spine edit. Tracked as an OUTSTANDING item. All six are load-bearing: E1b decides whether
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
