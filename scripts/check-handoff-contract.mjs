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
 * SCOPE AND ITS HONEST LIMIT: `.handoff/` is gitignored and `/wrap` clears it, so on a clean
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
const HANDOFF = "/.handoff"

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
 *
 * WIDENED 2026-08-21, and the LAG IS THE LESSON. Step 5 bumped census/walker/db-inspector/
 * implementer to spines that carry the block — and did not touch this set, so for the whole of that
 * rollout the check reported green having validated one agent's artefacts and skipped everyone
 * else's. The rule above ("same commit that ships its spine") was written precisely to prevent that
 * and was not followed by the person who wrote it. What made it recoverable was the OTHER half of
 * the design: skipped artefacts are named on every run, so the hole was legible in the output
 * rather than inferable only from the source. A boundary that widens by hand needs a loud skip
 * list, because the widening WILL be forgotten.
 *
 * `crawler-doctrine` is deliberately absent and is NOT a lag: its stdout is parsed as a single JSON
 * object, so a trailing fenced block would break the parse. That exemption is written into its
 * spine so a later reader does not close it as a gap. `main` is likewise absent — the main session
 * has no spine to carry the rule, and `NN-main.md` files are its own notes.
 */
export const CONTRACT_AGENTS = new Set(["grounder", "census", "walker", "db-inspector", "implementer"])

/**
 * Agents whose spine specifies the machine-readable ANCHOR LINE. A NARROWER set than the one above,
 * and the split is the point.
 *
 * Widening `CONTRACT_AGENTS` in one move switched on TWO assertions, not one — the contract block
 * (which step 5 did splice into four more spines) and the anchor line (which it did not). Only
 * `grounder.spine.md` carries the `anchor: task=… · agent=… · utc=… · commit=…` template; the other
 * four say to anchor and never give the syntax, so their agents anchor in PROSE ("Commit anchor:
 * a5b6f541") and fail a check that greps for the line. Verified 2026-08-21 by grepping all five
 * canon spines: grounder 1 hit, census/walker/db-inspector/implementer 0 each.
 *
 * Enforcing it on them anyway would be the P2 SWEEP incident again, one paragraph after this file
 * describes it: a rule cannot be enforced on an agent that was never told it. So the rule SPLITS
 * rather than being qualified — the covered half is enforced for all five, the uncovered half is
 * enforced for grounder and named here for the rest.
 *
 * CLEARED 2026-08-21, IN THE SAME CHANGE, exactly as the condition above required. census v8,
 * walker v6, db-inspector v4 and implementer v4 each gained the literal anchor template and were
 * propagated to this project; the two sets are now identical and this one is kept as a separate
 * name rather than folded away, because the split is what the next rollout will need. Whoever adds
 * a seventh agent adds it to CONTRACT_AGENTS when its spine carries the block, and to this set
 * when its spine carries the anchor line — which may not be the same commit.
 *
 * The lag this closed lasted one session and was found only because the check NAMES what it skips.
 * That is the transferable part: a hand-widened boundary will be forgotten, so it must be loud.
 */
export const ANCHOR_AGENTS = new Set(["grounder", "census", "walker", "db-inspector", "implementer"])

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
 *
 * `[ \t]` THROUGHOUT, never `\s`. Two reasons, and the first was found by a probe rather than by
 * reading:
 *   1. QUADRATIC. `^\s*` under /m re-consumes the whole trailing newline run at every line start —
 *      a 60k-blank-line artefact took 20 SECONDS here, and this runs once per label. `sonarjs/
 *      super-linear-regex` did not flag it and could not: the pattern is assembled through
 *      `new RegExp`, and the rule reads regex LITERALS. The control is aimed at the spelling, not
 *      at the class, so a dynamically built pattern is invisible to it — worth knowing before
 *      trusting a green run of that rule anywhere.
 *   2. CORRECTNESS. `\s{2,}` as the column separator could cross a newline and read the NEXT line's
 *      text as this label's value, turning a malformed block into a plausible one. The separator is
 *      a run of spaces on one line, which is what `[ \t]{2,}` says.
 */
const valueOf = (text, l) => (text.match(new RegExp(`^[ \\t]*${l}[ \\t]{2,}(.+?)[ \\t]*$`, "m")) ?? [])[1]

/**
 * Validate one artefact's trailing contract block. Returns findings, empty when well-formed.
 *
 * Deliberately tolerant about WHERE the block sits (last section, not last byte) and strict about
 * WHAT it contains. An agent that adds a trailing newline or a closing fence has not broken the
 * contract; an agent that drops Promote has.
 */
export function checkArtefact(path, text, enforceAnchor = true) {
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
  // Gated on ANCHOR_AGENTS — see its comment. The default is ENFORCE, so a caller that forgets to
  // pass the flag over-checks rather than under-checks.
  // `[ \t]*`, NOT `\s*`. Under /m, `\s` includes `\n`, so `^\s*` could anchor at one line start and
  // consume an entire run of blank lines before reaching `anchor:` — n line starts × n whitespace
  // chars, quadratic on an artefact with a large blank region. Agent-written text is the least
  // controlled input this file sees, which is why this one is bounded and the ones in `scripts/`
  // that parse the repo's own tracked files are baselined instead.
  // ONE CLAIM IN THE RULING DOES NOT SURVIVE CHECKING, and it is recorded rather than repeated: the
  // cross-line match is real but OUTCOME-EQUIVALENT. Any position `\s*` can reach by crossing
  // newlines is itself a line start, and `.*` cannot cross one, so the boolean result was never
  // different. The quadratic is the whole of the defect here.
  if (enforceAnchor && !/^[ \t]*anchor:.*\bcommit=/m.test(text)) {
    out.push(`${path}: no anchor line carrying a commit — an unanchored observation is a finding, not a fact`)
  }

  // An UNFILLED template passes every label test above — every line is present, it just says
  // `<pipeline id from the brief>`. Angle-bracket placeholders are the tell, and they are checked on
  // every line rather than only the verdict, because v5's placeholders are not all pipe-separated.
  // A bare `—` is NOT a placeholder: it is the specified value for "the brief named no pipeline".
  for (const l of LABELS) {
    const v = valueOf(text, l)
    // BOUNDED at 200. `<[^>]+>` is the classic unclosed-delimiter quadratic: on a run of `<` with
    // no `>`, every start position consumes the tail and backtracks a character at a time. ASCII
    // art, a diagram, or a nested generic in an agent's artefact produces exactly that run. No
    // real placeholder is 200 characters, and the probes assert both halves — a normal placeholder
    // still fires, and a 40k-`<` artefact stays linear.
    if (v !== undefined && /<[^>]{1,200}>/.test(v)) {
      out.push(`${path}: ${l} still holds the spine's placeholder ("${v}") — the block was copied, not filled in`)
    }
  }

  const verdict = valueOf(text, "Verdict")
  if (verdict !== undefined && !/<[^>]{1,200}>/.test(verdict)) {   // bounded — see the note above
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
    "Artefact   .handoff/m-041/01-grounder.md",
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

  // The anchor split, both directions. The uncovered half must be provably quiet, or the split is
  // just a comment; the covered half must still fire, or widening ANCHOR_AGENTS would prove nothing.
  ok(!checkArtefact("a.md", GOOD.replace(/^anchor:.*$/m, ""), false).some((f) => f.includes("anchor")),
    "…and is SILENT for a spine that never specified the anchor line — the split, not a qualified tag")
  ok(checkArtefact("a.md", GOOD.replace(/^anchor:.*$/m, ""), false).length === 0,
    "…while that same artefact is otherwise fully checked — the split withholds one assertion, not the check")
  // SUBSET, not STRICT subset. The first version of this probe asserted `<` and broke the moment
  // the anchor rollout caught up — encoding a transient rollout state as an invariant. The real
  // invariant is containment: an anchor rule on an agent whose artefacts are never checked would be
  // unreachable, and that holds whether the sets are equal or not.
  ok([...ANCHOR_AGENTS].every((a) => CONTRACT_AGENTS.has(a)),
    "ANCHOR_AGENTS ⊆ CONTRACT_AGENTS — an anchor rule on an unenforced agent would be unreachable")

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
  // Built from ONE segment, not `join(tmp, ".claude", "handoff", …)`. The 2026-08-21 move of the
  // handoff root out of `.claude/` swept every string literal in the repo and missed this fixture
  // precisely because the path was assembled from parts — and this probe is what caught it. A
  // fixture that spells its path differently from production is a fixture that can drift silently.
  mkdirSync(join(tmp, ".handoff", "m-041"), { recursive: true })
  writeFileSync(join(tmp, ".handoff", "m-041", "01-grounder.md"), GOOD)
  writeFileSync(join(tmp, ".handoff", "m-041", "notes.md"), "scratch, not an artefact")
  ok(artefacts(tmp).length === 1, "discovery finds NN-<agent>.md and ignores scratch files beside it")
  ok(artefacts(join(tmp, "nope")).length === 0, "a tree with no handoff directory yields nothing rather than throwing")
  rmSync(tmp, { recursive: true, force: true })

  // The rollout boundary, probed in BOTH directions. A boundary that only ever lets things through
  // is indistinguishable from a disabled check.
  ok(agentOf(".handoff/t/01-grounder.md") === "grounder", "agentOf reads the agent out of the filename")
  ok(agentOf(".handoff/t/03-db-inspector.md") === "db-inspector", "…including a hyphenated agent name")
  ok(agentOf("notes.md") === null, "…and returns null rather than guessing when the name does not parse")

  const P = (n) => `.handoff/t/${n}`
  const split = partition([
    P("01-grounder.md"), P("02-census.md"), P("03-walker.md"),
    P("04-db-inspector.md"), P("05-implementer.md"),
    P("06-crawler-doctrine.md"), P("07-main.md"),
  ])
  ok(split.enforced.length === 5,
    "MUST ENFORCE — all five spines that carry the block post-step-5, not just grounder")
  ok(["grounder", "census", "walker", "db-inspector", "implementer"].every((a) => split.enforced.some((p) => agentOf(p) === a)),
    "…and each of the five is named individually, so dropping one from the set fails here rather than silently narrowing the aperture")

  // The boundary must still EXCLUDE something, or it has stopped being a boundary and these probes
  // have stopped testing one. Both exclusions are permanent by design, not lag.
  ok(split.skipped.length === 2,
    "MUST SKIP — crawler-doctrine (stdout is parsed JSON; a fenced block breaks it) and main (no spine)")
  ok(split.skipped.some((p) => agentOf(p) === "crawler-doctrine") && split.skipped.some((p) => agentOf(p) === "main"),
    "…and they are those two specifically — a skip list that drifted to something else is not this exemption")

  // The honest cost of the boundary, asserted rather than left implicit: a skipped artefact is not
  // checked AT ALL, so a malformed block in one is invisible. This probe exists so that the day a
  // spine is added to CONTRACT_AGENTS, the person doing it sees what they are switching on.
  ok(partition([P("06-crawler-doctrine.md")]).enforced.length === 0,
    "a crawler-doctrine artefact is skipped even when it DOES carry a block — the boundary is by agent, not by content")

  // ── ReDoS bounds, both directions ────────────────────────────────────────────────────────────
  // These three patterns run over AGENT-WRITTEN artefacts. The other 22 `super-linear-regex` sites
  // in `scripts/` parse the repo's own tracked files and are baselined as debt; these were fixed,
  // because the input is the one an agent composes freely.
  //
  // The second half is the half that matters: a bound that breaks the match is a silently disabled
  // check, which is the failure this repo keeps finding. So the fixture asserts the placeholder
  // still fires FIRST, and the timing assertion second.
  ok(checkArtefact("a.md", GOOD.replace("Promote    none", "Promote    <what to promote>")).some((f) => f.includes("placeholder")),
    "KNOWN-GOOD: an ordinary placeholder still fires with the 200-char bound in place")
  ok(checkArtefact("a.md", GOOD.replace("Promote    none", `Promote    <${"x".repeat(199)}>`)).some((f) => f.includes("placeholder")),
    "…and one exactly at the bound still fires")
  // THE HONEST COST, asserted rather than left implicit: past 200 chars a placeholder is no longer
  // detected. That is the price of the bound and it is cheap — the spine's longest real placeholder
  // is 31 characters — but it is a real aperture, and a probe is where a cost like this stays visible.
  ok(!checkArtefact("a.md", GOOD.replace("Promote    none", `Promote    <${"x".repeat(201)}>`)).some((f) => f.includes("placeholder")),
    "…and one PAST the bound does not — the aperture the bound buys, stated")

  const timed = (text) => {
    const t0 = process.hrtime.bigint()
    checkArtefact("a.md", text)
    return Number(process.hrtime.bigint() - t0) / 1e6
  }
  // Measured on this machine 2026-08-22, each pattern in isolation on its own fixture:
  //   <[^>]+>   120k '<'      5850ms   →  <[^>]{1,200}>        58ms   (100×)
  //   ^\s*…     60k newlines  1871ms   →  ^[ \t]*…              0ms
  //   valueOf   60k newlines  1837ms   →  [ \t] throughout      0ms
  // The 500ms threshold sits an order of magnitude either side, so this is not a timing-flake test:
  // reverting any one bound fails it by a wide margin. The blank-region fixture ran 20,316ms end to
  // end before `valueOf` was fixed, which is how that second pattern was found at all.
  const bracketMs = timed(GOOD.replace("Promote    none", `Promote    ${"<".repeat(120_000)}`))
  ok(bracketMs < 500, `a 120k-'<' run with no '>' completes in ${bracketMs.toFixed(0)}ms — bounded, not quadratic`)
  const blankMs = timed(`${"\n".repeat(60_000)}anchor: task=t · commit=abc1234\n${GOOD}`)
  ok(blankMs < 500, `a 60k-newline blank region completes in ${blankMs.toFixed(0)}ms — [ \\t]* cannot cross lines`)

  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — fires on a missing, unfilled or self-contradicting block, quiet on a well-formed one, and enforces only the spines that carry it")
  process.exit(failed ? 1 : 0)
}

if (isEntry && !process.argv.includes("--selftest")) {
  const { enforced, skipped } = partition(artefacts(ROOT))
  const findings = enforced.flatMap((f) =>
    checkArtefact(f.replace(ROOT + "/", ""), readFileSync(f, "utf8"), ANCHOR_AGENTS.has(agentOf(f))))

  // Named before the verdict, pass or fail. An artefact outside the rollout boundary is a thing the
  // check DID NOT LOOK AT, and a reader has to see that without reading the source.
  if (skipped.length) {
    console.log(`   not checked — no contract block required of this writer (crawler-doctrine: stdout is parsed JSON; main: no spine):`)
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
