#!/usr/bin/env node
/**
 * scripts/agent-distribution.mjs — what agents actually cost, per type, against their budgets.
 *
 * M-062. The turn budget in every spine is UNENFORCEABLE and canon says so: an agent has no reliable
 * turn counter, it estimates. So the mechanisable half is not enforcement, it is VISIBILITY — an
 * overrun should surface as a report rather than sit in a log nobody opens (L-22).
 *
 * This is also the instrument the canon's re-measure trigger depends on.
 * `dev-standards/standards/AGENT-SPINES.md` schedules a second distribution after ~20 invocations
 * under the new spines; without a command to produce it, that trigger is a pending, and the ledger
 * rules ban pendings. It existed as a scratchpad throwaway when the trigger was written — this is
 * that script promoted, so the second measurement is one command rather than a rediscovery.
 *
 * BUDGETS ARE READ FROM THE SPINES, never hardcoded here. `.claude/agents/*.md` carry
 * "**Turn budget: 250 …**" and "**Output budget: 3k tokens.**" verbatim from canon, so a budget
 * changed in dev-standards and propagated here changes this report too. A second copy of those
 * numbers in this file would be a fact with two homes and one of them would go stale — which is the
 * failure this repo's SSOT rules exist to prevent.
 *
 * NOT ON THE GATE, deliberately. It reads the live transcript tree under ~/.claude/projects, which
 * no CI runner has. Its `--selftest` IS on the gate: the probes are hermetic, so the script is
 * verified even though the measurement cannot be. "Runs nowhere" and "is checked nowhere" are
 * different failures, and only the second one is avoidable here.
 *
 * Usage:
 *   node scripts/agent-distribution.mjs              measure this project's sessions
 *   node scripts/agent-distribution.mjs <dir>        measure an explicit projects/<slug> directory
 *   node scripts/agent-distribution.mjs --selftest   probes
 */
import { readdirSync, readFileSync, existsSync, statSync, mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from "node:fs"
import { join } from "node:path"
import { homedir, tmpdir } from "node:os"

const CHARS_PER_TOKEN = 4                       // rough, and only ever used for the RETURNED report

/** Claude Code slugs a project directory by lowercasing and replacing `:`, `\` and `/` with `-`. */
export function slugFor(cwd) {
  return cwd.toLowerCase().replace(/[:\\/]/g, "-")
}

/** Turn/output budgets as the SPINES state them — the single source, not a copy. */
export function budgetsFrom(agentsDir) {
  const out = {}
  if (!existsSync(agentsDir)) return out
  for (const f of readdirSync(agentsDir).filter((f) => f.endsWith(".md"))) {
    const text = readFileSync(join(agentsDir, f), "utf8")
    const turn = /\*\*Turn budget:\s*(\d+)/.exec(text)
    const output = /\*\*Output budget:\s*(\d+)k/.exec(text)
    if (turn || output) {
      out[f.replace(/\.md$/, "")] = {
        turns: turn ? Number(turn[1]) : null,
        outputK: output ? Number(output[1]) : null,
      }
    }
  }
  return out
}

/** One subagent run: how many turns it took, and how large the report it handed back was. */
export function measureRun(jsonlPath) {
  let turns = 0, peak = 0, lastReport = 0, compacted = false
  const text = readFileSync(jsonlPath, "utf8")
  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    let j
    try { j = JSON.parse(line) } catch { continue }
    if (j.subtype === "compact_boundary") compacted = true
    const u = j.message && j.message.usage
    if (u) {
      turns++
      const ctx = (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.input_tokens || 0)
      if (ctx > peak) peak = ctx
    }
    // The LAST assistant text block is the report handed back — the only part that becomes
    // permanent weight in the caller's window. Intermediate output is not returned.
    const content = j.message && j.message.content
    if (j.message && j.message.role === "assistant" && Array.isArray(content)) {
      const t = content.filter((c) => c.type === "text").map((c) => c.text || "").join("")
      if (t.trim()) lastReport = Math.round(t.length / CHARS_PER_TOKEN)
    }
  }
  return { turns, peak, report: lastReport, compacted }
}

/** Every subagent run under a projects/<slug> directory, grouped by agentType. */
export function collect(projectDir) {
  const byType = new Map()
  if (!existsSync(projectDir)) return byType

  for (const entry of readdirSync(projectDir)) {
    const sub = join(projectDir, entry, "subagents")
    if (!existsSync(sub)) continue
    for (const f of readdirSync(sub).filter((f) => f.endsWith(".jsonl"))) {
      const id = f.replace(/^agent-|\.jsonl$/g, "")
      let type = "unknown"
      const meta = join(sub, `agent-${id}.meta.json`)
      if (existsSync(meta)) {
        try { type = JSON.parse(readFileSync(meta, "utf8")).agentType || "unknown" } catch { /* keep unknown */ }
      }
      let m
      try { m = measureRun(join(sub, f)) } catch { continue }
      let mtime = 0
      try { mtime = statSync(join(sub, f)).mtimeMs } catch { /* unknown age */ }
      if (!byType.has(type)) byType.set(type, [])
      byType.get(type).push({ ...m, session: entry, id, mtime })
    }
  }
  return byType
}

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const max = (a) => (a.length ? Math.max(...a) : 0)

/**
 * When the current spine generation began, as the newest spine file's mtime.
 *
 * The re-measure trigger asks for ~20 invocations UNDER THE NEW SPINES. Counting every run in the
 * transcript tree answers a different question, and answers it in the dangerous direction: the first
 * live run of this script reported the trigger MET on 27 runs that all predated the budgets, which
 * would have meant tightening against exactly the behaviour the change was meant to alter. The
 * spines' own mtime is the boundary, and it needs no bookkeeping to stay true.
 */
export function spineGeneration(agentsDir) {
  if (!existsSync(agentsDir)) return null
  const times = readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => { try { return statSync(join(agentsDir, f)).mtimeMs } catch { return 0 } })
    .filter(Boolean)
  return times.length ? Math.max(...times) : null
}

/**
 * How many collected runs postdate a generation boundary.
 *
 * A run whose mtime could not be read counts as OLD: the trigger must never fire on evidence it
 * cannot date. `since === null` means no boundary is known at all, so every run counts and the
 * caller is obliged to say the generation is unknown rather than imply the runs are current.
 */
export function runsSince(byType, since) {
  let n = 0
  for (const runs of byType.values()) {
    for (const r of runs) {
      if (since === null || since === undefined) n++
      else if (r.mtime && r.mtime >= since) n++
    }
  }
  return n
}

export function report(byType, budgets) {
  const rows = []
  for (const [type, runs] of byType) {
    const turns = runs.map((r) => r.turns)
    const reports = runs.map((r) => r.report)
    const b = budgets[type] || {}
    rows.push({
      type,
      runs: runs.length,
      turnMed: med(turns), turnMax: max(turns),
      repMed: med(reports), repMax: max(reports),
      budgetTurns: b.turns ?? null,
      budgetOutK: b.outputK ?? null,
      turnOverruns: b.turns ? turns.filter((t) => t > b.turns).length : 0,
      outOverruns: b.outputK ? reports.filter((r) => r > b.outputK * 1000).length : 0,
      compacted: runs.filter((r) => r.compacted).length,
      peakMax: max(runs.map((r) => r.peak)),
    })
  }
  return rows.sort((a, b) => b.turnMax - a.turnMax)
}

// ── probes ───────────────────────────────────────────────────────────────────────────────────
if (process.argv.includes("--selftest")) {
  const tmp = mkdtempSync(join(tmpdir(), "agentdist-"))
  let failed = 0
  const ok = (c, label, detail = "") => { if (!c) failed++; console.log(`  ${c ? "✓" : "✗"} ${label}${c ? "" : `\n      ${detail}`}`) }

  ok(slugFor("c:\\dev\\pleks") === "c--dev-pleks", "slugFor matches Claude Code's project-directory naming", slugFor("c:\\dev\\pleks"))

  // Budgets come from the spines, so a spine edit must move this report.
  {
    const d = join(tmp, "agents"); mkdirSync(d, { recursive: true })
    writeFileSync(join(d, "walker.md"), "junk\n**Turn budget: 150 — a backstop, not a target.** more\n**Output budget: 6k tokens.**\n")
    writeFileSync(join(d, "census.md"), "**Turn budget: 150 — a backstop.**\n**Output budget: 4k tokens.**\n")
    writeFileSync(join(d, "nobudget.md"), "a spine with no budget clause at all\n")
    const b = budgetsFrom(d)
    ok(b.walker?.turns === 150 && b.walker?.outputK === 6, "reads BOTH budgets out of a spine file", JSON.stringify(b.walker))
    ok(!("nobudget" in b), "a file with no budget clause contributes no entry — absence is not zero", JSON.stringify(Object.keys(b)))
    ok(budgetsFrom(join(tmp, "nope")).walker === undefined, "a missing agents dir yields no budgets rather than throwing")
  }

  /** A synthetic session tree shaped exactly like Claude Code writes one. */
  const session = (name, agents) => {
    const sub = join(tmp, name, "sess-1", "subagents")
    mkdirSync(sub, { recursive: true })
    for (const [id, { type, turns, reportChars, boundary }] of Object.entries(agents)) {
      writeFileSync(join(sub, `agent-${id}.meta.json`), JSON.stringify({ agentType: type }))
      const lines = []
      for (let i = 0; i < turns; i++) {
        lines.push(JSON.stringify({ isSidechain: true, message: { role: "assistant", usage: { cache_read_input_tokens: 1000 * (i + 1), output_tokens: 5 } } }))
      }
      if (boundary) lines.push(JSON.stringify({ type: "system", subtype: "compact_boundary", compactMetadata: { postTokens: 15000 } }))
      lines.push(JSON.stringify({ message: { role: "assistant", content: [{ type: "text", text: "R".repeat(reportChars) }] } }))
      writeFileSync(join(sub, `agent-${id}.jsonl`), lines.join("\n") + "\n")
    }
    return join(tmp, name)
  }

  {
    const dir = session("proj", {
      a1: { type: "walker", turns: 100, reportChars: 4000 },
      a2: { type: "walker", turns: 200, reportChars: 40000 },
      a3: { type: "census", turns: 10, reportChars: 400 },
    })
    const budgets = { walker: { turns: 150, outputK: 6 }, census: { turns: 150, outputK: 4 } }
    const rows = report(collect(dir), budgets)
    const w = rows.find((r) => r.type === "walker")
    const c = rows.find((r) => r.type === "census")

    ok(w.runs === 2 && c.runs === 1, "groups runs by agentType from the .meta.json sidecar", JSON.stringify(rows))
    ok(w.turnMed === 200 && w.turnMax === 200, "reports median and max turns", JSON.stringify(w))
    ok(w.turnOverruns === 1, "counts turn overruns against the budget — 200 > 150, 100 is not", JSON.stringify(w))
    ok(c.turnOverruns === 0, "KNOWN-GOOD: a run inside its budget is not an overrun", JSON.stringify(c))
    ok(w.repMax === 10000 && w.outOverruns === 1, "counts output overruns — a 10k-token report against a 6k budget", JSON.stringify(w))
    ok(rows[0].type === "walker", "sorts by turnMax so the worst offender is first", JSON.stringify(rows.map((r) => r.type)))
  }

  {
    // The E6 question this feeds: do subagents ever compact?
    const dir = session("compacted", { b1: { type: "grounder", turns: 5, reportChars: 100, boundary: true } })
    const rows = report(collect(dir), {})
    ok(rows[0].compacted === 1, "counts subagent compaction boundaries — the open E6 question", JSON.stringify(rows[0]))
  }

  {
    // An agent with no budget in the spines must still be REPORTED, not dropped.
    const dir = session("nobudget", { c1: { type: "mystery", turns: 42, reportChars: 100 } })
    const rows = report(collect(dir), {})
    ok(rows.length === 1 && rows[0].budgetTurns === null,
      "an agent type with no budget is reported with a null budget, never silently dropped", JSON.stringify(rows[0]))
  }

  {
    // The generation boundary — the spines' own mtime, needing no bookkeeping to stay true.
    const d = join(tmp, "gen"); mkdirSync(d, { recursive: true })
    const stamp = (f, ms) => { writeFileSync(join(d, f), "x"); utimesSync(join(d, f), new Date(ms), new Date(ms)) }
    stamp("old.md", 1_000_000)
    stamp("new.md", 2_000_000)
    ok(spineGeneration(d) === 2_000_000, "the generation boundary is the NEWEST spine file's mtime", String(spineGeneration(d)))
    stamp("notes.txt", 9_000_000)
    ok(spineGeneration(d) === 2_000_000, "a non-spine file in the agents dir does not move the boundary", String(spineGeneration(d)))
    ok(spineGeneration(join(tmp, "nope")) === null, "a missing agents dir yields null — generation UNKNOWN, not zero")
  }

  {
    // The defect this script was caught having: counting every run in the tree answers a different
    // question than "how many runs under the NEW spines", and answers it in the dangerous direction.
    const m = new Map([["walker", [{ mtime: 100 }, { mtime: 300 }]], ["census", [{ mtime: 0 }]]])
    ok(runsSince(m, 200) === 1, "counts only runs newer than the generation boundary", String(runsSince(m, 200)))
    ok(runsSince(m, 50) === 2, "a run with an unreadable mtime never counts toward the trigger", String(runsSince(m, 50)))
    ok(runsSince(m, null) === 3, "a null boundary counts every run — unknown generation is not zero runs", String(runsSince(m, null)))
    const pre = new Map([["walker", Array.from({ length: 27 }, () => ({ mtime: 100 }))]])
    ok(runsSince(pre, 200) === 0,
      "REGRESSION: 27 runs that all predate the spines contribute 0 to the trigger, not 27", String(runsSince(pre, 200)))
  }

  {
    // The trigger reads mtime off the run, so collect() must stamp it.
    const dir = session("dated", { d1: { type: "walker", turns: 2, reportChars: 10 } })
    const runs = collect(dir).get("walker")
    ok(runs[0].mtime > 0, "collect stamps each run with its transcript's mtime", JSON.stringify(runs[0]))
    ok(runsSince(collect(dir), 0) === 1, "KNOWN-GOOD: a real collected run counts against a boundary it postdates")
  }

  {
    // Absences must be visible, not read as zero.
    ok(collect(join(tmp, "does-not-exist")).size === 0, "a missing project dir yields nothing rather than throwing")
    const empty = join(tmp, "emptyproj"); mkdirSync(empty, { recursive: true })
    ok(collect(empty).size === 0, "a project dir with no sessions yields nothing")
    ok(report(new Map(), {}).length === 0, "no runs yields no rows — the caller decides what that means")
  }

  rmSync(tmp, { recursive: true, force: true })
  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — budgets from spines, overruns counted, absences visible")
  process.exit(failed ? 1 : 0)
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────
const explicit = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null
const projectDir = explicit || join(homedir(), ".claude", "projects", slugFor(process.cwd()))
const budgets = budgetsFrom(join(process.cwd(), ".claude", "agents"))

if (!existsSync(projectDir)) {
  console.log(`⚠ no transcript directory at ${projectDir}`)
  console.log(`  Nothing to measure. This is an ABSENCE, not a clean result — pass an explicit`)
  console.log(`  projects/<slug> directory if the transcripts live elsewhere.`)
  process.exit(0)
}

const byType = collect(projectDir)
const rows = report(byType, budgets)
const totalRuns = rows.reduce((s, r) => s + r.runs, 0)
const generation = spineGeneration(join(process.cwd(), ".claude", "agents"))
const currentRuns = runsSince(byType, generation)
const genStamp = generation ? new Date(generation).toISOString().slice(0, 10) : null

if (!totalRuns) {
  console.log(`⚠ ${projectDir} holds no subagent runs. Absence, not zero.`)
  process.exit(0)
}

const pad = (s, n) => String(s).padEnd(n)
const num = (s, n) => String(s).padStart(n)

console.log(`\n🤖 agent distribution — ${totalRuns} run(s) across ${rows.length} type(s)`)
console.log(`   ${projectDir}\n`)
console.log(`   ${pad("type", 18)}${num("runs", 5)}  ${num("turns med/max", 14)}  ${num("report med/max", 15)}  ${pad("budget", 11)}  over`)

let overruns = 0
for (const r of rows) {
  const budget = r.budgetTurns ? `${r.budgetTurns}/${r.budgetOutK}k` : "— none —"
  const over = r.turnOverruns + r.outOverruns
  overruns += over
  const flag = over ? ` ⚠ ${r.turnOverruns}t ${r.outOverruns}o` : ""
  console.log(
    `   ${pad(r.type, 18)}${num(r.runs, 5)}  ${num(`${r.turnMed}/${r.turnMax}`, 14)}  ` +
    `${num(`${r.repMed}/${r.repMax}`, 15)}  ${pad(budget, 11)}${flag}`,
  )
}

const compacted = rows.reduce((s, r) => s + r.compacted, 0)
const peak = Math.max(...rows.map((r) => r.peakMax))
console.log(`\n   subagent compactions: ${compacted}  ·  peak subagent context: ${peak.toLocaleString()}`)
if (!compacted) {
  console.log(`   E6: zero compactions. Only evidence of "never" if peak approached the window —`)
  console.log(`   at ${peak.toLocaleString()} it is not, so this remains INCONCLUSIVE rather than answered.`)
}

if (overruns) {
  console.log(`\n   ⚠ ${overruns} budget overrun(s). Budgets are BACKSTOPS — an overrun is a finding about`)
  console.log(`   how the task was scoped, not automatically a fault in the agent.`)
} else {
  console.log(`\n   ✅ no budget overruns.`)
}

if (generation && currentRuns < totalRuns) {
  console.log(`\n   ⚠ the table above spans BOTH spine generations: ${totalRuns - currentRuns} of ${totalRuns} run(s) predate`)
  console.log(`   ${genStamp}, when the budgets landed. A median that includes runs made before a budget`)
  console.log(`   existed is not evidence about that budget — do not tighten against it.`)
}

if (generation === null) {
  console.log(`\n   ⏱ re-measure trigger: ${totalRuns} run(s) collected, but there is no .claude/agents`)
  console.log(`   directory to date them against. The trigger asks for 20 invocations UNDER THE CURRENT`)
  console.log(`   SPINES, and from here that is unknowable — this is an absence, not a 0/20.`)
} else if (currentRuns >= 20) {
  console.log(`\n   ⏱ RE-MEASURE TRIGGER MET (${currentRuns} >= 20 invocations since ${genStamp}). Record this`)
  console.log(`   table in docs/EXPERIMENTS.md E4 beside the first distribution, then tighten budgets`)
  console.log(`   against the current-generation runs only.`)
} else {
  console.log(`\n   ⏱ re-measure trigger at 20 invocations: ${currentRuns}/20 since the spines changed on`)
  console.log(`   ${genStamp} (${totalRuns - currentRuns} older run(s) excluded — they measure the previous generation).`)
}
