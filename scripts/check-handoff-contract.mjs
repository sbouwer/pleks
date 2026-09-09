#!/usr/bin/env node
/**
 * scripts/check-handoff-contract.mjs — every handoff artefact carries a well-formed contract block.
 *
 * @kit check-handoff-contract v3 — tracked. Edit it in dev-standards and re-adopt; a local
 * change here is a fork, and `check-kit-drift.mjs` will say so.
 *
 * PORTED FROM `pleks/scripts/check-handoff-contract.mjs`. It arrives because of dev-standards
 * **L-63** — *"the propagation unit is the contract, not the files that changed"* — and because
 * this project was, until now, a live instance of exactly the failure L-63 records against
 * life-therapy: **all six spines here carry the return-contract block and nothing in the repo read
 * any of it.** The gate was green, every spine matched canon, and `check-agent-spines.mjs` passed,
 * because spines matching canon is what that checks. The defect is invisible from the authoring
 * seat — whoever writes a propagation list has the mechanism in their own tree.
 *
 * WHY THE BLOCK NEEDS A CHECK AT ALL: the return contract (4-AGENT-PIPELINES §3) is emitted to the
 * caller through the transcript, and nothing can inspect a transcript after the fact. An agent that
 * returns bullets of its own devising instead is a silent failure. So the spine also requires the
 * block as the artefact's FINAL section, on disk, where a check can reach it.
 *
 * THE MISSING-vs-NONE DISTINCTION IS THE POINT. `Promote    none` is a considered result and the
 * normal one for an entry agent; an ABSENT Promote line is a contract failure. Collapsing them
 * deletes the only signal this file carries.
 *
 * THE GLYPH IS DELIBERATE REDUNDANCY. The verdict line carries both a glyph and a word, and this
 * check asserts they agree. A verdict whose gloss contradicts its own state ("⛔ proceed") is a real
 * failure and is invisible in a bare word.
 *
 * ⚠ THE GLYPH SET IS READ OFF THE SPINES, NOT OFF THE PLAYBOOK, and they disagree — found while
 * porting this file, 2026-08-30. `kit/agents/grounder.spine.md` line 212 specifies
 * `✅ proceed` · `⚠️ decision-needed` · `⛔ stop` and says "there is no fourth pair"; all six spines
 * here ship that form. `playbooks/4-AGENT-PIPELINES.md` §3's worked examples use
 * `✅ Proceed` · `⏸ Decision needed` · `🛑 Stop` — three of six glyphs different, and capitalised.
 * Anyone learning the protocol from the playbook writes a block this check rejects. The spine wins
 * because the spine is what reaches the agent; the playbook is being corrected upstream.
 *
 * SCOPE AND ITS HONEST LIMIT: `.handoff/` is gitignored, so on a clean tree this validates ZERO
 * files and passes. A check that cannot fire is usually a defect; here it is the design, because
 * the directory is task-scoped scratch. The mitigations are that the live run REPORTS its
 * denominator — so "0 artefacts" is visible rather than implied — and that `--selftest` carries the
 * real fixtures in both directions.
 *
 * Run: node scripts/check-handoff-contract.mjs             (wired into `npm run check`)
 *      node scripts/check-handoff-contract.mjs --selftest  (probes both directions)
 */
import { readdirSync, readFileSync, statSync, existsSync, realpathSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/");
const HANDOFF = "/.handoff";

/**
 * The five labels, in the order the block prints them. Order is part of the contract — a human
 * scans the column, and `Agent`/`Verdict` are what they scan for first.
 */
const LABELS = ["Agent", "Verdict", "Summary", "Artefact", "Promote"];

/** Glyph → the verdict word it must accompany. There is no fourth pair. See the header note. */
const GLYPHS = { "✅": "proceed", "⚠": "decision-needed", "⛔": "stop" };
const VERDICTS = new Set(Object.values(GLYPHS));

/**
 * Agents whose SPINE emits the contract block. The check enforces it only for these, because a rule
 * cannot be enforced on an agent that was never told it.
 *
 * This is a rollout boundary, not an exemption: it WIDENS as spines gain the block, and every agent
 * added here must be added in the same commit that ships its spine. Skipped artefacts are NAMED on
 * every run — a hand-widened boundary WILL be forgotten, so it must be loud. That is the half of
 * the upstream design that made its own one-session lag recoverable.
 *
 * `crawler-doctrine` is deliberately absent and is NOT lag: its stdout is parsed as a single JSON
 * object, so a trailing fenced block would break the parse. Its spine says so under "Why you carry
 * no return-contract block, when every other agent does", so a later reader does not close it as a
 * gap. `main` is likewise absent — the main session has no spine, and `NN-main.md` is its own notes.
 */
export const CONTRACT_AGENTS = new Set(["grounder", "census", "walker", "db-inspector", "implementer"]);

/**
 * Agents whose spine specifies the machine-readable ANCHOR LINE. Kept as a separate name from the
 * set above even though the two are currently identical, because the split is what the next rollout
 * needs: upstream, widening one set switched on TWO assertions and four spines anchored in prose
 * against a check that greps for a line. The two sets are read independently, so an agent can
 * carry the block without the anchor line and the finding names which of the two it failed.
 */
export const ANCHOR_AGENTS = new Set(["grounder", "census", "walker", "db-inspector", "implementer"]);

/** Every `NN-<agent>.md` under a handoff root. Non-recursive past the task-slug level, by design. */
export function artefacts(root) {
  const base = `${root}${HANDOFF}`;
  if (!existsSync(base)) return [];
  const out = [];
  for (const slug of readdirSync(base)) {
    const dir = join(base, slug);
    try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
    for (const f of readdirSync(dir)) {
      if (/^\d{2}-[a-z-]+\.md$/.test(f)) out.push(join(dir, f).replace(/\\/g, "/"));
    }
  }
  return out.sort();
}

/** The agent name a `NN-<agent>.md` filename encodes, or null if the name does not parse. */
export function agentOf(path) {
  const m = /\/\d{2}-([a-z-]+)\.md$/.exec(path.replace(/\\/g, "/"));
  return m ? m[1] : null;
}

/** Split discovered artefacts into the ones the contract applies to and the ones it does not. */
export function partition(paths) {
  const enforced = [], skipped = [];
  for (const p of paths) (CONTRACT_AGENTS.has(agentOf(p)) ? enforced : skipped).push(p);
  return { enforced, skipped };
}

/**
 * Read one label's value. The block is column-aligned, so the separator is a RUN OF SPACES, not a
 * colon. Captured to end of line: matching `(\S+)` would read an unfilled placeholder's first token
 * as a valid value and wave the whole template through.
 *
 * `[ \t]` THROUGHOUT, never `\s`, and both reasons are load-bearing:
 *   1. QUADRATIC. `^\s*` under /m re-consumes the whole trailing newline run at every line start —
 *      upstream measured a 60k-blank-line artefact at 20 SECONDS, and this runs once per label.
 *   2. CORRECTNESS. `\s{2,}` as the column separator could cross a newline and read the NEXT line's
 *      text as this label's value, turning a malformed block into a plausible one.
 */
const valueOf = (text, l) => (text.match(new RegExp(`^[ \\t]*${l}[ \\t]{2,}(.+?)[ \\t]*$`, "m")) ?? [])[1];

/** Parse cap — refusing beats truncating; see the block in `checkArtefact`. */
const MAX_ARTEFACT_BYTES = 1024 * 1024;

/**
 * Validate one artefact's trailing contract block. Returns findings, empty when well-formed.
 *
 * Deliberately tolerant about WHERE the block sits (last section, not last byte) and strict about
 * WHAT it contains. An agent that adds a trailing newline has not broken the contract; an agent
 * that drops Promote has.
 */
export function checkArtefact(path, text, enforceAnchor = true) {
  const out = [];

  // Every bound below is per-pattern: each says "this regex stays linear", none says anything about
  // the SUM. `checkArtefact` runs ~8 passes over `text`, so a 200MB artefact is slow at linear time
  // — bounded complexity and bounded work are different claims. The producer is an AGENT, the least
  // controlled input this file sees. This is a REFUSAL, not a truncation: truncating would report a
  // well-formed contract for a file whose block sits past the cut, a false PASS on the exact input
  // that tripped the cap.
  if (text.length > MAX_ARTEFACT_BYTES) {
    out.push(
      `${path}: artefact is ${(text.length / 1024 / 1024).toFixed(1)}MB, over the ${MAX_ARTEFACT_BYTES / 1024 / 1024}MB parse cap — not parsed. ` +
      `A handoff artefact is prose around a few hundred bytes of contract block; this size means a runaway writer or a pasted binary.`,
    );
    return out;
  }

  const missing = LABELS.filter((l) => valueOf(text, l) === undefined);
  if (missing.length === LABELS.length) {
    out.push(`${path}: no contract block at all — the labelled lines are the agent's return, and this artefact carries none`);
    return out;
  }
  for (const l of missing) {
    out.push(`${path}: contract block is missing its ${l} line${l === "Promote" ? ' — "Promote    none" is a line, and its ABSENCE is the failure this check exists to separate from it' : ""}`);
  }

  // An artefact is a grounding claim, so an unanchored one is itself a finding (CLAUDE.md §8).
  // `[ \t]*`, NOT `\s*` — under /m, `\s` includes `\n`, so `^\s*` could consume an entire run of
  // blank lines before reaching `anchor:`: n line starts × n whitespace chars.
  //
  // THE QUALIFIER IS OPTIONAL, AND IT WAS ADDED BECAUSE v2 REJECTED A BETTER ANCHOR (v3,
  // 2026-09-09). The first real pipeline artefact this check ever saw in life-therapy was a
  // CROSS-REPO grounding run — one agent reading two repos — and it anchored both:
  //
  //     anchor: … · commit(life-therapy)=b0873a1 · commit(yoros)=7e9f127
  //
  // v2 required a literal `commit=` and fired `no anchor line carrying a commit` on an artefact
  // carrying two. The agent had done MORE than the template asks; the check read it as having done
  // nothing. That direction is the dangerous one: the finding names the agent, so the obvious
  // reading is that the agent misbehaved, and the obvious fix is to make it write a weaker anchor.
  //
  // The general form is L-75 from the other side. L-75 is a gate whose substring test matches the
  // NEIGHBOUR; this is a requirement whose exact-string test misses the SPECIALISATION. Both come
  // from spelling a pattern for the one example in front of you, and a requirement that only
  // accepts the reference spelling silently forbids every legitimate extension of it.
  //
  // BOUNDED at 64 and `[^)]`, deliberately: an unbounded `\(.*\)` inside a `.*` is the classic
  // nested-quantifier backtrack, and the input here is agent-written prose. A repo name is not 64
  // characters. `commitment=` does NOT satisfy this — `\bcommit` matches, the optional group is
  // absent, and the next character must be `=`; a probe below asserts that in both directions,
  // because the neighbour-match is the failure this pattern's own lesson is about.
  if (enforceAnchor && !/^[ \t]*anchor:.*\bcommit(?:\([^)]{1,64}\))?=/m.test(text)) {
    out.push(`${path}: no anchor line carrying a commit — an unanchored observation is a finding, not a fact`);
  }

  // An UNFILLED template passes every label test above — every line is present, it just says
  // `<pipeline id from the brief>`. A bare `—` is NOT a placeholder: it is the specified value for
  // "the brief named no pipeline". BOUNDED at 200: `<[^>]+>` is the classic unclosed-delimiter
  // quadratic, and ASCII art or a nested generic produces exactly that run of `<`.
  for (const l of LABELS) {
    const v = valueOf(text, l);
    if (v !== undefined && /<[^>]{1,200}>/.test(v)) {
      out.push(`${path}: ${l} still holds the spine's placeholder ("${v}") — the block was copied, not filled in`);
    }
  }

  const verdict = valueOf(text, "Verdict");
  if (verdict !== undefined && !/<[^>]{1,200}>/.test(verdict)) {
    // Strip the variation selector: ⚠️ is ⚠ + U+FE0F, and only one of those spellings is typed.
    const v = verdict.replace(/️/g, "");
    const glyph = Object.keys(GLYPHS).find((g) => v.startsWith(g));
    const word = [...VERDICTS].find((w) => new RegExp(`\\b${w}\\b`).test(v));
    if (!glyph) out.push(`${path}: Verdict "${verdict}" carries no state glyph — must open with ${Object.keys(GLYPHS).join(" ")}`);
    if (!word) out.push(`${path}: Verdict "${verdict}" names no state — must be one of ${[...VERDICTS].join(", ")}`);
    if (glyph && word && GLYPHS[glyph] !== word) {
      out.push(`${path}: Verdict glyph and word disagree — "${glyph}" means ${GLYPHS[glyph]}, the line says ${word}`);
    }
  }
  return out;
}

const isEntry = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isEntry && process.argv.includes("--selftest")) {
  let failed = 0;
  const ok = (c, l) => { if (!c) failed++; console.log(`  ${c ? "✓" : "✗"} ${l}`); };

  const GOOD = [
    "anchor: task=redirect-map · agent=grounder · utc=2026-08-30T09:14:02Z · commit=93b9437",
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
    "Artefact   .handoff/redirect-map/01-grounder.md",
    "Promote    none",
    "```",
    "",
  ].join("\n");

  ok(checkArtefact("a.md", GOOD).length === 0, "KNOWN-GOOD: a well-formed block with Promote none is clean");

  // THE distinction. Both have "no promotion" as the outcome; only one is a defect.
  ok(checkArtefact("a.md", GOOD.replace(/^Promote.*$/m, "")).some((f) => f.includes("Promote")),
    "a MISSING Promote line fires — it is a contract failure");
  ok(!checkArtefact("a.md", GOOD).some((f) => f.includes("Promote")),
    "…and a PRESENT `Promote    none` does NOT fire — the considered answer is the normal one");

  ok(checkArtefact("a.md", GOOD.replace(/^Summary.*$/m, "")).some((f) => f.includes("Summary")), "a missing Summary line fires");
  ok(checkArtefact("a.md", GOOD.replace(/^Agent.*$/m, "")).some((f) => f.includes("Agent")), "a missing Agent routing line fires");
  ok(checkArtefact("a.md", GOOD.replace("grounder · P1 · step 1 of 3", "grounder · — · —")).length === 0,
    "KNOWN-GOOD: `—` in the routing slots is the SPECIFIED value when the brief named none, not a placeholder");

  ok(checkArtefact("a.md", "# Just a map\n\n## 1. Machinery map\nstuff\n").some((f) => f.includes("no contract block at all")),
    "an artefact with NO block at all fires once, not five times");
  ok(checkArtefact("a.md", GOOD.replace(/^anchor:.*$/m, "")).some((f) => f.includes("anchor")),
    "a missing anchor fires — an unanchored observation is a finding");

  // ── The qualified commit key (v3) ────────────────────────────────────────────────────────────
  // The KNOWN-GOOD is the load-bearing half here: v2 passed every probe it had while rejecting a
  // real artefact, because nothing exercised an anchor RICHER than the template's.
  {
    const twoRepos = GOOD.replace(
      "commit=93b9437",
      "commit(life-therapy)=b0873a1 · commit(yoros)=7e9f127");
    ok(!checkArtefact("a.md", twoRepos).some((f) => f.includes("anchor")),
      "KNOWN-GOOD: a CROSS-REPO anchor naming a commit per repo passes — the artefact v2 rejected");
    ok(checkArtefact("a.md", twoRepos).length === 0,
      "…and is otherwise clean, so the qualifier did not merely move the failure elsewhere");
    ok(!checkArtefact("a.md", GOOD).some((f) => f.includes("anchor")),
      "KNOWN-GOOD: the plain unqualified `commit=` still passes — the qualifier is optional");

    // The neighbour, which is the whole reason the qualifier is a bounded group and not `.*`.
    ok(checkArtefact("a.md", GOOD.replace("commit=93b9437", "commitment=high")).some((f) => f.includes("anchor")),
      "`commitment=` does NOT satisfy the anchor — a requirement that matches its own neighbour is L-75 inverted");
    ok(checkArtefact("a.md", GOOD.replace("commit=93b9437", "committed to=93b9437")).some((f) => f.includes("anchor")),
      "…nor does a word that merely starts with `commit` and then drifts");
    ok(checkArtefact("a.md", GOOD.replace("commit=93b9437", "commit(unclosed=93b9437")).some((f) => f.includes("anchor")),
      "…nor an UNCLOSED qualifier — `[^)]{1,64}` requires the bracket to shut, not just to open");

    // An anchor line that exists and carries no commit at all must still fire: the line's presence
    // is not the claim, the commit is. This is the case a looser `anchor:.*` would wave through.
    ok(checkArtefact("a.md", GOOD.replace(/^anchor:.*$/m, "anchor: task=t · agent=grounder")).some((f) => f.includes("anchor")),
      "an anchor line with NO commit key still fires — the commit is the claim, not the label");
  }

  // The anchor split, both directions.
  ok(!checkArtefact("a.md", GOOD.replace(/^anchor:.*$/m, ""), false).some((f) => f.includes("anchor")),
    "…and is SILENT for a spine that never specified the anchor line — the split, not a qualified tag");
  ok(checkArtefact("a.md", GOOD.replace(/^anchor:.*$/m, ""), false).length === 0,
    "…while that same artefact is otherwise fully checked — the split withholds one assertion, not the check");
  // SUBSET, not STRICT subset: encoding a transient rollout state as an invariant is how the
  // upstream version of this probe broke the moment the rollout caught up.
  ok([...ANCHOR_AGENTS].every((a) => CONTRACT_AGENTS.has(a)),
    "ANCHOR_AGENTS ⊆ CONTRACT_AGENTS — an anchor rule on an unenforced agent would be unreachable");

  // The glyph pair, both directions — and the spine's vocabulary, not the playbook's.
  ok(checkArtefact("a.md", GOOD.replace("✅ proceed — nothing to decide", "⛔ proceed — nothing to decide")).some((f) => f.includes("disagree")),
    "a glyph contradicting its own word fires — the whole reason the state is encoded twice");
  ok(checkArtefact("a.md", GOOD.replace("✅ proceed — nothing to decide", "⚠️ decision-needed — one call for Main")).length === 0,
    "KNOWN-GOOD: ⚠️ with its variation selector pairs with decision-needed and is clean");
  ok(checkArtefact("a.md", GOOD.replace("✅ proceed — nothing to decide", "proceed")).some((f) => f.includes("no state glyph")),
    "a bare word with no glyph fires");
  ok(checkArtefact("a.md", GOOD.replace("✅ proceed — nothing to decide", "✅ looks-fine")).some((f) => f.includes("names no state")),
    "an invented verdict word fires");
  // The playbook's own worked example must fail against the spine's vocabulary. This probe is the
  // canon divergence recorded in the header, asserted rather than described — if the playbook is
  // corrected upstream and the spine changes with it, this is the probe that goes red and says so.
  ok(checkArtefact("a.md", GOOD.replace("✅ proceed — nothing to decide", "⏸ Decision needed — 2 of 12 sites")).some((f) => f.includes("no state glyph")),
    "playbook §3's `⏸ Decision needed` is NOT the spine's vocabulary — the divergence, asserted");

  ok(checkArtefact("a.md", GOOD.replace("grounder · P1 · step 1 of 3", "grounder · <pipeline id from the brief> · step <N> of <M>")).some((f) => f.includes("placeholder")),
    "an UNFILLED template echoed back fires — it passes every label test and is still not a report");

  // Discovery, walked for real.
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const tmp = mkdtempSync(join(tmpdir(), "handoff-")).replace(/\\/g, "/");
  // Built from ONE segment, deliberately: upstream, a fixture assembled from parts survived a move
  // of the handoff root and silently stopped matching production.
  mkdirSync(join(tmp, ".handoff", "redirect-map"), { recursive: true });
  writeFileSync(join(tmp, ".handoff", "redirect-map", "01-grounder.md"), GOOD);
  writeFileSync(join(tmp, ".handoff", "redirect-map", "notes.md"), "scratch, not an artefact");
  ok(artefacts(tmp).length === 1, "discovery finds NN-<agent>.md and ignores scratch files beside it");
  ok(artefacts(join(tmp, "nope")).length === 0, "a tree with no handoff directory yields nothing rather than throwing");
  rmSync(tmp, { recursive: true, force: true });

  ok(agentOf(".handoff/t/01-grounder.md") === "grounder", "agentOf reads the agent out of the filename");
  ok(agentOf(".handoff/t/03-db-inspector.md") === "db-inspector", "…including a hyphenated agent name");
  ok(agentOf("notes.md") === null, "…and returns null rather than guessing when the name does not parse");

  const P = (n) => `.handoff/t/${n}`;
  const split = partition([
    P("01-grounder.md"), P("02-census.md"), P("03-walker.md"),
    P("04-db-inspector.md"), P("05-implementer.md"),
    P("06-crawler-doctrine.md"), P("07-main.md"),
  ]);
  ok(split.enforced.length === 5, "MUST ENFORCE — all five spines that carry the block");
  ok(["grounder", "census", "walker", "db-inspector", "implementer"].every((a) => split.enforced.some((p) => agentOf(p) === a)),
    "…and each of the five is named individually, so dropping one fails here rather than silently narrowing the aperture");
  // The boundary must still EXCLUDE something, or it has stopped being a boundary.
  ok(split.skipped.length === 2, "MUST SKIP — crawler-doctrine (stdout is parsed JSON) and main (no spine)");
  ok(split.skipped.some((p) => agentOf(p) === "crawler-doctrine") && split.skipped.some((p) => agentOf(p) === "main"),
    "…and those two specifically — a skip list that drifted to something else is not this exemption");
  ok(partition([P("06-crawler-doctrine.md")]).enforced.length === 0,
    "a crawler-doctrine artefact is skipped even when it DOES carry a block — the boundary is by agent, not by content");

  // ── ReDoS bounds, both directions. The bound must not break the match: a silently disabled check
  // is the failure this whole discipline keeps finding, so the placeholder fires FIRST and the
  // timing asserts second.
  ok(checkArtefact("a.md", GOOD.replace("Promote    none", "Promote    <what to promote>")).some((f) => f.includes("placeholder")),
    "KNOWN-GOOD: an ordinary placeholder still fires with the 200-char bound in place");
  ok(checkArtefact("a.md", GOOD.replace("Promote    none", `Promote    <${"x".repeat(199)}>`)).some((f) => f.includes("placeholder")),
    "…and one exactly at the bound still fires");
  // THE HONEST COST, asserted rather than left implicit: past 200 chars a placeholder is not
  // detected. The spine's longest real placeholder is 31 characters, so the aperture is cheap — but
  // a probe is where a cost like this stays visible.
  ok(!checkArtefact("a.md", GOOD.replace("Promote    none", `Promote    <${"x".repeat(201)}>`)).some((f) => f.includes("placeholder")),
    "…and one PAST the bound does not — the aperture the bound buys, stated");

  const timed = (text) => {
    const t0 = process.hrtime.bigint();
    checkArtefact("a.md", text);
    return Number(process.hrtime.bigint() - t0) / 1e6;
  };
  // THRESHOLD 1000ms. It separates linear from quadratic and the gap is ~100× (upstream measured
  // 58ms vs 5850ms), so a tighter line buys no discriminating power and turns a loaded machine into
  // a red build with no code change — which is how a timing probe gets deleted rather than fixed.
  const THRESHOLD_MS = 1000;
  const bracketMs = timed(GOOD.replace("Promote    none", `Promote    ${"<".repeat(120_000)}`));
  ok(bracketMs < THRESHOLD_MS, `a 120k-'<' run with no '>' completes in ${bracketMs.toFixed(0)}ms — bounded, not quadratic`);
  const blankMs = timed(`${"\n".repeat(60_000)}anchor: task=t · commit=abc1234\n${GOOD}`);
  ok(blankMs < THRESHOLD_MS, `a 60k-newline blank region completes in ${blankMs.toFixed(0)}ms — [ \\t]* cannot cross lines`);

  // The parse cap, both directions.
  ok(checkArtefact("a.md", GOOD).length === 0, "KNOWN-GOOD: an ordinary artefact is nowhere near the parse cap");
  {
    const over = checkArtefact("a.md", `${GOOD}\n${"x".repeat(1024 * 1024)}`);
    ok(over.length === 1 && over[0].includes("parse cap"),
      "an artefact past the parse cap is REFUSED with one finding — not truncated, which would report a well-formed contract for a file whose block sits past the cut");
  }

  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — fires on a missing, unfilled or self-contradicting block, quiet on a well-formed one, and enforces only the spines that carry it");
  process.exit(failed ? 1 : 0);
}

if (isEntry && !process.argv.includes("--selftest")) {
  const { enforced, skipped } = partition(artefacts(ROOT));
  const findings = enforced.flatMap((f) =>
    checkArtefact(f.replace(`${ROOT}/`, ""), readFileSync(f, "utf8"), ANCHOR_AGENTS.has(agentOf(f))));

  // Named before the verdict, pass or fail. An artefact outside the rollout boundary is a thing the
  // check DID NOT LOOK AT, and a reader has to see that without reading the source.
  if (skipped.length) {
    console.log("   not checked — no contract block required of this writer (crawler-doctrine: stdout is parsed JSON; main: no spine):");
    for (const f of skipped) console.log(`     · ${f.replace(`${ROOT}/`, "")}`);
  }

  if (findings.length) {
    console.error(`\n❌ handoff-contract: ${findings.length} finding(s) across ${enforced.length} artefact(s)\n`);
    for (const f of findings) console.error(`   ${f}`);
    process.exit(1);
  }
  // The denominator is printed deliberately: this directory is task-scoped scratch and is empty on
  // a clean tree, so "0 artefacts" has to be VISIBLE rather than read as "all artefacts passed".
  console.log(`🤝 handoff-contract: ${enforced.length} artefact(s) carry a well-formed contract block`);
}
