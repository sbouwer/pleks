#!/usr/bin/env node
/**
 * scripts/transcript-metrics.mjs — absolute cost metrics for a session, main + subagents
 *
 * Auth:   none — local analysis script, reads ~/.claude transcripts
 * Data:   <projectDir>/<sessionId>.jsonl, <projectDir>/<sessionId>/subagents/agent-*.jsonl,
 *         and the agent-*.meta.json sidecar beside each one
 * Notes:  Built for E16 (docs/EXPERIMENTS.md), which compares the cost of three delegation modes.
 *         Every number here comes from `message.usage` written by the harness. NOTHING is
 *         self-reported: a token count an agent states about itself is unfalsifiable, and in an
 *         experiment whose whole point is comparing agent modes it is the easiest place to lie.
 *
 *         ⚠ THE CONFOUND THIS EXISTS TO AVOID. Subagent spend is NOT in the main transcript —
 *         6,750 main turns carried ZERO `isSidechain` despite 31 `Agent` tool calls, because
 *         subagent transcripts are separate files. A harness reading only the main transcript
 *         reports a delegating run as far cheaper than a solo one — an error pointing exactly in
 *         the direction that flatters delegation. Totals here are main + every subagent file, and
 *         the breakdown is printed as well as the total, because WHERE the spend went is half the
 *         finding.
 *
 *         ⚠ NESTING. Subagents can spawn subagents, and a depth-2 transcript is written FLAT into
 *         the same `subagents/` directory — there is no nested directory to recurse into. The
 *         `spawnDepth` field of each `.meta.json` sidecar is what makes depth visible; discovery
 *         by glob alone would still find the files but could not tell you they were nested, and an
 *         arm whose agents fan out further than you think is an arm whose cost you have understated.
 *
 *         ⚠ RECONCILIATION. Each sidecar carries the `toolUseId` of the `Agent` tool_use that
 *         spawned it, so depth-1 sidecars can be matched one-for-one against `Agent` calls counted
 *         in the main transcript. A shortfall means transcripts are MISSING and the run's cost is
 *         understated; that is reported as a FINDING, never absorbed silently.
 *
 *         Run `--probe` before trusting any run: it asserts subagent discovery actually finds files
 *         and non-zero tokens on a session known to have spawned agents. A harness that quietly
 *         finds nothing returns a clean, plausible, wrong number.
 *
 *         Weighting matches .claude/hooks/context-budget.js rather than inventing a second scheme;
 *         if that hook's multipliers change, change them here in the same commit. The weighted
 *         column is a CONTEXT-cost model, not a billing claim — whether the quota counts a cache
 *         read at 0.1× or 1× is exactly what M-21 is open about, so `--json` emits the raw four
 *         fields alongside it and the comparison is made against `/usage`, not asserted here.
 */
import { readFileSync, readdirSync, existsSync, statSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir, tmpdir } from "node:os"

const CACHE_READ_MULTIPLIER = 0.1
const CACHE_WRITE_MULTIPLIER = 1.25

/** A gap longer than this between consecutive records is dead time, not work. */
const ACTIVE_GAP_MS = 60_000

/**
 * Derive the ~/.claude/projects slug from a working directory.
 *
 * VERIFIED EMPIRICALLY, not assumed: this machine holds `c--dev-pleks`,
 * `c--Users-stean-OneDrive-Websites-pleks`, `c--dev-life-therapy` and
 * `c--Users-stean-OneDrive-Websites-Life-Therapy`. `:` and the separators become `-`, and CASE IS
 * PRESERVED — the last two are the same rule applied to two paths that differ only in case, which
 * is what rules out the lowercasing this function was nearly written with. The leading lowercase
 * `c` is not a normalisation; it is the drive letter as the platform reports cwd.
 *
 * ⚠ THIS MATTERS FOR E16 SPECIFICALLY. Each experimental arm runs in its own git worktree, which is
 * its own path, which is its own project dir. A hardcoded slug would have pointed every arm at the
 * main checkout's transcripts and silently reported the wrong session — a harness that measures the
 * same tree three times and calls it a comparison. The derivation is still a hypothesis; existence
 * of the derived directory is the check, and a miss is fatal rather than a fallback.
 */
export function projectSlug(cwd) {
  return cwd.replace(/[:\\/]/g, "-")
}

export function projectsRoot() {
  return join(homedir(), ".claude", "projects")
}

/**
 * Resolve a derived slug to the directory that ACTUALLY exists, matching case-insensitively.
 *
 * ⚠ THIS IS NOT DEFENSIVE PADDING — it is a measured defect. `process.cwd()` on this machine returns
 * `C:\dev\pleks` with a capital drive letter, so `projectSlug` derives `C--dev-pleks`, while the
 * directory Claude Code actually wrote is `c--dev-pleks`. The derivation is off by the drive
 * letter's case and Windows' case-insensitive filesystem hid it completely: `existsSync` returned
 * true, the report ran, and the only visible symptom was a wrong-looking path in the header. On a
 * case-sensitive filesystem the same code takes the refuse-to-guess branch and an E16 arm produces
 * no datum at all. Reconciling the guess against the real listing is what makes the derivation a
 * hypothesis with a check rather than an assumption.
 *
 * Returns the real path, or null when nothing matches.
 */
export function resolveSlugDir(root, slug, entries) {
  const list = entries ?? (existsSync(root) ? readdirSync(root) : [])
  const exact = list.find((e) => e === slug)
  if (exact) return join(root, exact)
  const lower = slug.toLowerCase()
  const ci = list.find((e) => e.toLowerCase() === lower)
  return ci ? join(root, ci) : null
}

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
 *
 * `activeMs` sums the gaps between consecutive records that are shorter than ACTIVE_GAP_MS. Wall
 * clock over a session that sat idle overnight is a measure of when the human went to bed; active
 * time is the closest honest proxy for how long the work took. It is a PROXY: a single model turn
 * longer than the threshold is discarded as idle, so active time is a floor, and the threshold is
 * printed with the number so the reader can judge it rather than inherit it.
 */
export function aggregate(records, { since = null, until = null, activeGapMs = ACTIVE_GAP_MS } = {}) {
  const tokens = EMPTY()
  const toolCalls = {}
  let turns = 0
  let firstTs = null
  let lastTs = null
  const stamps = []
  // ⚠ ONE API RESPONSE CAN OCCUPY SEVERAL TRANSCRIPT LINES, EACH REPEATING THE SAME `usage` OBJECT.
  // A response containing text + thinking + three tool_use blocks is written as multiple records
  // sharing one `message.id`, and every one of them carries the FULL usage for that response. Summing
  // per line therefore bills a response once per content block.
  //
  // Measured 2026-08-24 on E16 arm A (session f2781cac, task 2 r1): 170 assistant lines with usage,
  // 103 distinct ids. Per-line 22,374,437 cache-read; per-id 14,520,451 — and the per-id figure
  // matches the CLI's own `result` event EXACTLY, which is the independent reference this file did
  // not previously have.
  //
  // WHY IT COULD NOT BE ABSORBED AS "uniform inflation": the factor is lines÷ids, a BEHAVIOURAL
  // property. An arm emitting more tool calls per response inflates more than one that does not, so
  // it biases arm-vs-arm comparison along exactly the axis E16 measures.
  //
  // ⚠ AND IT INVALIDATES THIS FILE'S OWN CORROBORATION CLAIM. `docs/EXPERIMENTS.md` cited this script
  // agreeing with `.claude/hooks/context-budget.js` to three significant figures as "the closest
  // thing available to a calibration". If both summed per line they agreed BECAUSE THEY SHARED THIS
  // DEFECT — the same trap `check-migration-forward-refs.mjs`'s header names: a defect two artefacts
  // inherited together agrees with itself. Independent verification needs an independent reference
  // point, and the CLI's `result` event is one; `context-budget.js` was never one.
  const billed = new Set()

  for (const r of records) {
    const ts = r.timestamp
    if (since && ts && ts < since) continue
    if (until && ts && ts > until) continue
    if (ts) {
      if (!firstTs || ts < firstTs) firstTs = ts
      if (!lastTs || ts > lastTs) lastTs = ts
      stamps.push(new Date(ts).getTime())
    }

    const u = r.message?.usage
    // A record with usage but NO id cannot be deduplicated and is counted — erring toward
    // over-counting rather than silently dropping spend, because a missing id is an unknown shape
    // and dropping it would understate cost in whichever arm happens to produce it.
    const id = r.message?.id
    if (u && (!id || !billed.has(id))) {
      if (id) billed.add(id)
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

  stamps.sort((a, b) => a - b)
  let activeMs = 0
  for (let i = 1; i < stamps.length; i++) {
    const gap = stamps[i] - stamps[i - 1]
    if (gap < activeGapMs) activeMs += gap
  }

  return { turns, tokens, toolCalls, firstTs, lastTs, activeMs, weighted: weightedUnits(tokens) }
}

export function parseJsonl(text) {
  const out = []
  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line)) } catch { /* a partially-written tail line is normal */ }
  }
  return out
}

/**
 * Every subagent transcript belonging to a session, each paired with its `.meta.json` sidecar.
 *
 * Empty array is a FINDING, not a clean result — see `--expect-subagents`. A sidecar that is
 * missing or unreadable yields `meta: null` rather than being dropped: the transcript's TOKENS
 * still count (they were really spent), only its depth and provenance are unknown, and silently
 * discarding it would understate the very number this script exists to get right.
 */
export function subagentFiles(projectDir, sessionId) {
  const dir = join(projectDir, sessionId, "subagents")
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.startsWith("agent-") && f.endsWith(".jsonl"))
    .sort()
    .map((f) => {
      const file = join(dir, f)
      const metaPath = file.replace(/\.jsonl$/, ".meta.json")
      let meta = null
      try { meta = JSON.parse(readFileSync(metaPath, "utf8")) } catch { /* sidecar absent or partial */ }
      return { file, meta }
    })
}

/**
 * Match depth-1 sidecars against the `Agent` tool_use ids the main transcript recorded.
 *
 * Verified on session 0d9dadd6: 31 depth-1 sidecars, 31 `Agent` ids, all 31 matched, and the 5
 * unmatched sidecars were exactly the depth-2 census→census spawns — which is what explains an
 * `Agent×31` tool count sitting beside 36 transcript files, previously recorded as unexplained.
 *
 * A depth-1 sidecar whose id is NOT in the main transcript is normal when the window clips the
 * spawning turn, so it is reported rather than failed. Fewer transcripts than `Agent` calls is the
 * dangerous direction — spend that happened and was not found — and that is the FINDING.
 */
/**
 * ⚠ THE DELEGATION TOOL IS SPELLED `Task` IN SOME SESSIONS AND `Agent` IN OTHERS, and reading only
 * one of them silently kills this whole function.
 *
 * Measured 2026-08-24 on E16 arm B (session `eaefff58`): the `system/init` event of a `claude -p`
 * session lists its delegation tool as **`Task`**. The orchestrating session that wrote this file
 * calls the same tool `Agent`, which is the only reason the original spelling ever looked right.
 *
 * The failure is silent AND aimed at the dangerous direction. With `agentCalls` stuck at 0, the
 * shortfall `agentCalls - depth1` can never be positive, so the finding this function exists to
 * raise — spend that happened and whose transcripts were not found — becomes unraisable. It would
 * have reported "0 delegation calls" beside a pile of subagent transcripts and exited 0.
 *
 * Both spellings are summed rather than one being chosen: they are the same tool, a session may in
 * principle expose either, and a session exposing both would be under-counted by picking one.
 */
const DELEGATION_TOOL_NAMES = ["Agent", "Task"]

export function reconcile(subs, mainToolCalls, { windowed = false } = {}) {
  const agentCalls = DELEGATION_TOOL_NAMES.reduce((n, k) => n + (mainToolCalls[k] || 0), 0)
  const depths = {}
  let noMeta = 0
  for (const s of subs) {
    if (!s.meta) { noMeta++; continue }
    const d = s.meta.spawnDepth ?? "unknown"
    depths[d] = (depths[d] || 0) + 1
  }
  const depth1 = depths[1] || 0
  const nested = subs.length - depth1 - noMeta
  const shortfall = agentCalls - depth1
  return {
    agentCalls,
    transcripts: subs.length,
    depth1,
    nested,
    noMeta,
    depths,
    maxDepth: Object.keys(depths).filter((d) => d !== "unknown").map(Number).reduce((a, b) => Math.max(a, b), 0),
    // Windowing legitimately clips spawning turns out of the main transcript, so a shortfall is
    // only assertable on a whole-session read.
    finding: !windowed && shortfall > 0 ? shortfall : 0,
  }
}

export const VALUE_FLAGS = new Set(["--since", "--until", "--project-dir", "--label", "--expect-subagents", "--active-gap"])
export const BOOL_FLAGS = new Set(["--selftest", "--probe", "--json"])

/**
 * Read a flag's value, accepting BOTH `--name value` and `--name=value`.
 *
 * ⚠ THIS READ ONLY THE SPACE-SEPARATED FORM, AND THE FAILURE WAS SILENT. `--expect-subagents=false`
 * matched nothing, fell through to the `?? "true"` default, and the run proceeded with the OPPOSITE
 * setting to the one asked for. The harmless direction is a solo arm printing a spurious warning.
 * The dangerous one is `--expect-subagents=true` on a delegating arm: the operator believes the
 * missing-sidecar assertion is armed and it is not — a control that reads as present while doing
 * nothing, the same class as the `Task`/`Agent` spelling defect noted above.
 */
export function parseFlag(args, name) {
  const eq = args.find((a) => a.startsWith(`${name}=`))
  if (eq !== undefined) return eq.slice(name.length + 1)
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1] ?? null
}

/** Every `--token` not in the known sets. Silently ignoring these is what hid the bug above. */
export function unknownFlags(args) {
  return args.filter((a) => {
    if (!a.startsWith("--")) return false
    const bare = a.includes("=") ? a.slice(0, a.indexOf("=")) : a
    return !VALUE_FLAGS.has(bare) && !BOOL_FLAGS.has(bare)
  })
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
  // ── the per-message-id defect, both directions (found on E16 arm A, 2026-08-24) ──────────────
  t("ONE RESPONSE SPLIT ACROSS LINES IS BILLED ONCE — the defect that inflated arm A by 54%", () => {
    // A response with text + thinking + a tool_use is three records sharing one id, each repeating
    // the SAME usage. Per-line summing charged it three times.
    const u = U(0, 0, 100, 10)
    const a = aggregate([
      { timestamp: "2026-01-01T00:00:00Z", message: { id: "msg_1", usage: u } },
      { timestamp: "2026-01-01T00:00:01Z", message: { id: "msg_1", usage: u } },
      { timestamp: "2026-01-01T00:00:02Z", message: { id: "msg_1", usage: u } },
    ])
    return a.tokens.cacheRead === 100 && a.tokens.output === 10 && a.turns === 1
  })
  t("KNOWN-GOOD: DISTINCT ids still sum — the dedup must not swallow real separate responses", () => {
    const a = aggregate([
      { timestamp: "2026-01-01T00:00:00Z", message: { id: "msg_1", usage: U(0, 0, 100, 10) } },
      { timestamp: "2026-01-01T00:00:01Z", message: { id: "msg_2", usage: U(0, 0, 100, 10) } },
    ])
    return a.tokens.cacheRead === 200 && a.turns === 2
  })
  t("a usage record with NO id is counted — err toward over-counting, never silent loss", () => {
    // An unknown shape must not vanish: dropping it would understate whichever arm produces it.
    const a = aggregate([
      { timestamp: "2026-01-01T00:00:00Z", message: { usage: U(0, 0, 50, 5) } },
      { timestamp: "2026-01-01T00:00:01Z", message: { usage: U(0, 0, 50, 5) } },
    ])
    return a.tokens.cacheRead === 100 && a.turns === 2
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

  // ── active time ─────────────────────────────────────────────────────────────────────────────
  t("ACTIVE TIME EXCLUDES AN IDLE GAP — a session slept through is not a session worked through", () => {
    const a = aggregate([
      rec("2026-01-01T00:00:00Z", U(1, 0, 0, 0)),
      rec("2026-01-01T00:00:30Z", U(1, 0, 0, 0)),   // 30s — counted
      rec("2026-01-01T08:00:00Z", U(1, 0, 0, 0)),   // 8h  — discarded
      rec("2026-01-01T08:00:10Z", U(1, 0, 0, 0)),   // 10s — counted
    ])
    return a.activeMs === 40_000 && durationMs(a.firstTs, a.lastTs) === 8 * 3600 * 1000 + 10_000
  })
  t("KNOWN-GOOD: with no gap over the threshold, active time equals wall clock", () => {
    const a = aggregate([rec("2026-01-01T00:00:00Z", U(1, 0, 0, 0)), rec("2026-01-01T00:00:30Z", U(1, 0, 0, 0))])
    return a.activeMs === 30_000 && a.activeMs === durationMs(a.firstTs, a.lastTs)
  })
  t("active time is order-independent — records are sorted before gaps are measured", () => {
    const fwd = aggregate([rec("2026-01-01T00:00:00Z", U(1, 0, 0, 0)), rec("2026-01-01T00:00:30Z", U(1, 0, 0, 0))])
    const rev = aggregate([rec("2026-01-01T00:00:30Z", U(1, 0, 0, 0)), rec("2026-01-01T00:00:00Z", U(1, 0, 0, 0))])
    return fwd.activeMs === rev.activeMs && rev.activeMs === 30_000
  })

  // ── project-dir derivation ──────────────────────────────────────────────────────────────────
  t("PROJECT SLUG matches the real dirs on this machine, case PRESERVED", () => {
    return projectSlug("c:\\dev\\pleks") === "c--dev-pleks" &&
      projectSlug("c:\\Users\\stean\\OneDrive\\Websites\\pleks") === "c--Users-stean-OneDrive-Websites-pleks"
  })
  t("KNOWN-GOOD (the case that rules out lowercasing): two paths differing only in case give two slugs", () => {
    // Both of these exist under ~/.claude/projects. A .toLowerCase() in projectSlug would collapse
    // them to one, and every E16 arm run from a worktree would read the wrong session.
    return projectSlug("c:\\dev\\life-therapy") !== projectSlug("c:\\dev\\Life-Therapy")
  })
  t("a worktree path derives a DIFFERENT slug from the main checkout — the whole point", () => {
    return projectSlug("c:\\dev\\pleks-e16-arm1") !== projectSlug("c:\\dev\\pleks")
  })
  t("posix separators are handled too — the script must not assume win32", () => {
    return projectSlug("/home/u/dev/pleks") === "-home-u-dev-pleks"
  })
  t("THE MASKED DEFECT: cwd's capital drive letter derives a slug the real dir does not match", () => {
    // process.cwd() returns "C:\dev\pleks"; Claude Code wrote "c--dev-pleks". Windows' case-
    // insensitive existsSync hid this entirely. An exact-match resolver must MISS here — if this
    // case ever passes as an exact match, the derivation changed and resolveSlugDir is dead code.
    return projectSlug("C:\\dev\\pleks") === "C--dev-pleks" && "C--dev-pleks" !== "c--dev-pleks"
  })
  t("resolveSlugDir RECOVERS that case, returning the real on-disk name not the derived one", () => {
    const got = resolveSlugDir("/root", "C--dev-pleks", ["c--dev-pleks", "c--dev-life-therapy"])
    return got === join("/root", "c--dev-pleks")
  })
  t("resolveSlugDir prefers an EXACT match over a case-insensitive one", () => {
    const got = resolveSlugDir("/root", "c--dev-Pleks", ["c--dev-pleks", "c--dev-Pleks"])
    return got === join("/root", "c--dev-Pleks")
  })
  t("KNOWN-GOOD (the failing direction): an unmatched slug returns null, so the caller can refuse", () => {
    return resolveSlugDir("/root", "c--dev-nothing", ["c--dev-pleks"]) === null
  })

  // ── reconciliation ──────────────────────────────────────────────────────────────────────────
  const sub = (depth) => ({ file: `agent-${depth}.jsonl`, meta: { spawnDepth: depth } })
  t("RECONCILES the real shape: 31 Agent calls, 31 depth-1 + 5 nested transcripts, no finding", () => {
    const subs = [...Array(31)].map(() => sub(1)).concat([...Array(5)].map(() => sub(2)))
    const r = reconcile(subs, { Agent: 31 })
    return r.finding === 0 && r.depth1 === 31 && r.nested === 5 && r.transcripts === 36 && r.maxDepth === 2
  })
  t("FINDING when transcripts are MISSING — fewer depth-1 files than Agent calls understates cost", () => {
    return reconcile([sub(1), sub(1)], { Agent: 5 }).finding === 3
  })
  // ── the tool-name defect, both directions (found on E16 arm B, 2026-08-24) ────────────────────
  t("`Task` COUNTS AS DELEGATION — the spelling a `claude -p` session actually uses", () => {
    // Reading only `Agent` pinned agentCalls at 0, which makes the shortfall unraisable: the
    // dangerous direction becomes undetectable while the script still exits 0.
    return reconcile([sub(1), sub(1)], { Task: 5 }).finding === 3
  })
  t("BOTH spellings sum — a session exposing each would be under-counted by picking one", () => {
    return reconcile([sub(1)], { Agent: 2, Task: 2 }).finding === 3
  })
  t("THE SILENT DEFECT: `--expect-subagents=false` must parse, not fall through to the default", () => {
    return parseFlag(["--expect-subagents=false"], "--expect-subagents") === "false"
  })
  t("KNOWN-GOOD: the space-separated spelling still parses", () => {
    return parseFlag(["--expect-subagents", "false"], "--expect-subagents") === "false"
  })
  t("an absent flag reads null, so the caller's ?? default applies", () => {
    return parseFlag(["--json"], "--expect-subagents") === null
  })
  t("`--name=` with an empty value yields \"\", NOT null — an explicit empty is not an absent flag", () => {
    return parseFlag(["--label="], "--label") === ""
  })
  t("a value containing `=` survives — only the FIRST separator splits", () => {
    return parseFlag(["--project-dir=C:/x=y/z"], "--project-dir") === "C:/x=y/z"
  })
  t("A TYPO IS FATAL, NOT IGNORED — the thing that made the defect above invisible", () => {
    return unknownFlags(["--expect-subagent=false"]).length === 1
  })
  t("KNOWN-GOOD: every real flag, in both spellings, is accepted", () => {
    return unknownFlags(["--json", "--expect-subagents=false", "--since", "x", "--project-dir=/p"]).length === 0
  })
  t("KNOWN-GOOD: a positional argument is not mistaken for an unknown flag", () => {
    return unknownFlags(["abc123-session-id", "--json"]).length === 0
  })
  t("KNOWN-GOOD: an unrelated tool is NOT counted as delegation", () => {
    return reconcile([sub(1)], { Bash: 99, Read: 40 }).finding === 0
  })
  t("no finding when depth-1 files EXCEED Agent calls — the safe direction, reported not failed", () => {
    return reconcile([sub(1), sub(1), sub(1)], { Agent: 1 }).finding === 0
  })
  t("a WINDOWED read never raises the shortfall finding — the window legitimately clips spawn turns", () => {
    return reconcile([sub(1)], { Agent: 5 }, { windowed: true }).finding === 0
  })
  t("a sidecar-less transcript is COUNTED, not dropped — its tokens were really spent", () => {
    const r = reconcile([sub(1), { file: "x.jsonl", meta: null }], { Agent: 1 })
    return r.transcripts === 2 && r.noMeta === 1 && r.nested === 0
  })
  t("nesting is detected from spawnDepth, not from directory layout (depth-2 files sit FLAT)", () => {
    const r = reconcile([sub(1), sub(2), sub(3)], { Agent: 1 })
    return r.maxDepth === 3 && r.nested === 2
  })

  // ── discovery, against a planted directory ──────────────────────────────────────────────────
  t("SUBAGENT DISCOVERY finds planted transcripts and reads their sidecars", () => {
    const root = mkdtempSync(join(tmpdir(), "tm-"))
    const dir = join(root, "sess", "subagents")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "agent-a.jsonl"), "{}\n")
    writeFileSync(join(dir, "agent-a.meta.json"), JSON.stringify({ agentType: "census", spawnDepth: 1 }))
    writeFileSync(join(dir, "agent-b.jsonl"), "{}\n")          // deliberately sidecar-less
    writeFileSync(join(dir, "notes.txt"), "not a transcript")  // deliberately not an agent file
    const found = subagentFiles(root, "sess")
    return found.length === 2 &&
      found[0].meta?.agentType === "census" && found[0].meta?.spawnDepth === 1 &&
      found[1].meta === null
  })
  t("KNOWN-GOOD (the failing direction): a session with no subagents dir yields an EMPTY array", () => {
    const root = mkdtempSync(join(tmpdir(), "tm-"))
    return subagentFiles(root, "no-such-session").length === 0
  })

  let bad = 0
  for (const [label, fn] of cases) {
    let ok = false
    try { ok = fn() === true } catch { ok = false }
    if (!ok) bad++
    console.log(`  ${ok ? "✓" : "✗"} ${label}`)
  }
  console.log(bad ? `\n✗ ${bad} selftest case(s) failed` : `\n✅ transcript-metrics selftest green (${cases.length} cases)`)
  process.exit(bad ? 1 : 0)
}

/**
 * The confound probe. Asserts, against REAL transcripts, that subagent discovery works — because
 * every unit test above passes just as happily against a harness that never finds a subagent file.
 */
function probe(projectDir) {
  if (!existsSync(projectDir)) {
    console.error(`✗ probe: project dir not found: ${projectDir}`)
    process.exit(1)
  }
  const sessions = readdirSync(projectDir).filter((f) => f.endsWith(".jsonl")).map((f) => f.replace(/\.jsonl$/, ""))
  const withAgents = sessions.map((s) => ({ s, subs: subagentFiles(projectDir, s) })).filter((x) => x.subs.length)

  if (!withAgents.length) {
    console.error("✗ probe: found NO session with subagent transcripts. Either this machine has never")
    console.error("   spawned an agent, or the discovery path is wrong. Do not run E16 until this passes —")
    console.error("   a harness that finds no subagent files reports delegation as free.")
    process.exit(1)
  }

  let bad = 0
  const target = withAgents.sort((a, b) => b.subs.length - a.subs.length)[0]
  console.log(`  probing session ${target.s.slice(0, 8)} — ${target.subs.length} subagent transcript(s)`)

  const sub = EMPTY()
  for (const { file } of target.subs) {
    const a = aggregate(parseJsonl(readFileSync(file, "utf8")))
    sub.input += a.tokens.input; sub.cacheWrite += a.tokens.cacheWrite
    sub.cacheRead += a.tokens.cacheRead; sub.output += a.tokens.output
  }
  const subW = weightedUnits(sub)
  const ok1 = subW > 0
  console.log(`  ${ok1 ? "✓" : "✗"} SUBAGENT SPEND IS NON-ZERO — ${k(subW)} weighted units the main transcript does not contain`)
  if (!ok1) bad++

  const mainPath = join(projectDir, `${target.s}.jsonl`)
  const mainAgg = existsSync(mainPath) ? aggregate(parseJsonl(readFileSync(mainPath, "utf8"))) : null
  const ok2 = mainAgg !== null
  console.log(`  ${ok2 ? "✓" : "✗"} the main transcript for that session is readable`)
  if (!ok2) bad++

  const withMeta = target.subs.filter((s) => s.meta).length
  const ok3 = withMeta > 0
  console.log(`  ${ok3 ? "✓" : "✗"} .meta.json sidecars are present (${withMeta}/${target.subs.length}) — without them nesting is invisible`)
  if (!ok3) bad++

  if (mainAgg) {
    const r = reconcile(target.subs, mainAgg.toolCalls)
    const ok4 = r.finding === 0
    console.log(`  ${ok4 ? "✓" : "✗"} RECONCILED: ${r.agentCalls} Agent call(s) ↔ ${r.depth1} depth-1 transcript(s), ${r.nested} nested (max depth ${r.maxDepth})`)
    if (!ok4) {
      console.log(`      ${r.finding} spawned agent(s) have NO transcript — that spend is real and unmeasured.`)
      bad++
    }
    const pct = (subW / (mainAgg.weighted + subW)) * 100
    console.log(`  ℹ subagents are ${pct.toFixed(1)}% of that session's total weighted spend`)
    console.log("    (reported, never asserted — the share is data about the session, not a property to gate on)")
  }

  console.log(bad ? "\n✗ probe FAILED — do not run E16 against this harness" : "\n✅ transcript-metrics probe green — subagent spend is being seen")
  process.exit(bad ? 1 : 0)
}

// ── argv ──────────────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (name) => parseFlag(args, name)

// An unrecognised flag is FATAL, not ignored. Silently dropping one is exactly what hid the
// `--expect-subagents=` defect documented on parseFlag: the run looked configured and was not.
const unknown = unknownFlags(args)
if (unknown.length) {
  console.error(`✗ unknown flag: ${unknown.join(" ")}`)
  console.error(`   known: ${[...VALUE_FLAGS, ...BOOL_FLAGS].sort().join(" ")}`)
  process.exit(1)
}
// Positional = any bare token whose PRECEDING token is not a value-taking flag. The previous
// version located that predecessor with args.indexOf(a), which returns the FIRST index of the
// value — so a positional equal to an earlier string was misjudged. find()'s index parameter is
// the actual position and cannot alias.
const positional = args.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(args[i - 1]))

if (args.includes("--selftest")) selftest()

/**
 * Resolve the project dir, and REFUSE TO GUESS rather than silently read the wrong tree.
 *
 * With no `--project-dir`, the slug is derived from cwd — correct by construction for a session run
 * in the directory being measured, which is every E16 arm. It is only ambiguous when a session id
 * is given with no cwd-derived dir to hold it, and there the script names the candidates and stops.
 */
function resolveProjectDir() {
  const explicit = flag("--project-dir")
  if (explicit) {
    if (!existsSync(explicit)) { console.error(`✗ --project-dir does not exist: ${explicit}`); process.exit(1) }
    return explicit
  }
  const slug = projectSlug(process.cwd())
  const resolved = resolveSlugDir(projectsRoot(), slug)
  if (resolved) return resolved

  console.error(`✗ no transcript dir for this working directory.`)
  console.error(`   cwd:     ${process.cwd()}`)
  console.error(`   derived: ${join(projectsRoot(), slug)}`)
  const others = existsSync(projectsRoot()) ? readdirSync(projectsRoot()) : []
  if (others.length) {
    console.error(`   ${others.length} project dir(s) exist, but guessing which one holds this run's session is`)
    console.error(`   exactly how an arm gets measured against another arm's transcript. Pass --project-dir:`)
    for (const o of others.slice(0, 12)) console.error(`     ${join(projectsRoot(), o)}`)
  }
  process.exit(1)
}

const PROJECT_DIR = resolveProjectDir()

if (args.includes("--probe")) probe(PROJECT_DIR)

// ── report ────────────────────────────────────────────────────────────────────────────────────
const asJson = args.includes("--json")
const since = flag("--since")
const until = flag("--until")
const label = flag("--label")
const activeGapMs = Number(flag("--active-gap") ?? ACTIVE_GAP_MS)
// Arm 1 (solo) legitimately spawns nothing, so its run must be QUIET; the delegating arms must be
// LOUD when they find nothing, because there "no subagent files" means the measurement failed, not
// that no delegation happened. One flag, set per arm, keeps both readings honest.
const expectSubagents = (flag("--expect-subagents") ?? "true") !== "false"

let sessionId = positional
if (!sessionId || sessionId === "latest") {
  const files = readdirSync(PROJECT_DIR).filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({ f, m: statSync(join(PROJECT_DIR, f)).mtimeMs })).sort((a, b) => b.m - a.m)
  if (!files.length) { console.error(`no transcripts found in ${PROJECT_DIR}`); process.exit(1) }
  sessionId = files[0].f.replace(/\.jsonl$/, "")
}

const mainPath = join(PROJECT_DIR, `${sessionId}.jsonl`)
if (!existsSync(mainPath)) { console.error(`no such session: ${sessionId}\n  in ${PROJECT_DIR}`); process.exit(1) }

const win = { since, until, activeGapMs }
const main = aggregate(parseJsonl(readFileSync(mainPath, "utf8")), win)
const subs = subagentFiles(PROJECT_DIR, sessionId)
  .map((s) => ({ ...s, ...aggregate(parseJsonl(readFileSync(s.file, "utf8")), win) }))

const subTotal = subs.reduce((acc, s) => {
  acc.input += s.tokens.input; acc.cacheWrite += s.tokens.cacheWrite
  acc.cacheRead += s.tokens.cacheRead; acc.output += s.tokens.output; acc.turns += s.turns
  acc.activeMs += s.activeMs
  return acc
}, { ...EMPTY(), turns: 0, activeMs: 0 })

const total = {
  input: main.tokens.input + subTotal.input,
  cacheWrite: main.tokens.cacheWrite + subTotal.cacheWrite,
  cacheRead: main.tokens.cacheRead + subTotal.cacheRead,
  output: main.tokens.output + subTotal.output,
}

const byType = {}
for (const s of subs) {
  const type = s.meta?.agentType ?? "unknown"
  const b = (byType[type] ||= { count: 0, turns: 0, weighted: 0 })
  b.count++; b.turns += s.turns; b.weighted += s.weighted
}

const rec = reconcile(subs, main.toolCalls, { windowed: Boolean(since || until) })

const allTs = [main.firstTs, main.lastTs, ...subs.flatMap((s) => [s.firstTs, s.lastTs])].filter(Boolean).sort()
const wall = durationMs(allTs[0], allTs[allTs.length - 1])
// Subagents run inside the main session's wall clock, so their active time OVERLAPS the main
// session's rather than extending it. Reported separately for that reason; summing them would
// double-count a delegating arm's duration and understate its apparent efficiency.
const activeMs = main.activeMs

if (asJson) {
  console.log(JSON.stringify({
    sessionId, label, projectDir: PROJECT_DIR, cwd: process.cwd(), since, until,
    wallClockMs: wall, wallClockFirst: allTs[0] ?? null, wallClockLast: allTs[allTs.length - 1] ?? null,
    activeMs, activeGapMs, subagentActiveMs: subTotal.activeMs,
    main: { turns: main.turns, tokens: main.tokens, weighted: main.weighted, activeMs: main.activeMs, toolCalls: main.toolCalls },
    subagents: {
      count: subs.length, turns: subTotal.turns, tokens: subTotal, weighted: weightedUnits(subTotal),
      byType,
      each: subs.map((s) => ({
        file: s.file, agentType: s.meta?.agentType ?? null, description: s.meta?.description ?? null,
        spawnDepth: s.meta?.spawnDepth ?? null, toolUseId: s.meta?.toolUseId ?? null,
        turns: s.turns, tokens: s.tokens, weighted: s.weighted,
      })),
    },
    reconciliation: rec,
    total: { turns: main.turns + subTotal.turns, tokens: total, weighted: weightedUnits(total) },
  }, null, 2))
  process.exit(rec.finding && expectSubagents ? 1 : 0)
}

const row = (name, turns, t) =>
  `  ${name.padEnd(12)} ${String(turns).padStart(6)}  ${k(t.input).padStart(8)}  ${k(t.cacheWrite).padStart(9)}  ${k(t.cacheRead).padStart(9)}  ${k(t.output).padStart(8)}  ${k(weightedUnits(t)).padStart(9)}`

console.log(`\n📊 ${label ? `${label} · ` : ""}${sessionId}${since || until ? `  [${since ?? "…"} → ${until ?? "…"}]` : ""}`)
console.log(`   ${PROJECT_DIR}`)
console.log(`   wall ${fmtDuration(wall)}  ·  active ${fmtDuration(activeMs)} (gaps >${Math.round(activeGapMs / 1000)}s treated as idle)`)
console.log(`   ${allTs[0] ?? "n/a"} → ${allTs[allTs.length - 1] ?? "n/a"}`)
// The k() formatter rounds above 1M and is for reading, not for recording. --json is the record.
console.log("\n  source          turns     input  cacheWrt   cacheRd    output   weighted")
console.log("  " + "─".repeat(74))
console.log(row("main", main.turns, main.tokens))
console.log(row(`subagents(${subs.length})`, subTotal.turns, subTotal))
console.log("  " + "─".repeat(74))
console.log(row("TOTAL", main.turns + subTotal.turns, total))
console.log("\n  (table is rounded above 1M — use --json for the figures of record)")

if (subs.length) {
  const types = Object.entries(byType).sort((a, b) => b[1].weighted - a[1].weighted)
  console.log(`\n  by agent: ${types.map(([n, b]) => `${n}×${b.count} ${k(b.weighted)}`).join("  ")}`)
  console.log(`  reconciliation: ${rec.agentCalls} Agent call(s) ↔ ${rec.depth1} depth-1, ${rec.nested} nested, max depth ${rec.maxDepth}` +
    (rec.noMeta ? `, ${rec.noMeta} without a sidecar` : ""))
  if (rec.finding) {
    console.log(`\n  ⚠ ${rec.finding} spawned agent(s) have NO transcript. That spend is real and NOT in any`)
    console.log("    number above — this run's cost is understated and must not be used as an E16 datum.")
  }
} else if (expectSubagents) {
  console.log("\n  ⚠ no subagent transcripts for this session. If this run delegated, the harness is")
  console.log("    not seeing the spend and every comparison against it understates delegation.")
  console.log("    (pass --expect-subagents=false for a solo arm, where finding none is correct)")
}

const tools = Object.entries(main.toolCalls).sort((a, b) => b[1] - a[1]).slice(0, 8)
if (tools.length) console.log(`\n  main tool calls: ${tools.map(([n, c]) => `${n}×${c}`).join("  ")}`)
console.log()

process.exit(rec.finding && expectSubagents ? 1 : 0)
