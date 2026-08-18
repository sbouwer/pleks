#!/usr/bin/env node
/**
 * scripts/check-claude-md.mjs — the marker audit for CLAUDE.md and .claude/rules/*.md
 *
 * SPEC_CLAUDE_MD_STANDARD v4.1 §4.1. Validates MARKERS ONLY — never prose. The first prose-parsing
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
const TAG = /@enforced\s+([a-z]+):([A-Za-z0-9/_.-]+)(?::(advisory))?/g
const UNENF = /\*\*UNENFORCEABLE\*\*\s*—\s*(.*)/

/** Does a control id resolve to something real? Lookup per namespace, never inference from prose. */
function controlExists(ns, id, root = ".") {
  const rd = (p) => readFileSync(`${root}/${p}`, "utf8")
  try {
    switch (ns) {
      case "eslint": {
        const name = id.replace(/^pleks\//, "")
        return existsSync(`${root}/eslint-rules/${name}.mjs`) && rd("eslint.config.mjs").includes(`"${id}"`)
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
      const block = l + "\n" + (lines[i + 1] ?? "") + "\n" + (lines[i + 2] ?? "")
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
  ["renamed rules section", `## SECURITY RULES (unchanged — still apply to any new code)\n- x <!-- @enforced hook:bash-gate -->\n`, true],
  // must PASS — the negative-space half, and the one that catches a never-matching pattern
  ["KNOWN-GOOD: tagged + unenforceable together", `${SEC}\n- Enforced one. <!-- @enforced hook:bash-gate -->\n- Loose one.\n  **UNENFORCEABLE** — nothing scans for this; it is a human judgement call.\n`, false],
  ["KNOWN-GOOD: prose that merely mentions a control id", `${SEC}\n- A rule. <!-- @enforced hook:bash-gate -->\n\nSome prose about eslint:pleks/no-cookie-client-from that is not a tag.\n`, false],
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

const enforced = [...claims.keys()].length
const unenf = (readFileSync("CLAUDE.md", "utf8").match(/\*\*UNENFORCEABLE\*\*/g) ?? []).length
console.log(`📑 CLAUDE.md markers — ${enforced} @enforced · ${unenf} UNENFORCEABLE (the binding metric; it may only fall)`)

if (findings.length) {
  console.error(`\n❌ ${findings.length} finding(s):\n`)
  for (const f of findings) console.error(`  ${f}`)
  process.exit(1)
}
console.log("✅ every marker resolves, nothing is claimed twice, every rule bullet is tagged")
