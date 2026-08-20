#!/usr/bin/env node
/**
 * scripts/check-handoff-contract.mjs — every handoff artefact carries a well-formed contract block.
 *
 * WHY THIS EXISTS: the return contract (4-AGENT-PIPELINES §3) is the labelled block an agent emits
 * to its caller. That channel is a transcript — nothing can inspect it after the fact, so an agent
 * that returns bullets of its own devising instead is a silent failure. The spine therefore also
 * requires the block as the artefact's FINAL section, on disk, where a check can reach it. ~70
 * tokens for an after-the-fact record of whether the contract held.
 *
 * (The incident originally cited here — "the spine was loaded and the return format still did not
 * stick" — was WITHDRAWN as misattributed: that run was executing a spine version with no return
 * contract in it, because agent definitions are snapshotted at the turn boundary. See E9 in
 * docs/EXPERIMENTS.md. The check is kept, because the failure it detects is real whether or not
 * that particular run was an instance of it, and because it is what proved the v5 block held.)
 *
 * THE MISSING-vs-NONE DISTINCTION IS THE POINT. `Promote    none` is a considered result and the
 * normal one for an entry agent; an ABSENT Promote line is a contract failure. Collapsing them
 * would delete the only signal this file exists to carry, so a missing line is a finding and
 * `none` is not.
 *
 * THE GLYPH IS DELIBERATE REDUNDANCY. v5's verdict line carries both a glyph and a word, and this
 * check asserts they agree. A verdict whose gloss contradicts its own state ("⛔ proceed") is a real
 * failure and is invisible in a bare word — the second encoding is what makes it detectable.
 *
 * SCOPE AND ITS HONEST LIMIT: `.claude/handoff/` is gitignored and `/wrap` clears it, so on a clean
 * tree this check validates ZERO files and passes. That is a check that cannot fire, which is
 * usually a defect — here it is the design, because the directory is task-scoped scratch. The
 * mitigations are that the live run REPORTS its denominator (so "0 artefacts" is visible rather
 * than implied) and that `--selftest` carries the real fixtures in both directions.
 *
 * Run: node scripts/check-handoff-contract.mjs             (wired into `npm run check`)
 *      node scripts/check-handoff-contract.mjs --selftest  (probes both directions)
 */
import { readdirSync, readFileSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, realpathSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/")
const HANDOFF = "/.claude/handoff"

/**
 * The five labels, in the order the block prints them. Order is part of the contract — a human scans
 * the column, and `Agent`/`Verdict` are what they scan for first.
 */
const LABELS = ["Agent", "Verdict", "Summary", "Artefact", "Promote"]

/** Glyph → the verdict word it must accompany. There is no fourth pair. */
const GLYPHS = { "✅": "proceed", "⚠": "decision-needed", "⛔": "stop" }
const VERDICTS = new Set(Object.values(GLYPHS))

/**
 * Agents whose SPINE emits the contract block. The check enforces the block only for these, because
 * a rule cannot be enforced on an agent that was never told it — a census artefact with no block is
 * the spine's state, not the agent's failure.
 *
 * This list is a rollout boundary, not an exemption: it WIDENS as
 * `dev-standards/playbooks/4-AGENT-PIPELINES.md` §11 step 5 splices the block into the remaining
 * spines, and every agent added here must be added in the same commit that ships its spine. Skipped
 * artefacts are NAMED on every run — a silent skip is how a rollout boundary becomes a hole.
 *
 * Discovered the hard way: the first non-grounder pipeline (P2 SWEEP, knip-tranche-2) turned the
 * commit gate red on `01-census.md` / `02-main.md`, because the check's aperture had been written
 * for the end state while only one spine had shipped.
 */
export const CONTRACT_AGENTS = new Set(["grounder"])

/** Every `NN-<agent>.md` under a handoff root. Non-recursive past the task-slug level, by design. */
export function artefacts(root) {
  const base = `${root}${HANDOFF}`
  if (!existsSync(base)) return []
  const out = []
  for (const slug of readdirSync(base)) {
    const dir = join(base, slug)
    try { if (!statSync(dir).isDirectory()) continue } catch { continue }
    for (const f of readdirSync(dir)) {
      if (/^\d{2}-[a-z-]+\.md$/.test(f)) out.push(join(dir, f).replace(/\\/g, "/"))
    }
  }
  return out.sort()
}

/** The agent name a `NN-<agent>.md` filename encodes, or null if the name does not parse. */
export function agentOf(path) {
  const m = /\/\d{2}-([a-z-]+)\.md$/.exec(path.replace(/\\/g, "/"))
  return m ? m[1] : null
}

/** Split discovered artefacts into the ones the contract applies to and the ones it does not. */
export function partition(paths) {
  const enforced = [], skipped = []
  for (const p of paths) (CONTRACT_AGENTS.has(agentOf(p)) ? enforced : skipped).push(p)
  return { enforced, skipped }
}

/**
 * Read one label's value. The block is column-aligned, so the separator is RUN OF SPACES, not a
 * colon — `\s{2,}` rather than `:`. Captured to end of line: matching `(\S+)` would read an unfilled
 * placeholder's first token as a valid value and wave the whole template through.
 */
const valueOf = (text, l) => (text.match(new RegExp(`^\\s*${l}\\s{2,}(.+?)\\s*$`, "m")) ?? [])[1]

/**
 * Validate one artefact's trailing contract block. Returns findings, empty when well-formed.
 *
 * Deliberately tolerant about WHERE the block sits (last section, not last byte) and strict about
 * WHAT it contains. An agent that adds a trailing newline or a closing fence has not broken the
 * contract; an agent that drops Promote has.
 */
export function checkArtefact(path, text) {
  const out = []

  const missing = LABELS.filter((l) => valueOf(text, l) === undefined)
  if (missing.length === LABELS.length) {
    out.push(`${path}: no contract block at all — the labelled lines are the agent's return, and this artefact carries none`)
    return out
  }
  for (const l of missing) {
    out.push(`${path}: contract block is missing its ${l} line${l === "Promote" ? ' — "Promote    none" is a line, and its ABSENCE is the failure this check exists to separate from it' : ""}`)
  }

  // Anchor: a machinery map is a grounding claim, so an artefact with no anchor is itself a finding.
  if (!/^\s*anchor:.*\bcommit=/m.test(text)) {
    out.push(`${path}: no anchor line carrying a commit — an unanchored observation is a finding, not a fact`)
  }

  // An UNFILLED template passes every label test above — every line is present, it just says
  // `<pipeline id from the brief>`. Angle-bracket placeholders are the tell, and they are checked on
  // every line rather than only the verdict, because v5's placeholders are not all pipe-separated.
  // A bare `—` is NOT a placeholder: it is the specified value for "the brief named no pipeline".
  for (const l of LABELS) {
    const v = valueOf(text, l)
    if (v !== undefined && /<[^>]+>/.test(v)) {
      out.push(`${path}: ${l} still holds the spine's placeholder ("${v}") — the block was copied, not filled in`)
    }
  }

  const verdict = valueOf(text, "Verdict")
  if (verdict !== undefined && !/<[^>]+>/.test(verdict)) {
    // Strip the variation selector: ⚠️ is ⚠ + U+FE0F, and only one of those spellings is typed.
    const v = verdict.replace(/️/g, "")
    const glyph = Object.keys(GLYPHS).find((g) => v.startsWith(g))
    const word = [...VERDICTS].find((w) => new RegExp(`\\b${w}\\b`).test(v))
    if (!glyph) {
      out.push(`${path}: Verdict "${verdict}" carries no state glyph — must open with ${Object.keys(GLYPHS).join(" ")}`)
    }
    if (!word) {
      out.push(`${path}: Verdict "${verdict}" names no state — must be one of ${[...VERDICTS].join(", ")}`)
    }
    if (glyph && word && GLYPHS[glyph] !== word) {
      out.push(`${path}: Verdict glyph and word disagree — "${glyph}" means ${GLYPHS[glyph]}, the line says ${word}`)
    }
  }
  return out
}

const isEntry = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

if (isEntry && process.argv.includes("--selftest")) {
  let failed = 0
  const ok = (c, l) => { if (!c) failed++; console.log(`  ${c ? "✓" : "✗"} ${l}`) }

  const GOOD = [
    "anchor: task=m-041 · agent=grounder · utc=2026-08-20T14:07:11Z · commit=7f7ba3d0",
    "",
    "## 1. Machinery map",
    "…",
    "## Contract",
    "",
    "```",
    "Agent      grounder · P1 · step 1 of 3",
    "Verdict    ✅ proceed — nothing to decide",
    "",
    "Summary    Mapped. Buildable as specified. 12 sites, 2 need a naming call.",
    "",
    "Artefact   .claude/handoff/m-041/01-grounder.md",
    "Promote    none",
    "```",
    "",
  ].join("\n")

  ok(checkArtefact("a.md", GOOD).length === 0,
    "KNOWN-GOOD: a well-formed v5 block with Promote none is clean")

  // THE distinction. Both of these have "no promotion" as the outcome; only one is a defect.
  ok(checkArtefact("a.md", GOOD.replace(/^Promote.*$/m, "")).some((f) => f.includes("Promote")),
    "a MISSING Promote line fires — it is a contract failure")
  ok(!checkArtefact("a.md", GOOD).some((f) => f.includes("Promote")),
    "…and a PRESENT `Promote    none` does NOT fire — the considered answer is the normal one")

  ok(checkArtefact("a.md", GOOD.replace(/^Summary.*$/m, "")).some((f) => f.includes("Summary")),
    "a missing Summary line fires")
  ok(checkArtefact("a.md", GOOD.replace(/^Agent.*$/m, "")).some((f) => f.includes("Agent")),
    "a missing Agent routing line fires")
  ok(checkArtefact("a.md", GOOD.replace("grounder · P1 · step 1 of 3", "grounder · — · —")).length === 0,
    "KNOWN-GOOD: `—` in the routing slots is the SPECIFIED value when the brief named none, not a placeholder")

  ok(checkArtefact("a.md", "# Just a map\n\n## 1. Machinery map\nstuff\n").some((f) => f.includes("no contract block at all")),
    "an artefact with NO block at all fires once, not five times")
  ok(checkArtefact("a.md", GOOD.replace(/^anchor:.*$/m, "")).some((f) => f.includes("anchor")),
    "a missing anchor fires — an unanchored observation is a finding")

  // The glyph pair, both directions.
  ok(checkArtefact("a.md", GOOD.replace("✅ proceed — nothing to decide", "⛔ proceed — nothing to decide")).some((f) => f.includes("disagree")),
    "a glyph contradicting its own word fires — the whole reason the state is encoded twice")
  ok(checkArtefact("a.md", GOOD.replace("✅ proceed — nothing to decide", "⚠️ decision-needed — one call for Main")).length === 0,
    "KNOWN-GOOD: ⚠️ with its variation selector pairs with decision-needed and is clean")
  ok(checkArtefact("a.md", GOOD.replace("✅ proceed — nothing to decide", "proceed")).some((f) => f.includes("no state glyph")),
    "a bare word with no glyph fires")
  ok(checkArtefact("a.md", GOOD.replace("✅ proceed — nothing to decide", "✅ looks-fine")).some((f) => f.includes("names no state")),
    "an invented verdict word fires")

  ok(checkArtefact("a.md", GOOD.replace("grounder · P1 · step 1 of 3", "grounder · <pipeline id from the brief> · step <N> of <M>")).some((f) => f.includes("placeholder")),
    "an UNFILLED template echoed back fires — it passes every label test and is still not a report")

  // Discovery, walked for real: a block-shaped file that is not an artefact must not be scanned,
  // and an artefact in a task directory must be found.
  const tmp = mkdtempSync(join(tmpdir(), "handoff-")).replace(/\\/g, "/")
  mkdirSync(join(tmp, ".claude", "handoff", "m-041"), { recursive: true })
  writeFileSync(join(tmp, ".claude", "handoff", "m-041", "01-grounder.md"), GOOD)
  writeFileSync(join(tmp, ".claude", "handoff", "m-041", "notes.md"), "scratch, not an artefact")
  ok(artefacts(tmp).length === 1, "discovery finds NN-<agent>.md and ignores scratch files beside it")
  ok(artefacts(join(tmp, "nope")).length === 0, "a tree with no handoff directory yields nothing rather than throwing")
  rmSync(tmp, { recursive: true, force: true })

  // The rollout boundary, probed in BOTH directions. A boundary that only ever lets things through
  // is indistinguishable from a disabled check.
  ok(agentOf(".claude/handoff/t/01-grounder.md") === "grounder", "agentOf reads the agent out of the filename")
  ok(agentOf(".claude/handoff/t/03-db-inspector.md") === "db-inspector", "…including a hyphenated agent name")
  ok(agentOf("notes.md") === null, "…and returns null rather than guessing when the name does not parse")

  const P = (n) => `.claude/handoff/t/${n}`
  const split = partition([P("01-grounder.md"), P("02-census.md"), P("03-walker.md")])
  ok(split.enforced.length === 1 && split.enforced[0] === P("01-grounder.md"),
    "MUST ENFORCE — grounder is the one spine carrying the block today")
  ok(split.skipped.length === 2,
    "MUST SKIP — census and walker artefacts are outside the boundary until step 5 splices their spines")

  // The honest cost of the boundary, asserted rather than left implicit: a skipped artefact is not
  // checked AT ALL, so a malformed block in one is invisible. This probe exists so that the day a
  // spine is added to CONTRACT_AGENTS, the person doing it sees what they are switching on.
  ok(partition([P("02-census.md")]).enforced.length === 0,
    "a census artefact is skipped even when it DOES carry a block — the boundary is by agent, not by content")

  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — fires on a missing, unfilled or self-contradicting block, quiet on a well-formed one, and enforces only the spines that carry it")
  process.exit(failed ? 1 : 0)
}

if (isEntry && !process.argv.includes("--selftest")) {
  const { enforced, skipped } = partition(artefacts(ROOT))
  const findings = enforced.flatMap((f) => checkArtefact(f.replace(ROOT + "/", ""), readFileSync(f, "utf8")))

  // Named before the verdict, pass or fail. An artefact outside the rollout boundary is a thing the
  // check DID NOT LOOK AT, and a reader has to see that without reading the source.
  if (skipped.length) {
    console.log(`   not checked — spine carries no contract block yet (§11 step 5 widens this):`)
    for (const f of skipped) console.log(`     · ${f.replace(ROOT + "/", "")}`)
  }

  if (findings.length) {
    console.error(`\n❌ handoff-contract: ${findings.length} finding(s) across ${enforced.length} artefact(s)\n`)
    for (const f of findings) console.error(`   ${f}`)
    console.error("")
    process.exit(1)
  }
  // The denominator is printed deliberately: this directory is task-scoped scratch and is empty on
  // a clean tree, so "0 artefacts" has to be VISIBLE rather than read as "all artefacts passed".
  console.log(`🤝 handoff-contract: ${enforced.length} artefact(s) carry a well-formed contract block`)
}
