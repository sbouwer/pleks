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
import { registrations as hookRegistrations } from "./check-hook-registration.mjs"

// ── Rules sections. Listed explicitly, and the list ASSERTS ITS OWN PREMISE (§4.3): a heading that
//    no longer exists FAILS rather than silently un-auditing its section. Renaming a heading to
//    escape the audit is the obvious defeat, so it is the one made loud.
// Moved 2026-08-19 with the v4.5 restructure, in the SAME commit as the headings — a scope change
// is a window change, and the two must never be separated: the vanished-section assertion below is
// the only thing standing between "renamed a heading" and "silently un-audited its bullets".
// Probed on the new scope before being trusted: a marker-less bullet planted under `### Enforced`
// must fail. Passing on the new scope is not evidence the new scope is audited.
const RULES_SECTIONS = [
  "### Enforced",
  "## 5 · DOCTRINE THE MACHINE CANNOT HOLD",
]

/**
 * ns:id[:qualifier] — `advisory` (reports, does not block) or `shared`.
 *
 * `shared` exists because the no-double-claim rule was too strict for one real case. It was
 * written to catch TWINS — the same rule restated in two files, both tagging one control, which
 * would inflate the enforced count with a single mechanism counted twice. But one script can also
 * enforce several genuinely DIFFERENT rules: check-migration-integrity asserts the migration file
 * set, policy pairing, and org_id-on-new-table, which are three separate doctrine lines that each
 * became mechanised. Counting all three is honest; refusing to is not.
 *
 * So `shared` is an explicit author assertion — "this control legitimately enforces more than one
 * distinct rule" — and it stays visible in the diff. A twin still uses the prose convention
 * ("same control as X, not re-tagged here"), because a twin is one rule, not several.
 */
// The id class MUST include "@" — scoped npm/plugin rule ids like
// `@typescript-eslint/no-explicit-any` are real controls. It did not, until 2026-08-18.
const TAG = /@enforced\s+([a-z]+):([A-Za-z0-9/_.@-]+)(?::(advisory|shared))?/g
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
      // ⚠ EXISTENCE IS NOT ENFORCEMENT — the defect this file was written to expose, one layer in.
      // Both of these resolved on `existsSync` alone. A check script nobody runs and a hook file
      // nothing invokes are FILES; the tag claiming them is exactly the overclaim the marker
      // grammar exists to prevent. So each now resolves through the thing that INVOKES it.
      case "check": {
        if (!existsSync(`${root}/scripts/${id}.mjs`) && !existsSync(`${root}/scripts/${id}.mts`)) return false
        const pkg = JSON.parse(rd("package.json"))
        // `check:full` counts — it is the pre-push tier and chains `check`. A script reachable from
        // neither is unwired, however green it is when run by hand.
        return [pkg.scripts?.check, pkg.scripts?.["check:full"]].some((s) => (s ?? "").includes(id))
      }
      case "hook": {
        if (!existsSync(`${root}/.claude/hooks/${id}.js`)) return false
        // Registration, not presence. Deleting settings' `hooks` block left both gates inert while
        // every tag still resolved (walker, PR #257). Reuses the registration parser rather than
        // re-deriving it, so the two checks cannot drift apart.
        return hookRegistrations(JSON.parse(rd(".claude/settings.json"))).some((r) => r.file === `${id}.js`)
      }
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

/** The ratchet, as a pure function so it can be probed in every direction. */
function ratchetFindings(n, ceiling, path, d) {
  if (!ceiling || typeof ceiling.maxN !== "number") {
    return [`${path} is missing or has no numeric maxN — the ratchet has no stored ceiling, so "N may only fall" is unenforced`]
  }
  const out = []
  if (n > ceiling.maxN) {
    out.push(`RATCHET: N rose to ${n}, ceiling is ${ceiling.maxN}. Mechanise the new rule, or raise maxN in ${path} in the SAME commit and argue it in the message.`)
  }
  if (n < ceiling.maxN) {
    out.push(`RATCHET: N fell to ${n} but the ceiling is still ${ceiling.maxN}. Lower maxN to ${n} — tightening the ratchet is part of the mechanisation's acceptance, not a follow-up.`)
  }

  // ── THE DENOMINATOR'S FLOOR, and why a ceiling on N alone is gameable ────────────────────────
  // N and D are counted from marker-carrying lines, which check 4 requires only INSIDE `### Enforced`
  // and §5. Everywhere else in CLAUDE.md a bullet needs no marker — correctly, because §1-§3 and
  // §6-§9 are prose, not the rules index.
  //
  // But that makes "N may only fall" satisfiable by MOVING a rule instead of mechanising it: cut an
  // UNENFORCEABLE bullet out of §5, paste it into §8 as ordinary prose, and N falls by one with the
  // rule still in the file, still unenforced, and now invisible to the metric that exists to count
  // it. The ratchet would report the mechanisation it did not get.
  //
  // Pinning D's FLOOR closes it: relocating a rule out of the tagged sections drops D and fails.
  // D may rise freely — a new ENFORCED rule is exactly what should be easy. Deliberately deleting an
  // obsolete rule lowers minD in the same commit, which is the visible, argued act a ratchet is for.
  if (typeof d === "number") {
    if (typeof ceiling.minD !== "number") {
      out.push(`${path} has no numeric minD — without it, N can be lowered by MOVING a rule out of the tagged sections instead of mechanising it`)
    } else if (d < ceiling.minD) {
      out.push(`RATCHET: D fell to ${d}, floor is ${ceiling.minD}. A rule left the tagged sections — mechanised rules RAISE D. If a rule was genuinely deleted, lower minD in ${path} in the SAME commit and say which rule and why.`)
    } else if (d > ceiling.minD) {
      out.push(`RATCHET: D rose to ${d} but the floor is still ${ceiling.minD}. Raise minD to ${d} — the new floor is part of the change, not a follow-up.`)
    }
  }
  return out
}

/** Audit one markdown file. Returns findings. */
function auditFile(path, text, claims, root = ".") {
  const out = []
  const lines = text.split("\n")

  // 1 + 2 — every @enforced resolves, and no control is claimed twice
  for (const m of text.matchAll(TAG)) {
    const [, ns, id, qualifier] = m
    const key = `${ns}:${id}`
    if (!controlExists(ns, id, root)) out.push(`${path}: @enforced ${key} — no such control`)
    // `shared` opts out of the single-claim rule deliberately and visibly; everything else
    // still fails, because the common case for a repeated control is a twin.
    if (qualifier !== "shared" && claims.has(key)) out.push(`${path}: ${key} claimed twice (also ${claims.get(key)})`)
    else if (!claims.has(key)) claims.set(key, path)
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
      // A pointer must resolve to EXACTLY ONE entry. Resolving to two is not a milder version of
      // resolving to none — it is worse: the reader follows the first heading, which is whichever
      // was written last, and both look authoritative. Eight ids were duplicated this way, because
      // marking an item BUILT added a second `### M-0NN` above the original instead of folding the
      // original into the `<details>` block the new entry already carried for it. The count is
      // therefore the test, not membership.
      const count = {}
      for (const m of readFileSync(regPath, "utf8").matchAll(/^### (M-\d{3})/gm)) count[m[1]] = (count[m[1]] ?? 0) + 1
      for (const p of pointers) {
        if (!count[p]) out.push(`${path}: ${p} resolves to no entry in docs/MECHANISABLE.md`)
        else if (count[p] > 1) out.push(`${path}: ${p} resolves to ${count[p]} entries in docs/MECHANISABLE.md — an ambiguous pointer sends the reader to whichever heading came first`)
      }
    }
  }

  // 2d — every marker BINDS to a bullet. The inverse of check 4, and the direction this audit
  // lacked until 2026-08-19: it validated marker-less bullets and never bullet-less markers, so a
  // marker floating after a prose paragraph counted toward N while belonging to no rule. Sixteen
  // of them survived the v4.5 restructure in a file this audit reported GREEN.
  //
  // It counts, it does not bind — the instrument's shape did not match the document's, and the
  // mismatch manufactured a pass.
  //
  // SCOPED TO THE RULES SECTIONS, not file-wide. A first pass ran file-wide and reported 61,
  // which was the check being wrong rather than 61 defects: `.claude/rules/*.md` are prose
  // documents where a marker legitimately annotates a PARAGRAPH — there the paragraph IS the
  // rule. The bullets-only grammar belongs to `### Enforced` and `§5`, and this is the exact
  // inverse of check 4, so it takes exactly check 4's scope. Imposing one file's grammar on
  // another's is how a check earns an allowlist.
  const sectionBounds = []
  for (const heading of RULES_SECTIONS) {
    const s = lines.indexOf(heading)
    if (s === -1) continue
    let e = s + 1
    while (e < lines.length && !lines[e].startsWith("## ")) e++
    sectionBounds.push([s, e])
  }
  const inRulesSection = (i) => sectionBounds.some(([s, e]) => i > s && i < e)

  lines.forEach((l, i) => {
    if (!l.includes("**UNENFORCEABLE**")) return
    if (!inRulesSection(i)) return
    if (/^\s*(-|\d+\.)\s+\S/.test(l)) return // the marker is itself on the bullet line
    // Walk back over the bullet's own continuation lines; a blank, heading, fence or rule ends it.
    for (let j = i - 1; j >= 0; j--) {
      const p = lines[j]
      if (p.trim() === "" || /^#{1,6}\s/.test(p) || p.startsWith("```") || p.startsWith("---")) break
      if (/^\s*(-|\d+\.)\s+\S/.test(p)) return
    }
    out.push(`${path}:${i + 1}: UNENFORCEABLE marker binds to no bullet — it is counted in N but belongs to no rule. Make the rule a bullet, or attach the marker to the bullet it describes.`)
  })

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
  // `shared` is the deliberate opt-out — one script enforcing several genuinely different rules.
  ["KNOWN-GOOD: a shared control claimed by two distinct rules", `${SEC}\n- One. <!-- @enforced hook:bash-gate:shared -->\n- Two. <!-- @enforced hook:bash-gate:shared -->\n`, false],
  // …but shared must not become a way to name a control that does not exist.
  ["shared does not excuse a nonexistent control", `${SEC}\n- One. <!-- @enforced check:does-not-exist:shared -->\n`, true],
  ["KNOWN-GOOD: two shared tags on distinct rules", `${SEC}\n- One. <!-- @enforced hook:bash-gate:shared -->\n- Two. <!-- @enforced hook:bash-gate:shared -->\n`, false],
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
  // AMBIGUOUS is a distinct failure from ABSENT, and the one the register actually had: marking an
  // item BUILT added a second `### M-0NN` heading instead of folding the original into the
  // `<details>` block the new entry already carried for it. Eight ids resolved to two entries each.
  ["M-pointer resolving to TWO register entries", `${SEC}\n- A rule.\n  **UNENFORCEABLE** — MECHANISABLE → **M-002**, which appears twice.\n`, true],
  // The inverse of "marker-less bullet": a BULLET-LESS MARKER. The plant is the exact shape that
  // survived the v4.5 restructure sixteen times in a file this audit reported green — a prose
  // paragraph, a blank line, then a marker belonging to nothing.
  ["marker floating after a prose paragraph", `${SEC}\n\nA prose paragraph stating a rule.\n\n**UNENFORCEABLE** — nothing binds this to a bullet.\n`, true],
  ["marker separated from its bullet by a blank line", `${SEC}\n- A rule.\n\n**UNENFORCEABLE** — separated from the bullet above.\n`, true],
  ["KNOWN-GOOD: marker directly under its bullet", `${SEC}\n- A rule.\n  **UNENFORCEABLE** — bound to the bullet above it.\n`, false],
  ["KNOWN-GOOD: marker on the bullet line itself", `${SEC}\n- A rule. **UNENFORCEABLE** — stated inline on the bullet.\n`, false],
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
  // M-002 appears TWICE on purpose: the ambiguous-pointer fixture below needs a register that
  // actually holds a duplicate, the way the real one held eight.
  writeFileSync(join(tmp, "docs", "MECHANISABLE.md"),
    "# register\n\n### M-001 — probe entry\n\n### M-002 — ✅ BUILT\n\n### M-002 — the original, never folded in\n")

  // The CONTROLS the fixtures tag, built in the fixture root rather than borrowed from the real one.
  // Until `root` reached auditFile these resolved against the live repo, so the fixture root did not
  // need them — and the fixtures were measuring the real tree while claiming to measure themselves.
  mkdirSync(join(tmp, ".claude", "hooks"), { recursive: true })
  mkdirSync(join(tmp, "eslint-rules"), { recursive: true })
  mkdirSync(join(tmp, "scripts"), { recursive: true })
  writeFileSync(join(tmp, ".claude", "hooks", "bash-gate.js"), "// fixture hook\n")
  writeFileSync(join(tmp, ".claude", "settings.json"), JSON.stringify({
    hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: 'node "$D/.claude/hooks/bash-gate.js"' }] }] },
  }))
  writeFileSync(join(tmp, "eslint-rules", "no-cookie-client-from.mjs"), "export default {}\n")
  writeFileSync(join(tmp, "eslint.config.mjs"),
    'export default [{ rules: { "no-restricted-imports": "error", "@typescript-eslint/no-explicit-any": "error", "pleks/no-cookie-client-from": "error" } }]\n')
  writeFileSync(join(tmp, "package.json"), JSON.stringify({ scripts: { check: "node scripts/check-nothing.mjs" } }))

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

  // ── the RATIO's own arithmetic ────────────────────────────────────────────
  // D_enforced counted DISTINCT CONTROLS until 2026-08-19 — correct while one control meant one
  // rule, wrong the moment `shared` existed. Tagging three mechanised rules moved 3 OUT of N and
  // added only 1 to D, so two rules vanished from BOTH sides and the binding metric silently
  // under-reported work that had been done. Counting is where this file has now been wrong twice
  // (occurrences-not-bullets, then controls-not-rules), so it is fixtured rather than trusted.
  const countEnfProbe = (t) => t.split("\n").filter((l) => new RegExp(TAG.source).test(l)).length
  const twoShared = `- One. <!-- @enforced hook:bash-gate:shared -->\n- Two. <!-- @enforced hook:bash-gate:shared -->\n`
  const okCount = countEnfProbe(twoShared) === 2
  if (!okCount) failed++
  console.log(`  ${okCount ? "✓" : "✗"} METRIC     — two rules sharing one control count as TWO enforced (got ${countEnfProbe(twoShared)})`)

  const okProse = countEnfProbe("Prose that merely mentions the @enforced convention.\n") === 0
  if (!okProse) failed++
  console.log(`  ${okProse ? "✓" : "✗"} METRIC     — prose mentioning @enforced does not inflate the count`)

  // ── the RESOLVER: existence is not enforcement ────────────────────────────
  // `check:` and `hook:` both resolved on existsSync alone, so a script nobody runs and a hook file
  // nothing invokes each resolved as a real control. Fixtures on disk, in a temp root, so the
  // resolver travels its real lookup path rather than being handed a mock.
  {
    const r = mkdtempSync(join(tmpdir(), "resolver-"))
    mkdirSync(join(r, "scripts"), { recursive: true })
    mkdirSync(join(r, ".claude", "hooks"), { recursive: true })
    writeFileSync(join(r, "scripts", "check-wired.mjs"), "")
    writeFileSync(join(r, "scripts", "check-orphan.mjs"), "")
    writeFileSync(join(r, ".claude", "hooks", "wired.js"), "")
    writeFileSync(join(r, ".claude", "hooks", "orphan.js"), "")
    writeFileSync(join(r, "package.json"), JSON.stringify({ scripts: { check: "node scripts/check-wired.mjs" } }))
    writeFileSync(join(r, ".claude", "settings.json"), JSON.stringify({
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: 'node "$D/.claude/hooks/wired.js"' }] }] },
    }))
    const RES = [
      ["KNOWN-GOOD: a check script reachable from `npm run check` resolves", "check", "check-wired", true],
      ["a check script that EXISTS but nothing runs does NOT resolve", "check", "check-orphan", false],
      ["a check script that does not exist at all does not resolve", "check", "check-absent", false],
      ["KNOWN-GOOD: a hook registered in settings resolves", "hook", "wired", true],
      ["a hook file that EXISTS but settings never invokes does NOT resolve", "hook", "orphan", false],
      ["a hook id with no file does not resolve", "hook", "absent", false],
    ]
    for (const [name, ns, id, want] of RES) {
      const got = controlExists(ns, id, r)
      const ok = got === want
      if (!ok) failed++
      console.log(`  ${ok ? "✓" : "✗"} RESOLVER   — ${name}${ok ? "" : `\n      got: ${got}`}`)
    }
    rmSync(r, { recursive: true, force: true })
  }

  // ── the RATCHET, in every direction ───────────────────────────────────────
  // It did not exist until 2026-08-19: "N may only fall" was printed, asserted in CLAUDE.md as
  // BINDING, and cited in lint-rules.md as the working example — while nothing keyed on it.
  // A ratchet that cannot fail is the thing this fixture set exists to make impossible.
  const RCASES = [
    ["N above the ceiling is a REGRESSION", 92, { maxN: 91 }, true],
    ["N below the ceiling means the ratchet was not tightened", 90, { maxN: 91 }, true],
    ["KNOWN-GOOD: N exactly at the ceiling", 91, { maxN: 91 }, false],
    ["a missing ceiling file fails rather than passing silently", 91, null, true],
    ["a ceiling with no numeric maxN fails", 91, { maxN: "91" }, true],
  ]
  for (const [name, n, c, shouldFire] of RCASES) {
    const fired = ratchetFindings(n, c, "x.json").length > 0
    const ok = fired === shouldFire
    if (!ok) failed++
    console.log(`  ${ok ? "✓" : "✗"} RATCHET    — ${name}`)
  }

  // The DENOMINATOR floor. The case that matters is the last one: N falling while D falls with it
  // is a rule being MOVED out of the tagged sections, not mechanised, and the N ceiling alone reads
  // that as progress.
  const DCASES = [
    ["KNOWN-GOOD: N at its ceiling and D at its floor", 91, 120, { maxN: 91, minD: 120 }, false],
    ["D below its floor fires — a rule left the tagged sections", 91, 119, { maxN: 91, minD: 120 }, true],
    ["D above its floor fires — the floor was not raised with the rule", 91, 121, { maxN: 91, minD: 120 }, true],
    ["a ceiling with no minD fires — D is unpinned and N is gameable by relocation", 91, 120, { maxN: 91 }, true],
    // The full defeat, spelled out: cut an UNENFORCEABLE bullet from §5, paste it into §8.
    ["MOVING a rule out (N-1 AND D-1) fires, where the N ceiling alone would have applauded", 90, 119, { maxN: 90, minD: 120 }, true],
  ]
  for (const [name, n, d, c, shouldFire] of DCASES) {
    const fired = ratchetFindings(n, c, "x.json", d).length > 0
    const ok = fired === shouldFire
    if (!ok) failed++
    console.log(`  ${ok ? "✓" : "✗"} RATCHET-D  — ${name}`)
  }

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
// ⚠ AND `root` MUST REACH auditFile(). It did not: both calls below took the default `"."`, so
// every fixture's control resolution and M-pointer lookup ran against the REAL repo instead of the
// fixture root. The fixtures passed for the wrong reason — "M-001 resolves, M-999 does not" was
// true of the live register whatever the fixture wrote — and the first fixture that needed the
// fixture register to DIFFER from the real one (an id appearing twice) silently reported nothing.
// Fixtures on disk, travelling the real discovery path, and STILL blind, because the path was
// travelled against the wrong tree.
function runAudit(root) {
  const claims = new Map()
  const findings = auditFile("CLAUDE.md", readFileSync(`${root}/CLAUDE.md`, "utf8"), claims, root)
  const dir = `${root}/.claude/rules`
  const files = readdirSync(dir).filter((x) => x.endsWith(".md"))
  // Non-empty assertion on the enumeration itself — a glob that decays to nothing must FAIL, not pass.
  if (files.length === 0) findings.push(`${dir}: no rule files found — glob decayed?`)
  for (const f of files) {
    // Rule files have no RULES_SECTIONS headings; only directions 1-3 apply to them.
    findings.push(...auditFile(`.claude/rules/${f}`, readFileSync(`${dir}/${f}`, "utf8"), claims, root)
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
/**
 * Count enforced RULES, not distinct controls.
 *
 * This was `claims.size` — correct while one control meant one rule, and WRONG the moment
 * `shared` allowed one script to enforce several. Tagging three genuinely mechanised rules moved
 * three out of N and added one to D_enforced: two rules disappeared from BOTH sides of the ratio,
 * so the binding metric silently stopped counting work that had actually been done.
 *
 * Same class as the earlier bug where this file counted marker OCCURRENCES and a rules file
 * discussing the marker inflated N — count the entity you claim to count (LESSONS L-05).
 */
const countEnf = (t) => t.split("\n").filter((l) => new RegExp(TAG.source).test(l)).length
const D_enforced = countEnf(readFileSync("CLAUDE.md", "utf8"))
  + readdirSync(".claude/rules").filter((x) => x.endsWith(".md"))
      .reduce((n, f) => n + countEnf(readFileSync(`.claude/rules/${f}`, "utf8")), 0)
console.log(`📑 marker ratio — ${N_unenf} of ${N_unenf + D_enforced} rules UNENFORCEABLE ` +
            `(${D_enforced} @enforced).`)

/**
 * THE RATCHET — which until 2026-08-19 did not exist.
 *
 * "N may only fall" was printed on this line and asserted in CLAUDE.md's header as the BINDING
 * metric, and `.claude/rules/lint-rules.md` cited this script as the working example of a
 * shrink-only ratchet. Nothing keyed on it: N was computed, logged, and discarded. Ten new
 * UNENFORCEABLE bullets took N from 91 to 101 with a green build — the enforcement-overclaim
 * class, inside the audit written to make that class unwritable, and cited elsewhere as proof it
 * worked. Found by adversarial review of PR #257.
 *
 * A ceiling in a tracked file is the mechanism. It cannot rot the way a count in a doctrine file
 * does (L-29) because this check compares it against reality on every run — a stale ceiling is a
 * failure, not a silent falsehood.
 *
 * BOTH directions fail, deliberately:
 *   N above the ceiling → a regression. Mechanise it, or raise the ceiling in the SAME commit
 *     with the new rule, which is what "except when a new genuinely-un-mechanisable rule is added,
 *     VISIBLY" means — visible in the diff, argued in the message.
 *   N below the ceiling → the ratchet has not been tightened. Lowering it is part of the
 *     mechanisation's acceptance, exactly as removing a baseline entry is part of a fix's.
 */
const CEILING_PATH = "scripts/claude-md-ratio.ceiling.json"
const ceiling = existsSync(CEILING_PATH) ? JSON.parse(readFileSync(CEILING_PATH, "utf8")) : null
const ratchet = ratchetFindings(N_unenf, ceiling, CEILING_PATH, N_unenf + D_enforced)
findings.push(...ratchet)
if (!ratchet.length) console.log(`🔒 ratchet — N at its ceiling (${ceiling.maxN}, may only fall) · D at its floor (${ceiling.minD}, may only rise).`)

if (findings.length) {
  console.error(`\n❌ ${findings.length} finding(s):\n`)
  for (const f of findings) console.error(`  ${f}`)
  process.exit(1)
}
console.log("✅ every marker resolves, nothing is claimed twice, every rule bullet is tagged")
