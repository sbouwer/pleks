#!/usr/bin/env node
/**
 * scripts/check-refund-writers.mjs — the refund columns have ONE writer, and every other file naming them says why
 *
 * Auth:   none — local/CI script
 * Data:   git-tracked .ts/.tsx under app/, lib/, components/ (tests excluded)
 * Notes:  ADDENDUM_14W §0c. Counsel's Q6: the only refund that can exist is a person's own check terminally failing
 *         after their own payment. The ruling (2026-10-03, Q4/Q5) makes that refund OWED — recorded on the payment row,
 *         executed by an admin. So `refund_amount_cents` / `refunded_at` / `refund_payfast_id` must be written in
 *         exactly one place, lib/screening/refundOwed.ts. Any other file that names one of them is either a second
 *         writer (a second refund policy) or a reader nobody classified — both fail here until listed with a reason.
 *         `refunded_at` is also a column on property_intelligence_pulls, a different product with its own refund
 *         path, so the property-intelligence run route is listed for that reason and no other.
 *         The RAW text is matched, comments included — the opposite of check-invariant-has-callers, on purpose. There a
 *         missed match is the safe direction; here a missed match IS the second writer. blank-comments.mjs does not
 *         track strings, so `"https://x", refunded_at` blanked the column away (walker 14w-s0c F6). A comment naming a
 *         column therefore fails too: reword it or list the file. Loud is the right way for this check to be wrong.
 *         A stale entry — a listed file that no longer names a column — fails too, so the list only shrinks honestly.
 *
 *         WHAT IT CANNOT SEE, stated so the tag is not read wider than it is: a column name built at runtime (string
 *         concatenation, a computed key), a write through `.rpc()` or a row spread, SQL in `supabase/migrations` or a
 *         DB function, and anything outside app/lib/components. "One writer" holds for code that NAMES the column.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const COLUMN = /\b(refund_amount_cents|refunded_at|refund_payfast_id)\b/

/** Each entry is a decision: read, classified, and the reason recorded here. */
const ALLOWED = new Map([
  ["lib/screening/refundOwed.ts", "THE one writer — records a terminal product's refund as owed (14W §0c, ruling Q4/Q5)"],
  ["app/api/property-intelligence/run/[pull_id]/route.ts", "property_intelligence_pulls.refunded_at — a different table and product, not a screening refund"],
])

export function findNamers(files) {
  return files.filter(({ text }) => COLUMN.test(text)).map(({ path }) => path)
}

export function evaluate(files) {
  const namers = findNamers(files)
  const unlisted = namers.filter((p) => !ALLOWED.has(p))
  const stale = [...ALLOWED.keys()].filter((p) => !namers.includes(p))
  return { unlisted, stale }
}

function trackedSources() {
  const out = execFileSync("git", ["ls-files", "app", "lib", "components"], { encoding: "utf8" })
  return out.split("\n")
    .filter((p) => /\.(ts|tsx)$/.test(p))
    .filter((p) => !/(\.test\.|\.dbtest\.|__tests__\/)/.test(p))
}

function selftest() {
  const fails = []
  const ok = (cond, msg) => { if (!cond) fails.push(msg) }

  // Bad direction: an unlisted writer fails, and so does a stale entry.
  const planted = evaluate([
    { path: "lib/screening/refundOwed.ts", text: `db.update({ refund_amount_cents: 1 })` },
    { path: "app/api/property-intelligence/run/[pull_id]/route.ts", text: `.update({ refunded_at: now })` },
    { path: "lib/payments/sneaky.ts", text: `db.update({ refunded_at: now })` },
  ])
  ok(planted.unlisted.includes("lib/payments/sneaky.ts"), "an unlisted writer must fail")
  const staleRun = evaluate([{ path: "lib/screening/refundOwed.ts", text: `refund_amount_cents` }])
  ok(staleRun.stale.includes("app/api/property-intelligence/run/[pull_id]/route.ts"), "a stale entry must fail")
  // F6: a `//` inside a string must not hide the column that follows it on the line.
  const urlFirst = evaluate([{ path: "lib/z.ts", text: `db.update({ note: "see https://x", refunded_at: now })` }])
  ok(urlFirst.unlisted.includes("lib/z.ts"), "a writer after a URL string must fail")

  // Good direction: the listed pair passes clean, and a near-miss identifier is not the column.
  const clean = evaluate([
    { path: "lib/screening/refundOwed.ts", text: `.is("refunded_at", null)` },
    { path: "app/api/property-intelligence/run/[pull_id]/route.ts", text: `refunded_at` },
    { path: "lib/y.ts", text: `const refunded_atx = 1; const prerefund_payfast_id = 2` },
  ])
  ok(clean.unlisted.length === 0 && clean.stale.length === 0, `known-good set must pass: ${JSON.stringify(clean)}`)

  if (fails.length) {
    console.error("check-refund-writers --selftest FAILED:\n  " + fails.join("\n  "))
    process.exit(1)
  }
  console.log("check-refund-writers --selftest: 4 probes passed (3 must-fail, 1 must-pass)")
}

function main() {
  if (process.argv.includes("--selftest")) return selftest()
  const files = trackedSources().map((path) => ({ path, text: readFileSync(path, "utf8") }))
  const { unlisted, stale } = evaluate(files)
  if (unlisted.length || stale.length) {
    for (const p of unlisted) console.error(`✗ ${p} names a refund column and is not an allowed writer (14W §0c — lib/screening/refundOwed.ts is the one writer)`)
    for (const p of stale) console.error(`✗ stale allowlist entry: ${p} no longer names a refund column — remove it`)
    process.exit(1)
  }
  console.log(`✓ refund columns: ${ALLOWED.size} classified files, no other writer`)
}

main()
