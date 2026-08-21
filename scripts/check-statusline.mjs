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

// ── the LIVE permission mode, read from the transcript and not from the payload ──────────────
//
// These probes exist because the first two cuts of this feature both read the payload's mode field
// and both were wrong. The regression probe below is the one that matters: it puts the two channels
// in DISAGREEMENT, which is the only configuration where reading the wrong one is detectable — and
// is exactly the configuration the live session was in for its whole length while every instrument
// reported agreement.
{
  const withMode = (name, mode) => {
    const p = join(tmp, `${name}.jsonl`)
    const lines = [usageLine(193_000)]
    if (mode !== null) lines.push(JSON.stringify({ type: "mode", mode, sessionId: "probe" }))
    writeFileSync(p, lines.join("\n") + "\n")
    return p
  }

  const normal = strip(run(payload(withMode("m-normal", "normal"))).out)
  ok(/perm normal/.test(normal), "a transcript in `normal` mode is reported — normal prompts on every write", normal)
  ok(/prompt/i.test(normal), "…and it says what that COSTS, not just the mode's name — a bare label is not actionable", normal)

  const plan = strip(run(payload(withMode("m-plan", "plan"))).out)
  ok(/perm plan/.test(plan), "a non-acceptEdits mode other than normal is reported too", plan)

  // KNOWN-GOOD half. Without these, a rule that shouted on every mode would pass the three above.
  const accept = strip(run(payload(withMode("m-accept", "acceptEdits"))).out)
  ok(!/perm/.test(accept), "KNOWN-GOOD: `acceptEdits` renders NO mode clause — agreement stays quiet", accept)

  // Three states, three renderings. `perm ?` is NOT cosmetic: if an unmeasurable mode rendered the
  // same silence as `acceptEdits`, this instrument would carry the very defect it was built to fix.
  const none = strip(run(payload(withMode("m-none", null))).out)
  ok(/perm \?/.test(none),
    "no mode record in the window renders `perm ?` — an unmeasurable mode must NOT share silence with an agreeing one", none)
  ok(!/normal|acceptEdits|plan/.test(none),
    "…and it names no mode, because it does not know one — `perm ?` is the absence, not a guess", none)

  // Multiple mode records — the LAST one wins. Every probe above writes exactly ONE record, so an
  // implementation scanning forwards and taking the first match passes all of them and then reports
  // a stale mode in the field: the session that produced this file carried ~200 records, and a
  // Shift+Tab out of `normal` would leave the bar shouting `perm normal` forever, which trains the
  // reader to ignore it. Both directions, because a single direction also passes under an
  // implementation that always returns the last match regardless of which value that is.
  const flipped = (name, ...modes) => {
    const p = join(tmp, `${name}.jsonl`)
    const lines = [usageLine(193_000), ...modes.map((mode) => JSON.stringify({ type: "mode", mode, sessionId: "probe" }))]
    writeFileSync(p, lines.join("\n") + "\n")
    return p
  }

  const toAccept = strip(run(payload(flipped("m-seq-a", "normal", "acceptEdits"))).out)
  ok(!/perm/.test(toAccept), "normal → acceptEdits: the LATEST record wins, so the clause goes silent", toAccept)

  const toNormal = strip(run(payload(flipped("m-seq-b", "acceptEdits", "normal"))).out)
  ok(/perm normal/.test(toNormal), "acceptEdits → normal: the latest wins in the other direction too", toNormal)

  // UNTESTED BOUNDARY, recorded rather than assumed away: every fixture here is a few lines, so the
  // 512KB tail window always contains the whole transcript and `perm ?` is only ever produced by
  // omitting the record entirely. The FIELD case is a record that EXISTS but has scrolled out of the
  // window — which is what determines how often `perm ?` really appears. Testing it needs a >512KB
  // fixture, which is real cost for a case that fails in the honest direction (`perm ?`, not a wrong
  // mode). The trade is deliberate; the gap is written down so it is not mistaken for coverage.

  // ⚠ THE REGRESSION PROBE. Payload says acceptEdits (the configured default); transcript says
  // normal (the live state). An implementation reading `permission_mode` renders silence here and
  // calls it agreement — which is precisely what shipped, twice. Only the transcript can be right.
  const conflicted = JSON.stringify({
    transcript_path: withMode("m-conflict", "normal"),
    cwd: freshCwd(),
    model: { display_name: "Opus 5", id: "claude-opus-5" },
    permission_mode: "acceptEdits",
    permissionMode: "acceptEdits",
  })
  const c = strip(run(conflicted).out)
  ok(/perm normal/.test(c),
    "REGRESSION: payload says acceptEdits, transcript says normal → the TRANSCRIPT wins; reading the payload reports what was asked for, not what took", c)
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
