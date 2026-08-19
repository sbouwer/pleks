#!/usr/bin/env node
/**
 * scripts/check-claude-md.mjs — the marker audit for CLAUDE.md and .claude/rules/*.md
 *
 * SPEC_CLAUDE_MD_STANDARD §4.1 — canonical copy at `C:\dev\dev-standards\SPEC_CLAUDE_MD_STANDARD.md`
 * (v4.4 as at 2026-08-18; this header cited "v4.1" with no path, which resolved to nothing on disk
 * until 2026-08-19 — a fabricated SSOT reference in the very script written to catch them).
 * The spec lives OUTSIDE this repo deliberately: it is cross-project, and the template it carries
 * is the source for several codebases. That makes the path, not the name, the citation.
 * Validates MARKERS ONLY — never prose. The first prose-parsing
 * attempt in the source project scored six findings, six false positives; parsing prose for
 * identifiers inherits every ambiguity of prose.
 *
 * Four exact directions:
 *   1. every `@enforced <ns:id>` names a control that EXISTS
 *   2. every control is claimed by AT MOST ONE tag
 *   3. every `@unenforceable` carries a non-empty reason
 *   4. every bullet inside a RULES SECTION carries a marker (closes the forgotten-tag hole)
 *
 * ⚠ WHY THIS FILE EXISTS AT ALL. Without it the markers are prose with syntax, and
 * `@enforced eslint:pleks/no-cookie-client-from` is exactly the unverified enforcement claim the
 * markers were introduced to make unwritable. The field case: a commit message asserting it had made
 * a missed writer "a build failure instead of a silent divergence" when it had left no guard at all.
 *
 * ⚠ WRITTEN PROBE-FIRST — the fixtures below were written BEFORE the checker, and that ordering is
 * the point, not a style note. On 2026-08-18 a pairing check in this repo was written three times and
 * reported 328 → 29 → 21 violations, each number plausible, one known-good case wrong in all three;
 * root cause a regex in a template literal where `\s` silently degraded to `s`. A never-matching
 * pattern reports 100% violations, so tool failure and catastrophic finding are the same output, and
 * partial fixes shrink the number while INCREASING its believability. The fixture that kills that
 * class is the boring one: A KNOWN-GOOD CASE MUST PASS. Run `--selftest`.
 *
 * Usage:
 *   node scripts/check-claude-md.mjs             # audit the real files
 *   node scripts/check-claude-md.mjs --selftest  # run the fixtures (both directions)
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// ── Rules sections. Listed explicitly, and the list ASSERTS ITS OWN PREMISE (§4.3): a heading that
//    no longer exists FAILS rather than silently un-auditing its section. Renaming a heading to
//    escape the audit is the obvious defeat, so it is the one made loud.
const RULES_SECTIONS = [
  "## SECURITY RULES (unchanged — still apply to any new code)",
  "## DO NOT DO",
]

/** ns:id[:qualifier] — qualifier is currently only `advisory` (reports, does not block). */
// The id class MUST include "@" — scoped npm/plugin rule ids like
// `@typescript-eslint/no-explicit-any` are real controls. It did not, until 2026-08-18.
const TAG = /@enforced\s+([a-z]+):([A-Za-z0-9/_.@-]+)(?::(advisory))?/g
const UNENF = /\*\*UNENFORCEABLE\*\*\s*—\s*(.*)/

/** Does a control id resolve to something real? Lookup per namespace, never inference from prose. */
function controlExists(ns, id, root = ".") {
  const rd = (p) => readFileSync(`${root}/${p}`, "utf8")
  try {
    switch (ns) {
      case "eslint": {
        // ⚠ TWO KINDS OF ESLINT CONTROL, AND THE FIRST VERSION SAW ONLY ONE.
        // Custom `pleks/*` rules live in eslint-rules/. But BUILT-IN and plugin rules configured in
        // eslint.config.mjs — `no-restricted-imports`, `react/jsx-key`, `@typescript-eslint/*` — are
        // equally real controls with no file of their own. The resolver required a file, so a rule
        // genuinely enforced by config could not be truthfully tagged, and the tagging pass correctly
        // refused to stretch the grammar and marked those rules UNENFORCEABLE instead.
        // That inflated N — the binding metric — with controls that exist. THE TOOL WAS CONSTRAINING
        // THE TRUTH, which is the one thing a measurement instrument must not do.
        const cfg = rd("eslint.config.mjs")
        const custom = id.startsWith("pleks/")
        if (custom) return existsSync(`${root}/eslint-rules/${id.slice(6)}.mjs`) && cfg.includes(`"${id}"`)
        return cfg.includes(`"${id}"`)   // configured built-in / plugin rule
      }
      case "check":
        return existsSync(`${root}/scripts/${id}.mjs`) || existsSync(`${root}/scripts/${id}.mts`)
      case "hook":
        return existsSync(`${root}/.claude/hooks/${id}.js`)
      case "ci":
        return readdirSync(`${root}/.github/workflows`).some((f) =>
          rd(`.github/workflows/${f}`).includes(`${id}:`))
      case "audit":
        return rd("scripts/security/audit.mjs").includes(id)
      case "test":
        return existsSync(`${root}/${id}`)
      default:
        return false
    }
  } catch { return false }
}

/** Audit one markdown file. Returns findings. */
function auditFile(path, text, claims, root = ".") {
  const out = []
  const lines = text.split("\n")

  // 1 + 2 — every @enforced resolves, and no control is claimed twice
  for (const m of text.matchAll(TAG)) {
    const [, ns, id] = m
    const key = `${ns}:${id}`
    if (!controlExists(ns, id, root)) out.push(`${path}: @enforced ${key} — no such control`)
    if (claims.has(key)) out.push(`${path}: ${key} claimed twice (also ${claims.get(key)})`)
    else claims.set(key, path)
  }

  // 2b — a tag the parser CANNOT READ is worse than a missing tag. It satisfies check 4's
  // literal `.includes("@enforced")` string test, so the bullet looks tagged; but it registers
  // no claim, so the rule is counted in NEITHER N nor D_enforced and is never resolution-checked.
  // The rule silently exits the audit while reading as enforced to a human.
  // Found 2026-08-18: the id class excluded "@", so `eslint:@typescript-eslint/no-explicit-any`
  // parsed as nothing and a real, verified control vanished from the metric with no complaint.
  // A tag must parse or fail LOUDLY — silence is the one outcome an instrument may not have.
  // Scoped to HTML comments deliberately: a tag ATTEMPT is by definition inside the comment
  // syntax the format uses. Prose may legitimately discuss `@enforced` — several UNENFORCEABLE
  // reasons explain why they are NOT tagged — and flagging that is a false positive that would
  // buy an allowlist, which is how a check stops meaning anything (see lint-rules.md).
  lines.forEach((l, i) => {
    for (const c of l.matchAll(/<!--([\s\S]*?)-->/g)) {
      if (!c[1].includes("@enforced")) continue
      if (!new RegExp(TAG.source).test(c[1]))
        out.push(`${path}:${i + 1}: unparseable @enforced tag (registers no claim) — ${c[1].trim().slice(0, 70)}`)
    }
  })

  // 2c — every M-0NN pointer resolves to a real register entry.
  // These pointers REPLACED the inline sketches, so they now carry the content's only address —
  // and nothing verified them until 2026-08-19. Seventeen were introduced into the always-loaded
  // file in a single pass, unchecked, pointing at a file that was not even in the repo (brief/ is
  // a symlink to OneDrive). A citation that reads as rigorous and resolves to nothing is the exact
  // failure this script exists to catch; the extraction was reintroducing it while removing it
  // elsewhere. Silent when a file has no pointers, so this cannot fire spuriously.
  const pointers = [...new Set([...text.matchAll(/\bM-\d{3}\b/g)].map((m) => m[0]))]
  if (pointers.length) {
    const regPath = `${root}/docs/MECHANISABLE.md`
    if (!existsSync(regPath)) {
      out.push(`${path}: ${pointers.length} M-pointer(s) but docs/MECHANISABLE.md does not exist`)
    } else {
      const have = new Set([...readFileSync(regPath, "utf8").matchAll(/^### (M-\d{3})/gm)].map((m) => m[1]))
      for (const p of pointers) if (!have.has(p)) out.push(`${path}: ${p} resolves to no entry in docs/MECHANISABLE.md`)
    }
  }

  // 3 — every UNENFORCEABLE carries a reason
  lines.forEach((l, i) => {
    if (!l.includes("**UNENFORCEABLE**")) return
    const m = l.match(UNENF)
    if (!m || m[1].trim().length < 10) out.push(`${path}:${i + 1}: @unenforceable with no usable reason`)
  })

  // 4 — inside a rules section, every bullet carries a marker
  for (const heading of RULES_SECTIONS) {
    const start = lines.indexOf(heading)
    if (start === -1) { out.push(`${path}: rules section vanished: "${heading}" — renamed? Its bullets are now unaudited.`); continue }
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i]
      if (l.startsWith("## ")) break
      if (!/^\s*(-|\d+\.)\s+\S/.test(l)) continue
      // Extend to the END of the bullet, not a fixed 3-line window. The fixed window silently
      // required a marker within 2 lines of the bullet's first line, which pressured annotators to
      // jam markers INTO the middle of multi-line rule statements. That is exactly how SECURITY
      // RULE 1's exception clause ("a row describing a HUMAN…") got orphaned mid-sentence — the
      // tool's arbitrary limit deformed the document it was measuring. Found and fixed 2026-08-18.
      let block = l
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s*(-|\d+\.)\s+\S/.test(lines[j]) || lines[j].startsWith("## ") || lines[j].startsWith("---")) break
        block += "\n" + lines[j]
      }
      if (!block.includes("@enforced") && !block.includes("**UNENFORCEABLE**"))
        out.push(`${path}:${i + 1}: rule bullet carries no marker — ${l.trim().slice(0, 62)}`)
    }
  }
  return out
}

// ── FIXTURES — written BEFORE the checker. Both directions, per §4.5. ───────────────────────────
const SEC = RULES_SECTIONS[1]
const FIXTURES = [
  // must FAIL
  ["nonexistent control", `${SEC}\n- A rule. <!-- @enforced eslint:pleks/does-not-exist -->\n`, true],
  ["control claimed twice", `${SEC}\n- One. <!-- @enforced hook:bash-gate -->\n- Two. <!-- @enforced hook:bash-gate -->\n`, true],
  ["unenforceable with no reason", `${SEC}\n- A rule.\n  **UNENFORCEABLE** — \n`, true],
  ["untagged bullet in a rules section", `${SEC}\n- A rule nobody tagged.\n`, true],
  ["near-miss by normalisation", `${SEC}\n- A rule. <!-- @enforced hook:bash_gate -->\n`, true],
  // The bug this pair locks down: the tag is PRESENT (so check 4 is satisfied and the bullet
  // reads as enforced) but UNPARSEABLE (so it registers no claim and vanishes from the metric).
  ["unparseable @enforced tag registers no claim", `${SEC}\n- A rule. <!-- @enforced eslint -->\n`, true],
  ["KNOWN-GOOD: scoped plugin id containing @ parses", `${SEC}\n- A rule. <!-- @enforced eslint:@typescript-eslint/no-explicit-any -->\n`, false],
  ["KNOWN-GOOD: prose discussing @enforced outside a comment", `${SEC}\n- A rule. <!-- @enforced hook:bash-gate -->\n- Loose one.\n  **UNENFORCEABLE** — tagging it \`@enforced\` here would overclaim, so it is not tagged.\n`, false],
  // Regression: a marker BELOW the old 3-line window must still count, so a multi-line rule
  // statement never has to be broken apart to satisfy the checker.
  ["KNOWN-GOOD: marker below the old 3-line window", `${SEC}\n- A rule that runs on\n  several continuation\n  lines before its\n  marker appears.\n  **UNENFORCEABLE** — nothing scans for this; it is a human judgement call.\n`, false],
  ["M-pointer resolving to no register entry", `${SEC}\n- A rule.\n  **UNENFORCEABLE** — MECHANISABLE → **M-999**, which does not exist.\n`, true],
  ["KNOWN-GOOD: M-pointer that resolves", `${SEC}\n- A rule.\n  **UNENFORCEABLE** — MECHANISABLE → **M-001**, which exists in the register.\n`, false],
  ["renamed rules section", `## SECURITY RULES (unchanged — still apply to any new code)\n- x <!-- @enforced hook:bash-gate -->\n`, true],
  // must PASS — the negative-space half, and the one that catches a never-matching pattern
  ["KNOWN-GOOD: tagged + unenforceable together", `${SEC}\n- Enforced one. <!-- @enforced hook:bash-gate -->\n- Loose one.\n  **UNENFORCEABLE** — nothing scans for this; it is a human judgement call.\n`, false],
  ["KNOWN-GOOD: prose that merely mentions a control id", `${SEC}\n- A rule. <!-- @enforced hook:bash-gate -->\n\nSome prose about eslint:pleks/no-cookie-client-from that is not a tag.\n`, false],
  // A CONFIGURED BUILT-IN is a real control. The first resolver could not see one, so rules genuinely
  // enforced by eslint.config.mjs were forced into the UNENFORCEABLE count — the instrument inflating
  // its own metric. Both directions fixtured, because "resolves anything" is the opposite failure.
  ["KNOWN-GOOD: configured built-in eslint rule resolves", `${SEC}\n- A rule. <!-- @enforced eslint:no-restricted-imports -->\n`, false],
  ["built-in that is NOT configured must still fail", `${SEC}\n- A rule. <!-- @enforced eslint:no-invented-rule-xyz -->\n`, true],
]

if (process.argv.includes("--selftest")) {
  let failed = 0
  // ⚠ FIXTURES ON DISK, RUN THROUGH runAudit() — not strings handed to auditFile().
  // v4.3: "probes cannot travel through the channel the control inspects." The first version of this
  // selftest passed strings straight in, bypassing discovery entirely — so a renamed .claude/rules, a
  // decayed glob, or a loop finding zero files would have left all eight fixtures green. Green and
  // unfailable, in the tool written to prevent exactly that.
  const tmp = mkdtempSync(join(tmpdir(), "claude-md-fixture-"))
  mkdirSync(join(tmp, ".claude", "rules"), { recursive: true })
  // A register with exactly ONE entry, so pointer resolution can be probed in both directions:
  // M-001 must resolve, M-999 must not.
  mkdirSync(join(tmp, "docs"), { recursive: true })
  writeFileSync(join(tmp, "docs", "MECHANISABLE.md"), "# register\n\n### M-001 — probe entry\n")

  for (const [name, body, shouldFire] of FIXTURES) {
    // Every fixture carries BOTH rules sections so the premise-assertion doesn't fire spuriously,
    // except the one fixture specifically testing a vanished section.
    const text = name === "renamed rules section" ? body : `${RULES_SECTIONS[0]}\n\n${body}`
    writeFileSync(join(tmp, "CLAUDE.md"), text)
    writeFileSync(join(tmp, ".claude", "rules", "probe.md"),
      '---\npaths:\n  - "x/**"\n---\n\nNo rules here.\n')
    const found = runAudit(tmp).findings.filter((f) =>
      name === "renamed rules section" ? f.includes("vanished") : !f.includes("vanished"))
    const fired = found.length > 0
    const ok = fired === shouldFire
    if (!ok) failed++
    console.log(`  ${ok ? "✓" : "✗"} ${shouldFire ? "must fire " : "must pass "} — ${name}${ok ? "" : `\n      got: ${found.join(" | ") || "(nothing)"}`}`)
  }

  // The discovery fixture — the one the old string-based design could not express at all.
  for (const f of readdirSync(join(tmp, ".claude", "rules"))) rmSync(join(tmp, ".claude", "rules", f))
  const globFired = runAudit(tmp).findings.some((f) => f.includes("glob decayed"))
  if (!globFired) failed++
  console.log(`  ${globFired ? "✓" : "✗"} must fire  — rule-file glob decays to zero`)

  console.log(failed === 0
    ? "\n✅ fixtures green — fires, stays quiet, AND notices its own subject going missing"
    : `\n❌ ${failed} fixture(s) wrong`)
  process.exit(failed === 0 ? 0 : 1)
}

// ── Discovery. ⚠ THE SELFTEST RUNS THROUGH THIS TOO, and that is the whole point.
// v4.3: "probes cannot travel through the channel the control inspects — fixtures on disk."
// The first version of this file passed fixture STRINGS straight to auditFile(), bypassing discovery
// entirely — so a renamed .claude/rules, a decayed glob, or a loop finding zero files would have left
// all eight fixtures green. Green and unfailable, in the tool written to prevent exactly that.
function runAudit(root) {
  const claims = new Map()
  const findings = auditFile("CLAUDE.md", readFileSync(`${root}/CLAUDE.md`, "utf8"), claims)
  const dir = `${root}/.claude/rules`
  const files = readdirSync(dir).filter((x) => x.endsWith(".md"))
  // Non-empty assertion on the enumeration itself — a glob that decays to nothing must FAIL, not pass.
  if (files.length === 0) findings.push(`${dir}: no rule files found — glob decayed?`)
  for (const f of files) {
    // Rule files have no RULES_SECTIONS headings; only directions 1-3 apply to them.
    findings.push(...auditFile(`.claude/rules/${f}`, readFileSync(`${dir}/${f}`, "utf8"), claims)
      .filter((x) => !x.includes("rules section vanished")))
  }
  return { findings, claims }
}

// ── The real audit ───────────────────────────────────────────────────────────────────────────────
const { findings, claims } = runAudit(".")

// ⚠ THE METRIC IS A RATIO, NOT A COUNT (v4.4 §1). N = rules whose only control is model attention;
// D = all marker-carrying rules. The denominator is an integrity check on the numerator, because a
// bare N falls for three different reasons and only one is progress:
//   D rising, N flat    → the tagging pass working (untagged prose becoming counted rules)
//   N falling, D stable → mechanisation, which is what the ratchet is for
//   N and D falling     → DELETION — may be right, but a different act deserving different attention
// A field migration went D 18 → 21 with N steady at 9; a bare count reads that as noise or regression.
// ⚠ COUNT BULLETS, NOT OCCURRENCES. The first version matched every `**UNENFORCEABLE**` in the text,
// so a reason line that MENTIONS the marker — as lint-rules.md did, discussing the metric by name —
// counted twice and inflated N by one. The binding metric was measuring its own vocabulary.
// Found by the triage pass reconciling 116 reported against 115 real bullets. One line at a time
// is the fix: a line either carries the marker or it does not.
const countUnenf = (t) => t.split("\n").filter((l) => l.includes("**UNENFORCEABLE**")).length
const N_unenf = countUnenf(readFileSync("CLAUDE.md", "utf8"))
  + readdirSync(".claude/rules").filter((x) => x.endsWith(".md"))
      .reduce((n, f) => n + countUnenf(readFileSync(`.claude/rules/${f}`, "utf8")), 0)
const D_enforced = [...claims.keys()].length
console.log(`📑 marker ratio — ${N_unenf} of ${N_unenf + D_enforced} rules UNENFORCEABLE ` +
            `(${D_enforced} @enforced). N may only fall; report BOTH deltas each ratchet pass.`)

if (findings.length) {
  console.error(`\n❌ ${findings.length} finding(s):\n`)
  for (const f of findings) console.error(`  ${f}`)
  process.exit(1)
}
console.log("✅ every marker resolves, nothing is claimed twice, every rule bullet is tagged")
