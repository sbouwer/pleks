#!/usr/bin/env node
/**
 * scripts/check-context-budget.mjs — probes for the context-budget hook.
 *
 * A reminder hook has several ways to be useless, and this repo has now shipped three of them:
 *   quiet when it should be     — a warning on every prompt is wallpaper and gets ignored
 *   silent when it should warn  — the failure that costs money, and the invisible one
 *   noisy on a broken payload   — this hook only ever ADDS a line, so a parse failure must degrade
 *                                 to "no advice", never to a stalled prompt
 *   SHIPPED:
 *     · it read the last usage line and so reported the PRE-compaction size to a session that had
 *       just compacted — nagging at the one moment the problem was already solved
 *     · it addressed "/compact" to the model, which cannot run a slash command, while the human
 *       who can saw nothing at all
 *     · it called readFileSync() on a 41.5MB transcript EVERY PROMPT — the WINDOW constant bounded
 *       the parsing and not the reading, so the hook policing I/O cost was the most I/O-expensive
 *       thing in the session
 *
 * All three passed the suite that existed at the time, because every probe exercised a case the
 * author had already thought of. The REGRESSION fixtures below exist so those classes cannot come
 * back — in particular the I/O one, which no assertion about OUTPUT could ever have caught. That is
 * why the memory probe measures the process rather than the message.
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, openSync, writeSync, closeSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const HOOK = ".claude/hooks/context-budget.js"

if (!existsSync(HOOK)) {
  console.log(`❌ ${HOOK} is missing — the hook this probe exists to verify is not installed`)
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), "ctxbudget-"))

const usageLine = (cacheRead, extra = {}) => JSON.stringify({
  type: "assistant",
  ...extra,
  message: { usage: { cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 0, input_tokens: 0, output_tokens: 100 } },
})

const boundary = (postTokens, trigger = "manual") => JSON.stringify({
  type: "system", subtype: "compact_boundary",
  compactMetadata: { trigger, preTokens: 687_984, ...(postTokens === null ? {} : { postTokens }) },
})

function write(name, lines) {
  const p = join(tmp, `${name}.jsonl`)
  writeFileSync(p, lines.join("\n") + "\n")
  return p
}

/** A transcript whose LAST usage-bearing line reports the given context size. */
function transcript(name, cacheRead, extraTail = []) {
  return write(name, [
    JSON.stringify({ type: "user", message: { content: "hello" } }),
    usageLine(10),
    usageLine(cacheRead),
    ...extraTail,
  ])
}

/** A fresh cwd per case, so one probe's state file cannot leak into the next. */
let cwdSeq = 0
function freshCwd() {
  const d = join(tmp, `cwd${cwdSeq++}`)
  mkdirSync(d, { recursive: true })
  return d
}

function run(payload) {
  // `process.execPath`, not "node" — the hook must run under the interpreter running this check.
  const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: "utf8" })
  if (r.status !== 0) return { error: `hook exited ${r.status}: ${r.stderr.slice(0, 200)}` }
  try {
    const j = JSON.parse(r.stdout)
    return { ctx: j.hookSpecificOutput.additionalContext, sys: j.systemMessage ?? null }
  } catch {
    return { error: `unparseable stdout: ${r.stdout.slice(0, 200)}` }
  }
}

const payload = (transcript_path, cwd = freshCwd(), prompt = "do a thing") =>
  JSON.stringify({ hook_event_name: "UserPromptSubmit", transcript_path, prompt, cwd })

let failed = 0
const ok = (cond, label, detail = "") => { if (!cond) failed++; console.log(`  ${cond ? "✓" : "✗"} ${label}${cond ? "" : `\n      ${detail}`}`) }

// ── quiet below the threshold ────────────────────────────────────────────────────────────────
{
  const r = run(payload(transcript("small", 50_000)))
  ok(r.sys === null, "KNOWN-GOOD: 50k says nothing to the USER — a reminder that always fires is wallpaper", JSON.stringify(r))
  ok(r.ctx === "ctx 50k", "…but the MODEL gets the bare figure, so a working hook is distinguishable from an absent one", JSON.stringify(r))
  ok(!/batch|compact|billable/i.test(r.ctx), "…with NO advice attached — the bare tier is a fact, not a nag", JSON.stringify(r.ctx))
  ok(r.ctx.length < 20, `…and it stays ~10 tokens (${r.ctx.length} chars), or the always-on tier becomes the wallpaper it replaced`, r.ctx)
}

// The ambiguity the bare tier exists to kill: below-threshold vs. never-measured must not look alike.
{
  const measured = run(payload(transcript("tiny", 12_000)))
  const unmeasurable = run("{not json")
  ok(measured.ctx === "ctx 12k" && unmeasurable.ctx === "",
    "a MEASURED small context and an UNMEASURABLE one produce different output — the three-way silence is resolved",
    JSON.stringify({ measured: measured.ctx, unmeasurable: unmeasurable.ctx }))
}

// ── WARN must sit below the recommended autocompact threshold, or the tier is unreachable ────
{
  const r = run(payload(transcript("warnband", 200_000)))
  ok(/Context 200k/.test(r.sys ?? ""), "200k warns — WARN(180k) is BELOW the 300k autocompact this hook recommends, so the tier can actually fire", JSON.stringify(r))
  ok(/300000/.test(r.sys ?? ""), "…and the recommended threshold is stated, not implied", JSON.stringify(r))
}

// ── escalates above the stop line ────────────────────────────────────────────────────────────
{
  const r = run(payload(transcript("big", 600_000)))
  ok(/⚠ CONTEXT 600k/.test(r.sys ?? ""), "600k escalates to the user", JSON.stringify(r))
  ok(/60k billable/.test(r.sys ?? ""), "…and states the PER-TURN cost, which is the number that decides", JSON.stringify(r))
  ok((r.sys ?? "").length > (run(payload(transcript("mid2", 200_000))).sys ?? "").length,
    "…and says more than the warn-band message, so the escalation is visible")
}

// ── THE AUDIENCE SPLIT (shipped defect) ──────────────────────────────────────────────────────
// "/compact" is a slash command. Only the human can run one. Putting that instruction in
// additionalContext delivers it to the model and to nobody who can act on it.
{
  const r = run(payload(transcript("split", 600_000)))
  ok(/\/compact/.test(r.sys ?? ""), "the /compact ask reaches the USER, who is the only one who can run it", JSON.stringify(r))
  ok(!/run \/compact/i.test(r.ctx ?? ""), "…and is NOT what the model is told to do — it cannot run a slash command", JSON.stringify(r))
  ok(/batch/i.test(r.ctx ?? ""), "the model gets the lever it CAN pull: batching independent tool calls", JSON.stringify(r))
  ok(/autocompact/.test(r.sys ?? ""), "…and the user is told the permanent fix, not just the manual one", JSON.stringify(r))
}

// ── THE POST-COMPACTION READ (shipped defect) ────────────────────────────────────────────────
{
  const p = write("compacted", [usageLine(687_984), boundary(15_444), JSON.stringify({ type: "user", isCompactSummary: true, message: { content: "continued…" } })])
  const r = run(payload(p))
  ok(r.sys === null && r.ctx === "ctx 15k", "REGRESSION: straight after a compaction the hook reads postTokens (15k), not the stale pre-compaction usage (688k) — and now SHOWS the 15k rather than leaving it inferred from silence", JSON.stringify(r))
}
{
  const p = write("regrown", [usageLine(687_984), boundary(15_444), usageLine(200_000)])
  const r = run(payload(p))
  ok(/Context 200k/.test(r.sys ?? ""), "KNOWN-GOOD: a post-compaction turn that regrew past WARN warns again — the boundary is not a permanent mute", JSON.stringify(r))
}
{
  const p = write("boundary-malformed", [usageLine(600_000), boundary(null)])
  const r = run(payload(p))
  ok(/600k/.test(r.sys ?? ""), "a boundary missing postTokens is skipped, not read as zero", JSON.stringify(r))
}

// ── THE UNBOUNDED READ (shipped defect) ──────────────────────────────────────────────────────
// This is the one no output assertion could have caught: the hook printed exactly the right
// message while reading 41.5MB to do it. So measure the PROCESS, not the message.
{
  // The driver's line is MARKED, because requiring the hook also registers its stdin handler and
  // that handler prints the hook's own JSON on stdin close. Taking "the last line" picked up the
  // hook's output instead, every field came back undefined, and `(undefined ?? 0) - (undefined ?? 0)`
  // is 0 — which is less than any threshold. The probe passed while asserting nothing. Hence the
  // marker, and hence the explicit "rss is a positive number" assertion below it.
  const driver = join(tmp, "rss-driver.mjs")
  writeFileSync(driver, [
    `import { createRequire } from "node:module"`,
    `const require = createRequire(${JSON.stringify(`file:///${process.cwd().replace(/\\/g, "/")}/`)})`,
    `const h = require(${JSON.stringify(`./${HOOK}`)})`,
    `const t0 = Date.now()`,
    `h.measure(process.argv[2], process.argv[3])`,
    `console.log("RSSPROBE:" + JSON.stringify({ rss: process.memoryUsage().rss, ms: Date.now() - t0 }))`,
  ].join("\n"))

  /** Build a transcript of roughly `mb` megabytes whose LAST line is a real usage line. */
  function bigTranscript(name, mb) {
    const p = join(tmp, `${name}.jsonl`)
    const filler = JSON.stringify({ type: "user", message: { content: "x".repeat(4000) } }) + "\n"
    const chunk = Buffer.from(filler.repeat(256), "utf8")          // ~1MB per chunk
    const fd = openSync(p, "w")
    try {
      for (let written = 0; written < mb * 1024 * 1024; written += chunk.length) writeSync(fd, chunk)
      writeSync(fd, Buffer.from(usageLine(600_000) + "\n", "utf8"))
    } finally { closeSync(fd) }
    return p
  }

  const measureRss = (p) => {
    // `process.execPath` matters MORE here than in the probe above: this measures RSS, and a
    // different Node major has a different baseline heap. A PATH-resolved interpreter would make
    // the number meaningless rather than merely unpinned.
    const r = spawnSync(process.execPath, [driver, p, freshCwd()], { encoding: "utf8" })
    const line = r.stdout.split("\n").find((l) => l.startsWith("RSSPROBE:"))
    if (!line) return { error: `no RSSPROBE line. stderr: ${r.stderr.slice(0, 200)}` }
    try { return JSON.parse(line.slice("RSSPROBE:".length)) } catch { return { error: `bad RSSPROBE payload: ${line.slice(0, 120)}` } }
  }

  const small = measureRss(bigTranscript("io-small", 1))
  const huge = measureRss(bigTranscript("io-huge", 200))

  ok(!small.error && !huge.error, "the RSS driver ran against both a 1MB and a 200MB transcript", JSON.stringify({ small, huge }))
  ok(Number.isFinite(small.rss) && small.rss > 0 && Number.isFinite(huge.rss) && huge.rss > 0,
    "…and both reported a REAL rss — an undefined here would make the comparison below vacuously true",
    JSON.stringify({ small, huge }))

  const growth = huge.rss - small.rss
  ok(growth < 60 * 1024 * 1024,
    `REGRESSION: memory is FLAT in transcript size — a 200MB file costs ${Math.round(growth / 1e6)}MB more RSS than a 1MB one (a whole-file read would cost ~200MB)`,
    JSON.stringify({ small, huge, growthMB: Math.round(growth / 1e6) }))
  ok(Number.isFinite(huge.ms) && huge.ms < 2000,
    `…and wall-time is flat too: ${huge.ms}ms on a 200MB transcript`, JSON.stringify(huge))
}

// ── AGENT ACCOUNTING ─────────────────────────────────────────────────────────────────────────
// Agent spend lives in <transcript-dir>/<sessionId>/subagents/, NOT in the main transcript:
// measured 6,750 main turns in this repo's session carrying ZERO isSidechain, despite 32 Agent
// calls. A guard against isSidechain in the main file was correct in principle and dead in fact.
{
  /** A session directory laid out the way Claude Code actually writes one. */
  function sessionWithAgents(name, agents) {
    const p = write(name, [usageLine(600_000)])
    const dir = join(tmp, name, "subagents")
    mkdirSync(dir, { recursive: true })
    for (const [id, { type, turns }] of Object.entries(agents)) {
      writeFileSync(join(dir, `agent-${id}.meta.json`), JSON.stringify({ agentType: type, description: "d", spawnDepth: 1 }))
      writeFileSync(join(dir, `agent-${id}.jsonl`),
        turns.map((t) => JSON.stringify({ isSidechain: true, agentId: id, type: "assistant", message: { usage: { cache_read_input_tokens: t, cache_creation_input_tokens: 0, input_tokens: 0, output_tokens: 50 } } })).join("\n") + "\n")
    }
    return p
  }

  const withAgents = sessionWithAgents("hasagents", {
    aaa: { type: "census", turns: [100_000, 120_000] },
    bbb: { type: "grounder", turns: [90_000] },
  })
  const r = run(payload(withAgents))
  ok(/3 agents|3 invocations|2 agents/.test(r.sys ?? "") || /2 invocations/.test(r.ctx ?? ""),
    "a session WITH subagents reports a non-zero invocation count", JSON.stringify(r))
  ok(/Agents so far: 2 invocations/.test(r.ctx ?? ""), "…the model is told how many delegations have happened", JSON.stringify(r))
  ok(!/~0k billable/.test(r.ctx ?? "") && /Agents so far/.test(r.ctx ?? ""), "…and their cost is non-zero", JSON.stringify(r))
  ok(/READS a lot and RETURNS a little/.test(r.ctx ?? ""), "…and is given the rule for when delegation actually pays", JSON.stringify(r))

  // Millions must read as millions. The first live run printed "~55687k billable-equivalent" for
  // real agent spend — correct, and unreadable at the glance this figure exists to inform.
  const heavy = sessionWithAgents("heavyagents", {
    ccc: { type: "implementer", turns: Array.from({ length: 40 }, () => 900_000) },
  })
  const rh = run(payload(heavy))
  ok(/\d+\.\d M?|\d+\.\dM/.test(rh.ctx ?? "") && /M billable/.test(rh.ctx ?? ""),
    "spend in the millions renders as M, not as five digits of k", JSON.stringify(rh.ctx))
  ok(!/\d{4,}k/.test(rh.ctx ?? ""), "…and no four-plus-digit k value survives anywhere in the message", JSON.stringify(rh.ctx))

  // The other direction, which is the one that rots silently: no agents must mean EXACTLY zero,
  // reported as an absence, never as a null rendered into a number.
  const noAgents = write("noagents", [usageLine(600_000)])
  const r2 = run(payload(noAgents))
  ok(!/Agents so far/.test(r2.ctx ?? ""), "KNOWN-GOOD: a session with NO subagents omits the agent clause entirely — no null-as-zero", JSON.stringify(r2))
  ok(!/NaN|undefined|null/.test(r2.ctx ?? "") && !/NaN|undefined|null/.test(r2.sys ?? ""),
    "…and neither message contains NaN/undefined/null", JSON.stringify(r2))
}

// ── cumulative accounting across invocations ─────────────────────────────────────────────────
{
  const cwd = freshCwd()
  const p = write("cumulative", [usageLine(600_000)])
  const first = run(payload(p, cwd))
  ok(/over \d+ turns/.test(first.sys ?? ""), "the user is given a cumulative session spend, not only the snapshot", JSON.stringify(first))
  ok(!/since tracking began/.test(first.sys ?? ""),
    "KNOWN-GOOD: a transcript SMALLER than the window is tracked from byte 0, so the total is complete and is NOT hedged", JSON.stringify(first))
  ok(existsSync(join(cwd, ".claude/.context-budget.state.json")), "…and the state file is written where the next invocation will find it")

  // …but a transcript larger than the window cannot be tracked from byte 0 without the unbounded
  // read this hook exists to avoid, so its total MUST say so rather than quietly under-report.
  const bigP = join(tmp, "cumulative-big.jsonl")
  writeFileSync(bigP, JSON.stringify({ type: "user", message: { content: "x".repeat(700_000) } }) + "\n" + usageLine(600_000) + "\n")
  const bigFirst = run(payload(bigP, freshCwd()))
  ok(/since tracking began/.test(bigFirst.sys ?? ""),
    "a transcript LARGER than the window is labelled 'since tracking began' — the total is partial and says so", JSON.stringify(bigFirst))

  writeFileSync(p, [usageLine(600_000), usageLine(610_000)].join("\n") + "\n")
  const second = run(payload(p, cwd))
  const turnsOf = (s) => Number((/over (\d+) turns/.exec(s ?? "") || [])[1] ?? -1)
  ok(turnsOf(second.sys) > turnsOf(first.sys), `the second invocation counts MORE turns (${turnsOf(first.sys)} → ${turnsOf(second.sys)}) — the delta accumulated`, JSON.stringify(second))
}

// ── the sum, not just cache_read ─────────────────────────────────────────────────────────────
{
  const p = write("sum", [JSON.stringify({ type: "assistant", message: { usage: { cache_read_input_tokens: 400_000, cache_creation_input_tokens: 100_000, input_tokens: 20_000, output_tokens: 9 } } })])
  const r = run(payload(p))
  ok(/520k/.test(r.sys ?? ""), "counts cache_read + cache_creation + input — all of it was sent", JSON.stringify(r))
}

// ── the LAST usage line wins, not the first ──────────────────────────────────────────────────
{
  const r = run(payload(transcript("grew", 500_000)))
  ok(/500k/.test(r.sys ?? "") && !/10k billable/.test(r.sys ?? ""), "reads the LATEST turn — an early small turn must not mask a grown context", JSON.stringify(r))
}

// ── trailing non-usage lines must not hide the measurement ───────────────────────────────────
{
  const tail = Array.from({ length: 40 }, (_, i) => JSON.stringify({ type: "user", message: { content: `tool result ${i}` } }))
  const r = run(payload(transcript("tail", 500_000, tail)))
  ok(/500k/.test(r.sys ?? ""), "scans back past trailing tool-result lines to the last usage", JSON.stringify(r))
}

// ── degrade to silence, never to a stall ─────────────────────────────────────────────────────
{
  ok(run("{not json").ctx === "", "an unparseable payload yields no advice rather than an error")
  ok(run(payload(join(tmp, "does-not-exist.jsonl"))).ctx === "", "a missing transcript yields no advice")
  ok(run(JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "x" })).ctx === "", "a payload with no transcript_path yields no advice")
  writeFileSync(join(tmp, "empty.jsonl"), "")
  ok(run(payload(join(tmp, "empty.jsonl"))).ctx === "", "an empty transcript yields no advice")
  ok(run(payload(join(tmp, "empty.jsonl"))).sys === null, "…and no systemMessage key either, so the user sees nothing rather than an empty banner")

  // A corrupt state file must not take the hook down with it.
  const cwd = freshCwd()
  mkdirSync(join(cwd, ".claude"), { recursive: true })
  writeFileSync(join(cwd, ".claude/.context-budget.state.json"), "{ this is not json")
  const r = run(payload(transcript("corruptstate", 600_000), cwd))
  ok(/600k/.test(r.sys ?? ""), "a corrupt state file is discarded and measurement continues", JSON.stringify(r))

  // No cwd at all — state is impossible, the snapshot must still work.
  const r2 = run(JSON.stringify({ hook_event_name: "UserPromptSubmit", transcript_path: transcript("nocwd", 600_000), prompt: "x" }))
  ok(/600k/.test(r2.sys ?? ""), "with no cwd the snapshot still measures — cumulative is the only casualty", JSON.stringify(r2))
}

// ── the threshold and the autocompact window must stay coherent ──────────────────────────────
// The hook warns, and the CLI compacts. If the warn line sits AT or ABOVE the compaction window,
// compaction pre-empts its own warning and the tier is unreachable text — the hook would look
// installed and say nothing, forever. This is the one relationship between the two that nothing
// else can check, because it spans a JS constant and a JSON setting.
{
  const settings = JSON.parse(readFileSync(".claude/settings.json", "utf8"))
  const window = settings.autoCompactWindow
  const { WARN, STOP } = await import("../.claude/hooks/context-budget.js").then((m) => m.default ?? m)

  ok(typeof window === "number", "settings.json sets autoCompactWindow — compaction is configured, not left at the ~1M default", JSON.stringify(window))
  ok(window >= 100_000 && window <= 1_000_000, `…and it is inside the CLI's accepted 100k-1M range (${window})`, String(window))
  ok(WARN < window, `WARN (${WARN}) is BELOW autoCompactWindow (${window}) — otherwise compaction fires first and the warning is unreachable`, `WARN=${WARN} window=${window}`)
  ok(STOP > window, `STOP (${STOP}) is ABOVE autoCompactWindow (${window}) — reaching it means autocompact did not fire, which is itself the finding`, `STOP=${STOP} window=${window}`)
}

rmSync(tmp, { recursive: true, force: true })
console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — right number, right audience, flat memory, agents counted")
process.exit(failed ? 1 : 0)
