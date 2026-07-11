/**
 * scripts/audit-holiday-table.mts — diff the SA public-holiday table against the public feeds
 *
 * The auditor DIFFS, it never writes (ADDENDUM_70K D-7d). Any change to the table stays a reviewed PR with a
 * per-entry statutory justification — this only tells a human WHEN to look.
 *
 *   --ci     exit non-zero on any Class-A/B diff or witness disagreement (runs in the pipeline)
 *   --cron   print the JSON report to stdout (the sentinel route digests it)
 *   (default) human-readable summary
 *
 * Their fetcher is a populator; ours is a skeptic.
 */
import { runHolidayAudit } from "../lib/dates/holidayAuditFetch"

const mode = process.argv.includes("--ci") ? "ci" : process.argv.includes("--cron") ? "cron" : "human"

const report = await runHolidayAudit()

if (mode === "cron") {
  process.stdout.write(JSON.stringify(report))
  process.exit(0)
}

if (!report.ran) {
  console.error("⚠ holiday auditor could not reach Nager.Date — audit did NOT run (this is a signal, not a clean pass).")
  process.exit(mode === "ci" ? 1 : 0)
}

const { primary, witnessDisagreementDates, calendarificReachable } = report
console.log(`Holiday-table audit — ${primary!.comparedFrom}..${primary!.comparedThrough}`)
console.log(`  witnesses: Nager ✓${calendarificReachable ? "  Calendarific ✓" : "  (Calendarific: no key — single witness)"}`)

const a = primary!.diffs.filter((d) => d.cls === "A")
const b = primary!.diffs.filter((d) => d.cls === "B")
const c = primary!.diffs.filter((d) => d.cls === "C")

for (const [label, list] of [["A — API has, table lacks (possible proclamation)", a], ["B — table has, API lacks (table wins pending review)", b], ["C — metadata only", c]] as const) {
  if (list.length) {
    console.log(`\n  Class ${label}:`)
    for (const d of list) console.log(`    ${d.date}  ${d.detail}`)
  }
}
if (witnessDisagreementDates.length) {
  console.log(`\n  ⚠ witnesses DISAGREE on: ${witnessDisagreementDates.join(", ")} — a human must look.`)
}

if (report.needsReview) {
  console.log(`\n✗ audit needs review (${a.length} Class-A, ${b.length} Class-B, ${witnessDisagreementDates.length} witness-disagreement).`)
  process.exit(mode === "ci" ? 1 : 0)
}
console.log(`\n✓ table agrees with the feed(s) — no action.`)
process.exit(0)
