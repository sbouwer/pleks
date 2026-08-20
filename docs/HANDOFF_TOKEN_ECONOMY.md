# HANDOFF — TOKEN ECONOMY

**For CD.** Two open decisions that now have measurements behind them, plus a portable spec so the
next project installs this in minutes rather than rediscovering it.

**Anchor:** everything below measured 2026-08-20 in `c:\dev\pleks`, session `2678b6e4`, CLI
**2.1.235**, Opus 5 via the VSCode extension. Implementation landed in `a59c6ac6` and the three
commits before it. Harness observations rot — see §4 for the re-run triggers.

---

## 1 · THE HEADLINE, BEFORE ANY OF THE MACHINERY

**One settings key is worth more than everything else in this document combined.**

```jsonc
// .claude/settings.json
{ "autoCompactWindow": 300000 }
```

`int().min(1e5).max(1e6)`, read straight from the compiled CLI's own schema. Env equivalent:
`CLAUDE_CODE_AUTO_COMPACT_WINDOW`. The default (`auto`) fires at roughly a full window.

Why it dominates — every turn re-sends the whole conversation, so context size IS the per-turn
price. From this repo's own `compactMetadata`:

| | preTokens | postTokens | trigger |
|---|---|---|---|
| boundary 1 | 1,001,754 | **16,754** | auto |
| boundary 2 | 998,784 | **18,203** | auto |
| boundary 3 | 687,984 | **15,444** | manual |

A ~60x reset. `cumulativeDroppedTokens` reached **4,344,909** in one session. The turns spent
climbing from 300k to 1M each cost ~5x what the same turn costs at 300k.

**Why 300k and not 100k:** each compaction ran ~2 minutes (`durationMs` 104844 / 113963 / 120994)
and discards detail the next turns must re-read. Below ~250k the stalls and re-reading eat the
saving. 300k is ~4x cheaper than the default without making compaction the dominant activity.

> **Process note worth carrying forward.** `claude --help` advertises only a `--autocompact` flag.
> Taking that as the whole surface cost ~10 round trips building a PowerShell profile wrapper that
> could never have worked for the VSCode extension — the launcher actually in use. The settings key
> and the env var were both discoverable by grepping the CLI binary. **Grep the binary before
> concluding a capability is CLI-only.**

---

## 2 · OPEN DECISIONS FOR CD

### D1 · Per-agent `memory:` — should every subagent pay for CLAUDE.md?

**Status quo:** `memory: project` is set on all six agents, so every one receives CLAUDE.md
(~13k tokens, E3). A `db-inspector` answering one SQL question pays the same as an `implementer`
doing a repo-wide transform.

**The data that makes this decidable (E4):** agents ran **27 invocations, 3,292 turns, 55.7M
billable-equivalent** — 13.7% of total session spend. At 27 invocations, 13k each is ~350k of
CLAUDE.md alone, but that is a *floor*, not the problem; **2.1M per invocation** is.

**The decision:** per-agent rather than global. `implementer` and `walker` plausibly need the
conventions (they write, or judge writes). `db-inspector` and `census` plausibly do not — they
return facts, not code shaped by house style.

**Argument against changing it:** an agent ignorant of conventions produces work you re-do, and
re-doing it costs far more than 13k.

### **RULED 2026-08-20 (CD): DO NOT CHANGE. Recorded so it is not re-derived.**

The arithmetic that settles it — 27 invocations × ~13k of CLAUDE.md is ~351k input tokens, which
bills mostly as cache read (×0.1) to **~35k billable-equivalent**. Total agent spend over the same
27 runs was **55.7M**. CLAUDE.md is therefore **~0.06% of agent cost**.

It is not a lever. A single re-done implementer run (2.1M) costs sixty times the entire CLAUDE.md
budget across every agent in the session. **Turn count is the cost; the preamble is a rounding
error.** The earlier framing — "never costed either way" — is now closed: it has been costed, and
the answer is that it does not matter.

### D2 · An output budget on agent reports

**The measurement, and it is the uncomfortable one:**

| metric | value |
|---|---|
| billable-equivalent per invocation | **2.1M** |
| turns per agent | **122 average, 336 peak** |
| tokens returned per invocation | **1.9k–6k** (see correction below) |

> **CORRECTION 2026-08-20.** An earlier version of this document and of E4 claimed **45k returned
> per invocation**. That was the agent's TOTAL output across all its turns, not the report handed
> back — two quantities an order of magnitude apart. The returned report is **1.9k–6k**. The
> uncorrected figure overstated delegation's carrying cost ~10x, and with it fixed, delegation comes
> out slightly AHEAD of inline rather than behind. **The 2.1M run cost remains the dominant term, and
> turn count — not report size — is what drives it.** Do not cite the 45k.

**Measured per-type distribution** — what any budget must be set against:

| type | runs | turns med/max | returned med/max | CD's proposed N/M | fits? |
|---|---|---|---|---|---|
| implementer | 10 | 196 / **336** | 1,910 / 2,188 | 60 / 3k | **N 5.6x low** · M ok |
| census | 5 | 62 / **139** | 3,271 / 9,433 | 25 / 4k | **N 5.6x low** · M ok at median |
| walker | 6 | 118 / **129** | 4,444 / 4,973 | 40 / 6k | **N 3.2x low** · M ok |
| grounder | 5 | 100 / **117** | 5,274 / 6,035 | 25 / 4k | **N 4.7x low** · **M low** |
| db-inspector | 1 | 18 / 18 | 1,354 / 1,354 | 10 / 1k | **N 1.8x low** · **M low** |

**Every type's MEDIAN exceeds its proposed N**, not merely its max. As written the budgets would
truncate essentially every run. The **M values are close to right**; the **N values are the ones
needing revision**. This is the "revisit against measured turn counts" CD asked for.

The spines say agents "return classified results". **Nothing bounds the size, and nothing bounds the
turn count.** An agent running 122 turns and returning 45k is not "reads a lot, returns a little" —
it is a second full session whose output then becomes permanent weight in the main window, re-sent
on every subsequent turn.

**Rough break-even:** an agent replacing 50 file-reads saves ~250k of permanent main-context weight
(≈2.5M billable over 100 later turns) and costs 2.1M to run plus ~450k to carry its own output.
**Approximately break-even — not the clear win the spines assume.**

**Proposed canon change (CD's call):** an explicit output budget on `census` / `grounder` / `walker`
reports, and a turn budget on the agents themselves. Delegation wins only when the agent READS a lot
and RETURNS a little; today neither half is enforced.

Composition, for scoping: `implementer` 10, `walker` 6, `census` 5, `grounder` 5, `db-inspector` 1.

### D3 · Should `autoCompactWindow` be a dev-standards default?

It is a one-line, launcher-independent, version-controlled setting with a measured ~4x effect and no
security surface. **Recommendation: yes, as a standards default at 300000**, overridable per project
where losing detail is expensive (long spec work) by raising it.

### D4 · Is the statusline standard, or Pleks-local?

`systemMessage` from a `UserPromptSubmit` hook **does not render to the human** (confirmed 2026-08-20).
So a hook can only ever reach the model. If the human is to see the budget at all, it must be a
statusline. **Recommendation: standard** — it costs zero tokens and needs no threshold.

---

## 3 · PORTABLE SPEC — install order for a new project

Ordered by value per minute of work. **Tier 0 alone captures most of the benefit.**

### Tier 0 — one line, ~30 seconds

```jsonc
// .claude/settings.json
{ "autoCompactWindow": 300000 }
```

Stop here if that is all the project warrants.

### Tier 1 — the human-facing gauge (~20 min)

`.claude/statusline.js`, registered in settings:

```jsonc
"statusLine": { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/statusline.js\"" }
```

Renders e.g. `Opus 5 · ctx 223k ~22k/turn · 27 agents 55.7M`, coloured by which decision applies:
green while a turn is cheap, yellow once compaction pays for itself, red once a grep costs what a
large edit costs.

### Tier 2 — the model-facing hook (~40 min)

`.claude/hooks/context-budget.js` on `UserPromptSubmit`. Injects batching guidance and running agent
spend into `additionalContext`. **Do not put "/compact" in it** — the model cannot run a slash
command (see §5.1).

### Tier 3 — probes (~40 min, and non-optional if tiers 1–2 are installed)

See §5 for what each probe must actually assert. Four defects shipped here under a green suite.

### Copy list

| file | tier |
|---|---|
| `.claude/settings.json` → `autoCompactWindow` | 0 |
| `.claude/statusline.js` | 1 |
| `.claude/hooks/context-budget.js` | 2 |
| `scripts/check-statusline.mjs` | 3 |
| `scripts/check-context-budget.mjs` | 3 |

**Two gitignore traps that will bite on any repo using `.claude/*` with negations:**
`!.claude/statusline.js` must be added explicitly, and `.claude/.context-budget.state.json` must be
ignored. A check that ENUMERATES expected top-level `.claude` files catches the first within a
minute; without it the file is silently untracked and "committed" only in the commit message.

---

## 4 · HARNESS FACTS THIS DEPENDS ON

All observations of CLI **2.1.235**. Anthropic documents none of it.

| fact | consequence if it changes |
|---|---|
| `compactMetadata` on `type:"system", subtype:"compact_boundary"` carries `preTokens`/`postTokens`/`trigger` | the post-compaction read breaks and the hook reports stale, huge numbers |
| subagent transcripts live at `<dir>/<sessionId>/subagents/agent-*.jsonl` + `.meta.json` (`agentType`) | agent accounting silently reports zero |
| `isSidechain` **never appears** in the main transcript — 0 of 6,750 turns despite 32 `Agent` calls | a guard against it there is dead code |
| `systemMessage` from `UserPromptSubmit` does not render to the human | the statusline becomes the only human-facing surface |
| MCP tool schemas are **deferred**; `ToolSearch` fetches on demand (**E5**) | a revert to eager loading reinstates a 15–40k per-turn floor |
| discovered MCP schemas are **sticky** — resident count went 5 → 34 → 34 across boundaries | per-session server enablement becomes worth doing again |
| no hook can TRIGGER compaction; `PreCompact` fires when one is already underway | — |
| **does `autoCompactWindow` reach SUBAGENT windows? — UNKNOWN (E6)** | if it does not, a turn budget is the ONLY control in that window |

**On that last row.** 27 subagent runs contained **zero** `compact_boundary` lines — but the highest
peak context was **249,142**, so no run came within 50k of any threshold, and all of them predate
the setting. The null result proves "no compaction below ~250k", not "never". Recorded as
inconclusive in E6 rather than allowed to read as proof.

The incidental finding lowers this question's priority rather than raising it: **subagent context
plateaus around 250k even at 336 turns**, so agents are not approaching a boundary in normal use.
To settle it, run one deliberately long agent (repo-wide census, no early exit) against
`autoCompactWindow: 300000` and check its transcript — but nothing in normal use gets there.

**RE-RUN TRIGGER:** on any Claude Code major-version upgrade, re-run **E5** before trusting the "MCP
is free" conclusion, and re-verify the transcript field names above. Recorded in
`docs/EXPERIMENTS.md` alongside E1b/E2.

---

## 5 · DESIGN RULES, EACH PAID FOR

Four defects shipped in this hook, **every one green under its own probe suite at the time**. That
is the pattern already in CLAUDE.md's scars: a control whose claim outruns its implementation,
invisible because the common case passes.

### 5.1 · Address the party that can act

The hook put "run /compact" into `additionalContext`, which is delivered to the **model** — the one
participant that cannot run a slash command. The human, who can, saw nothing. **An instruction
delivered to a party that cannot execute it is indistinguishable from no instruction, while looking
like a working control.**

Split by capability: `additionalContext` → batching and delegation economics (model can act);
statusline → the compaction ask (human can act).

### 5.2 · A reset invalidates the last reading

The hook read the last usage line, which at prompt-submit time straight after a compaction is the
**pre-compaction** turn. It reported 687k to a session just reset to 15,444 — nagging at the one
moment the problem was solved. Scan backwards for whichever lands first: a `compact_boundary` (use
`postTokens`) or a usage line.

### 5.3 · Bound the READ, not just the parse

`readFileSync()` then `subarray()` bounds the *parsing* and not the *reading*: a 41.5MB read and
allocation on **every prompt**. Use `openSync` + a positioned read. **The tool policing I/O cost was
the most I/O-expensive thing in the session.**

### 5.4 · Probe the process, not only the message

No assertion about output could have caught 5.3 — the hook printed exactly the right number while
reading 41.5MB to do it. The probe must measure **RSS and wall-time against a large synthetic input**.
Result after the fix: a 200MB transcript costs **4ms and 0MB more RSS** than a 1MB one.

### 5.5 · A probe that can pass vacuously has not been written yet

That RSS probe first passed for the wrong reason: the driver's parse picked up the hook's own stdout
JSON, so `rss` was `undefined`, and `(undefined ?? 0) - (undefined ?? 0)` is below any threshold.
**Always assert the measurement is a real, positive number before comparing it.**

### 5.6 · Guard the entrypoint on any hook meant to be imported

The statusline `require`s the hook. Without `if (require.main === module)`, that import registers a
stdin handler which prints the hook's JSON onto the statusline's stdout. Same collision as 5.5,
different victim.

### 5.7 · Never sum a snapshot with a total

Three numbers, different units: **context NOW** is a snapshot (what each turn re-sends, and what
drives the thresholds); **main** and **agent** spend are cumulative totals. Adding them produces a
number that means nothing. And label a partial total *"since tracking began"* — reconstructing from
byte 0 is the unbounded read 5.3 removed.

### 5.8 · Cross-artefact invariants need their own check

`WARN` (a JS constant) must sit **below** `autoCompactWindow` (a JSON setting) or compaction
pre-empts its own warning and the tier is unreachable text; `STOP` must sit **above** it, because
reaching STOP means autocompact did not fire — itself the finding. Nothing else can see both ends.

### 5.9 · Piping a gate destroys its exit code

`npm run check 2>&1 | tail -8` returns **tail's** status. Several commits' gate runs would have
reported success while failing. Use `set -o pipefail` and echo `${PIPESTATUS[0]}`. This is in direct
tension with the token rule that says to pipe long output — **do both**.

---

## 6 · WHAT THE MEASUREMENT COST, AND HOW TO REPEAT IT CHEAPLY

E4/E5 came from walking the transcript offline, not from the hook. Method: sum
`input + cache_write×1.25 + cache_read×0.1 + output` per turn across the main transcript and every
`subagents/agent-*.jsonl`.

**Do not measure by spawning a nested `claude` process.** The first attempt at the E5 A/B did, and
consumed the user's session limit. Use a separate machine or an idle window.
