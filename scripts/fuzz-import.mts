/**
 * scripts/fuzz-import.mts — the deep fuzz run. `npm run fuzz [cases] [fromSeed]`
 *
 * Thousands of generated agency books — every dialect, every corruption, every density — through the importer's
 * pure path (mapping → classification → normalisation → plausibility). ~2 ms a book, so 5 000 takes seconds.
 *
 * ⚠ IT PROVES STRICTLY LESS THAN IT LOOKS. A pure pass cannot see a phantom column, a NOT NULL, a CHECK, a
 * trigger or a unique index. It would never have caught `payment_method` (a column that does not exist), or
 * `escalation_percent: null` hitting NOT NULL, or the trust ledger doubling. Those live at the WRITE boundary,
 * and a single DB test found each of them in minutes.
 *
 * So "5 000 passed" is NOT "the importer is proven". Read the footer, not the number.
 */
import { fuzz, formatReport } from "../test/import/fuzz"

const cases = Number(process.argv[2] ?? 5000)
const fromSeed = Number(process.argv[3] ?? 1)

const report = fuzz({ cases, fromSeed, leasesPerBook: 8 })
console.log(formatReport(report))

if (report.findings.length > 0) {
  console.error(`\n✗ ${report.findings.length} finding(s). Each is replayable from its seed.\n`)
  process.exit(1)
}
