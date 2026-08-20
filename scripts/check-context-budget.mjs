#!/usr/bin/env node
/**
 * scripts/check-context-budget.mjs — probes for the context-budget hook.
 *
 * Three directions, because a reminder hook has three ways to be useless:
 *   quiet when it should be    — a warning on every prompt is wallpaper and gets ignored
 *   silent when it should warn — the failure that costs money, and the invisible one
 *   noisy on a broken payload  — this hook only ever ADDS a line, so a parse failure must degrade
 *                                to "no advice", never to a stalled prompt
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

/** A transcript whose LAST usage-bearing line reports the given context size. */
function transcript(name, cacheRead, extraTail = []) {
  const p = join(tmp, `${name}.jsonl`)
  const lines = [
    JSON.stringify({ type: "user", message: { content: "hello" } }),
    JSON.stringify({ type: "assistant", message: { usage: { cache_read_input_tokens: 10, output_tokens: 5 } } }),
    JSON.stringify({ type: "assistant", message: { usage: { cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 0, input_tokens: 0, output_tokens: 100 } } }),
    ...extraTail,
  ]
  writeFileSync(p, lines.join("\n") + "\n")
  return p
}

function run(payload) {
  const r = spawnSync("node", [HOOK], { input: payload, encoding: "utf8" })
  if (r.status !== 0) return { error: `hook exited ${r.status}: ${r.stderr.slice(0, 160)}` }
  try {
    return { ctx: JSON.parse(r.stdout).hookSpecificOutput.additionalContext }
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
  ok(r.ctx === "", "KNOWN-GOOD: 50k context says nothing — a reminder that always fires is wallpaper", JSON.stringify(r))
}

// ── warns in the middle band ─────────────────────────────────────────────────────────────────
{
  const r = run(payload(transcript("mid", 300_000)))
  ok(/Context 300k/.test(r.ctx ?? ""), "300k warns, and names the actual number", JSON.stringify(r))
  ok(/compact/i.test(r.ctx ?? "") && /batch/i.test(r.ctx ?? ""), "…and gives BOTH levers — compact for a new task, batch for the same one", JSON.stringify(r))
}

// ── escalates above the stop line ────────────────────────────────────────────────────────────
{
  const r = run(payload(transcript("big", 600_000)))
  ok(/⚠ CONTEXT 600k/.test(r.ctx ?? ""), "600k escalates", JSON.stringify(r))
  ok(/60k billable/.test(r.ctx ?? ""), "…and states the PER-TURN cost, which is the number that decides", JSON.stringify(r))
  ok((r.ctx ?? "").length > (run(payload(transcript("mid2", 300_000))).ctx ?? "").length,
    "…and says more than the mid-band message, so the escalation is visible")
}

// ── the sum, not just cache_read ─────────────────────────────────────────────────────────────
{
  const p = join(tmp, "sum.jsonl")
  writeFileSync(p, JSON.stringify({
    type: "assistant",
    message: { usage: { cache_read_input_tokens: 200_000, cache_creation_input_tokens: 100_000, input_tokens: 20_000, output_tokens: 9 } },
  }) + "\n")
  const r = run(payload(p))
  ok(/320k/.test(r.ctx ?? ""), "counts cache_read + cache_creation + input — all of it was sent", JSON.stringify(r))
}

// ── the LAST usage line wins, not the first ──────────────────────────────────────────────────
{
  const r = run(payload(transcript("grew", 500_000)))
  ok(/500k/.test(r.ctx ?? "") && !/10k/.test(r.ctx ?? ""),
    "reads the LATEST turn — an early small turn must not mask a grown context", JSON.stringify(r))
}

// ── trailing non-usage lines must not hide the measurement ───────────────────────────────────
{
  const tail = Array.from({ length: 40 }, (_, i) => JSON.stringify({ type: "user", message: { content: `tool result ${i}` } }))
  const r = run(payload(transcript("tail", 500_000, tail)))
  ok(/500k/.test(r.ctx ?? ""), "scans back past trailing tool-result lines to the last usage", JSON.stringify(r))
}

// ── degrade to silence, never to a stall ─────────────────────────────────────────────────────
{
  ok(run("{not json").ctx === "", "an unparseable payload yields no advice rather than an error")
  ok(run(payload(join(tmp, "does-not-exist.jsonl"))).ctx === "", "a missing transcript yields no advice")
  ok(run(JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "x" })).ctx === "",
    "a payload with no transcript_path yields no advice")
  writeFileSync(join(tmp, "empty.jsonl"), "")
  ok(run(payload(join(tmp, "empty.jsonl"))).ctx === "", "an empty transcript yields no advice")
}

rmSync(tmp, { recursive: true, force: true })
console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — quiet when small, escalates when large, silent when it cannot measure")
process.exit(failed ? 1 : 0)
