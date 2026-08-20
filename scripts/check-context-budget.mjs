#!/usr/bin/env node
/**
 * scripts/check-context-budget.mjs — probes for the context-budget hook.
 *
 * A reminder hook has four ways to be useless, and this repo has now shipped two of them:
 *   quiet when it should be     — a warning on every prompt is wallpaper and gets ignored
 *   silent when it should warn  — the failure that costs money, and the invisible one
 *   noisy on a broken payload   — this hook only ever ADDS a line, so a parse failure must degrade
 *                                 to "no advice", never to a stalled prompt
 *   SHIPPED, twice:
 *     · it read the last usage line and so reported the PRE-compaction size to a session that had
 *       just compacted — nagging at the one moment the problem was already solved
 *     · it addressed "/compact" to the model, which cannot run a slash command, while the human
 *       who can saw nothing at all
 *
 * Both of those passed the original probe suite, because every probe exercised a case the author
 * had already thought of. The two fixtures at the bottom exist so that class cannot come back.
 *
 * Driven as a real subprocess with a real stdin payload and a real transcript file on disk, because
 * the thing most likely to break is reading the transcript — not the arithmetic.
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs"
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

/** A transcript whose LAST usage-bearing line reports the given context size. */
function transcript(name, cacheRead, extraTail = []) {
  const p = join(tmp, `${name}.jsonl`)
  const lines = [
    JSON.stringify({ type: "user", message: { content: "hello" } }),
    usageLine(10),
    usageLine(cacheRead),
    ...extraTail,
  ]
  writeFileSync(p, lines.join("\n") + "\n")
  return p
}

function write(name, lines) {
  const p = join(tmp, `${name}.jsonl`)
  writeFileSync(p, lines.join("\n") + "\n")
  return p
}

function run(payload) {
  const r = spawnSync("node", [HOOK], { input: payload, encoding: "utf8" })
  if (r.status !== 0) return { error: `hook exited ${r.status}: ${r.stderr.slice(0, 160)}` }
  try {
    const j = JSON.parse(r.stdout)
    return { ctx: j.hookSpecificOutput.additionalContext, sys: j.systemMessage ?? null }
  } catch {
    return { error: `unparseable stdout: ${r.stdout.slice(0, 160)}` }
  }
}

const payload = (transcript_path, prompt = "do a thing") =>
  JSON.stringify({ hook_event_name: "UserPromptSubmit", transcript_path, prompt, cwd: process.cwd() })

let failed = 0
const ok = (cond, label, detail = "") => { if (!cond) failed++; console.log(`  ${cond ? "✓" : "✗"} ${label}${cond ? "" : `\n      ${detail}`}`) }

// ── quiet below the threshold ────────────────────────────────────────────────────────────────
{
  const r = run(payload(transcript("small", 50_000)))
  ok(r.ctx === "" && r.sys === null, "KNOWN-GOOD: 50k says nothing to EITHER audience — a reminder that always fires is wallpaper", JSON.stringify(r))
}

// ── warns in the middle band, to both audiences, with different text ─────────────────────────
{
  const r = run(payload(transcript("mid", 300_000)))
  ok(/Context 300k/.test(r.ctx ?? "") && /Context 300k/.test(r.sys ?? ""), "300k warns BOTH audiences, and names the actual number", JSON.stringify(r))
}

// ── escalates above the stop line ────────────────────────────────────────────────────────────
{
  const r = run(payload(transcript("big", 600_000)))
  ok(/⚠ CONTEXT 600k/.test(r.sys ?? ""), "600k escalates to the user", JSON.stringify(r))
  ok(/60k billable/.test(r.sys ?? ""), "…and states the PER-TURN cost, which is the number that decides", JSON.stringify(r))
  ok((r.sys ?? "").length > (run(payload(transcript("mid2", 300_000))).sys ?? "").length,
    "…and says more than the mid-band message, so the escalation is visible")
}

// ── THE AUDIENCE SPLIT (shipped defect #1) ───────────────────────────────────────────────────
// "/compact" is a slash command. Only the human can run one. Putting that instruction in
// additionalContext delivers it to the model and to nobody who can act on it.
{
  const r = run(payload(transcript("split", 600_000)))
  ok(/\/compact/.test(r.sys ?? ""), "the /compact ask reaches the USER, who is the only one who can run it", JSON.stringify(r))
  ok(!/run \/compact/i.test(r.ctx ?? ""), "…and is NOT what the model is told to do — it cannot run a slash command", JSON.stringify(r))
  ok(/batch/i.test(r.ctx ?? ""), "the model gets the lever it CAN pull: batching independent tool calls", JSON.stringify(r))
  ok(/autocompact/.test(r.sys ?? ""), "…and the user is told the permanent fix, not just the manual one", JSON.stringify(r))
}

// ── THE POST-COMPACTION READ (shipped defect #2) ─────────────────────────────────────────────
// At prompt-submit time right after a compaction there is no post-compaction turn yet, so the
// newest usage line is the PRE-compaction one. Reading it reports ~700k to a 15k session.
{
  const p = write("compacted", [
    usageLine(687_984),                                                    // the turn before compaction
    JSON.stringify({ type: "system", subtype: "compact_boundary", compactMetadata: { trigger: "manual", preTokens: 687_984, postTokens: 15_444 } }),
    JSON.stringify({ type: "user", isCompactSummary: true, message: { content: "This session is being continued…" } }),
  ])
  const r = run(payload(p))
  ok(r.sys === null && r.ctx === "", "REGRESSION: straight after a compaction the hook is SILENT — it reads postTokens (15k), not the stale pre-compaction usage (688k)", JSON.stringify(r))
}
{
  // …and the boundary must not silence it forever: once context regrows past WARN, it warns again.
  const p = write("regrown", [
    usageLine(687_984),
    JSON.stringify({ type: "system", subtype: "compact_boundary", compactMetadata: { trigger: "manual", preTokens: 687_984, postTokens: 15_444 } }),
    usageLine(300_000),                                                    // context grew back
  ])
  const r = run(payload(p))
  ok(/Context 300k/.test(r.sys ?? ""), "KNOWN-GOOD: a post-compaction turn that regrew to 300k warns again — the boundary is not a permanent mute", JSON.stringify(r))
}
{
  // A boundary with no postTokens must not be trusted as a measurement.
  const p = write("boundary-malformed", [
    usageLine(600_000),
    JSON.stringify({ type: "system", subtype: "compact_boundary", compactMetadata: { trigger: "auto" } }),
  ])
  const r = run(payload(p))
  ok(/600k/.test(r.sys ?? ""), "a boundary missing postTokens is skipped, not read as zero", JSON.stringify(r))
}

// ── a subagent's window is not this session's ────────────────────────────────────────────────
{
  const p = write("sidechain", [
    usageLine(600_000),
    usageLine(40_000, { isSidechain: true }),                              // a subagent turn
  ])
  const r = run(payload(p))
  ok(/600k/.test(r.sys ?? ""), "sidechain (subagent) usage is skipped — it is its own context window, not ours", JSON.stringify(r))
}

// ── the sum, not just cache_read ─────────────────────────────────────────────────────────────
{
  const p = write("sum", [JSON.stringify({
    type: "assistant",
    message: { usage: { cache_read_input_tokens: 200_000, cache_creation_input_tokens: 100_000, input_tokens: 20_000, output_tokens: 9 } },
  })])
  const r = run(payload(p))
  ok(/320k/.test(r.sys ?? ""), "counts cache_read + cache_creation + input — all of it was sent", JSON.stringify(r))
}

// ── the LAST usage line wins, not the first ──────────────────────────────────────────────────
{
  const r = run(payload(transcript("grew", 500_000)))
  ok(/500k/.test(r.sys ?? "") && !/10k/.test(r.sys ?? ""),
    "reads the LATEST turn — an early small turn must not mask a grown context", JSON.stringify(r))
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
  ok(run(JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "x" })).ctx === "",
    "a payload with no transcript_path yields no advice")
  writeFileSync(join(tmp, "empty.jsonl"), "")
  ok(run(payload(join(tmp, "empty.jsonl"))).ctx === "", "an empty transcript yields no advice")
  ok(run(payload(join(tmp, "empty.jsonl"))).sys === null, "…and no systemMessage key either, so the user sees nothing rather than an empty banner")
}

rmSync(tmp, { recursive: true, force: true })
console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — right number, right audience, silent when it cannot measure")
process.exit(failed ? 1 : 0)
