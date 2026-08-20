# HARNESS EXPERIMENT REGISTER

**In-repo E-register for the CLAUDE.md Standard.** These are **OBSERVATIONS of one harness version**,
not documented mechanisms. Anthropic documents none of this; all of it is behaviour probed from
inside a session and may change without notice on any upgrade.

**Anchor:** all results below measured **2026-08-18**, Opus 5 via the Claude Code VSCode extension.
Exact CLI version string NOT captured (`claude --version` unavailable in the sandbox) — a re-run
should record it, because "which version was this true of" is the whole value of an anchor.

**RE-RUN TRIGGER:** on any Claude Code major-version upgrade, re-run **E1b**, **E2** and **E5**
*before* trusting rule scoping, marker invisibility, or the assumption that MCP tool schemas are
deferred. Tracked as an OUTSTANDING item. All three are load-bearing: E1b decides whether scoped
rules are a control or a convenience, E2 decides whether the entire marker vocabulary costs context
budget, and E5 decides whether connected MCP servers impose a flat per-turn floor (on 2.1.235 they
do not — a revert to eager tool loading would change the economics of every session).

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

Resolved in the canonical register (`C:\dev\dev-standards\SPEC_CLAUDE_MD_STANDARD.md` §9), not by a
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
- **45k tokens returned per invocation**, which then sit in the main window and are re-sent on
  every subsequent turn for the rest of the session

**The doctrine said delegation wins when an agent reads a lot and returns a little. At 122 turns and
45k returned, this repo has been doing neither half.** A rough inline comparison: an agent replacing
50 file-reads saves ~250k of permanent main-context weight (≈2.5M billable over 100 later turns) and
costs 2.1M to run plus ~450k to carry its own output — **approximately break-even**, not the clear
win the spines assume. The saving is real only when the agent's turn count stays low and its report
stays short; neither is bounded today.

Composition by type, for scoping the fix: `implementer` 10, `walker` 6, `census` 5, `grounder` 5,
`db-inspector` 1.

**Consequence:** an output budget on agent reports, and a turn budget on the agents themselves, are
canon changes worth making — but they are CD's call, not a mechanism this repo can add unilaterally.
Recorded here rather than acted on.

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

## Why this file exists separately from CLAUDE.md

By E2's block-placement finding, a register recorded as a comment BLOCK inside `CLAUDE.md` is **stripped before
any session sees it** — it instructs nobody. The findings are already load-bearing in the artefacts
themselves (E2 justified the marker format; E1b produced the twin audit, the SECURITY RULES
annotations, and the M-register), so the lab notebook does not need to travel with them.

What stays in `CLAUDE.md` is a two-line citation. What lives here is the narrative and the **re-run
protocol** — including the canary's exact plant position, which is re-run instructions and belongs
with the protocol rather than at the site being probed.
