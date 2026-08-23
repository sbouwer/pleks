#!/usr/bin/env node
/**
 * scripts/check-subscription-single-reads.mjs — a single-row read of `subscriptions` must narrow by status
 *
 * Auth:   none — local/CI script
 * Data:   git-tracked .ts/.tsx under app/ and lib/
 * Notes:  `subscriptions.org_id` carries an INDEX, not a unique constraint (001_foundation.sql:265).
 *         An org that is purged and then resubscribed therefore holds TWO rows, and PostgREST's
 *         `.single()` / `.maybeSingle()` error on >1 — so the query does not return the wrong row,
 *         it returns no row at all, and every caller's `?? default` becomes the answer.
 *
 *         THAT IS THE BUG CLASS, and it is not hypothetical: as at 2026-08-23 the only org in
 *         production holding a subscription held two rows (one `purged`, one `active`). Five call
 *         sites were reading through that error. Four failed CLOSED — a paying Firm org told it
 *         needed a Firm plan — and one failed OPEN on spend, minting 3 AI reformat credits for an
 *         `owner` org entitled to zero, via `?? "steward"`.
 *
 *         The fix at every site is to narrow by `status` so at most one row can match. This check
 *         asserts the narrowing is present; it deliberately does NOT judge which statuses are
 *         correct, because that differs per site (an entitlement read wants active+trialing, a
 *         lifecycle read wants everything except purged) and a check that guessed would be wrong
 *         more often than the humans it interrupts.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const TERMINATORS = ["single", "maybeSingle"]

/**
 * Blank out `//` and block comments, character by character, preserving length so byte offsets and
 * line numbers still line up. LINEAR AND REGEX-FREE ON PURPOSE — twice this month a check has been
 * fooled by its own explanatory comment (the knip floor counted `@knipignore` written in prose;
 * the first draft of THIS file flagged four sites it had just fixed, because each carried a comment
 * saying "`.single()` errors"). A comment-stripping regex was the other candidate and this repo's
 * super-linear-regex rule rejects that shape, correctly.
 */
export function blankComments(src) {
  let out = ""
  let i = 0
  while (i < src.length) {
    if (src[i] === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") { out += " "; i++ }
    } else if (src[i] === "/" && src[i + 1] === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++ }
      out += "  "; i += 2
    } else {
      out += src[i]; i++
    }
  }
  return out
}

/**
 * Pure, so both directions are testable without a repo. Returns violation objects.
 */
export function findViolations(file, rawSrc) {
  const src = blankComments(rawSrc)
  const out = []
  let i = -1
  while ((i = src.indexOf('.from("subscriptions")', i + 1)) !== -1) {
    const line = src.slice(0, i).split("\n").length
    const rest = src.slice(i, i + 900)
    const end = /\.(single|maybeSingle|limit|then|order|insert|update|upsert|delete)\(/.exec(rest)
    if (!end) continue
    const terminator = end[1]
    if (!TERMINATORS.includes(terminator)) continue // multi-row or a write — not this class
    const chain = rest.slice(0, end.index + end[0].length)
    const narrows = /\.(eq|in|not|neq)\(\s*["']status["']/.test(chain)
    if (!narrows) out.push({ file, line, terminator })
  }
  return out
}

function selftest() {
  const cases = [
    [
      "a bare .single() with no status filter FAILS — the shape that shipped",
      'db.from("subscriptions").select("tier").eq("org_id", orgId).single()',
      1,
    ],
    [
      "KNOWN-GOOD: .in() on status passes",
      'db.from("subscriptions").select("tier").eq("org_id", o).in("status", ["active"]).single()',
      0,
    ],
    [
      "KNOWN-GOOD: .not() excluding purged passes",
      'db.from("subscriptions").select("tier").eq("org_id", o).not("status", "eq", "purged").maybeSingle()',
      0,
    ],
    [
      "maybeSingle is covered too — it errors on >1 rows exactly as .single() does",
      'db.from("subscriptions").select("tier").eq("org_id", o).maybeSingle()',
      1,
    ],
    [
      "KNOWN-GOOD: a multi-row read is not this class and must not be flagged",
      'db.from("subscriptions").select("tier").eq("org_id", o).order("created_at")',
      0,
    ],
    [
      "KNOWN-GOOD: a write is not a read",
      'db.from("subscriptions").update({ status: "paused" }).eq("org_id", o)',
      0,
    ],
    [
      "KNOWN-GOOD: another table's unnarrowed .single() is none of this check's business",
      'db.from("organisations").select("name").eq("id", o).single()',
      0,
    ],
    [
      "KNOWN-GOOD: a COMMENT naming .single() does not create a violation — the first draft of this " +
        "check flagged all four sites it had just fixed, because each explains itself in a comment",
      'db.from("subscriptions").select("tier").eq("org_id", o)\n' +
        '  // .single() errors here when the org has two rows\n' +
        '  .not("status", "eq", "purged")\n  .maybeSingle()',
      0,
    ],
    [
      "a real violation AFTER a comment is still caught — the stripper must not swallow code",
      'db.from("subscriptions").select("tier") /* purged rows exist */ .eq("org_id", o).single()',
      1,
    ],
    [
      "two violations in one file are both reported, not just the first",
      'db.from("subscriptions").select("a").eq("org_id",o).single()\n' +
        'db.from("subscriptions").select("b").eq("org_id",o).single()',
      2,
    ],
  ]
  let bad = 0
  for (const [label, src, expected] of cases) {
    const got = findViolations("fixture.ts", src).length
    const ok = got === expected
    if (!ok) bad++
    console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — expected ${expected}, got ${got}`}`)
  }
  console.log(bad ? `\n✗ ${bad} selftest case(s) failed` : "\n✅ check-subscription-single-reads selftest green")
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes("--selftest")) selftest()

const files = execFileSync("git", ["ls-files", "-z", "app/*.ts", "app/*.tsx", "lib/*.ts", "lib/*.tsx"], {
  encoding: "utf8",
}).split("\0").filter(Boolean)

const violations = []
let scanned = 0
for (const f of files) {
  const src = readFileSync(f, "utf8")
  if (!src.includes('.from("subscriptions")')) continue
  scanned++
  violations.push(...findViolations(f, src))
}

// A scan that reads nothing reports nothing and exits 0, which at the gate is indistinguishable
// from a clean tree — the same hole check-knip-floor exists to close. There ARE subscription
// readers in this repo; if there are suddenly none, the scan is broken, not the tree.
if (scanned === 0) {
  console.error("✗ subscription reads: scanned 0 files containing `.from(\"subscriptions\")` — the scan is not seeing the tree")
  process.exit(1)
}

if (violations.length) {
  console.error("✗ single-row reads of `subscriptions` that do not narrow by status:")
  for (const v of violations) {
    console.error(`   ${v.file}:${v.line} — .${v.terminator}() with no .eq/.in/.not on "status"`)
  }
  console.error(
    "\n   `subscriptions.org_id` is an INDEX, not a unique constraint. An org purged and then\n" +
    "   resubscribed holds two rows, so this errors and your `?? default` becomes the answer.\n" +
    "   Narrow by status — which statuses is yours to decide, and the reason belongs at the site.",
  )
  process.exit(1)
}
console.log(`✅ subscriptions: ${scanned} file(s) with single-row reads, all narrowed by status`)
