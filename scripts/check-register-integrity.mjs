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
import { readFileSync, existsSync, readdirSync } from "node:fs"

const HEADING = /^### (M-\d+[a-z]?)\b(.*)$/

/**
 * The `**Satisfied when:**` slot (M-083 assertion 2), adopted by ruling 2026-08-23.
 *
 * The entry itself warned that a slot nobody populates is "the same defect in a new costume", so
 * two things make it real rather than decorative: it is REQUIRED on every open entry (a missing
 * slot fails), and `none` must carry a reason. Without the second, every author facing a hard
 * entry writes a bare `none` and the convention is dead on arrival while still looking alive.
 */
const SLOT_LABEL = "**Satisfied when:**"

/**
 * The slot value from an entry's body lines, or null.
 *
 * Deliberately NOT a regex. This is a line-START prefix test with an optional bullet, and every
 * regex spelling of it that reads naturally — `^\s*[-*]?\s*` — puts two variable-width whitespace
 * runs either side of an optional, which can split a run of spaces more than one way and trips
 * `sonarjs/super-linear-regex`. Rewriting it as string work removes the ambiguity rather than
 * hiding it behind a disable, and the anchoring that actually matters survives: the test is
 * against the START of a line, never a substring, because M-083's own prose carries a specimen of
 * this grammar as an example and a substring test matches its own documentation.
 *
 * The bullet test is TWO characters (`- ` / `* `) on purpose. A one-character `*` test would eat
 * the first asterisk of an unbulleted `**Satisfied when:**` line and then fail to recognise it.
 * An empty value reads as NO slot rather than as a satisfied one, so `- **Satisfied when:**` with
 * nothing after it fails the ratchet instead of passing it.
 */
function slotOf(lines) {
  for (const line of lines) {
    let rest = line.trimStart()
    if (rest.startsWith("- ") || rest.startsWith("* ")) rest = rest.slice(2).trimStart()
    if (!rest.startsWith(SLOT_LABEL)) continue
    const value = rest.slice(SLOT_LABEL.length).trim()
    if (value) return value
  }
  return null
}

const MARKER = /^(check|hook|eslint|audit|ci|test):(\S+)$/

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

/**
 * Resolve a `**Satisfied when:**` marker to whether its mechanism EXISTS on disk.
 *
 * Three states, not two. "I could not evaluate this marker form" is returned as `unknown`, never
 * folded into `false` — that collapse is M-088's entire subject, and a resolver that answered
 * "absent" to a spelling it does not understand would report a built mechanism as missing forever,
 * which is precisely how a register entry gets re-opened by a machine that cannot read it.
 */
export function resolveMarker(marker, root = ".") {
  // `extends:<marker>` — the fix MODIFIES an existing mechanism rather than adding one. Existence
  // is then meaningless as a signal: `pleks/no-inline-app-url` exists and the entry is still open
  // precisely because it does not yet visit plain literals. Reporting "your mechanism exists, close
  // the entry" there would be worse than saying nothing — it would argue for closing an open hole.
  // Returned as its own state so it is never confused with "absent" or with an unreadable marker.
  if (/^extends:/.test(marker)) return "extends"
  const m = MARKER.exec(marker)
  if (!m) return "unknown"
  const [, kind, name] = m
  const at = (p) => existsSync(`${root}/${p}`)
  switch (kind) {
    case "check":
      return at(`scripts/${name}.mjs`) || at(`scripts/${name}.mts`) || at(`scripts/check-${name}.mjs`)
    case "hook":
      // `hook:bash-gate:shared` — the trailing qualifier names the settings twin, not a file.
      return at(`.claude/hooks/${name.split(":")[0]}.js`)
    case "eslint":
      return at(`eslint-rules/${name.replace(/^pleks\//, "")}.mjs`)
    case "test":
      return at(name)
    case "audit": {
      if (!at("scripts/security/audit.mjs")) return "unknown"
      return new RegExp(`\\b${name.replace(/[^\w]/g, ".")}\\b`).test(readFileSync(`${root}/scripts/security/audit.mjs`, "utf8"))
    }
    case "ci": {
      const dir = `${root}/.github/workflows`
      if (!existsSync(dir)) return "unknown"
      return readdirSync(dir).some((f) => readFileSync(`${dir}/${f}`, "utf8").includes(name))
    }
    default:
      return "unknown"
  }
}

/**
 * Parse headings into `{ id, built, line, slot }`. Only the LEADING id counts — a heading may
 * mention others. `slot` is the entry's `**Satisfied when:**` value, or null when it carries none.
 */
export function parseEntries(text) {
  const lines = text.split(/\r?\n/)
  const out = []
  lines.forEach((line, i) => {
    const m = HEADING.exec(line)
    if (m) out.push({ id: m[1], built: isBuilt(m[2]), line: i + 1 })
  })
  // The body of entry N runs to the heading of entry N+1 — the slot must be read from the entry
  // that owns it, or a missing slot silently borrows its successor's.
  out.forEach((e, i) => {
    const end = i + 1 < out.length ? out[i + 1].line - 1 : lines.length
    e.slot = slotOf(lines.slice(e.line, end))
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

  // ── M-083 assertion 2 ────────────────────────────────────────────────────────────────────────
  // Adopted by ruling 2026-08-23, with the backfill the entry said it needed. Two halves, and only
  // the first one FAILS — deliberately. The entry is explicit: a hard failure on "your mechanism
  // now exists, close the entry" would push the next author to delete the citation rather than
  // settle the entry, which is the allowlist-widening failure in a new costume.
  // Missing slots are aggregated into ONE finding. Printing the same paragraph 55 times buries the
  // other assertions and trains the reader to scroll past the whole block.
  const slotless = []
  for (const e of entries) {
    if (e.built) continue                       // a closed entry's slot is already answered
    if (!e.slot) { slotless.push(`${e.id}:${e.line}`); continue }
    if (/^none\b/i.test(e.slot)) {
      // A bare `none` is the dead slot the entry warned about: it looks filled and says nothing.
      if (!/^none\s*[—-]\s*\S/i.test(e.slot)) {
        fails.push(`${e.id} (line ${e.line}) says \`Satisfied when: none\` with no reason. An unmechanisable entry has to say WHY, or the slot records only that someone reached this line.`)
      }
      continue
    }
    const state = resolveMarker(e.slot)
    if (state === "extends") continue           // existence decides nothing; see resolveMarker
    if (state === true) {
      notes.push(`⚑ ${e.id} (line ${e.line}) is OPEN but its named mechanism \`${e.slot}\` now EXISTS — check whether it asserts what this entry wanted, and close it if so. Reported, never enforced: resolution proves the mechanism is there, not that it is right.`)
    } else if (state === "unknown") {
      // Never silently false. An unreadable marker is an unanswered question, not a clean result.
      notes.push(`? ${e.id} (line ${e.line}) names \`${e.slot}\`, which this resolver cannot evaluate — NOT a finding that the mechanism is absent. Fix the spelling or teach resolveMarker the form.`)
    }
  }
  if (slotless.length) {
    fails.push(`${slotless.length} open entr${slotless.length === 1 ? "y carries" : "ies carry"} no \`**Satisfied when:**\` slot: ${slotless.join(" ")}\n     Every open entry names the mechanism that would close it — \`check:check-foo\`, \`eslint:pleks/foo\`, \`hook:foo\`, \`audit:catN_x\`, \`ci:job\`, \`test:path\` — or \`none — <reason>\` when it is deliberately unmechanisable.`)
  }

  // Reported, never enforced: the next free number. `4-AGENT-PIPELINES.md` records a double
  // allocation (70H) that came from minting a number without checking, and the remedy there is the
  // same as here — say what the next one is, so nobody has to derive it under time pressure.
  const nums = entries.map((e) => Number(e.id.slice(2).replace(/[a-z]$/, "")))
  notes.push(`next free id: M-${String(Math.max(...nums) + 1).padStart(3, "0")} · ${entries.length} entries (${entries.filter((e) => e.built).length} BUILT)`)

  return { fails, notes }
}

function selftest() {
  // Every open entry now needs a slot, so the fixture heading carries one by default — otherwise
  // each pre-existing case below would fail for the NEW reason and stop testing its own property.
  const H = (id, built) => (built
    ? `### ${id} — ✅ BUILT 2026-01-01`
    : `### ${id} — a title\n- **Satisfied when:** none — a fixture`)
  const cases = [
    ["a clean register passes", [H("M-001"), H("M-002", true)].join("\n"), 0],
    ["A DUPLICATE ID FAILS — the case this script exists for", [H("M-001"), H("M-002"), H("M-001")].join("\n"), 1],
    ["a duplicate where one side is BUILT still fails — the real M-068 shape", [H("M-068", true), H("M-068")].join("\n"), 1],
    ["two separate duplicates are both reported", [H("M-001"), H("M-001"), H("M-002"), H("M-002")].join("\n"), 2],
    ["AN EMPTY PARSE FAILS — a broken grammar must not read as a clean register", "## not a heading\nsome prose\n", 1],
    // The known-good half. Without it, "fail on everything" scores green.
    ["KNOWN-GOOD: a lettered suffix is a DIFFERENT entry, not a duplicate — the M-068b remedy", [H("M-068", true), H("M-068b", true)].join("\n"), 0],
    ["KNOWN-GOOD: a heading that MENTIONS another id is not a second entry", ["### M-007 — supersedes M-001 and M-002", "- **Satisfied when:** none — a fixture", H("M-001")].join("\n"), 0],
    ["KNOWN-GOOD: gaps in the numbering are fine — entries get closed, not renumbered", [H("M-001"), H("M-050"), H("M-083")].join("\n"), 0],

    // ── M-083 assertion 2 ──────────────────────────────────────────────────────────────────────
    ["A MISSING SLOT FAILS — the ratchet that makes the convention real", "### M-001 — a title\n- **Rung:** check\n", 1],
    ["a BARE `none` FAILS — the dead slot the entry warned about", "### M-001 — a title\n- **Satisfied when:** none\n", 1],
    ["KNOWN-GOOD: `none` WITH a reason passes", "### M-001 — a title\n- **Satisfied when:** none — needs a ruling first\n", 0],
    ["KNOWN-GOOD: a BUILT entry needs no slot — it is already answered", H("M-001", true), 0],
    ["KNOWN-GOOD: an unresolvable marker is a NOTE, never a failure", "### M-001 — a title\n- **Satisfied when:** check:check-does-not-exist\n", 0],
    // The slot must be read from the entry that OWNS it. Without the body-slicing above, M-001
    // would borrow M-002's slot and a missing slot would go unreported — the same relational
    // blindness that let the duplicate M-068 through.
    ["a slot belongs to ITS entry — M-001 must not borrow M-002's", "### M-001 — a title\n### M-002 — a title\n- **Satisfied when:** none — mine\n", 1],

    // The three shapes the regex-free `slotOf` has to get right, each of which a naive spelling
    // gets wrong: an EMPTY slot is not a filled one; an unbulleted line must survive a bullet
    // stripper that would otherwise eat its first asterisk; and the label must be at the START of
    // a line, because this register's own prose quotes the grammar as an example.
    ["an EMPTY slot reads as NO slot — it looks filled and says nothing", "### M-001 — a title\n- **Satisfied when:**\n", 1],
    ["KNOWN-GOOD: an UNBULLETED slot line is still a slot", "### M-001 — a title\n**Satisfied when:** none — no bullet\n", 0],
    ["a slot QUOTED MID-SENTENCE is not a slot — M-083's own self-specimen trap", "### M-001 — a title\nwrite `- **Satisfied when:** check:foo` on each entry\n", 1],
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

  // The resolver's three states, probed against the REAL tree — a resolver that answered one value
  // to everything would pass every case above, because those only assert failure COUNTS.
  const resolverCases = [
    ["check:check-register-integrity", true,      "a real check resolves"],
    ["eslint:pleks/require-scope-on-delete", true, "a real eslint rule resolves, pleks/ prefix stripped"],
    ["hook:bash-gate", true,                      "a real hook resolves"],
    ["hook:bash-gate:shared", true,               "…and a :shared qualifier names the twin, not a file"],
    ["check:check-nope-not-real", false,          "an ABSENT mechanism resolves false"],
    ["eslint:pleks/nope-not-real", false,         "an absent eslint rule resolves false"],
    ["not-a-marker-at-all", "unknown",            "AN UNREADABLE MARKER IS UNKNOWN, NEVER FALSE — M-088's class"],
    ["wat:something", "unknown",                  "an unrecognised KIND is unknown, not absent"],
    // `extends:` must not resolve true even when the named mechanism plainly exists — that is the
    // whole reason the form exists, and a resolver that ignored the prefix would nudge every
    // extend-an-existing-rule entry toward being closed while its hole is still open.
    ["extends:eslint:pleks/no-inline-app-url", "extends", "an EXTENDS marker is never decided by existence"],
    ["extends:check:check-nope-not-real", "extends",      "…including when the named mechanism is absent"],
  ]
  for (const [marker, want, why] of resolverCases) {
    const got = resolveMarker(marker)
    if (got !== want) { console.log(`  ✗ resolveMarker("${marker}") → ${got}, expected ${want} — ${why}`); bad++ }
    else console.log(`  ✓ ${why}`)
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
