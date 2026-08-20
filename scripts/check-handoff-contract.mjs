#!/usr/bin/env node
/**
 * scripts/check-handoff-contract.mjs — every handoff artefact carries a well-formed contract block.
 *
 * WHY THIS EXISTS: the return contract (4-AGENT-PIPELINES §3) is four labelled lines an agent emits
 * to its caller. That channel is a transcript — nothing can inspect it after the fact, so an agent
 * that returns four bullets of its own devising instead is a silent failure. It happened on the
 * first real P1: the spine was demonstrably loaded (the artefact carried all six prescribed
 * sections) and the return format still did not stick, with no PROMOTE line at all.
 *
 * So the spine also requires the block as the artefact's FINAL section, on disk, where a check can
 * reach it. ~60 tokens for an after-the-fact record of whether the contract held.
 *
 * THE MISSING-vs-NONE DISTINCTION IS THE POINT. `PROMOTE: none` is a considered result and the
 * normal one for an entry agent; an ABSENT PROMOTE line is a contract failure. Collapsing them
 * would delete the only signal this file exists to carry, so a missing line is a finding and
 * `none` is not.
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

/** The four labels, in order. Order is part of the contract — a reader scans for VERDICT first. */
const LABELS = ["VERDICT", "ARTEFACT", "SUMMARY", "PROMOTE"]
const VERDICTS = new Set(["proceed", "stop", "decision-needed"])

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

/**
 * Validate one artefact's trailing contract block. Returns findings, empty when well-formed.
 *
 * Deliberately tolerant about WHERE the block sits (last section, not last byte) and strict about
 * WHAT it contains. An agent that adds a trailing newline or a closing fence has not broken the
 * contract; an agent that drops PROMOTE has.
 */
export function checkArtefact(path, text) {
  const out = []
  const label = (l) => new RegExp(`^\\s*${l}:`, "m")

  const missing = LABELS.filter((l) => !label(l).test(text))
  if (missing.length === LABELS.length) {
    out.push(`${path}: no contract block at all — the four labelled lines are the agent's return, and this artefact carries none`)
    return out
  }
  for (const l of missing) {
    out.push(`${path}: contract block is missing its ${l} line${l === "PROMOTE" ? ' — "PROMOTE: none" is a line, and its ABSENCE is the failure this check exists to separate from it' : ""}`)
  }

  // Anchor: a machinery map is a grounding claim, so an artefact with no anchor is itself a finding.
  if (!/^\s*anchor:.*\bcommit=/m.test(text)) {
    out.push(`${path}: no anchor line carrying a commit — an unanchored observation is a finding, not a fact`)
  }

  // Capture the WHOLE line, not the first token. Matching `(\S+)` reads the spine's placeholder
  // `proceed | stop | decision-needed` as a valid `proceed` and waves an unfilled template through
  // — which is exactly the case below, and it is why this is captured greedily.
  const verdict = text.match(/^\s*VERDICT:\s*(.+?)\s*$/m)
  if (verdict) {
    const v = verdict[1]
    if (v.includes("|")) {
      // The template shipped in the spine has `|`-separated placeholders. An artefact echoing them
      // back copied the block without filling it in, which passes every label test above.
      out.push(`${path}: VERDICT still holds the spine's placeholder ("${v}") — the block was copied, not filled in`)
    } else if (!VERDICTS.has(v)) {
      out.push(`${path}: VERDICT is "${v}" — must be one of ${[...VERDICTS].join(", ")}`)
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
    "VERDICT:   proceed",
    "ARTEFACT:  .claude/handoff/m-041/01-grounder.md",
    "SUMMARY:   Mapped. Buildable as specified. 12 sites, 2 need a naming call.",
    "PROMOTE:   none",
    "",
  ].join("\n")

  ok(checkArtefact("a.md", GOOD).length === 0,
    "KNOWN-GOOD: a well-formed artefact with PROMOTE: none is clean")

  // THE distinction. Both of these have "no promotion" as the outcome; only one is a defect.
  ok(checkArtefact("a.md", GOOD.replace(/^PROMOTE:.*$/m, "")).some((f) => f.includes("PROMOTE")),
    "a MISSING PROMOTE line fires — it is a contract failure")
  ok(!checkArtefact("a.md", GOOD).some((f) => f.includes("PROMOTE")),
    "…and a PRESENT `PROMOTE: none` does NOT fire — the considered answer is the normal one")

  ok(checkArtefact("a.md", GOOD.replace(/^SUMMARY:.*$/m, "")).some((f) => f.includes("SUMMARY")),
    "a missing SUMMARY line fires")
  ok(checkArtefact("a.md", "# Just a map\n\n## 1. Machinery map\nstuff\n").some((f) => f.includes("no contract block at all")),
    "an artefact with NO block at all fires once, not four times")
  ok(checkArtefact("a.md", GOOD.replace(/^anchor:.*$/m, "")).some((f) => f.includes("anchor")),
    "a missing anchor fires — an unanchored observation is a finding")
  ok(checkArtefact("a.md", GOOD.replace("VERDICT:   proceed", "VERDICT:   looks-fine")).some((f) => f.includes("must be one of")),
    "an invented VERDICT value fires")
  ok(checkArtefact("a.md", GOOD.replace("VERDICT:   proceed", "VERDICT:   proceed | stop | decision-needed")).some((f) => f.includes("placeholder")),
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

  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — fires on a missing or unfilled block, quiet on a well-formed one")
  process.exit(failed ? 1 : 0)
}

if (isEntry && !process.argv.includes("--selftest")) {
  const files = artefacts(ROOT)
  const findings = files.flatMap((f) => checkArtefact(f.replace(ROOT + "/", ""), readFileSync(f, "utf8")))

  if (findings.length) {
    console.error(`\n❌ handoff-contract: ${findings.length} finding(s) across ${files.length} artefact(s)\n`)
    for (const f of findings) console.error(`   ${f}`)
    console.error("")
    process.exit(1)
  }
  // The denominator is printed deliberately: this directory is task-scoped scratch and is empty on
  // a clean tree, so "0 artefacts" has to be VISIBLE rather than read as "all artefacts passed".
  console.log(`🤝 handoff-contract: ${files.length} artefact(s) carry a well-formed contract block`)
}
