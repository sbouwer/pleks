#!/usr/bin/env node
/**
 * scripts/transcript-metrics.mjs — absolute cost metrics for a session, main + subagents
 *
 * Auth:   none — local analysis script, reads ~/.claude transcripts
 * Data:   <projectDir>/<sessionId>.jsonl and <projectDir>/<sessionId>/subagents/agent-*.jsonl
 * Notes:  Built for E16 (docs/EXPERIMENTS.md), which compares the cost of three delegation modes.
 *         Every number here comes from `message.usage` written by the harness. NOTHING is
 *         self-reported: a token count an agent states about itself is unfalsifiable, and in an
 *         experiment whose whole point is comparing agent modes it is the easiest place to lie.
 *
 *         ⚠ THE CONFOUND THIS EXISTS TO AVOID. `.claude/hooks/context-budget.js` records that
 *         subagent spend is NOT in the main transcript — it measured 6,750 main turns with ZERO
 *         carrying `isSidechain`, despite 32 `Agent` tool calls. Subagent transcripts are separate
 *         files. A harness reading only the main transcript therefore reports a delegating run as
 *         far cheaper than a solo one, which is an error pointing exactly in the direction that
 *         flatters delegation. Totals here are main + every subagent file, and the breakdown is
 *         printed as well as the total, because WHERE the spend went is half the finding.
 *
 *         Run `--probe` before trusting any run: it asserts the subagent discovery actually finds
 *         files and non-zero tokens on a session known to have spawned agents. A harness that
 *         quietly finds nothing returns a clean, plausible, wrong number — the same "could not
 *         check rendering as checked, found none" class as M-088.
 *
 *         Weighting matches context-budget.js rather than inventing a second scheme; if that hook's
 *         multipliers change, change them here in the same commit.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const CACHE_READ_MULTIPLIER = 0.1
const CACHE_WRITE_MULTIPLIER = 1.25

const PROJECT_DIR = join(homedir(), ".claude", "projects", "c--dev-pleks")

/** Weighted "billable-equivalent" units, same scheme as .claude/hooks/context-budget.js. */
export function weightedUnits(t) {
  return (
    (t.input || 0) +
    (t.cacheWrite || 0) * CACHE_WRITE_MULTIPLIER +
    (t.cacheRead || 0) * CACHE_READ_MULTIPLIER +
    (t.output || 0)
  )
}

const EMPTY = () => ({ input: 0, cacheWrite: 0, cacheRead: 0, output: 0 })

/**
 * Aggregate parsed transcript records. Pure, so both directions are testable without a session.
 *
 * `since`/`until` are ISO strings bounding which records count — one experimental run is a slice of
 * a session, not a whole file, and without windowing every arm would inherit the others' spend.
 */
export function aggregate(records, { since = null, until = null } = {}) {
  const tokens = EMPTY()
  const toolCalls = {}
  let turns = 0
  let firstTs = null
  let lastTs = null

  for (const r of records) {
    const ts = r.timestamp
    if (since && ts && ts < since) continue
    if (until && ts && ts > until) continue
    if (ts) {
      if (!firstTs || ts < firstTs) firstTs = ts
      if (!lastTs || ts > lastTs) lastTs = ts
    }

    const u = r.message?.usage
    if (u) {
      turns++
      tokens.input += u.input_tokens || 0
      tokens.cacheWrite += u.cache_creation_input_tokens || 0
      tokens.cacheRead += u.cache_read_input_tokens || 0
      tokens.output += u.output_tokens || 0
    }

    const content = r.message?.content
    if (Array.isArray(content)) {
      for (const c of content) {
        if (c?.type === "tool_use" && c.name) toolCalls[c.name] = (toolCalls[c.name] || 0) + 1
      }
    }
  }

  return { turns, tokens, toolCalls, firstTs, lastTs, weighted: weightedUnits(tokens) }
}

export function parseJsonl(text) {
  const out = []
  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line)) } catch { /* a partially-written tail line is normal */ }
  }
  return out
}

/** Every subagent transcript belonging to a session. Empty array is a FINDING, not a clean result. */
export function subagentFiles(projectDir, sessionId) {
  const dir = join(projectDir, sessionId, "subagents")
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => f.startsWith("agent-") && f.endsWith(".jsonl")).map((f) => join(dir, f))
}

function durationMs(a, b) {
  if (!a || !b) return null
  return new Date(b).getTime() - new Date(a).getTime()
}

function fmtDuration(ms) {
  if (ms == null) return "n/a"
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`
}

const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)))

function selftest() {
  const cases = []
  const t = (label, fn) => cases.push([label, fn])
  const rec = (ts, u, content) => ({ timestamp: ts, message: { usage: u, content } })
  const U = (i, cw, cr, o) => ({
    input_tokens: i, cache_creation_input_tokens: cw, cache_read_input_tokens: cr, output_tokens: o,
  })

  t("sums the four usage fields across records", () => {
    const a = aggregate([rec("2026-01-01T00:00:00Z", U(1, 2, 3, 4)), rec("2026-01-01T00:01:00Z", U(10, 20, 30, 40))])
    return a.tokens.input === 11 && a.tokens.cacheWrite === 22 && a.tokens.cacheRead === 33 && a.tokens.output === 44
  })
  t("counts a turn only for a record carrying usage, not every line", () => {
    const a = aggregate([rec("2026-01-01T00:00:00Z", U(1, 0, 0, 1)), { timestamp: "2026-01-01T00:00:01Z", type: "user" }])
    return a.turns === 1
  })
  t("weighting matches context-budget.js: cache read 0.1, cache write 1.25", () => {
    return weightedUnits({ input: 100, cacheWrite: 100, cacheRead: 100, output: 100 }) === 100 + 125 + 10 + 100
  })
  t("CACHE READ DOMINATES A REAL SHAPE — the reason output-token counting alone is misleading", () => {
    // 3.0 BILLION cache-read vs 6M output was this repo's measured 6,653-turn session.
    const w = weightedUnits({ input: 0, cacheWrite: 0, cacheRead: 3_000_000, output: 6_000 })
    return w === 300_000 + 6_000 && w > 6_000
  })
  t("a --since window EXCLUDES earlier records — one arm must not inherit another's spend", () => {
    const a = aggregate(
      [rec("2026-01-01T00:00:00Z", U(999, 0, 0, 0)), rec("2026-01-02T00:00:00Z", U(1, 0, 0, 0))],
      { since: "2026-01-01T12:00:00Z" },
    )
    return a.tokens.input === 1
  })
  t("an --until window EXCLUDES later records", () => {
    const a = aggregate(
      [rec("2026-01-01T00:00:00Z", U(1, 0, 0, 0)), rec("2026-01-02T00:00:00Z", U(999, 0, 0, 0))],
      { until: "2026-01-01T12:00:00Z" },
    )
    return a.tokens.input === 1
  })
  t("KNOWN-GOOD: no window counts everything", () => {
    const a = aggregate([rec("2026-01-01T00:00:00Z", U(1, 0, 0, 0)), rec("2026-01-02T00:00:00Z", U(1, 0, 0, 0))])
    return a.tokens.input === 2
  })
  t("counts tool calls by name from assistant content", () => {
    const a = aggregate([rec("2026-01-01T00:00:00Z", U(1, 0, 0, 0), [
      { type: "tool_use", name: "Bash" }, { type: "tool_use", name: "Bash" }, { type: "tool_use", name: "Read" },
    ])])
    return a.toolCalls.Bash === 2 && a.toolCalls.Read === 1
  })
  t("wall-clock spans first to last record regardless of order", () => {
    const a = aggregate([rec("2026-01-01T00:05:00Z", U(1, 0, 0, 0)), rec("2026-01-01T00:00:00Z", U(1, 0, 0, 0))])
    return a.firstTs === "2026-01-01T00:00:00Z" && a.lastTs === "2026-01-01T00:05:00Z"
  })
  t("a malformed line is skipped, not fatal — transcripts are appended to live", () => {
    return parseJsonl('{"a":1}\n{not json\n{"b":2}\n').length === 2
  })

  let bad = 0
  for (const [label, fn] of cases) {
    let ok = false
    try { ok = fn() === true } catch { ok = false }
    if (!ok) bad++
    console.log(`  ${ok ? "✓" : "✗"} ${label}`)
  }
  console.log(bad ? `\n✗ ${bad} selftest case(s) failed` : "\n✅ transcript-metrics selftest green")
  process.exit(bad ? 1 : 0)
}

/**
 * The confound probe. Asserts, against REAL transcripts, that subagent discovery works — because
 * every unit test above passes just as happily against a harness that never finds a subagent file.
 */
function probe() {
  if (!existsSync(PROJECT_DIR)) {
    console.error(`✗ probe: project dir not found: ${PROJECT_DIR}`)
    process.exit(1)
  }
  const sessions = readdirSync(PROJECT_DIR).filter((f) => f.endsWith(".jsonl")).map((f) => f.replace(/\.jsonl$/, ""))
  const withAgents = sessions.map((s) => ({ s, files: subagentFiles(PROJECT_DIR, s) })).filter((x) => x.files.length)

  if (!withAgents.length) {
    console.error("✗ probe: found NO session with subagent transcripts. Either this machine has never")
    console.error("   spawned an agent, or the discovery path is wrong. Do not run E16 until this passes —")
    console.error("   a harness that finds no subagent files reports delegation as free.")
    process.exit(1)
  }

  let bad = 0
  const target = withAgents.sort((a, b) => b.files.length - a.files.length)[0]
  console.log(`  probing session ${target.s.slice(0, 8)} — ${target.files.length} subagent transcript(s)`)

  let sub = EMPTY()
  for (const f of target.files) {
    const a = aggregate(parseJsonl(readFileSync(f, "utf8")))
    sub.input += a.tokens.input; sub.cacheWrite += a.tokens.cacheWrite
    sub.cacheRead += a.tokens.cacheRead; sub.output += a.tokens.output
  }
  const subW = weightedUnits(sub)
  const ok1 = subW > 0
  console.log(`  ${ok1 ? "✓" : "✗"} SUBAGENT SPEND IS NON-ZERO — ${k(subW)} weighted units the main transcript does not contain`)
  if (!ok1) bad++

  const mainPath = join(PROJECT_DIR, `${target.s}.jsonl`)
  const mainAgg = existsSync(mainPath) ? aggregate(parseJsonl(readFileSync(mainPath, "utf8"))) : null
  const ok2 = mainAgg !== null
  console.log(`  ${ok2 ? "✓" : "✗"} the main transcript for that session is readable`)
  if (!ok2) bad++

  if (mainAgg) {
    const pct = (subW / (mainAgg.weighted + subW)) * 100
    console.log(`  ℹ subagents are ${pct.toFixed(1)}% of that session's total weighted spend`)
    console.log("    (reported, never asserted — the share is data about the session, not a property to gate on)")
  }

  console.log(bad ? `\n✗ probe FAILED — do not run E16 against this harness` : "\n✅ transcript-metrics probe green — subagent spend is being seen")
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes("--selftest")) selftest()
if (process.argv.includes("--probe")) probe()

// ── report ────────────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1] }
const asJson = args.includes("--json")
const since = flag("--since")
const until = flag("--until")
let sessionId = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--since" && args[args.indexOf(a) - 1] !== "--until")

if (!sessionId || sessionId === "latest") {
  const files = readdirSync(PROJECT_DIR).filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({ f, m: statSync(join(PROJECT_DIR, f)).mtimeMs })).sort((a, b) => b.m - a.m)
  if (!files.length) { console.error("no transcripts found"); process.exit(1) }
  sessionId = files[0].f.replace(/\.jsonl$/, "")
}

const mainPath = join(PROJECT_DIR, `${sessionId}.jsonl`)
if (!existsSync(mainPath)) { console.error(`no such session: ${sessionId}`); process.exit(1) }

const win = { since, until }
const main = aggregate(parseJsonl(readFileSync(mainPath, "utf8")), win)
const subFiles = subagentFiles(PROJECT_DIR, sessionId)
const subs = subFiles.map((f) => ({ file: f, ...aggregate(parseJsonl(readFileSync(f, "utf8")), win) }))

const subTotal = subs.reduce((acc, s) => {
  acc.input += s.tokens.input; acc.cacheWrite += s.tokens.cacheWrite
  acc.cacheRead += s.tokens.cacheRead; acc.output += s.tokens.output; acc.turns += s.turns
  return acc
}, { ...EMPTY(), turns: 0 })

const total = {
  input: main.tokens.input + subTotal.input,
  cacheWrite: main.tokens.cacheWrite + subTotal.cacheWrite,
  cacheRead: main.tokens.cacheRead + subTotal.cacheRead,
  output: main.tokens.output + subTotal.output,
}

const allTs = [main.firstTs, main.lastTs, ...subs.flatMap((s) => [s.firstTs, s.lastTs])].filter(Boolean).sort()
const wall = durationMs(allTs[0], allTs[allTs.length - 1])

if (asJson) {
  console.log(JSON.stringify({
    sessionId, since, until,
    wallClockMs: wall, wallClockFirst: allTs[0] ?? null, wallClockLast: allTs[allTs.length - 1] ?? null,
    main: { turns: main.turns, tokens: main.tokens, weighted: main.weighted, toolCalls: main.toolCalls },
    subagents: { count: subs.length, turns: subTotal.turns, tokens: subTotal, weighted: weightedUnits(subTotal) },
    total: { turns: main.turns + subTotal.turns, tokens: total, weighted: weightedUnits(total) },
  }, null, 2))
  process.exit(0)
}

const row = (label, turns, t) =>
  `  ${label.padEnd(12)} ${String(turns).padStart(6)}  ${k(t.input).padStart(8)}  ${k(t.cacheWrite).padStart(9)}  ${k(t.cacheRead).padStart(9)}  ${k(t.output).padStart(8)}  ${k(weightedUnits(t)).padStart(9)}`

console.log(`\n📊 ${sessionId}${since || until ? `  [${since ?? "…"} → ${until ?? "…"}]` : ""}`)
console.log(`   wall-clock ${fmtDuration(wall)}   ${allTs[0] ?? "n/a"} → ${allTs[allTs.length - 1] ?? "n/a"}`)
console.log("\n  source          turns     input  cacheWrt   cacheRd    output   weighted")
console.log("  " + "─".repeat(74))
console.log(row("main", main.turns, main.tokens))
console.log(row(`subagents(${subs.length})`, subTotal.turns, subTotal))
console.log("  " + "─".repeat(74))
console.log(row("TOTAL", main.turns + subTotal.turns, total))

if (!subs.length) {
  console.log("\n  ⚠ no subagent transcripts for this session. If this run delegated, the harness is")
  console.log("    not seeing the spend and every comparison against it understates delegation.")
}

const tools = Object.entries(main.toolCalls).sort((a, b) => b[1] - a[1]).slice(0, 8)
if (tools.length) console.log(`\n  main tool calls: ${tools.map(([n, c]) => `${n}×${c}`).join("  ")}`)
console.log()
