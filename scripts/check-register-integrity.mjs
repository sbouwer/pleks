#!/usr/bin/env node
/**
 * scripts/check-register-integrity.mjs — the M-register's own structural invariants (M-083)
 *
 * Auth:   none — local/CI script
 * Data:   docs/MECHANISABLE.md
 * Notes:  An M-number identifies exactly one entry. On 2026-08-21 two entries were both filed as
 *         `### M-068`, a day apart, and it survived a full triage pass that read every entry —
 *         because the pass read entries, and this defect is only visible ACROSS them. It also broke
 *         the register's own counts: the derived open figure came out 50 or 51 depending on which
 *         grep was used, and BOTH were reported to CD as exact.
 *
 *         SCOPE IS DELIBERATELY NARROW, and the narrowing is a measurement rather than a preference.
 *         M-083 was filed claiming a second assertion — "every entry citing a control marker that
 *         RESOLVES and is not marked BUILT is reported" — and asserting `check-claude-md.mjs`'s
 *         resolver made that nearly free. **Measured at `5dbd0684` before building it: exactly ONE
 *         of the 50 open entries carries a real `@enforced` marker.** The detector would have
 *         examined 2% of the register and would NOT have caught M-068b, which carries no marker,
 *         nor the four other stale-BUILT entries found by hand on 2026-08-21. The sketch was written
 *         from the mechanism that was available, not from the defect that occurred. What it would
 *         actually take is recorded at the entry; it is not built here, and pretending a 2% detector
 *         is the fix would have been worse than leaving it open.
 */
import { readFileSync } from "node:fs"

const HEADING = /^### (M-\d+[a-z]?)\b(.*)$/

/**
 * Is this heading tail claiming the entry is BUILT?
 *
 * ⚠ THE FIRST CUT WAS `/BUILT/` AND IT WAS WRONG WITHIN THE HOUR. Marking M-083 as
 * "⚠ HALF BUILT 2026-08-22" moved the reported count from 18 to 19 — the substring matched the
 * qualifier that exists precisely to deny it. Caught only because the number disagreed with the
 * previous run, which is not a mechanism.
 *
 * Same defect class as the four this repo fixed in `bash-gate.js` the day before: **the pattern
 * matched characters AROUND the thing instead of the thing.** That it reappeared in a check written
 * to catch register defects, by the session that had just written those four up, is the argument for
 * the discriminating probes below rather than a reason to trust the next regex.
 *
 * Two live spellings are accepted because both are in the file and neither is wrong: `— ✅ BUILT
 * <date>` (most entries) and `— **BUILT <date>**` (M-081). Requiring the tick would silently reopen
 * M-081.
 */
export function isBuilt(tail) {
  if (/\b(?:HALF|PARTIAL|PARTIALLY|NOT|NEVER)\s+BUILT\b/i.test(tail)) return false
  return /(?:^|[^A-Za-z])BUILT\b/.test(tail)
}

/** Parse headings into `{ id, built, line }`. Only the LEADING id counts — a heading may mention others. */
export function parseEntries(text) {
  const out = []
  text.split(/\r?\n/).forEach((line, i) => {
    const m = HEADING.exec(line)
    if (m) out.push({ id: m[1], built: isBuilt(m[2]), line: i + 1 })
  })
  return out
}

/**
 * The assertions, pure so both directions are testable without the real file.
 * Returns `{ fails, notes }` — fails block, notes are printed and do not.
 */
export function evaluate(entries) {
  const fails = []
  const notes = []

  // A register that parses to nothing is not a clean register. Same shape as `check-knip-floor`'s
  // collapsed-analysis guard: every enumeration asserts NON-EMPTY as its own case, or a broken
  // parser reports success. This one would have passed silently on a renamed heading level.
  if (entries.length === 0) {
    fails.push("no `### M-NNN` entries parsed at all — the heading grammar changed or the file moved. A register that parses to zero is a broken parse, not an empty register.")
    return { fails, notes }
  }

  const seen = new Map()
  for (const e of entries) {
    if (seen.has(e.id)) {
      const first = seen.get(e.id)
      fails.push(`${e.id} is used by TWO entries (lines ${first.line} and ${e.line}). An M-number identifies one entry; a reused id breaks every count derived from this file and every git-log reference to the number. Renumber the LATER one, keeping the earlier id stable so existing references still resolve.`)
    } else {
      seen.set(e.id, e)
    }
  }

  // Reported, never enforced: the next free number. `4-AGENT-PIPELINES.md` records a double
  // allocation (70H) that came from minting a number without checking, and the remedy there is the
  // same as here — say what the next one is, so nobody has to derive it under time pressure.
  const nums = entries.map((e) => Number(e.id.slice(2).replace(/[a-z]$/, "")))
  notes.push(`next free id: M-${String(Math.max(...nums) + 1).padStart(3, "0")} · ${entries.length} entries (${entries.filter((e) => e.built).length} BUILT)`)

  return { fails, notes }
}

function selftest() {
  const H = (id, built) => `### ${id}${built ? " — ✅ BUILT 2026-01-01" : " — a title"}`
  const cases = [
    ["a clean register passes", [H("M-001"), H("M-002", true)].join("\n"), 0],
    ["A DUPLICATE ID FAILS — the case this script exists for", [H("M-001"), H("M-002"), H("M-001")].join("\n"), 1],
    ["a duplicate where one side is BUILT still fails — the real M-068 shape", [H("M-068", true), H("M-068")].join("\n"), 1],
    ["two separate duplicates are both reported", [H("M-001"), H("M-001"), H("M-002"), H("M-002")].join("\n"), 2],
    ["AN EMPTY PARSE FAILS — a broken grammar must not read as a clean register", "## not a heading\nsome prose\n", 1],
    // The known-good half. Without it, "fail on everything" scores green.
    ["KNOWN-GOOD: a lettered suffix is a DIFFERENT entry, not a duplicate — the M-068b remedy", [H("M-068", true), H("M-068b", true)].join("\n"), 0],
    ["KNOWN-GOOD: a heading that MENTIONS another id is not a second entry", ["### M-007 — supersedes M-001 and M-002", H("M-001")].join("\n"), 0],
    ["KNOWN-GOOD: gaps in the numbering are fine — entries get closed, not renumbered", [H("M-001"), H("M-050"), H("M-083")].join("\n"), 0],
  ]
  let bad = 0
  for (const [label, text, wantFails] of cases) {
    const got = evaluate(parseEntries(text)).fails.length
    const ok = got === wantFails
    if (!ok) bad++
    console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — expected ${wantFails} failure(s), got ${got}`}`)
  }

  // The parser's own discriminating property, probed directly: BUILT is read from the heading TAIL,
  // so an entry merely titled "...nothing stops X from BUILDing" would not be miscounted — and an
  // id in the title must not be mistaken for the entry's own.
  const p = parseEntries(["### M-009 — a title", "### M-010 — ✅ BUILT 2026-01-01"].join("\n"))
  if (p.length !== 2 || p[0].built || !p[1].built) { console.log("  ✗ BUILT is not being read from the heading tail"); bad++ }
  else console.log("  ✓ BUILT is read from the heading tail, per entry")

  const next = evaluate(parseEntries([H("M-001"), H("M-083")].join("\n"))).notes.join(" ")
  if (!/next free id: M-084/.test(next)) { console.log(`  ✗ next-free-id is wrong: ${next}`); bad++ }
  else console.log("  ✓ the next free id is reported, and a lettered suffix does not inflate it")

  // The BUILT discrimination, both directions. The first cut of `isBuilt` was `/BUILT/` and it
  // counted "⚠ HALF BUILT" as built within an hour of being written — a qualifier read as a claim.
  // Both halves are needed: a rule that answers "not built" to everything passes the deny half alone.
  const builtCases = [
    [" — ✅ BUILT 2026-08-21", true, "the common spelling"],
    [" — **BUILT 2026-08-21 (`34468178`)**", true, "M-081's bold spelling, no tick"],
    [" — ⚠ HALF BUILT 2026-08-22", false, "THE DEFECT: a qualifier is not a claim"],
    [" — PARTIALLY BUILT, see the entry", false, "the same qualifier, spelled out"],
    [" — NOT BUILT: blocked on a ruling", false, "an explicit denial must not read as built"],
    [" — a title about REBUILT tooling", false, "BUILT must be a token, not a suffix"],
    [" — a plain open entry", false, "silence is not a claim"],
  ]
  for (const [tail, want, why] of builtCases) {
    const got = isBuilt(tail)
    if (got !== want) { console.log(`  ✗ isBuilt("${tail.trim()}") → ${got}, expected ${want} — ${why}`); bad++ }
    else console.log(`  ✓ ${want ? "BUILT" : "not built"}: ${why}`)
  }

  console.log(bad ? `\n✗ ${bad} selftest case(s) failed` : "\n✅ check-register-integrity selftest green")
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes("--selftest")) selftest()

// An optional path so the check can be run over a PAST revision (`git show <sha>:docs/... > f`).
// That is how it was proved against the real M-068 duplicate rather than only against synthetic
// cases — a probe suite confirms the shapes you thought of; the historical file is the one that
// actually happened.
const PATH = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "docs/MECHANISABLE.md"
const { fails, notes } = evaluate(parseEntries(readFileSync(PATH, "utf8")))
for (const n of notes) console.log(`   ${n}`)
if (fails.length) {
  console.error("✗ register integrity:")
  for (const f of fails) console.error(`   ${f}`)
  process.exit(1)
}
console.log("✅ register integrity: every M-number identifies exactly one entry")
