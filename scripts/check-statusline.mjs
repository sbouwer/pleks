#!/usr/bin/env node
/**
 * scripts/check-statusline.mjs — probes for the always-visible context gauge.
 *
 * A statusline fails in ways a hook does not, and every one of them is visible to the human on
 * every frame:
 *   it throws              → a stack trace renders into the status bar, forever
 *   it prints extra lines  → the bar is one line; anything else corrupts the UI
 *   it prints a LIBRARY's  → `.claude/statusline.js` requires the context-budget hook, whose
 *     output                 module body used to register a stdin handler on import. That handler
 *                            printed the hook's JSON onto the statusline's stdout. The same
 *                            collision made the hook's own RSS probe pass vacuously, so it is a
 *                            demonstrated failure, not a hypothetical one.
 *   it says nothing        → the whole point is that the human can see the number without asking
 *
 * Driven as a real subprocess with a real stdin payload, because the statusline contract IS
 * "JSON on stdin, one line on stdout".
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const LINE = ".claude/statusline.js"
const SETTINGS = ".claude/settings.json"

if (!existsSync(LINE)) {
  console.log(`❌ ${LINE} is missing — the statusline this probe exists to verify is not installed`)
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), "statusline-"))
let failed = 0
const ok = (cond, label, detail = "") => { if (!cond) failed++; console.log(`  ${cond ? "✓" : "✗"} ${label}${cond ? "" : `\n      ${detail}`}`) }

const usageLine = (cacheRead) => JSON.stringify({
  type: "assistant",
  message: { usage: { cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 0, input_tokens: 0, output_tokens: 100 } },
})

function transcript(name, cacheRead) {
  const p = join(tmp, `${name}.jsonl`)
  writeFileSync(p, usageLine(cacheRead) + "\n")
  return p
}

let cwdSeq = 0
function freshCwd(agents = null) {
  const d = join(tmp, `cwd${cwdSeq++}`)
  mkdirSync(join(d, ".claude"), { recursive: true })
  if (agents) writeFileSync(join(d, ".claude/.context-budget.state.json"), JSON.stringify({ transcript: "x", main: {}, agents }))
  return d
}

function run(payload) {
  const r = spawnSync("node", [LINE], { input: payload, encoding: "utf8" })
  return { out: r.stdout ?? "", err: r.stderr ?? "", status: r.status }
}

const payload = (transcript_path, cwd = freshCwd()) =>
  JSON.stringify({ transcript_path, cwd, model: { display_name: "Opus 5", id: "claude-opus-5" } })

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "")

// ── it renders the number at all ─────────────────────────────────────────────────────────────
{
  const r = run(payload(transcript("mid", 193_000)))
  ok(r.status === 0, "exits 0", JSON.stringify(r))
  ok(/ctx 193k/.test(strip(r.out)), "renders the live context figure — the human can see it without asking", JSON.stringify(r))
  ok(/~19k\/turn/.test(strip(r.out)), "…and the per-turn cost, which is the number that decides", JSON.stringify(r))
  ok(/Opus 5/.test(strip(r.out)), "…and keeps the model name, so replacing the default bar loses nothing", JSON.stringify(r))
}

// ── one line, always ─────────────────────────────────────────────────────────────────────────
{
  const r = run(payload(transcript("oneline", 193_000)))
  ok(!r.out.includes("\n"), "emits a SINGLE line — a status bar has room for exactly one", JSON.stringify(r.out))
}

// ── THE LIBRARY-IMPORT COLLISION (demonstrated failure) ──────────────────────────────────────
{
  const r = run(payload(transcript("nohookjson", 193_000)))
  ok(!/hookSpecificOutput/.test(r.out),
    "REGRESSION: requiring the context-budget hook does NOT leak its JSON onto the status bar — the entrypoint guard holds",
    JSON.stringify(r.out))
  ok(!/additionalContext/.test(r.out), "…no part of the hook payload appears", JSON.stringify(r.out))
}

// ── colour tracks the DECISION, not the magnitude ────────────────────────────────────────────
{
  const green = run(payload(transcript("g", 50_000))).out
  const yellow = run(payload(transcript("y", 200_000))).out
  const red = run(payload(transcript("r", 600_000))).out
  ok(green.includes("\x1b[32m"), "below WARN renders green — a cheap turn should look cheap", JSON.stringify(green))
  ok(yellow.includes("\x1b[33m"), "between WARN and STOP renders yellow", JSON.stringify(yellow))
  ok(red.includes("\x1b[31m"), "above STOP renders red", JSON.stringify(red))
  ok(/\/compact/.test(strip(red)), "…and above STOP it names the action, since only the human can take it", JSON.stringify(red))
  ok(!/\/compact/.test(strip(yellow)), "KNOWN-GOOD: below STOP it does NOT nag — a bar that always shouts is wallpaper", JSON.stringify(yellow))
}

// ── agents appear only when there are agents ─────────────────────────────────────────────────
{
  const withAgents = freshCwd({ "agent-a.jsonl": { offset: 1, tokens: 1, billable: 2_400_000 }, "agent-b.jsonl": { offset: 1, tokens: 1, billable: 600_000 } })
  const r = run(payload(transcript("ag", 193_000), withAgents))
  ok(/2 agents/.test(strip(r.out)), "reports the agent count from the hook's state file", JSON.stringify(r.out))
  ok(/3\.0M/.test(strip(r.out)), "…and their summed spend, scaled to M rather than five digits of k", JSON.stringify(r.out))

  const r2 = run(payload(transcript("noag", 193_000), freshCwd()))
  ok(!/agents/.test(strip(r2.out)), "KNOWN-GOOD: no state file means the agent clause is omitted, not rendered as zero", JSON.stringify(r2.out))
}

// ── it never writes state: the hook is the single writer ─────────────────────────────────────
{
  const cwd = freshCwd()
  run(payload(transcript("nowrite", 193_000), cwd))
  ok(!existsSync(join(cwd, ".claude/.context-budget.state.json")),
    "the statusline does NOT write state — it re-renders on a timer, and one writer avoids thrash")
}

// ── degrade to a blank line, never to a stack trace ──────────────────────────────────────────
{
  for (const [label, p] of [
    ["unparseable payload", "{not json"],
    ["missing transcript", JSON.stringify({ transcript_path: join(tmp, "nope.jsonl"), cwd: freshCwd() })],
    ["no transcript_path", JSON.stringify({ cwd: freshCwd() })],
    ["empty stdin", ""],
  ]) {
    const r = run(p)
    ok(r.status === 0 && !/Error|at Object|\bnode:/.test(r.out), `${label} → no stack trace on the status bar`, JSON.stringify(r))
  }

  // A transcript with no usage yet must say "unknown", not "0k" — 0k is a claim.
  const empty = join(tmp, "nousage.jsonl")
  writeFileSync(empty, JSON.stringify({ type: "user", message: { content: "hi" } }) + "\n")
  const r = run(payload(empty))
  ok(/ctx —/.test(strip(r.out)), "a session with no assistant turn yet shows 'ctx —', not a fabricated 0k", JSON.stringify(r.out))
}

// ── it is actually wired up ──────────────────────────────────────────────────────────────────
{
  const s = JSON.parse(readFileSync(SETTINGS, "utf8"))
  ok(s.statusLine && s.statusLine.type === "command", "settings.json declares a command statusLine", JSON.stringify(s.statusLine))
  ok(/statusline\.js/.test(s.statusLine?.command ?? ""), "…pointing at this file — an unregistered statusline renders nothing and looks fine on disk", JSON.stringify(s.statusLine))
}

rmSync(tmp, { recursive: true, force: true })
console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — one line, right colour, no hook payload, no stack traces")
process.exit(failed ? 1 : 0)
