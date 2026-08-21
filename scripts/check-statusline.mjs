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

// ── the session's permission mode: the value, reported without a prediction ──────────────────
//
// THREE cuts of this feature read the wrong field, and the third is the instructive one. The first
// two read the payload's mode field (once misspelled, once correctly). The third read the
// transcript's `{"type":"mode"}` record on the reasoning that a payload carries the CONFIGURED
// default while the transcript carries the LIVE state — and shipped a permanent red false alarm,
// because that field has CARDINALITY 1: 1735 records across 12 transcripts on this machine, every
// one `normal`. A constant is not a state.
//
// So these probes assert two different kinds of thing, and the second kind is new:
//   · the READ is correct — the right field, latest-wins, absence distinguished from a value.
//   · the RENDER makes NO claim about consequence. Whether a mode predicts a prompt is unmeasured
//     (this session ran `acceptEdits` and a prompt happened anyway), so a probe that demanded the
//     word "prompt" — as the previous suite did — was pinning a guess into the gate.
{
  const withMode = (name, mode) => {
    const p = join(tmp, `${name}.jsonl`)
    const lines = [usageLine(193_000)]
    // The field is `permissionMode`, top-level on a record — measured cardinality 3
    // (`acceptEdits`, `auto`, `default`), and it TRANSITIONS mid-session, which is the positive
    // evidence that it tracks something the user changes.
    if (mode !== null) lines.push(JSON.stringify({ type: "user", permissionMode: mode, sessionId: "probe" }))
    writeFileSync(p, lines.join("\n") + "\n")
    return p
  }

  const accept = strip(run(payload(withMode("m-accept", "acceptEdits"))).out)
  ok(/perm acceptEdits/.test(accept), "the mode is rendered by name", accept)

  const plan = strip(run(payload(withMode("m-plan", "plan"))).out)
  ok(/perm plan/.test(plan), "…whatever the value is — no mode is special-cased", plan)

  // ⚠ THE ANTI-ALARM PROBE, and the one that would have caught what shipped. Every mode renders the
  // same way: no colour, no consequence, no advice. The previous suite REQUIRED the string "prompt"
  // on a non-acceptEdits mode, so it enforced the false claim rather than catching it — a probe
  // written from the same belief as the code cannot refute it (L-44), and this is that failure with
  // a name on it. Asserting the ABSENCE of a prediction is the only form that survives the author
  // being wrong about what the mode means.
  for (const [name, mode] of [["a-accept", "acceptEdits"], ["a-plan", "plan"], ["a-default", "default"]]) {
    const out = strip(run(payload(withMode(name, mode))).out)
    ok(!/prompt|WILL|NOT the|Shift\+Tab/i.test(out),
      `\`${mode}\` renders the value and predicts NOTHING — no instrument here knows what a mode causes`, out)
  }

  // Absence is its own rendering. If an unmeasurable mode looked like a measured one, this
  // instrument would carry the very defect it was built to fix.
  const none = strip(run(payload(withMode("m-none", null))).out)
  ok(/perm \?/.test(none), "no mode record in the window renders `perm ?`", none)
  ok(!/normal|acceptEdits|plan|default/.test(none),
    "…and it names no mode, because it does not know one — `perm ?` is the absence, not a guess", none)

  // Multiple records — the LAST one wins. Every probe above writes exactly ONE, so an implementation
  // scanning forwards and taking the first passes all of them and then reports a stale mode forever.
  // Both directions, because one direction also passes under an implementation that always returns
  // the last match regardless of value.
  const flipped = (name, ...modes) => {
    const p = join(tmp, `${name}.jsonl`)
    const lines = [usageLine(193_000),
      ...modes.map((m) => JSON.stringify({ type: "user", permissionMode: m, sessionId: "probe" }))]
    writeFileSync(p, lines.join("\n") + "\n")
    return p
  }

  const toAccept = strip(run(payload(flipped("m-seq-a", "default", "acceptEdits"))).out)
  ok(/perm acceptEdits/.test(toAccept), "default → acceptEdits: the LATEST record wins", toAccept)

  const toDefault = strip(run(payload(flipped("m-seq-b", "acceptEdits", "default"))).out)
  ok(/perm default/.test(toDefault), "acceptEdits → default: the latest wins in the other direction too", toDefault)

  // ⚠ THE CHANNEL PROBE. A transcript carrying BOTH fields in disagreement: a `{"type":"mode"}`
  // record saying `normal` (the constant — an unset editor default) and a `permissionMode` saying
  // `acceptEdits`. An implementation reading the record renders `perm normal`, which is what shipped
  // and what was permanently wrong. Only `permissionMode` can be right, and this is the sole
  // configuration in which reading the other one is detectable at all.
  const bothFields = join(tmp, "m-channel.jsonl")
  writeFileSync(bothFields, [
    usageLine(193_000),
    JSON.stringify({ type: "mode", mode: "normal", sessionId: "probe" }),
    JSON.stringify({ type: "user", permissionMode: "acceptEdits", sessionId: "probe" }),
  ].join("\n") + "\n")
  const ch = strip(run(payload(bothFields)).out)
  ok(/perm acceptEdits/.test(ch) && !/perm normal/.test(ch),
    "CHANNEL: `type:mode` says normal, `permissionMode` says acceptEdits → permissionMode wins; the other field is constant across every transcript on the machine", ch)

  // UNTESTED BOUNDARY, recorded rather than assumed away: every fixture here is a few lines, so the
  // 512KB tail window always holds the whole transcript and `perm ?` is only ever produced by
  // omitting the field entirely. The FIELD case is a record that EXISTS but has scrolled out of the
  // window. Testing it needs a >512KB fixture, which is real cost for a case that fails in the
  // honest direction (`perm ?`, not a wrong mode). Deliberate; written down so it is not mistaken
  // for coverage.
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
