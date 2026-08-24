#!/usr/bin/env node
/**
 * scripts/check-invariant-has-callers.mjs — an export that NAMES a rule must have a reader
 *
 * Auth:   none — local/CI script
 * Data:   git-tracked .ts/.tsx under app/, lib/, components/
 * Notes:  The class this exists for, found three times in two sweeps from unrelated domains
 *         (M-067 comms fan-out · M-077 help content · M-082 retention): **a constant whose
 *         existence stands in for the enforcement it names.** `excludePlatformOrg` is a stated
 *         MUST with zero call sites; `HELP_CONTENT_DRAFT` is a sign-off gate nothing reads;
 *         `RETENTION_PROTECTED_TABLES` is a statutory list with no importer, which TWO artefacts
 *         describe in the present tense as live.
 *
 *         Why a dead-code tool cannot do this. knip reports all three as unused exports and
 *         proposes DELETING them — which removes the only record that the rule exists and leaves
 *         the obligation. Deleting an unenforced invariant is strictly worse than leaving it:
 *         it converts a visible gap into an invisible one. `@knipignore` is the right answer to
 *         knip and the wrong answer to this — it says "do not delete", not "this needs a reader".
 *         Two different claims, so two different tags.
 *
 *         WHAT THIS CHECK IS, STATED HONESTLY. It converts a silent lie into a loud one. It does
 *         not make the platform org excluded, sign off the help content, or protect a table from a
 *         purge — each of those is a decision someone still has to take. M-082 says exactly this
 *         about its own sketch half (a), and it is still the right first move: the three known
 *         instances went years unnoticed because nothing ever asked the question out loud.
 *
 *         SCOPE, AND THE HOLE IN IT. This is a ratchet over DECLARED invariants — an export nobody
 *         tagged is invisible to it. That is deliberate: M-077 rejected the general shape ("any
 *         `*_DRAFT`/`*_REQUIRED`-shaped export with zero readers") on a population of three, and
 *         shipping a heuristic on three sites is how a check's first number becomes a finding.
 *         The general form stays open in the register; this closes the ratchet, not the class.
 *
 *         A READER IS CODE, NOT PROSE. Comments are blanked in the files being searched before an
 *         identifier is counted. This is not fastidiousness — it is M-082's actual finding: the
 *         module header and `010_platform_features.sql:1690` both assert the array is live, and a
 *         check that counted a sentence as a reader would have been satisfied by the very prose
 *         that made the gap invisible.
 */
import { execFileSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
// Shared, not duplicated: the function is subtle (length-preserving, linear, regex-free) and a
// second copy that drifts would fail in the direction this check cannot detect. It was imported
// from check-subscription-single-reads.mjs first, which was WRONG for a reason worth recording —
// that module has a top-level `--selftest` branch and a `git ls-files` scan, so importing it ran
// the other check's probes and exited 0 on them, and this file's own probes never ran.
import { blankComments } from "./lib/blank-comments.mjs"

const BASELINE_PATH = "scripts/invariant-callers.baseline.json"
const TAG = "@invariant"

/**
 * Find `@invariant M-0NN` tags and resolve each to the export it precedes.
 *
 * Returns `{ ident, register, line }` for resolved tags and `{ line, unresolved: true }` for a tag
 * that names nothing. An unresolved tag FAILS rather than being skipped: a tag pointing at no
 * export is either a typo or prose, and both should be loud. That also closes the token-in-prose
 * trap this repo has now hit twice (check-knip-floor counted `@knipignore` written in a sentence;
 * the first draft of check-subscription-single-reads flagged the four sites it had just fixed) —
 * here the tag cannot be discussed in passing inside app/lib/components without failing the gate.
 */
export function findTags(file, src) {
  const lines = src.split("\n")
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const tagAt = lines[i].indexOf(TAG)
    if (tagAt === -1) continue
    // Must be inside a comment line, not a string or identifier.
    const before = lines[i].slice(0, tagAt)
    if (!/^\s*(?:\*|\/\/|\/\*)/.test(before)) continue

    const reg = /@invariant\s+(M-\d+[a-z]?)\b/.exec(lines[i])
    let ident = null
    for (let j = i + 1; j < Math.min(i + 25, lines.length); j++) {
      const m = /^export\s+(?:async\s+)?(?:const|function|let|class)\s+([A-Za-z_$][\w$]*)/.exec(lines[j])
      if (m) { ident = m[1]; break }
    }
    if (!ident || !reg) out.push({ file, line: i + 1, unresolved: true, ident, register: reg?.[1] ?? null })
    else out.push({ file, line: i + 1, ident, register: reg[1] })
  }
  return out
}

/** A test is not an enforcement. See countReaders. */
export function isTestFile(file) {
  return /(?:^|\/)__tests__\//.test(file) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
}

/**
 * Count files that reference `ident` as code, excluding its declaring file and any TEST file.
 * `sources` is a Map of file → raw source.
 *
 * ⚠ TESTS ARE EXCLUDED ON PURPOSE, and this was found by using the check rather than by designing
 * it. Wiring the first real reader for HELP_CONTENT_DRAFT (M-077) made this report the new unit
 * test as a reader alongside the production module — which would have meant a constant read ONLY
 * by its own test satisfied the gate while enforcing nothing in the product. That is this check's
 * own failure mode reproduced one layer up: a test asserting an invariant is exactly the kind of
 * artefact whose existence stands in for the enforcement it names.
 */
export function countReaders(ident, declaringFile, sources) {
  const word = new RegExp(`\\b${ident}\\b`)
  const readers = []
  for (const [file, raw] of sources) {
    if (file === declaringFile) continue
    if (isTestFile(file)) continue
    if (!raw.includes(ident)) continue // cheap pre-filter before the expensive blanking
    if (word.test(blankComments(raw))) readers.push(file)
  }
  return readers
}

function selftest() {
  const cases = []
  const t = (label, fn) => cases.push([label, fn])

  t("a tagged export with no reader is FOUND — the shape this check exists for", () => {
    const tags = findTags("a.ts", "/**\n * @invariant M-082\n */\nexport const FOO = [1]\n")
    return tags.length === 1 && tags[0].ident === "FOO" && tags[0].register === "M-082" && !tags[0].unresolved
  })
  t("a tagged FUNCTION resolves too — M-067 is a function, not a constant", () => {
    const tags = findTags("a.ts", "/**\n * @invariant M-067\n */\nexport function excludePlatformOrg(q) { return q }\n")
    return tags.length === 1 && tags[0].ident === "excludePlatformOrg"
  })
  t("A TAG NAMING NOTHING FAILS — a tag pointing at no export is a typo or prose, never a pass", () => {
    const tags = findTags("a.ts", "/**\n * @invariant M-082\n */\nconst notExported = 1\n")
    return tags.length === 1 && tags[0].unresolved === true
  })
  t("A TAG WITH NO M-NUMBER FAILS — an invariant with no register entry is an assertion, not a record", () => {
    const tags = findTags("a.ts", "/**\n * @invariant\n */\nexport const FOO = 1\n")
    return tags.length === 1 && tags[0].unresolved === true
  })
  t("KNOWN-GOOD: the tag written in a STRING is not a tag — the token-in-prose trap, twice hit", () => {
    return findTags("a.ts", 'export const HELP = "pass @invariant M-001 to tag it"\n').length === 0
  })
  t("KNOWN-GOOD: an untagged export is none of this check's business", () => {
    return findTags("a.ts", "export const FOO = 1\n").length === 0
  })
  t("a CODE reference counts as a reader", () => {
    const srcs = new Map([["a.ts", "export const FOO = 1"], ["b.ts", "import { FOO } from './a'\nconst x = FOO"]])
    return countReaders("FOO", "a.ts", srcs).length === 1
  })
  t("A COMMENT REFERENCE DOES NOT COUNT — M-082's actual finding: prose asserting a list is live", () => {
    const srcs = new Map([["a.ts", "export const FOO = 1"], ["b.ts", "// BUILD_65 imports FOO rather than defining its own\nconst x = 1"]])
    return countReaders("FOO", "a.ts", srcs).length === 0
  })
  t("the DECLARING file never counts as its own reader", () => {
    const srcs = new Map([["a.ts", "export const FOO = 1\nconst self = FOO"]])
    return countReaders("FOO", "a.ts", srcs).length === 0
  })
  t("KNOWN-GOOD: a longer identifier containing the name is not a reader (word-boundary)", () => {
    const srcs = new Map([["a.ts", "export const FOO = 1"], ["b.ts", "const FOO_BAR = 2"]])
    return countReaders("FOO", "a.ts", srcs).length === 0
  })
  t("A TEST IS NOT A READER — a constant read only by its own test enforces nothing in the product", () => {
    const srcs = new Map([
      ["lib/a.ts", "export const FOO = 1"],
      ["lib/__tests__/a.test.ts", "import { FOO } from '../a'\nexpect(FOO).toBe(1)"],
      ["lib/b.spec.ts", "import { FOO } from './a'"],
    ])
    return countReaders("FOO", "lib/a.ts", srcs).length === 0
  })
  t("KNOWN-GOOD: a production reader still counts when a test reads it too", () => {
    const srcs = new Map([
      ["lib/a.ts", "export const FOO = 1"],
      ["lib/real.ts", "import { FOO } from './a'\nconst x = FOO"],
      ["lib/__tests__/a.test.ts", "import { FOO } from '../a'"],
    ])
    const r = countReaders("FOO", "lib/a.ts", srcs)
    return r.length === 1 && r[0] === "lib/real.ts"
  })
  // R6 mention-fixture — see scripts/check-mention-fixtures.mjs. This check's whole premise is that
  // a SENTENCE must never satisfy an invariant (M-082's finding was prose asserting a list was live
  // while nothing read it), so the mention case is not an edge here — it is the subject. Named as a
  // fixture so the R6 gate can see it, and probed in the shape that actually occurs: a file
  // DISCUSSING the constant, in every comment syntax, with no code path to it.
  t(`${"mention"}-fixture: a constant named only in comments is NOT a reader — line, block and JSDoc alike`, () => {
    const srcs = new Map([
      ["lib/a.ts", "export const FOO = 1"],
      ["lib/prose.ts", "// FOO is the statutory list; see M-082.\n/* FOO used to be read here. */\n/** @see FOO */\nexport const UNRELATED = 2"],
    ])
    return countReaders("FOO", "lib/a.ts", srcs).length === 0
  })

  let bad = 0
  for (const [label, fn] of cases) {
    let ok = false
    try { ok = fn() === true } catch { ok = false }
    if (!ok) bad++
    console.log(`  ${ok ? "✓" : "✗"} ${label}`)
  }
  console.log(bad ? `\n✗ ${bad} selftest case(s) failed` : "\n✅ check-invariant-has-callers selftest green")
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes("--selftest")) selftest()

const files = execFileSync(
  "git",
  ["ls-files", "-z", "app/*.ts", "app/*.tsx", "lib/*.ts", "lib/*.tsx", "components/*.ts", "components/*.tsx"],
  { encoding: "utf8" },
).split("\0").filter(Boolean)

const sources = new Map(files.map((f) => [f, readFileSync(f, "utf8")]))

const tags = []
for (const [file, src] of sources) {
  if (!src.includes(TAG)) continue
  tags.push(...findTags(file, src))
}

// A scan that reads nothing reports nothing and exits 0, which at the gate is indistinguishable
// from a clean tree. There ARE tagged invariants in this repo; if there are suddenly none, the
// scan is broken, not the tree. Same hole check-knip-floor exists to close.
if (tags.length === 0) {
  console.error(`✗ invariants: found no ${TAG} tags at all — the scan is not seeing the tree`)
  process.exit(1)
}

const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : { entries: {} }
const entries = baseline.entries ?? {}

const unresolved = tags.filter((t) => t.unresolved)
const resolved = tags.filter((t) => !t.unresolved)

const orphans = []   // tagged, zero readers, NOT baselined — the failure this check is for
const healed = []    // baselined but now HAS readers — the baseline must shrink
for (const tag of resolved) {
  const readers = countReaders(tag.ident, tag.file, sources)
  const isBaselined = Object.hasOwn(entries, tag.ident)
  if (readers.length === 0 && !isBaselined) orphans.push(tag)
  if (readers.length > 0 && isBaselined) healed.push({ ...tag, readers })
}

// A baseline entry naming an identifier that no longer carries a tag is a decision log pointing at
// nothing. It must be deleted, or it will silently exempt a future export that reuses the name.
const stale = Object.keys(entries).filter((k) => !resolved.some((t) => t.ident === k))

let failed = false

if (unresolved.length) {
  failed = true
  console.error(`✗ ${TAG} tags that name nothing:`)
  for (const t of unresolved) {
    const why = t.register ? "no export declaration follows it" : "no M-register number on the tag"
    console.error(`   ${t.file}:${t.line} — ${why}`)
  }
  console.error(`\n   Write it as \`${TAG} M-0NN\` on the comment directly above the export it governs.`)
}

if (orphans.length) {
  failed = true
  console.error(`✗ declared invariants with ZERO code readers:`)
  for (const t of orphans) console.error(`   ${t.file}:${t.line} — ${t.ident} (${t.register})`)
  console.error(
    "\n   The export names a rule and nothing applies it, so the rule is asserted rather than enforced.\n" +
    "   Wire a reader, or record it in " + BASELINE_PATH + " with its reason and M-number.\n" +
    "   Do NOT resolve this by deleting the export: that removes the record and leaves the obligation.",
  )
}

if (healed.length) {
  failed = true
  console.error(`✗ baselined invariants that now HAVE readers — the baseline must shrink:`)
  for (const t of healed) console.error(`   ${t.ident} — now read by ${t.readers.join(", ")}`)
  console.error(`\n   Delete these entries from ${BASELINE_PATH}. A baseline only shrinks.`)
}

if (stale.length) {
  failed = true
  console.error(`✗ baseline entries naming no tagged export: ${stale.join(", ")}`)
  console.error(`   Delete them from ${BASELINE_PATH} — a stale entry silently exempts whatever reuses the name.`)
}

if (failed) process.exit(1)

const baselined = resolved.filter((t) => Object.hasOwn(entries, t.ident)).length
console.log(
  `✅ invariants: ${resolved.length} declared, ${resolved.length - baselined} with readers, ` +
  `${baselined} recorded as unenforced (see ${BASELINE_PATH})`,
)
